import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import type { TravelMode } from './src/types/medroute';
import {
  computeSingleRouteOnServer,
  geocodeAddressOnServer,
  getServerGoogleMapsApiKey,
  searchAccommodationsPlacesOnServer,
  searchProvidersPlacesOnServer,
} from './server/googleMaps';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_TRAVEL_MODES: TravelMode[] = ['DRIVE', 'TWO_WHEELER', 'TRANSIT', 'WALK'];

function extractRequestReferer(req: express.Request): string | null {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  if (origin) return origin;

  const referer = typeof req.headers.referer === 'string' ? req.headers.referer.trim() : '';
  if (referer) return referer;

  const forwardedHost =
    typeof req.headers['x-forwarded-host'] === 'string'
      ? req.headers['x-forwarded-host'].split(',')[0].trim()
      : '';
  if (forwardedHost) {
    const proto =
      typeof req.headers['x-forwarded-proto'] === 'string'
        ? req.headers['x-forwarded-proto'].split(',')[0].trim()
        : 'https';
    return `${proto}://${forwardedHost}/`;
  }

  return null;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  // 1. Maps API Configuration Status (never reveals secret value)
  app.get('/api/maps/status', (_req, res) => {
    const configured = getServerGoogleMapsApiKey() !== null;
    res.json({ configured });
  });

  // 2. Geocoding Endpoint (forward address/PIN or reverse lat/lng)
  app.post('/api/maps/geocode', async (req, res) => {
    const { address, latitude, longitude } = req.body || {};
    const requestReferer = extractRequestReferer(req);
    const result = await geocodeAddressOnServer({
      address: typeof address === 'string' ? address : undefined,
      latitude: typeof latitude === 'number' ? latitude : undefined,
      longitude: typeof longitude === 'number' ? longitude : undefined,
      requestReferer,
    });

    return res.status(200).json(result);
  });

  // 3. Places API (New) — Healthcare Providers Discovery
  app.post('/api/maps/places/providers', async (req, res) => {
    const { serviceName, category, latitude, longitude, city, pageToken } = req.body || {};

    if (typeof serviceName !== 'string' || !serviceName.trim()) {
      return res.status(400).json({
        ok: false,
        diagnostic: {
          category: 'INCORRECT_REQUEST',
          httpStatus: 400,
          userMessage: 'A medical service name is required.',
        },
      });
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

    return res.status(200).json(result);
  });

  // 4. Places API (New) — Nearby Accommodation Discovery
  app.post('/api/maps/places/accommodations', async (req, res) => {
    const { latitude, longitude } = req.body || {};
    const requestReferer = extractRequestReferer(req);

    const result = await searchAccommodationsPlacesOnServer({
      latitude: Number(latitude),
      longitude: Number(longitude),
      requestReferer,
    });

    return res.status(200).json(result);
  });

  // 5. Routes API — Compute Road Distance and Travel Duration
  app.post('/api/maps/routes', async (req, res) => {
    const { origin, destination, modes } = req.body || {};
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
      return res.status(200).json({
        ok: false,
        modes: modeMap,
        diagnostic: firstFatalDiagnostic,
      });
    }

    return res.status(200).json({
      ok: true,
      modes: modeMap,
      diagnostic: firstFatalDiagnostic,
    });
  });

  // Mount Vite middleware in development or serve built dist/ in production
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MedRoute server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MedRoute server:', err);
  process.exit(1);
});
