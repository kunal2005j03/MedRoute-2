import type { ProviderRecord, StartingLocation } from '../types/medroute';
import { isValidCoordinatePair } from './safety';

export const UBER_UNIVERSAL_LINK_BASE = 'https://m.uber.com/looking';

export interface UberLocationPayload {
  latitude: number;
  longitude: number;
  addressLine1: string;
  addressLine2: string;
}

export type UberDeepLinkIssue =
  | 'INVALID_DESTINATION_COORDINATES'
  | 'MISSING_PICKUP_COORDINATES'
  | 'UNVERIFIED_MANUAL_LOCATION';

export interface DestinationLocationInput {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface UberDeepLinkInput {
  startingLocation: Partial<StartingLocation> | null | undefined;
  locationMode?: 'gps' | 'manual';
  provider?: Partial<ProviderRecord> | null | undefined;
  destination?: Partial<DestinationLocationInput> | null | undefined;
  clientId?: string | null;
}

export interface UberDeepLinkResult {
  ready: boolean;
  url: string | null;
  issue: UberDeepLinkIssue | null;
  errorMessage: string | null;
  hasConfiguredClientId: boolean;
  hasIncompleteDestinationAddress: boolean;
  pickup: UberLocationPayload | null;
  destination: UberLocationPayload | null;
}

export function getConfiguredUberClientId(
  overrideClientId?: string | null
): string | null {
  const raw =
    overrideClientId !== undefined
      ? overrideClientId
      : (import.meta.env?.VITE_UBER_CLIENT_ID as string | undefined);

  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  return trimmed;
}

export function buildUberPickupPayload(
  startingLocation: Partial<StartingLocation> | null | undefined
): UberLocationPayload | null {
  if (
    !startingLocation ||
    !isValidCoordinatePair(
      startingLocation.latitude,
      startingLocation.longitude
    )
  ) {
    return null;
  }

  const label =
    typeof startingLocation.label === 'string'
      ? startingLocation.label.trim()
      : '';
  const formattedAddress =
    typeof startingLocation.formattedAddress === 'string'
      ? startingLocation.formattedAddress.trim()
      : '';
  const fallbackParts = [
    startingLocation.city,
    startingLocation.state,
    startingLocation.pincode,
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim());

  const addressLine1 = label || formattedAddress || 'Selected Pickup Location';
  const addressLine2 =
    formattedAddress || fallbackParts.join(', ') || addressLine1;

  return {
    latitude: startingLocation.latitude as number,
    longitude: startingLocation.longitude as number,
    addressLine1,
    addressLine2,
  };
}

export function buildUberDestinationPayload(
  destination: Partial<DestinationLocationInput> | Partial<ProviderRecord> | null | undefined
): {
  payload: UberLocationPayload | null;
  hasIncompleteAddress: boolean;
} {
  if (
    !destination ||
    !isValidCoordinatePair(destination.latitude, destination.longitude)
  ) {
    return { payload: null, hasIncompleteAddress: false };
  }

  const name = typeof destination.name === 'string' ? destination.name.trim() : '';
  const address =
    typeof destination.address === 'string' ? destination.address.trim() : '';
  const fallbackRegion = [
    destination.city,
    (destination as Partial<ProviderRecord>).state,
    (destination as Partial<ProviderRecord>).pincode,
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim())
    .join(', ');

  return {
    payload: {
      latitude: destination.latitude as number,
      longitude: destination.longitude as number,
      addressLine1: name || 'Selected Destination',
      addressLine2: address || fallbackRegion || name,
    },
    hasIncompleteAddress: address.length === 0,
  };
}

export function buildUberDeepLink(
  input: UberDeepLinkInput
): UberDeepLinkResult {
  const resolvedClientId = getConfiguredUberClientId(input.clientId);
  const hasConfiguredClientId = Boolean(resolvedClientId);

  const destInput = input.destination || input.provider;
  const { payload: destination, hasIncompleteAddress } =
    buildUberDestinationPayload(destInput);

  if (!destination) {
    return {
      ready: false,
      url: null,
      issue: 'INVALID_DESTINATION_COORDINATES',
      errorMessage:
        'Uber fare check is unavailable because this destination does not have valid coordinates.',
      hasConfiguredClientId,
      hasIncompleteDestinationAddress: false,
      pickup: null,
      destination: null,
    };
  }

  if (
    input.locationMode === 'manual' &&
    input.startingLocation?.source === 'gps'
  ) {
    return {
      ready: false,
      url: null,
      issue: 'UNVERIFIED_MANUAL_LOCATION',
      errorMessage:
        'Your manual starting location has not been verified yet. Please verify a starting address before checking the Uber fare.',
      hasConfiguredClientId,
      hasIncompleteDestinationAddress: hasIncompleteAddress,
      pickup: null,
      destination,
    };
  }

  const pickup = buildUberPickupPayload(input.startingLocation);
  if (!pickup) {
    return {
      ready: false,
      url: null,
      issue: 'MISSING_PICKUP_COORDINATES',
      errorMessage:
        'Pickup location coordinates are missing or invalid. Please select your current location or verify a starting address first.',
      hasConfiguredClientId,
      hasIncompleteDestinationAddress: hasIncompleteAddress,
      pickup: null,
      destination,
    };
  }

  const params = new URLSearchParams();
  if (resolvedClientId) {
    params.set('client_id', resolvedClientId);
  }
  params.set('pickup', JSON.stringify(pickup));
  params.set('drop[0]', JSON.stringify(destination));

  return {
    ready: true,
    url: `${UBER_UNIVERSAL_LINK_BASE}?${params.toString()}`,
    issue: null,
    errorMessage: null,
    hasConfiguredClientId,
    hasIncompleteDestinationAddress: hasIncompleteAddress,
    pickup,
    destination,
  };
}
