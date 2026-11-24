import type { MapsApiDiagnostic, TravelMode } from '../src/types/medroute';

const SOLUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

let lastWorkingServerKey: string | null = null;

/**
 * Collects unique server-side Google Maps API keys without ever exposing them to the client.
 * Checks GOOGLE_MAPS_API_KEY and VITE_GOOGLE_MAPS_API_KEY (injected by AI Studio provisioning).
 * If a key previously succeeded in this server process, it is prioritized first to avoid wasted retries.
 */
export function getServerGoogleMapsApiKeys(): string[] {
  const rawCandidates = [
    process.env.GOOGLE_MAPS_API_KEY?.trim() || '',
    process.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || '',
  ].filter((k) => k.length > 0);

  const unique = Array.from(new Set(rawCandidates));
  if (lastWorkingServerKey && unique.includes(lastWorkingServerKey)) {
    return [
      lastWorkingServerKey,
      ...unique.filter((k) => k !== lastWorkingServerKey),
    ];
  }
  return unique;
}

export function getServerGoogleMapsApiKey(): string | null {
  return getServerGoogleMapsApiKeys()[0] || null;
}

export function sanitizeSecretFromText(text: string): string {
  const keys = getServerGoogleMapsApiKeys();
  let safe = text.replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[REDACTED_API_KEY]');
  for (const key of keys) {
    safe = safe.split(key).join('[REDACTED_API_KEY]');
  }
  return safe;
}

export function classifyGoogleApiError(params: {
  httpStatus?: number | null;
  googleStatus?: string | null;
  rawMessage?: string | null;
  errorReason?: string | null;
  apiName: string;
}): MapsApiDiagnostic {
  const httpStatus = params.httpStatus ?? null;
  const googleStatus = params.googleStatus ?? null;
  const message = sanitizeSecretFromText(params.rawMessage || '');
  const reason = (params.errorReason || '').toUpperCase();
  const combined = `${googleStatus || ''} ${reason} ${message}`.toLowerCase();

  if (
    httpStatus === 429 ||
    combined.includes('resource_exhausted') ||
    combined.includes('over_query_limit') ||
    combined.includes('quota') ||
    combined.includes('rate_limit')
  ) {
    return {
      category: 'QUOTA_EXCEEDED',
      httpStatus,
      googleStatus,
      userMessage: `${params.apiName} quota limit has been reached. Try again later or switch to Demo Mode.`,
      details: message || null,
    };
  }

  if (
    combined.includes('billing') ||
    combined.includes('billing_disabled') ||
    combined.includes('enable billing')
  ) {
    return {
      category: 'BILLING_NOT_ENABLED',
      httpStatus,
      googleStatus,
      userMessage: `Google Cloud billing is not enabled for ${params.apiName}. Enable billing on the project or switch to Demo Mode.`,
      details: message || null,
    };
  }

  if (
    combined.includes('service_disabled') ||
    combined.includes('has not been used') ||
    combined.includes('is disabled') ||
    combined.includes('not activated') ||
    combined.includes('not enabled')
  ) {
    return {
      category: 'API_NOT_ENABLED',
      httpStatus,
      googleStatus,
      userMessage: `${params.apiName} is not enabled on the configured Google Cloud project.`,
      details: message || null,
    };
  }

  if (
    combined.includes('api_key_invalid') ||
    combined.includes('api key not valid') ||
    combined.includes('invalid api key') ||
    combined.includes('provided api key is invalid')
  ) {
    return {
      category: 'INVALID_API_KEY',
      httpStatus,
      googleStatus,
      userMessage: 'The configured GOOGLE_MAPS_API_KEY is invalid. Verify the secret value on the server.',
      details: message || null,
    };
  }

  if (
    combined.includes('referer') ||
    combined.includes('referrer') ||
    combined.includes('ip_address_blocked') ||
    combined.includes('service_blocked') ||
    combined.includes('not authorized to use this api') ||
    combined.includes('api_key_http_referrer_blocked')
  ) {
    return {
      category: 'API_RESTRICTION',
      httpStatus,
      googleStatus,
      userMessage: `The server API key is restricted from calling ${params.apiName}. Check API and application restrictions on the key.`,
      details: message || null,
    };
  }

  if (
    httpStatus === 400 ||
    combined.includes('invalid_argument') ||
    combined.includes('invalid_request')
  ) {
    return {
      category: 'INCORRECT_REQUEST',
      httpStatus,
      googleStatus,
      userMessage: `${params.apiName} rejected the request parameters. Verify the location or route inputs.`,
      details: message || null,
    };
  }

  if (httpStatus === 401 || httpStatus === 403 || combined.includes('permission_denied') || combined.includes('request_denied')) {
    return {
      category: 'AUTH_FAILURE',
      httpStatus,
      googleStatus,
      userMessage: `${params.apiName} authorization failed (HTTP ${httpStatus ?? 'unknown'}). Check API enablement, billing, and key restrictions.`,
      details: message || null,
    };
  }

  return {
    category: 'UNKNOWN_ERROR',
    httpStatus,
    googleStatus,
    userMessage: `${params.apiName} returned an unexpected error.`,
    details: message || null,
  };
}

