import type {
  AccommodationRecord,
  CostRange,
  JourneyCostBreakdown,
  MedicalChargeRecord,
  ServiceCategory,
} from '../types/medroute';
import {
  FARE_UNAVAILABLE_TEXT,
  isPositiveNumber,
  isValidFiniteNumber,
  parsePositiveOptionalAmount,
  UNAVAILABLE_TEXT,
} from './safety';

export function extractMedicalChargeRange(
  charge: MedicalChargeRecord | null | undefined
): CostRange | null {
  if (!charge) return null;

  if (isPositiveNumber(charge.minAmount) && isPositiveNumber(charge.maxAmount)) {
    return {
      min: Math.min(charge.minAmount, charge.maxAmount),
      max: Math.max(charge.minAmount, charge.maxAmount),
    };
  }

  if (isPositiveNumber(charge.amount)) {
    return {
      min: charge.amount,
      max: charge.amount,
    };
  }

  return null;
}

export function getCategoryChargeLabel(category: ServiceCategory): string {
  switch (category) {
    case 'Consultation':
      return 'Consultation fee';
    case 'Diagnostics':
      return 'Selected diagnostic price';
    case 'Treatment and Procedures':
      return 'Published treatment / package charge';
  }
}

export function calculateAccommodationExpense(
  accommodation: AccommodationRecord | null | undefined,
  nights: number
): CostRange | null {
  if (!accommodation || !Number.isInteger(nights) || nights < 1) {
    return null;
  }

  const hasMin = isPositiveNumber(accommodation.minNightlyPrice);
  const hasMax = isPositiveNumber(accommodation.maxNightlyPrice);

  if (!hasMin && !hasMax) {
    return null;
  }

  const minNight = hasMin ? (accommodation.minNightlyPrice as number) : (accommodation.maxNightlyPrice as number);
  const maxNight = hasMax ? (accommodation.maxNightlyPrice as number) : (accommodation.minNightlyPrice as number);

  const low = Math.min(minNight, maxNight) * nights;
  const high = Math.max(minNight, maxNight) * nights;

  if (!isValidFiniteNumber(low) || !isValidFiniteNumber(high)) {
    return null;
  }

  return { min: low, max: high };
}

export interface CostCalculationInput {
  category: ServiceCategory;
  charge: MedicalChargeRecord | null | undefined;
  manualRoundTripFare: string;
  needsAccommodation: boolean;
  nights: number;
  selectedAccommodation: AccommodationRecord | null | undefined;
  manualDailyCommuteFare: string;
}

/**
 * Computes the complete medical journey cost breakdown strictly following MedRoute rules:
 * - Category-specific single medical charge only (no cross-category addition or double counting)
 * - Missing values NEVER silently become 0
 * - Any missing required component marks the overall total as incomplete
 * - Accommodation & local commute are strictly excluded when needsAccommodation === false
 */
