import type {
  Coordinates,
  MapsApiDiagnostic,
  StartingLocation,
  TravelMode,
  TravelModeResult,
  TravelSummary,
} from '../types/medroute';
import {
  buildGoogleMapsNavigationUrl,
  calculateHaversineKm,
  formatDurationSeconds,
  UNAVAILABLE_TEXT,
} from '../utils/safety';

function notifyQuotaIfNeeded(diagnostic?: MapsApiDiagnostic | null) {
  if (diagnostic?.category === 'QUOTA_EXCEEDED' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

export async function fetchMapsBackendStatus(): Promise<{ configured: boolean }> {
  try {
    const res = await fetch('/api/maps/status');
    if (!res.ok) return { configured: false };
    const data = await res.json();
    return { configured: Boolean(data?.configured) };
  } catch {
    return { configured: false };
  }
}

export async function geocodeLocationViaBackend(params: {
  address?: string;
  latitude?: number;
  longitude?: number;
}): Promise<{
  ok: boolean;
  location?: StartingLocation | null;
  diagnostic?: MapsApiDiagnostic | null;
}> {
  try {
    const res = await fetch('/api/maps/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      const diagnostic: MapsApiDiagnostic = data?.diagnostic || {
        category: 'UNKNOWN_ERROR',
        httpStatus: res.status,
        userMessage: 'Unable to resolve this location via Google Geocoding API.',
      };
      notifyQuotaIfNeeded(diagnostic);
      return { ok: false, diagnostic };
    }

    if (!data.result) {
      return { ok: true, location: null, diagnostic: null };
    }

    return {
      ok: true,
      location: {
        label: data.result.label,
        formattedAddress: data.result.formattedAddress,
        city: data.result.city ?? null,
        state: data.result.state ?? null,
        pincode: data.result.pincode ?? null,
        latitude: data.result.latitude,
        longitude: data.result.longitude,
        source: params.address ? 'geocode_live' : 'gps',
      },
      diagnostic: null,
    };
  } catch (err) {
    return {
      ok: false,
      diagnostic: {
        category: 'NETWORK_FAILURE',
        userMessage: 'Network error while resolving location. Check your connection or switch to Demo Mode.',
        details: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export interface LivePlaceProviderItem {
  placeId: string;
  name: string;
  providerType: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  website: string | null;
  googleMapsUri: string | null;
}

export async function searchLiveProvidersViaBackend(params: {
  serviceName: string;
  category: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  pageToken?: string | null;
}): Promise<{
  ok: boolean;
  places: LivePlaceProviderItem[];
  nextPageToken: string | null;
  diagnostic?: MapsApiDiagnostic | null;
}> {
  try {
    const res = await fetch('/api/maps/places/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      const diagnostic: MapsApiDiagnostic = data?.diagnostic || {
        category: 'UNKNOWN_ERROR',
        httpStatus: res.status,
        userMessage: 'Unable to retrieve live hospital listings from Places API (New).',
      };
      notifyQuotaIfNeeded(diagnostic);
      return { ok: false, places: [], nextPageToken: null, diagnostic };
    }

    return {
      ok: true,
      places: Array.isArray(data.places) ? data.places : [],
      nextPageToken: typeof data.nextPageToken === 'string' ? data.nextPageToken : null,
      diagnostic: null,
    };
  } catch (err) {
    return {
      ok: false,
      places: [],
      nextPageToken: null,
      diagnostic: {
        category: 'NETWORK_FAILURE',
        userMessage: 'Network error while discovering providers. Check your connection or try Demo Mode.',
        details: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export interface LivePlaceAccommodationItem {
  placeId: string;
  name: string;
  accommodationType: string;
  address: string;
  latitude: number;
  longitude: number;
  website: string | null;
  googleMapsUri: string | null;
  phoneNumber?: string | null;
}

export async function searchLiveAccommodationsViaBackend(params: {
  latitude: number;
  longitude: number;
}): Promise<{
  ok: boolean;
  places: LivePlaceAccommodationItem[];
  diagnostic?: MapsApiDiagnostic | null;
}> {
  try {
    const res = await fetch('/api/maps/places/accommodations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      const diagnostic: MapsApiDiagnostic = data?.diagnostic || {
        category: 'UNKNOWN_ERROR',
        httpStatus: res.status,
        userMessage: 'Unable to retrieve nearby accommodation listings from Places API (New).',
      };
      notifyQuotaIfNeeded(diagnostic);
      return { ok: false, places: [], diagnostic };
    }

    return {
      ok: true,
      places: Array.isArray(data.places) ? data.places : [],
      diagnostic: null,
    };
  } catch (err) {
    return {
      ok: false,
      places: [],
      diagnostic: {
        category: 'NETWORK_FAILURE',
        userMessage: 'Network error while discovering nearby stays.',
        details: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function computeLiveRoutesViaBackend(params: {
  origin: Coordinates;
  destination: Coordinates;
  destinationName: string;
  selectedMode?: TravelMode;
}): Promise<{
  ok: boolean;
  summary?: TravelSummary;
  diagnostic?: MapsApiDiagnostic | null;
}> {
  const allModes: TravelMode[] = ['DRIVE', 'TWO_WHEELER', 'TRANSIT', 'WALK'];

  try {
    const res = await fetch('/api/maps/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: params.origin,
        destination: params.destination,
        modes: allModes,
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      const diagnostic: MapsApiDiagnostic = data?.diagnostic || {
        category: 'UNKNOWN_ERROR',
        httpStatus: res.status,
        userMessage: 'Unable to calculate road distance and travel time via Google Routes API.',
      };
      notifyQuotaIfNeeded(diagnostic);
      return { ok: false, diagnostic };
    }

    const modesRecord = {} as Record<TravelMode, TravelModeResult>;
    for (const mode of allModes) {
      const raw = data.modes?.[mode];
      if (raw && raw.ok && raw.supported) {
        const distanceKm =
          typeof raw.distanceMeters === 'number' && Number.isFinite(raw.distanceMeters)
            ? raw.distanceMeters / 1000
            : null;
        modesRecord[mode] = {
          mode,
          supported: true,
          distanceMeters: raw.distanceMeters ?? null,
          distanceKm,
          durationSeconds: raw.durationSeconds ?? null,
          durationText: formatDurationSeconds(raw.durationSeconds),
          transitFare: raw.transitFare ?? null,
          tollInfo: raw.tollInfo ?? null,
          source: 'google_routes',
        };
      } else {
        modesRecord[mode] = {
          mode,
          supported: false,
          distanceMeters: null,
          distanceKm: null,
          durationSeconds: null,
          durationText: UNAVAILABLE_TEXT,
          transitFare: null,
          tollInfo: null,
          source: 'google_routes',
          errorMessage: raw?.diagnostic?.userMessage || 'Route unavailable for this travel mode',
        };
      }
    }

    const activeMode = params.selectedMode || 'DRIVE';
    return {
      ok: true,
      summary: {
        origin: params.origin,
        destination: params.destination,
        selectedMode: activeMode,
        modes: modesRecord,
        navigationUrl: buildGoogleMapsNavigationUrl(
          params.origin,
          params.destination,
          params.destinationName,
          activeMode
        ),
        apiDiagnostic: data.diagnostic || null,
      },
      diagnostic: data.diagnostic || null,
    };
  } catch (err) {
    return {
      ok: false,
      diagnostic: {
        category: 'NETWORK_FAILURE',
        userMessage: 'Network error while computing route via Google Routes API.',
        details: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/**
 * Generates transparent distance-based travel estimates exclusively for Demo Mode
 * when operating without live Google Maps API calls.
 */
export function buildDemoTravelSummary(params: {
  origin: Coordinates;
  destination: Coordinates;
  destinationName: string;
  selectedMode?: TravelMode;
}): TravelSummary {
  const straightKm = calculateHaversineKm(params.origin, params.destination);
  const roadKm = straightKm !== null ? Math.max(0.5, straightKm * 1.28) : null;
  const distanceMeters = roadKm !== null ? Math.round(roadKm * 1000) : null;

  const speedsKmh: Record<TravelMode, number> = {
    DRIVE: 26,
    TWO_WHEELER: 30,
    TRANSIT: 19,
    WALK: 4.5,
  };

  const modesRecord = {} as Record<TravelMode, TravelModeResult>;
  (['DRIVE', 'TWO_WHEELER', 'TRANSIT', 'WALK'] as TravelMode[]).forEach((mode) => {
    // Walking over 15 km is marked unsupported for clarity
    if (roadKm === null || (mode === 'WALK' && roadKm > 15)) {
      modesRecord[mode] = {
        mode,
        supported: false,
        distanceMeters: null,
        distanceKm: null,
        durationSeconds: null,
        durationText: UNAVAILABLE_TEXT,
        source: 'demo_estimate',
        errorMessage:
          mode === 'WALK' && roadKm !== null && roadKm > 15
            ? 'Distance exceeds practical walking range'
            : 'Coordinates unavailable',
      };
      return;
    }

    const durationSeconds = Math.max(120, Math.round((roadKm / speedsKmh[mode]) * 3600));
    modesRecord[mode] = {
      mode,
      supported: true,
      distanceMeters,
      distanceKm: roadKm,
      durationSeconds,
      durationText: formatDurationSeconds(durationSeconds),
      source: 'demo_estimate',
    };
  });

  const activeMode = params.selectedMode || 'DRIVE';
  return {
    origin: params.origin,
    destination: params.destination,
    selectedMode: activeMode,
    modes: modesRecord,
    navigationUrl: buildGoogleMapsNavigationUrl(
      params.origin,
      params.destination,
      params.destinationName,
      activeMode
    ),
    apiDiagnostic: null,
  };
}