export function getAppRefererHeader(requestReferer?: string | null): string | null {
  const candidates = [requestReferer, process.env.APP_URL];
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      if (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        parsed.hostname !== 'localhost' &&
        parsed.hostname !== '127.0.0.1' &&
        parsed.hostname !== '0.0.0.0'
      ) {
        return `${parsed.origin}/`;
      }
    } catch {
      // ignore invalid URL
    }
  }
  return null;
}

function buildGoogleHeaders(
  apiKey: string,
  extra: Record<string, string>,
  requestReferer?: string | null
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Goog-Api-Key': apiKey,
    'X-Goog-Maps-Solution-ID': SOLUTION_ID,
    ...extra,
  };
  const referer = getAppRefererHeader(requestReferer);
  if (referer) {
    headers.Referer = referer;
  }
  return headers;
}

function isKeyAuthErrorStatus(status: number, data: any): boolean {
  if (status === 401 || status === 403) return true;
  const meta = extractGoogleErrorMeta(data);
  const combined = `${meta.googleStatus || ''} ${meta.errorReason || ''} ${meta.rawMessage || ''}`.toLowerCase();
  return (
    combined.includes('permission_denied') ||
    combined.includes('request_denied') ||
    combined.includes('api_key_invalid') ||
    combined.includes('billing') ||
    combined.includes('service_disabled') ||
    combined.includes('service_blocked') ||
    combined.includes('referer') ||
    combined.includes('referrer')
  );
}

async function fetchGoogleJsonWithKeyFallback(params: {
  url: string;
  method: 'GET' | 'POST';
  extraHeaders: Record<string, string>;
  body?: string;
  requestReferer?: string | null;
}): Promise<{ response: Response; data: any }> {
  const keys = getServerGoogleMapsApiKeys();
  let lastResult: { response: Response; data: any } | null = null;

  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const response = await fetch(params.url, {
      method: params.method,
      headers: buildGoogleHeaders(key, params.extraHeaders, params.requestReferer),
      body: params.body,
    });
    const data = await response.json().catch(() => null);
    lastResult = { response, data };

    if (response.ok) {
      lastWorkingServerKey = key;
      return lastResult;
    }

    // Only retry with an alternate server key if this looks like an auth/billing/key error
    if (!isKeyAuthErrorStatus(response.status, data)) {
      return lastResult;
    }
  }

  return lastResult!;
}

