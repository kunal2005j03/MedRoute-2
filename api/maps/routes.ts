import type { TravelMode } from '../../src/types/medroute.ts';
import { computeSingleRouteOnServer } from '../../server/googleMaps.ts';
import {
  extractVercelRequestReferer,
  readJsonBody,
  type VercelLikeRequest,
  type VercelLikeResponse,
} from '../../server/vercelHelpers.ts';

const ALLOWED_TRAVEL_MODES: TravelMode[] = ['DRIVE', 'TWO_WHEELER', 'TRANSIT', 'WALK'];

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = await readJsonBody(req);
  const { origin, destination, modes } = body;
  const requestReferer = extractVercelRequestReferer(req);

  const originLat = Number(origin?.latitude);
  const originLng = Number(origin?.longitude);
  const destLat = Number(destination?.latitude);
  const destLng = Number(destination?.longitude);

  const requestedModes: TravelMode[] = Array.isArray(modes)
    ? modes.filter((m: unknown): m is TravelMode =>
        ALLOWED_TRAVEL_MODES.includes(m as TravelMode)
      )
    : ['DRIVE', 'TWO_WHEELER', 'TRANSIT', 'WALK'];

  const activeModes =
    requestedModes.length > 0 ? requestedModes : (['DRIVE'] as TravelMode[]);

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
  return res.status(200).json({
    ok: anySucceeded || !firstFatalDiagnostic,
    modes: modeMap,
    diagnostic: firstFatalDiagnostic,
  });
}
