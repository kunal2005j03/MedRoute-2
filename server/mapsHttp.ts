import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TravelMode } from '../src/types/medroute';
import {
  computeSingleRouteOnServer,
  geocodeAddressOnServer,
  getServerGoogleMapsApiKey,
  searchAccommodationsPlacesOnServer,
  searchProvidersPlacesOnServer,
} from './googleMaps.js';

const ALLOWED_TRAVEL_MODES: TravelMode[] = ['DRIVE', 'TWO_WHEELER', 'TRANSIT', 'WALK'];
const MAX_BODY_BYTES = 64 * 1024;

export interface ApiRequest extends IncomingMessage {
  body?: unknown;
}

export interface ApiResponse extends ServerResponse {
  status?: (code: number) => ApiResponse;
  json?: (payload: unknown) => ApiResponse | void;
}

function sendJson(res: ApiResponse, statusCode: number, payload: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    const nextRes = res.status(statusCode);
    if (typeof nextRes.json === 'function') {
      nextRes.json(payload);
      return;
    }
  }
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

function getHeaderValue(req: ApiRequest, name: string): string {
  const val = req.headers[name];
  if (typeof val === 'string') return val.trim();
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0].trim();
  return '';
}

export function extractRequestReferer(req: ApiRequest): string | null {
  const origin = getHeaderValue(req, 'origin');
  if (origin) return origin;

  const referer = getHeaderValue(req, 'referer');
  if (referer) return referer;

  const forwardedHost = getHeaderValue(req, 'x-forwarded-host').split(',')[0]?.trim() || '';
  if (forwardedHost) {
    const proto = getHeaderValue(req, 'x-forwarded-proto').split(',')[0]?.trim() || 'https';
    return `${proto}://${forwardedHost}/`;
  }

  return null;
}

async function readJsonBody(req: ApiRequest): Promise<Record<string, any> | null> {
  if (req.body !== undefined) {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return req.body as Record<string, any>;
    }
    if (typeof req.body === 'string') {
      try {
        const parsed = JSON.parse(req.body);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return null;
      }
    }
    if (Buffer.isBuffer(req.body)) {
      try {
        const parsed = JSON.parse(req.body.toString('utf8'));
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let aborted = false;

    req.on('data', (chunk: Buffer | string) => {
      if (aborted) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > MAX_BODY_BYTES) {
        aborted = true;
        resolve(null);
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      if (aborted) return;
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed && typeof parsed === 'object' ? parsed : null);
      } catch {
        resolve(null);
      }
    });

    req.on('error', () => {
      if (!aborted) resolve(null);
    });
  });
}

function rejectMethod(res: ApiResponse, allowed: string): void {
  res.setHeader('Allow', allowed);
  sendJson(res, 405, {
    ok: false,
    diagnostic: {
      category: 'INCORRECT_REQUEST',
      httpStatus: 405,
      userMessage: `Method not allowed. Use ${allowed}.`,
    },
  });
}

export async function handleMapsStatus(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    rejectMethod(res, 'GET');
    return;
  }

  const configured = getServerGoogleMapsApiKey() !== null;
  sendJson(res, 200, { configured });
}

export async function handleMapsGeocode(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    rejectMethod(res, 'POST');
    return;
  }

  const body = await readJsonBody(req);
  if (!body) {
    sendJson(res, 400, {
      ok: false,
      diagnostic: {
        category: 'INCORRECT_REQUEST',
        httpStatus: 400,
        userMessage: 'Invalid JSON request payload.',
      },
    });
    return;
  }

  const { address, latitude, longitude } = body;
  const requestReferer = extractRequestReferer(req);

  const result = await geocodeAddressOnServer({
    address: typeof address === 'string' ? address : undefined,
    latitude: typeof latitude === 'number' ? latitude : undefined,
    longitude: typeof longitude === 'number' ? longitude : undefined,
    requestReferer,
  });

  sendJson(res, 200, result);
}