function extractGoogleErrorMeta(payload: any): {
  googleStatus: string | null;
  rawMessage: string | null;
  errorReason: string | null;
} {
  if (!payload || typeof payload !== 'object') {
    return { googleStatus: null, rawMessage: null, errorReason: null };
  }

  // Standard Google API v1/v2 error envelope: { error: { code, message, status, details } }
  if (payload.error && typeof payload.error === 'object') {
    const details = Array.isArray(payload.error.details) ? payload.error.details : [];
    const errorInfo = details.find((d: any) => d && typeof d.reason === 'string');
    const detailSummary = details
      .map((d: any) => {
        if (!d || typeof d !== 'object') return '';
        const parts = [d.reason, d.domain, d.message, d.metadata ? JSON.stringify(d.metadata) : ''].filter(Boolean);
        return parts.join(' ');
      })
      .filter(Boolean)
      .join(' | ');
    const baseMsg = typeof payload.error.message === 'string' ? payload.error.message : '';
    const combinedMessage = [baseMsg, detailSummary].filter(Boolean).join(' — ');
    return {
      googleStatus: typeof payload.error.status === 'string' ? payload.error.status : null,
      rawMessage: combinedMessage || null,
      errorReason: errorInfo ? String(errorInfo.reason) : null,
    };
  }

  // Geocoding classic envelope: { status: "REQUEST_DENIED", error_message: "..." }
  if (typeof payload.status === 'string' && payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
    return {
      googleStatus: payload.status,
      rawMessage: typeof payload.error_message === 'string' ? payload.error_message : null,
      errorReason: null,
    };
  }

  return { googleStatus: null, rawMessage: null, errorReason: null };
}

export function missingKeyDiagnostic(apiName: string): MapsApiDiagnostic {
  return {
    category: 'MISSING_API_KEY',
    httpStatus: 503,
    googleStatus: null,
    userMessage: `GOOGLE_MAPS_API_KEY is not configured on the server for ${apiName}. Configure the secret or switch to Demo Mode.`,
    details: 'Set GOOGLE_MAPS_API_KEY in server environment secrets.',
  };
}

function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function extractAddressComponent(components: any[], type: string): string | null {
  if (!Array.isArray(components)) return null;
  const match = components.find(
    (c) => Array.isArray(c?.types) && c.types.includes(type)
  );
  return typeof match?.long_name === 'string'
    ? match.long_name
    : typeof match?.longText === 'string'
      ? match.longText
      : null;
}

