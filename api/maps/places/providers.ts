import { searchProvidersPlacesOnServer } from '../../../server/googleMaps.ts';
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
  const { serviceName, category, latitude, longitude, city, pageToken } = body;

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

  const requestReferer = extractVercelRequestReferer(req);
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
}