export async function handleMapsProviders(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    rejectMethod(res, 'POST');
    return;
  }

  const body = await readJsonBody(req);
  if (!body) {
    sendJson(res, 400, {
      ok: false,
      diagnostic: {
        category: 'INCORRECT_REQUEST',
        httpStatus: 400,
        userMessage: 'Invalid JSON request payload.',
      },
    });
    return;
  }

  const { serviceName, category, latitude, longitude, city, pageToken } = body;

  if (typeof serviceName !== 'string' || !serviceName.trim()) {
    sendJson(res, 400, {
      ok: false,
      diagnostic: {
        category: 'INCORRECT_REQUEST',
        httpStatus: 400,
        userMessage: 'A medical service name is required.',
      },
    });
    return;
  }

  const requestReferer = extractRequestReferer(req);
  const result = await searchProvidersPlacesOnServer({
    serviceName: serviceName.trim(),
    category: typeof category === 'string' ? category : 'Consultation',
    latitude: Number(latitude),
    longitude: Number(longitude),
    city: typeof city === 'string' ? city : null,
    pageToken: typeof pageToken === 'string' ? pageToken : null,
    requestReferer,
  });

  sendJson(res, 200, result);
}

export async function handleMapsAccommodations(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    rejectMethod(res, 'POST');
    return;
  }

  const body = await readJsonBody(req);
  if (!body) {
    sendJson(res, 400, {
      ok: false,
      diagnostic: {
        category: 'INCORRECT_REQUEST',
        httpStatus: 400,
        userMessage: 'Invalid JSON request payload.',
      },
    });
    return;
  }

  const { latitude, longitude } = body;
  const requestReferer = extractRequestReferer(req);

  const result = await searchAccommodationsPlacesOnServer({
    latitude: Number(latitude),
    longitude: Number(longitude),
    requestReferer,
  });

  sendJson(res, 200, result);
}

export async function handleMapsRoutes(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    rejectMethod(res, 'POST');
    return;
  }

  const body = await readJsonBody(req);
  if (!body) {
    sendJson(res, 400, {
      ok: false,
      diagnostic: {
        category: 'INCORRECT_REQUEST',
        httpStatus: 400,
        userMessage: 'Invalid JSON request payload.',
      },
    });
    return;
  }

  const { origin, destination, modes } = body;
  const requestReferer = extractRequestReferer(req);

  const originLat = Number(origin?.latitude);
  const originLng = Number(origin?.longitude);
  const destLat = Number(destination?.latitude);
  const destLng = Number(destination?.longitude);

  const requestedModes: TravelMode[] = Array.isArray(modes)
    ? modes.filter((m): m is TravelMode => ALLOWED_TRAVEL_MODES.includes(m))
    : ['DRIVE', 'TWO_WHEELER', 'TRANSIT', 'WALK'];

  const activeModes = requestedModes.length > 0 ? requestedModes : (['DRIVE'] as TravelMode[]);

  const settled = await Promise.all(
    activeModes.map(async (mode) => {
      const routeRes = await computeSingleRouteOnServer({
        originLat,
        originLng,
        destLat,
        destLng,
        travelMode: mode,
        requestReferer,
      });
      return [mode, routeRes] as const;
    })
  );

  const modeMap: Record<string, any> = {};
  let firstFatalDiagnostic = null;

  for (const [mode, routeRes] of settled) {
    modeMap[mode] = routeRes;
    if (!routeRes.ok && routeRes.diagnostic && !firstFatalDiagnostic) {
      firstFatalDiagnostic = routeRes.diagnostic;
    }
  }

  const anySucceeded = settled.some(([, r]) => r.ok);
  if (!anySucceeded && firstFatalDiagnostic) {
    sendJson(res, 200, {
      ok: false,
      modes: modeMap,
      diagnostic: firstFatalDiagnostic,
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    modes: modeMap,
    diagnostic: firstFatalDiagnostic,
  });
}
