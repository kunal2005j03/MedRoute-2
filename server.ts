import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  handleMapsAccommodations,
  handleMapsGeocode,
  handleMapsProviders,
  handleMapsRoutes,
  handleMapsStatus,
} from './server/mapsHttp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  // 1. Maps API Configuration Status (never reveals secret value)
  app.get('/api/maps/status', (req, res) => {
    void handleMapsStatus(req, res);
  });

  // 2. Geocoding Endpoint (forward address/PIN or reverse lat/lng)
  app.post('/api/maps/geocode', (req, res) => {
    void handleMapsGeocode(req, res);
  });

  // 3. Places API (New) — Healthcare Providers Discovery
  app.post('/api/maps/places/providers', (req, res) => {
    void handleMapsProviders(req, res);
  });

  // 4. Places API (New) — Nearby Accommodation Discovery
  app.post('/api/maps/places/accommodations', (req, res) => {
    void handleMapsAccommodations(req, res);
  });

  // 5. Routes API — Compute Road Distance and Travel Duration
  app.post('/api/maps/routes', (req, res) => {
    void handleMapsRoutes(req, res);
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