export async function geocodeAddressOnServer(params: {
  address?: string;
  latitude?: number;
  longitude?: number;
  requestReferer?: string | null;
}): Promise<{
  ok: boolean;
  result?: {
    label: string;
    formattedAddress: string;
    city: string | null;
    state: string | null;
    pincode: string | null;
    latitude: number;
    longitude: number;
  } | null;
  diagnostic?: MapsApiDiagnostic;
}> {
  const apiKey = getServerGoogleMapsApiKey();
  if (!apiKey) {
    return { ok: false, diagnostic: missingKeyDiagnostic('Geocoding API') };
  }

  const isForward = typeof params.address === 'string' && params.address.trim().length > 0;
  const isReverse = !isForward && isValidLatLng(params.latitude, params.longitude);

  if (!isForward && !isReverse) {
    return {
      ok: false,
      diagnostic: {
        category: 'INCORRECT_REQUEST',
        httpStatus: 400,
        googleStatus: 'INVALID_REQUEST',
        userMessage: 'Provide either a valid address/PIN code or valid latitude and longitude coordinates.',
      },
    };
  }

  // 1. Primary: Official Geocoding API v4 REST endpoint
  try {
    const v4Url = isForward
      ? `https://geocode.googleapis.com/v4/geocode/address/${encodeURIComponent(params.address!.trim().slice(0, 200))}?regionCode=IN&languageCode=en`
      : `https://geocode.googleapis.com/v4/geocode/location/${params.latitude},${params.longitude}?languageCode=en`;

    const { response, data } = await fetchGoogleJsonWithKeyFallback({
      url: v4Url,
      method: 'GET',
      extraHeaders: {
        'X-Goog-FieldMask':
          'results.placeId,results.location,results.formattedAddress,results.addressComponents',
      },
      requestReferer: params.requestReferer,
    });

    if (response.ok && data && typeof data === 'object') {
      const results = Array.isArray(data.results) ? data.results : [];
      if (results.length === 0) {
        return { ok: true, result: null };
      }

      const first = results[0];
      const lat = first?.location?.latitude;
      const lng = first?.location?.longitude;
      const formattedAddress =
        typeof first?.formattedAddress === 'string' ? first.formattedAddress : '';

      if (!isValidLatLng(lat, lng) || !formattedAddress) {
        return {
          ok: false,
          diagnostic: {
            category: 'INCOMPLETE_RESPONSE',
            httpStatus: response.status,
            googleStatus: null,
            userMessage: 'Geocoding API returned an incomplete coordinate record.',
          },
        };
      }

      const components = first.addressComponents || [];
      const city =
        extractAddressComponent(components, 'locality') ||
        extractAddressComponent(components, 'administrative_area_level_2');
      const state = extractAddressComponent(components, 'administrative_area_level_1');
      const pincode = extractAddressComponent(components, 'postal_code');

      return {
        ok: true,
        result: {
          label: params.address?.trim() || city || formattedAddress.split(',')[0] || formattedAddress,
          formattedAddress,
          city,
          state,
          pincode,
          latitude: lat,
          longitude: lng,
        },
      };
    }

    const meta = extractGoogleErrorMeta(data);
    const primaryDiagnostic = classifyGoogleApiError({
      httpStatus: response.status,
      googleStatus: meta.googleStatus,
      rawMessage: meta.rawMessage,
      errorReason: meta.errorReason,
      apiName: 'Geocoding API',
    });

    // If forward geocoding failed solely because Geocoding API is not enabled/billed on this starter key,
    // use Places API (New) Text Search (already enabled on starter keys) to resolve the Indian address/PIN.
    const canFallbackToPlaces =
      isForward &&
      (primaryDiagnostic.category === 'API_NOT_ENABLED' ||
        primaryDiagnostic.category === 'BILLING_NOT_ENABLED' ||
        primaryDiagnostic.category === 'API_RESTRICTION' ||
        primaryDiagnostic.category === 'AUTH_FAILURE');

    if (!canFallbackToPlaces) {
      return { ok: false, diagnostic: primaryDiagnostic };
    }

    const cleanedAddress = params.address!.trim().slice(0, 200);
    const placesQuery = cleanedAddress.toLowerCase().includes('india')
      ? cleanedAddress
      : `${cleanedAddress}, India`;

    const { response: placesRes, data: placesData } = await fetchGoogleJsonWithKeyFallback({
      url: 'https://places.googleapis.com/v1/places:searchText',
      method: 'POST',
      extraHeaders: {
        'Content-Type': 'application/json',
        'X-Goog-FieldMask':
          'places.displayName,places.formattedAddress,places.location,places.addressComponents',
      },
      body: JSON.stringify({
        textQuery: placesQuery,
        pageSize: 1,
        languageCode: 'en',
        regionCode: 'IN',
      }),
      requestReferer: params.requestReferer,
    });
    if (!placesRes.ok || !placesData || typeof placesData !== 'object') {
      return { ok: false, diagnostic: primaryDiagnostic };
    }

    const placeList = Array.isArray(placesData.places) ? placesData.places : [];
    if (placeList.length === 0) {
      return { ok: true, result: null };
    }

    const p = placeList[0];
    const pLat = p?.location?.latitude;
    const pLng = p?.location?.longitude;
    const pAddr = typeof p?.formattedAddress === 'string' ? p.formattedAddress : '';

    if (!isValidLatLng(pLat, pLng) || !pAddr) {
      return {
        ok: false,
        diagnostic: {
          category: 'INCOMPLETE_RESPONSE',
          httpStatus: placesRes.status,
          googleStatus: null,
          userMessage: 'Location lookup returned incomplete coordinates.',
        },
      };
    }

    const pComponents = p.addressComponents || [];
    const city =
      extractAddressComponent(pComponents, 'locality') ||
      extractAddressComponent(pComponents, 'administrative_area_level_2');
    const state = extractAddressComponent(pComponents, 'administrative_area_level_1');
    const pincode = extractAddressComponent(pComponents, 'postal_code');

    return {
      ok: true,
      result: {
        label: cleanedAddress,
        formattedAddress: pAddr,
        city,
        state,
        pincode,
        latitude: pLat,
        longitude: pLng,
      },
    };
  } catch (err) {
    return {
      ok: false,
      diagnostic: {
        category: 'NETWORK_FAILURE',
        httpStatus: null,
        googleStatus: null,
        userMessage: 'Network error while contacting Google Geocoding API.',
        details: sanitizeSecretFromText(err instanceof Error ? err.message : String(err)),
      },
    };
  }
}

