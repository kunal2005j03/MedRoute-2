import { searchAccommodationsPlacesOnServer } from '../../../server/googleMaps.ts';
import {
  extractVercelRequestReferer,
  readJsonBody,
  type VercelLikeRequest,
  type VercelLikeResponse,
} from '../../../server/vercelHelpers.ts';

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = await readJsonBody(req);
  const requestReferer = extractVercelRequestReferer(req);
  const result = await searchAccommodationsPlacesOnServer({
    latitude: Number(body.latitude),
    longitude: Number(body.longitude),
    requestReferer,
  });

  return res.status(200).json(result);
}
