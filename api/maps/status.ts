import { getServerGoogleMapsApiKey } from '../../server/googleMaps.ts';
import type {
  VercelLikeRequest,
  VercelLikeResponse,
} from '../../server/vercelHelpers.ts';

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const configured = getServerGoogleMapsApiKey() !== null;
  return res.status(200).json({ configured });
}