export async function searchProvidersPlacesOnServer(params: {
  serviceName: string;
  category: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  pageToken?: string | null;
  requestReferer?: string | null;
}): Promise<{
  ok: boolean;
  places?: Array<{
    placeId: string;
    name: string;
    providerType: string;
    address: string;
    latitude: number;
    longitude: number;
    phone: string | null;
    website: string | null;
    googleMapsUri: string | null;
  }>;
  nextPageToken?: string | null;
  diagnostic?: MapsApiDiagnostic;
}> {
  const apiKey = getServerGoogleMapsApiKey();
  if (!apiKey) {
    return { ok: false, diagnostic: missingKeyDiagnostic('Places API (New)') };
  }

  if (!isValidLatLng(params.latitude, params.longitude)) {
    return {
      ok: false,
      diagnostic: {
        category: 'INCORRECT_REQUEST',
        httpStatus: 400,
        googleStatus: 'INVALID_ARGUMENT',
        userMessage: 'Valid starting coordinates are required for provider discovery.',
      },
    };
  }

  const facilityNoun =
    params.category === 'Diagnostics' ? 'diagnostic centre OR hospital' : 'hospital OR clinic';
  const locationContext = params.city ? ` near ${params.city}` : '';
  const textQuery = `${params.serviceName} ${facilityNoun}${locationContext}`.slice(0, 160);

  const body: Record<string, unknown> = {
    textQuery,
    pageSize: 20,
    languageCode: 'en',
    regionCode: 'IN',
    locationBias: {
      circle: {
        center: {
          latitude: params.latitude,
          longitude: params.longitude,
        },
        radius: 25000.0,
      },
    },
  };

  if (params.pageToken && typeof params.pageToken === 'string') {
    body.pageToken = params.pageToken;
  }

  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.primaryTypeDisplayName',
    'places.nationalPhoneNumber',
    'places.internationalPhoneNumber',
    'places.websiteUri',
    'places.googleMapsUri',
    'nextPageToken',
  ].join(',');

  try {
    const { response, data } = await fetchGoogleJsonWithKeyFallback({
      url: 'https://places.googleapis.com/v1/places:searchText',
      method: 'POST',
      extraHeaders: {
        'Content-Type': 'application/json',
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
      requestReferer: params.requestReferer,
    });

    if (!response.ok) {
      const meta = extractGoogleErrorMeta(data);
      return {
        ok: false,
        diagnostic: classifyGoogleApiError({
          httpStatus: response.status,
          googleStatus: meta.googleStatus,
          rawMessage: meta.rawMessage,
          errorReason: meta.errorReason,
          apiName: 'Places API (New)',
        }),
      };
    }

    if (!data || typeof data !== 'object') {
      return {
        ok: false,
        diagnostic: {
          category: 'INCOMPLETE_RESPONSE',
          httpStatus: response.status,
          googleStatus: null,
          userMessage: 'Places API (New) returned an unreadable payload.',
        },
      };
    }

    const rawPlaces = Array.isArray(data.places) ? data.places : [];
    const normalized = rawPlaces
      .filter((p: any) => {
        const lat = p?.location?.latitude;
        const lng = p?.location?.longitude;
        return typeof p?.id === 'string' && typeof p?.displayName?.text === 'string' && isValidLatLng(lat, lng);
      })
      .map((p: any) => ({
        placeId: String(p.id),
        name: String(p.displayName.text),
        providerType:
          typeof p.primaryTypeDisplayName?.text === 'string'
            ? p.primaryTypeDisplayName.text
            : 'Hospital / Clinic',
        address:
          typeof p.formattedAddress === 'string' ? p.formattedAddress : 'Information unavailable',
        latitude: Number(p.location.latitude),
        longitude: Number(p.location.longitude),
        phone:
          typeof p.nationalPhoneNumber === 'string'
            ? p.nationalPhoneNumber
            : typeof p.internationalPhoneNumber === 'string'
              ? p.internationalPhoneNumber
              : null,
        website: typeof p.websiteUri === 'string' ? p.websiteUri : null,
        googleMapsUri: typeof p.googleMapsUri === 'string' ? p.googleMapsUri : null,
      }));

    return {
      ok: true,
      places: normalized,
      nextPageToken: typeof data.nextPageToken === 'string' ? data.nextPageToken : null,
    };
  } catch (err) {
    return {
      ok: false,
      diagnostic: {
        category: 'NETWORK_FAILURE',
        httpStatus: null,
        googleStatus: null,
        userMessage: 'Network error while contacting Google Places API (New).',
        details: sanitizeSecretFromText(err instanceof Error ? err.message : String(err)),
      },
    };
  }
}

