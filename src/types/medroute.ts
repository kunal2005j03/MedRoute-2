export type AppMode = 'live' | 'demo';

export type ServiceCategory =
  | 'Consultation'
  | 'Diagnostics'
  | 'Treatment and Procedures';

export type VerificationStatus = 'verified' | 'demo' | 'unverified';

export type DataOrigin = 'verified' | 'demo' | 'live_places';

export type ChargeType =
  | 'consultation_fee'
  | 'diagnostic_price'
  | 'treatment_package'
  | 'per_session'
  | 'per_consultation'
  | 'per_test'
  | 'per_procedure';

export type TravelMode = 'DRIVE' | 'TWO_WHEELER' | 'TRANSIT' | 'WALK';

export type ActiveSection = 'search' | 'results' | 'details' | 'compare';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface StartingLocation {
  label: string;
  formattedAddress: string;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  latitude: number;
  longitude: number;
  source: 'gps' | 'geocode_live' | 'demo_lookup';
}

export interface MedicalService {
  serviceId: string;
  category: ServiceCategory;
  serviceName: string;
  description: string;
}

export interface ProviderRecord {
  providerId: string;
  name: string;
  providerType: string;
  address: string;
  city: string;
  state: string;
  pincode?: string | null;
  latitude: number;
  longitude: number;
  phone?: string | null;
  website?: string | null;
  source: string;
  lastVerified: string;
  dataOrigin: DataOrigin;
  googleMapsUri?: string | null;
}

export interface ProviderServiceRecord {
  recordId: string;
  providerId: string;
  serviceId: string;
  verificationStatus: VerificationStatus;
  source: string;
  lastVerified: string;
  dataOrigin: 'verified' | 'demo';
}

export interface MedicalChargeRecord {
  chargeId: string;
  providerId: string;
  serviceId: string;
  amount?: number | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  chargeType: ChargeType;
  includesNote?: string | null;
  sourceName: string;
  sourceUrl?: string | null;
  lastVerified: string;
  verificationStatus: VerificationStatus;
  dataOrigin: 'verified' | 'demo';
}

export interface AccommodationRecord {
  accommodationId: string;
  name: string;
  accommodationType: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  minNightlyPrice?: number | null;
  maxNightlyPrice?: number | null;
  priceSource: string;
  lastVerified: string;
  dataOrigin: DataOrigin;
  distanceFromHospitalKm?: number | null;
  website?: string | null;
  googleMapsUri?: string | null;
  phoneNumber?: string | null;
}

export interface DiscoveredProvider {
  provider: ProviderRecord;
  serviceVerification: VerificationStatus;
  serviceSource: string;
  serviceLastVerified: string;
  availableServices: string[];
  charge: MedicalChargeRecord | null;
  straightLineDistanceKm: number | null;
}

export interface MoneyAmount {
  amount: number;
  currencyCode: string;
  formattedText: string;
}

export interface TollEstimateInfo {
  hasTolls: boolean;
  estimatedPrices: MoneyAmount[];
}

export interface TravelModeResult {
  mode: TravelMode;
  supported: boolean;
  distanceMeters: number | null;
  distanceKm: number | null;
  durationSeconds: number | null;
  durationText: string;
  transitFare?: MoneyAmount | null;
  tollInfo?: TollEstimateInfo | null;
  source: 'google_routes' | 'demo_estimate';
  errorMessage?: string | null;
}

export interface TravelSummary {
  origin: Coordinates;
  destination: Coordinates;
  selectedMode: TravelMode;
  modes: Record<TravelMode, TravelModeResult>;
  navigationUrl: string;
  apiDiagnostic?: MapsApiDiagnostic | null;
}

export interface MapsApiDiagnostic {
  category:
    | 'MISSING_API_KEY'
    | 'INVALID_API_KEY'
    | 'BILLING_NOT_ENABLED'
    | 'API_NOT_ENABLED'
    | 'API_RESTRICTION'
    | 'QUOTA_EXCEEDED'
    | 'INCORRECT_REQUEST'
    | 'NETWORK_FAILURE'
    | 'INCOMPLETE_RESPONSE'
    | 'AUTH_FAILURE'
    | 'UNKNOWN_ERROR';
  httpStatus?: number | null;
  googleStatus?: string | null;
  userMessage: string;
  details?: string | null;
}

export type TravelCostMethod =
  | 'none'
  | 'transit_api'
  | 'taxi_formula'
  | 'car_fuel'
  | 'two_wheeler_fuel'
  | 'manual';

export interface TravelCostConfig {
  method: TravelCostMethod;
  taxiBaseFare: string;
  taxiPerKmRate: string;
  taxiExtraCharges: string;
  carMileageKmPerL: string;
  carFuelPricePerL: string;
  carTollsRoundTrip: string;
  twoWheelerMileageKmPerL: string;
  twoWheelerFuelPricePerL: string;
  manualRoundTripFare: string;
}

export interface CostRange {
  min: number;
  max: number;
}

export type EstimateConfidence = 'high' | 'medium' | 'low' | 'incomplete';

export interface JourneyCostBreakdown {
  medicalCharge: CostRange | null;
  medicalChargeLabel: string;
  medicalChargeSource: string;
  medicalChargeVerified: string;
  medicalChargeConfidenceLabel: string;
  medicalChargeAvailable: boolean;

  travelRoundTrip: CostRange | null;
  travelSourceLabel: string;
  travelFormulaBreakdown: string | null;
  travelAvailable: boolean;

  accommodationIncluded: boolean;
  nights: number;
  accommodationName: string | null;
  accommodationExpense: CostRange | null;
  accommodationSourceLabel: string;
  accommodationAvailable: boolean;

  localCommuteExpense: CostRange | null;
  localCommuteAssumptions: string;
  localCommuteAvailable: boolean;

  totalRange: CostRange | null;
  isComplete: boolean;
  estimateConfidence: EstimateConfidence;
  estimateConfidenceLabel: string;
  missingComponents: string[];
}

export interface ProviderJourneyState {
  travel: TravelSummary | null;
  travelLoading: boolean;
  travelError: MapsApiDiagnostic | null;
  selectedTravelMode: TravelMode;
  travelCostConfig: TravelCostConfig;
  manualRoundTripFare: string;

  accommodations: AccommodationRecord[];
  accommodationsLoading: boolean;
  accommodationsError: MapsApiDiagnostic | null;
  accommodationsFetched: boolean;
  selectedAccommodationId: string | null;
  manualDailyCommuteFare: string;
}

export interface JourneySearchInput {
  category: ServiceCategory;
  serviceId: string;
  customServiceName?: string;
  locationMode: 'gps' | 'manual';
  manualLocationText: string;
  startingLocation: StartingLocation | null;
  needsAccommodation: boolean;
  nights: number;
}
