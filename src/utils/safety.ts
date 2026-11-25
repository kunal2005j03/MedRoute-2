import type { Coordinates } from '../types/medroute';

export const UNAVAILABLE_TEXT = 'Information unavailable';
export const FARE_UNAVAILABLE_TEXT = 'Fare unavailable';

export function isValidFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isPositiveNumber(value: unknown): value is number {
  return isValidFiniteNumber(value) && value > 0;
}

export function isValidCoordinatePair(
  lat: unknown,
  lng: unknown
): boolean {
  return (
    isValidFiniteNumber(lat) &&
    isValidFiniteNumber(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function formatNumber(
  value: number | null | undefined,
  decimals = 2
): string {
  if (!isValidFiniteNumber(value)) {
    return UNAVAILABLE_TEXT;
  }
  const safeDecimals = Number.isInteger(decimals) && decimals >= 0 && decimals <= 6 ? decimals : 2;
  return value.toFixed(safeDecimals);
}

export function formatDistanceKm(distanceKm: number | null | undefined): string {
  if (!isValidFiniteNumber(distanceKm) || distanceKm < 0) {
    return UNAVAILABLE_TEXT;
  }
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${formatNumber(distanceKm, 1)} km`;
}

export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (!isValidFiniteNumber(seconds) || seconds < 0) {
    return UNAVAILABLE_TEXT;
  }
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
}

export function formatINR(amount: number | null | undefined): string {
  if (!isValidFiniteNumber(amount) || amount < 0) {
    return UNAVAILABLE_TEXT;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

export function formatINRRange(
  minAmount: number | null | undefined,
  maxAmount: number | null | undefined
): string {
  const hasMin = isValidFiniteNumber(minAmount) && minAmount >= 0;
  const hasMax = isValidFiniteNumber(maxAmount) && maxAmount >= 0;

  if (!hasMin && !hasMax) {
    return UNAVAILABLE_TEXT;
  }
  if (hasMin && !hasMax) {
    return formatINR(minAmount);
  }
  if (!hasMin && hasMax) {
    return formatINR(maxAmount);
  }
  if (Math.round(minAmount as number) === Math.round(maxAmount as number)) {
    return formatINR(minAmount);
  }
  const low = Math.min(minAmount as number, maxAmount as number);
  const high = Math.max(minAmount as number, maxAmount as number);
  return `${formatINR(low)} – ${formatINR(high)}`;
}

export function parsePositiveOptionalAmount(raw: string | null | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10000000) {
    return null;
  }
  return parsed;
}

export function parsePositiveWholeNights(raw: string | number): number | null {
  const num = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1 || num > 365) {
    return null;
  }
  return num;
}

export function calculateHaversineKm(
  from: Partial<Coordinates> | null | undefined,
  to: Partial<Coordinates> | null | undefined
): number | null {
  if (
    !from ||
    !to ||
    !isValidCoordinatePair(from.latitude, from.longitude) ||
    !isValidCoordinatePair(to.latitude, to.longitude)
  ) {
    return null;
  }

  const R = 6371; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad((to.latitude as number) - (from.latitude as number));
  const dLng = toRad((to.longitude as number) - (from.longitude as number));
  const lat1 = toRad(from.latitude as number);
  const lat2 = toRad(to.latitude as number);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Number.isFinite(distance) ? distance : null;
}

export function sanitizeExternalUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function buildGoogleMapsNavigationUrl(
  origin: Partial<Coordinates> | null | undefined,
  destination: Partial<Coordinates> | null | undefined,
  destinationName?: string | null,
  travelMode: 'DRIVE' | 'TWO_WHEELER' | 'TRANSIT' | 'WALK' = 'DRIVE'
): string {
  const params = new URLSearchParams({ api: '1' });

  if (origin && isValidCoordinatePair(origin.latitude, origin.longitude)) {
    params.set('origin', `${origin.latitude},${origin.longitude}`);
  }

  if (destination && isValidCoordinatePair(destination.latitude, destination.longitude)) {
    params.set('destination', `${destination.latitude},${destination.longitude}`);
  } else if (destinationName && destinationName.trim()) {
    params.set('destination', destinationName.trim());
  }

  const gmapsModeMap: Record<string, string> = {
    DRIVE: 'driving',
    TWO_WHEELER: 'two-wheeler',
    TRANSIT: 'transit',
    WALK: 'walking',
  };
  params.set('travelmode', gmapsModeMap[travelMode] || 'driving');

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildGoogleMapsPlaceUrl(
  googleMapsUri: string | null | undefined,
  coords?: Partial<Coordinates> | null,
  label?: string | null
): string | null {
  const direct = sanitizeExternalUrl(googleMapsUri);
  if (direct) return direct;

  if (coords && isValidCoordinatePair(coords.latitude, coords.longitude)) {
    const params = new URLSearchParams({
      api: '1',
      query: `${coords.latitude},${coords.longitude}`,
    });
    return `https://www.google.com/maps/search/?${params.toString()}`;
  }

  if (typeof label === 'string' && label.trim().length > 0) {
    const params = new URLSearchParams({
      api: '1',
      query: label.trim(),
    });
    return `https://www.google.com/maps/search/?${params.toString()}`;
  }

  return null;
}

export function displayTextOrUnavailable(value: string | null | undefined): string {
  if (typeof value !== 'string') return UNAVAILABLE_TEXT;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : UNAVAILABLE_TEXT;
}

export function sanitizeTelUri(phone: string | null | undefined): string | null {
  if (typeof phone !== 'string') return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[^\d+]/g, '');
  if (!cleaned || cleaned === '+') return null;
  return `tel:${cleaned}`;
}

