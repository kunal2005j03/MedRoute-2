import { geocodeAddressOnServer } from '../../server/googleMaps.ts';
import {
  extractVercelRequestReferer,
  readJsonBody,
  type VercelLikeRequest,
  type VercelLikeResponse,
} from '../../server/vercelHelpers.ts';

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
  const result = await geocodeAddressOnServer({
    address: typeof body.address === 'string' ? body.address : undefined,
    latitude: typeof body.latitude === 'number' ? body.latitude : undefined,
    longitude: typeof body.longitude === 'number' ? body.longitude : undefined,
    requestReferer,
  });

  return res.status(200).json(result);
}
