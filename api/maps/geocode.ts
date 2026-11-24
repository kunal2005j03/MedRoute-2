import { handleMapsGeocode, type ApiRequest, type ApiResponse } from '../../server/mapsHttp.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await handleMapsGeocode(req, res);
}