export async function searchAccommodationsPlacesOnServer(params: {
  latitude: number;
  longitude: number;
  requestReferer?: string | null;
}): Promise<{
  ok: boolean;
  places?: Array<{
    placeId: string;
    name: string;
    accommodationType: string;
    address: string;
    latitude: number;
    longitude: number;
    googleMapsUri: string | null;
  }>;
  diagnostic?: MapsApiDiagnostic;
}> {
  const apiKey = getServerGoogleMapsApiKey();
  if (!apiKey) {
    return { ok: false, diagnostic: missingKeyDiagnostic('Places API (New)') };
  }

  if (!isValidLatLng(params.latitude, params.longitude)) {
    return {
      ok: false,
      diagnostic: {
        category: 'INCORRECT_REQUEST',
        httpStatus: 400,
        googleStatus: 'INVALID_ARGUMENT',
        userMessage: 'Valid hospital coordinates are required for accommodation discovery.',
      },
    };
  }

  const body = {
    includedTypes: ['hotel', 'lodging', 'guest_house'],
    maxResultCount: 10,
    rankPreference: 'DISTANCE',
    languageCode: 'en',
    regionCode: 'IN',
    locationRestriction: {
      circle: {
        center: {
          latitude: params.latitude,
          longitude: params.longitude,
        },
        radius: 5000.0,
      },
    },
  };

  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.primaryTypeDisplayName',
    'places.googleMapsUri',
  ].join(',');

  try {
    const { response, data } = await fetchGoogleJsonWithKeyFallback({
      url: 'https://places.googleapis.com/v1/places:searchNearby',
      method: 'POST',
      extraHeaders: {
        'Content-Type': 'application/json',
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
      requestReferer: params.requestReferer,
    });

    if (!response.ok) {
      const meta = extractGoogleErrorMeta(data);
      return {
        ok: false,
        diagnostic: classifyGoogleApiError({
          httpStatus: response.status,
          googleStatus: meta.googleStatus,
          rawMessage: meta.rawMessage,
          errorReason: meta.errorReason,
          apiName: 'Places API (New)',
        }),
      };
    }

    const rawPlaces = Array.isArray(data?.places) ? data.places : [];
    const normalized = rawPlaces
      .filter((p: any) => {
        const lat = p?.location?.latitude;
        const lng = p?.location?.longitude;
        return typeof p?.id === 'string' && typeof p?.displayName?.text === 'string' && isValidLatLng(lat, lng);
      })
      .map((p: any) => ({
        placeId: String(p.id),
        name: String(p.displayName.text),
        accommodationType:
          typeof p.primaryTypeDisplayName?.text === 'string'
            ? p.primaryTypeDisplayName.text
            : 'Hotel / Lodging',
        address:
          typeof p.formattedAddress === 'string' ? p.formattedAddress : 'Information unavailable',
        latitude: Number(p.location.latitude),
        longitude: Number(p.location.longitude),
        googleMapsUri: typeof p.googleMapsUri === 'string' ? p.googleMapsUri : null,
      }));

    return { ok: true, places: normalized };
  } catch (err) {
    return {
      ok: false,
      diagnostic: {
        category: 'NETWORK_FAILURE',
        httpStatus: null,
        googleStatus: null,
        userMessage: 'Network error while discovering nearby accommodation.',
        details: sanitizeSecretFromText(err instanceof Error ? err.message : String(err)),
      },
    };
  }
}

