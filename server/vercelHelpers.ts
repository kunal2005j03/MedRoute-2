import type { IncomingMessage } from 'http';

export interface VercelLikeRequest extends IncomingMessage {
  method?: string;
  body?: any;
  headers: Record<string, string | string[] | undefined>;
}

export interface VercelLikeResponse {
  status: (code: number) => VercelLikeResponse;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: (chunk?: string) => void;
}

export function extractVercelRequestReferer(req: VercelLikeRequest): string | null {
  const originHeader = req.headers.origin;
  const origin = typeof originHeader === 'string' ? originHeader.trim() : '';
  if (origin) return origin;

  const refererHeader = req.headers.referer;
  const referer = typeof refererHeader === 'string' ? refererHeader.trim() : '';
  if (referer) return referer;

  const forwardedHostRaw = req.headers['x-forwarded-host'];
  const forwardedHost =
    typeof forwardedHostRaw === 'string'
      ? forwardedHostRaw.split(',')[0].trim()
      : '';
  if (forwardedHost) {
    const protoRaw = req.headers['x-forwarded-proto'];
    const proto =
      typeof protoRaw === 'string' ? protoRaw.split(',')[0].trim() : 'https';
    return `${proto}://${forwardedHost}/`;
  }

  return null;
}

export function extractVercelClientIp(req: VercelLikeRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  return req.socket?.remoteAddress || 'anonymous';
}

export async function readJsonBody(req: VercelLikeRequest): Promise<Record<string, any>> {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}