export function calculateJourneyCostBreakdown(
  input: CostCalculationInput
): JourneyCostBreakdown {
  const missingComponents: string[] = [];

  // 1. Medical Service Charge
  const medicalRange = extractMedicalChargeRange(input.charge);
  const medicalChargeAvailable = medicalRange !== null;
  if (!medicalChargeAvailable) {
    missingComponents.push(getCategoryChargeLabel(input.category));
  }

  // 2. Round-Trip Travel Expense
  // Confirmed live fares are unavailable from Google Routes API; user may optionally enter an estimate.
  const enteredRoundTrip = parsePositiveOptionalAmount(input.manualRoundTripFare);
  const travelAvailable = enteredRoundTrip !== null;
  const travelRoundTrip: CostRange | null = travelAvailable
    ? { min: enteredRoundTrip, max: enteredRoundTrip }
    : null;
  const travelSourceLabel = travelAvailable
    ? 'User-entered round-trip estimate (not a confirmed operator fare)'
    : `${FARE_UNAVAILABLE_TEXT} — Google Routes API does not publish confirmed operator fares`;

  if (!travelAvailable) {
    missingComponents.push('Round-trip travel fare');
  }

  // 3. Accommodation & 4. Local Commute (only if requested)
  const accommodationIncluded = input.needsAccommodation;
  const safeNights = Number.isInteger(input.nights) && input.nights >= 1 ? input.nights : 1;

  let accommodationExpense: CostRange | null = null;
  let accommodationAvailable = false;
  let accommodationSourceLabel = 'Excluded (accommodation not requested)';
  let accommodationName: string | null = null;

  let localCommuteExpense: CostRange | null = null;
  let localCommuteAvailable = false;
  let localCommuteAssumptions = 'Excluded (accommodation not requested)';

  if (accommodationIncluded) {
    if (input.selectedAccommodation) {
      accommodationName = input.selectedAccommodation.name;
      accommodationExpense = calculateAccommodationExpense(
        input.selectedAccommodation,
        safeNights
      );
      accommodationAvailable = accommodationExpense !== null;

      if (accommodationAvailable) {
        accommodationSourceLabel = `${input.selectedAccommodation.priceSource} · Verified ${input.selectedAccommodation.lastVerified} (${safeNights} ${safeNights === 1 ? 'night' : 'nights'})`;
      } else {
        accommodationSourceLabel =
          'Nightly price unavailable for selected stay — room availability not claimed';
        missingComponents.push('Accommodation nightly rate');
      }
    } else {
      accommodationSourceLabel = 'No accommodation selected yet';
      missingComponents.push('Accommodation selection & nightly rate');
    }

    // Local commute assumption: 1 round-trip daily between accommodation and hospital for each night stayed
    const enteredDailyCommute = parsePositiveOptionalAmount(input.manualDailyCommuteFare);
    if (enteredDailyCommute !== null) {
      const totalLocal = enteredDailyCommute * safeNights;
      localCommuteExpense = { min: totalLocal, max: totalLocal };
      localCommuteAvailable = true;
      localCommuteAssumptions = `User-entered estimate: ₹${Math.round(enteredDailyCommute)}/day round-trip × ${safeNights} ${safeNights === 1 ? 'day' : 'days'} (accommodation ↔ hospital)`;
    } else {
      localCommuteAvailable = false;
      localCommuteAssumptions = `${FARE_UNAVAILABLE_TEXT} — assumes 1 hospital round-trip per stay day (${safeNights} ${safeNights === 1 ? 'day' : 'days'}); enter an optional daily estimate to include`;
      missingComponents.push('Local accommodation-to-hospital commute fare');
    }
  }

  // 5. Total Estimated Journey Cost
  const isComplete = missingComponents.length === 0;
  let totalRange: CostRange | null = null;

  if (isComplete && medicalRange && travelRoundTrip) {
    let minSum = medicalRange.min + travelRoundTrip.min;
    let maxSum = medicalRange.max + travelRoundTrip.max;

    if (accommodationIncluded && accommodationExpense && localCommuteExpense) {
      minSum += accommodationExpense.min + localCommuteExpense.min;
      maxSum += accommodationExpense.max + localCommuteExpense.max;
    }

    if (isValidFiniteNumber(minSum) && isValidFiniteNumber(maxSum)) {
      totalRange = { min: minSum, max: maxSum };
    }
  }

  return {
    medicalCharge: medicalRange,
    medicalChargeLabel: getCategoryChargeLabel(input.category),
    medicalChargeSource: input.charge
      ? `${input.charge.sourceName}${input.charge.includesNote ? ` (${input.charge.includesNote})` : ''}`
      : UNAVAILABLE_TEXT,
    medicalChargeVerified: input.charge?.lastVerified || UNAVAILABLE_TEXT,
    medicalChargeAvailable,

    travelRoundTrip,
    travelSourceLabel,
    travelAvailable,

    accommodationIncluded,
    nights: accommodationIncluded ? safeNights : 0,
    accommodationName,
    accommodationExpense,
    accommodationSourceLabel,
    accommodationAvailable,

    localCommuteExpense,
    localCommuteAssumptions,
    localCommuteAvailable,

    totalRange,
    isComplete,
    missingComponents,
  };
}