function parseDurationStringSeconds(durationStr: unknown): number | null {
  if (typeof durationStr !== 'string') return null;
  const match = durationStr.match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) return null;
  const secs = Number(match[1]);
  return Number.isFinite(secs) && secs >= 0 ? Math.round(secs) : null;
}

export async function computeSingleRouteOnServer(params: {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  travelMode: TravelMode;
  requestReferer?: string | null;
}): Promise<{
  ok: boolean;
  supported: boolean;
  distanceMeters: number | null;
  durationSeconds: number | null;
  diagnostic?: MapsApiDiagnostic;
}> {
  const apiKey = getServerGoogleMapsApiKey();
  if (!apiKey) {
    return {
      ok: false,
      supported: false,
      distanceMeters: null,
      durationSeconds: null,
      diagnostic: missingKeyDiagnostic('Routes API'),
    };
  }

  if (
    !isValidLatLng(params.originLat, params.originLng) ||
    !isValidLatLng(params.destLat, params.destLng)
  ) {
    return {
      ok: false,
      supported: false,
      distanceMeters: null,
      durationSeconds: null,
      diagnostic: {
        category: 'INCORRECT_REQUEST',
        httpStatus: 400,
        googleStatus: 'INVALID_ARGUMENT',
        userMessage: 'Valid origin and destination coordinates are required to compute routes.',
      },
    };
  }

  const body: Record<string, unknown> = {
    origin: {
      location: {
        latLng: {
          latitude: params.originLat,
          longitude: params.originLng,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: params.destLat,
          longitude: params.destLng,
        },
      },
    },
    travelMode: params.travelMode,
    computeAlternativeRoutes: false,
    languageCode: 'en-IN',
    units: 'METRIC',
  };

  // routingPreference is only accepted for DRIVE and TWO_WHEELER
  if (params.travelMode === 'DRIVE' || params.travelMode === 'TWO_WHEELER') {
    body.routingPreference = 'TRAFFIC_AWARE';
  }

  try {
    const { response, data } = await fetchGoogleJsonWithKeyFallback({
      url: 'https://routes.googleapis.com/directions/v2:computeRoutes',
      method: 'POST',
      extraHeaders: {
        'Content-Type': 'application/json',
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
      },
      body: JSON.stringify(body),
      requestReferer: params.requestReferer,
    });

    if (!response.ok) {
      const meta = extractGoogleErrorMeta(data);
      return {
        ok: false,
        supported: false,
        distanceMeters: null,
        durationSeconds: null,
        diagnostic: classifyGoogleApiError({
          httpStatus: response.status,
          googleStatus: meta.googleStatus,
          rawMessage: meta.rawMessage,
          errorReason: meta.errorReason,
          apiName: 'Routes API',
        }),
      };
    }

    const routes = Array.isArray(data?.routes) ? data.routes : [];
    if (routes.length === 0) {
      // Valid response when a travel mode (e.g., TRANSIT or WALK across cities) has no supported route
      return {
        ok: true,
        supported: false,
        distanceMeters: null,
        durationSeconds: null,
      };
    }

    const primary = routes[0];
    const distanceMeters =
      typeof primary?.distanceMeters === 'number' && Number.isFinite(primary.distanceMeters)
        ? primary.distanceMeters
        : null;
    const durationSeconds = parseDurationStringSeconds(primary?.duration);

    if (distanceMeters === null && durationSeconds === null) {
      return {
        ok: false,
        supported: false,
        distanceMeters: null,
        durationSeconds: null,
        diagnostic: {
          category: 'INCOMPLETE_RESPONSE',
          httpStatus: response.status,
          googleStatus: null,
          userMessage: 'Routes API returned an incomplete route summary.',
        },
      };
    }

    return {
      ok: true,
      supported: true,
      distanceMeters,
      durationSeconds,
    };
  } catch (err) {
    return {
      ok: false,
      supported: false,
      distanceMeters: null,
      durationSeconds: null,
      diagnostic: {
        category: 'NETWORK_FAILURE',
        httpStatus: null,
        googleStatus: null,
        userMessage: 'Network error while contacting Google Routes API.',
        details: sanitizeSecretFromText(err instanceof Error ? err.message : String(err)),
      },
    };
  }
}
