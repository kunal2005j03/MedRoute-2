import type {
  AccommodationRecord,
  CostRange,
  EstimateConfidence,
  JourneyCostBreakdown,
  MedicalChargeRecord,
  ServiceCategory,
  TravelCostConfig,
  TravelCostMethod,
  TravelMode,
  TravelModeResult,
} from '../types/medroute';
import {
  FARE_UNAVAILABLE_TEXT,
  isPositiveNumber,
  isValidFiniteNumber,
  parsePositiveOptionalAmount,
  UNAVAILABLE_TEXT,
} from './safety';

export function createDefaultTravelCostConfig(
  travelMode: TravelMode = 'DRIVE'
): TravelCostConfig {
  const defaultMethod: TravelCostMethod =
    travelMode === 'TRANSIT'
      ? 'transit_api'
      : travelMode === 'TWO_WHEELER'
        ? 'two_wheeler_fuel'
        : travelMode === 'WALK'
          ? 'none'
          : 'taxi_formula';

  return {
    method: defaultMethod,
    taxiBaseFare: '50',
    taxiPerKmRate: '18',
    taxiExtraCharges: '0',
    carMileageKmPerL: '15',
    carFuelPricePerL: '105',
    carTollsRoundTrip: '',
    twoWheelerMileageKmPerL: '45',
    twoWheelerFuelPricePerL: '105',
    manualRoundTripFare: '',
  };
}

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

export function getMedicalChargeConfidenceLabel(
  charge: MedicalChargeRecord | null | undefined
): string {
  if (!charge) {
    return 'Unavailable';
  }
  switch (charge.verificationStatus) {
    case 'verified':
      return 'Verified Price';
    case 'demo':
      return 'Demo Data (Sample Tariff)';
    default:
      return 'Unverified Price';
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

  const minNight = hasMin
    ? (accommodation.minNightlyPrice as number)
    : (accommodation.maxNightlyPrice as number);
  const maxNight = hasMax
    ? (accommodation.maxNightlyPrice as number)
    : (accommodation.minNightlyPrice as number);

  const low = Math.min(minNight, maxNight) * nights;
  const high = Math.max(minNight, maxNight) * nights;

  if (!isValidFiniteNumber(low) || !isValidFiniteNumber(high)) {
    return null;
  }

  return { min: low, max: high };
}

export interface TravelFareCalculationResult {
  range: CostRange | null;
  available: boolean;
  sourceLabel: string;
  formulaBreakdown: string | null;
  isOfficialTransitFare: boolean;
}

export function computeTravelRoundTripEstimate(params: {
  travelCostConfig?: TravelCostConfig | null;
  routeModeResult?: TravelModeResult | null;
  manualRoundTripFare?: string;
}): TravelFareCalculationResult {
  const cfg = params.travelCostConfig;
  const route = params.routeModeResult;
  const roadKm =
    route?.supported && isPositiveNumber(route.distanceKm)
      ? route.distanceKm
      : null;

  // Fallback for legacy callers passing manualRoundTripFare directly without travelCostConfig
  if (!cfg) {
    const manual = parsePositiveOptionalAmount(params.manualRoundTripFare);
    if (manual !== null && manual > 0) {
      return {
        range: { min: manual, max: manual },
        available: true,
        sourceLabel:
          'Estimated Travel Fare (user-entered round-trip estimate, not a confirmed operator fare)',
        formulaBreakdown: `Manual round-trip input: ₹${Math.round(manual)}`,
        isOfficialTransitFare: false,
      };
    }
    return {
      range: null,
      available: false,
      sourceLabel: `${FARE_UNAVAILABLE_TEXT} — Google Routes API does not publish confirmed operator fares`,
      formulaBreakdown: null,
      isOfficialTransitFare: false,
    };
  }

  if (cfg.method === 'none') {
    if (route?.mode === 'WALK' && route.supported) {
      return {
        range: null,
        available: false,
        sourceLabel: `${FARE_UNAVAILABLE_TEXT} — Walking mode selected (no fare configured)`,
        formulaBreakdown: null,
        isOfficialTransitFare: false,
      };
    }
    return {
      range: null,
      available: false,
      sourceLabel: `${FARE_UNAVAILABLE_TEXT} — Select a fare estimation method or enter a manual estimate`,
      formulaBreakdown: null,
      isOfficialTransitFare: false,
    };
  }

  if (cfg.method === 'manual') {
    const manual = parsePositiveOptionalAmount(
      cfg.manualRoundTripFare || params.manualRoundTripFare
    );
    if (manual === null || manual <= 0) {
      return {
        range: null,
        available: false,
        sourceLabel: `${FARE_UNAVAILABLE_TEXT} — Enter a positive round-trip estimate to include`,
        formulaBreakdown: null,
        isOfficialTransitFare: false,
      };
    }
    const rounded = Math.round(manual);
    return {
      range: { min: rounded, max: rounded },
      available: true,
      sourceLabel:
        'Estimated Travel Fare (user-entered round-trip estimate, not a confirmed operator fare)',
      formulaBreakdown: `Manual round-trip amount: ₹${rounded}`,
      isOfficialTransitFare: false,
    };
  }

  if (cfg.method === 'transit_api') {
    const fare = route?.transitFare;
    if (fare && isPositiveNumber(fare.amount) && fare.currencyCode === 'INR') {
      const roundTrip = Math.round(fare.amount * 2);
      return {
        range: { min: roundTrip, max: roundTrip },
        available: true,
        sourceLabel: `Estimated Travel Fare · Google Routes API transit fare (${fare.formattedText} one-way × 2)`,
        formulaBreakdown: `2 × ${fare.formattedText} = ₹${roundTrip} round-trip`,
        isOfficialTransitFare: true,
      };
    }
    return {
      range: null,
      available: false,
      sourceLabel:
        'Fare Data Unavailable — Google Routes API did not return transit ticket pricing for this route',
      formulaBreakdown: null,
      isOfficialTransitFare: false,
    };
  }

  if (cfg.method === 'taxi_formula') {
    if (roadKm === null) {
      return {
        range: null,
        available: false,
        sourceLabel: `${FARE_UNAVAILABLE_TEXT} — Road distance is required to compute taxi fare`,
        formulaBreakdown: null,
        isOfficialTransitFare: false,
      };
    }
    const baseFare = parsePositiveOptionalAmount(cfg.taxiBaseFare);
    const perKm = parsePositiveOptionalAmount(cfg.taxiPerKmRate);
    const extra = parsePositiveOptionalAmount(cfg.taxiExtraCharges) ?? 0;

    if (baseFare === null || perKm === null || perKm <= 0) {
      return {
        range: null,
        available: false,
        sourceLabel: `${FARE_UNAVAILABLE_TEXT} — Enter a valid taxi base fare and per-km rate`,
        formulaBreakdown: null,
        isOfficialTransitFare: false,
      };
    }

    const oneWay = baseFare + roadKm * perKm;
    const roundTrip = Math.round(2 * oneWay + extra);
    if (!isValidFiniteNumber(roundTrip) || roundTrip <= 0) {
      return {
        range: null,
        available: false,
        sourceLabel: FARE_UNAVAILABLE_TEXT,
        formulaBreakdown: null,
        isOfficialTransitFare: false,
      };
    }

    const extraText = extra > 0 ? ` + ₹${Math.round(extra)} tolls/extra` : '';
    return {
      range: { min: roundTrip, max: roundTrip },
      available: true,
      sourceLabel:
        'Estimated Travel Fare (Taxi/Cab configurable formula · not a live aggregator quote)',
      formulaBreakdown: `2 × (₹${Math.round(baseFare)} base + ${roadKm.toFixed(1)} km × ₹${perKm}/km)${extraText} = ₹${roundTrip}`,
      isOfficialTransitFare: false,
    };
  }

  if (cfg.method === 'car_fuel') {
    if (roadKm === null) {
      return {
        range: null,
        available: false,
        sourceLabel: `${FARE_UNAVAILABLE_TEXT} — Road distance is required to compute fuel cost`,
        formulaBreakdown: null,
        isOfficialTransitFare: false,
      };
    }
    const mileage = parsePositiveOptionalAmount(cfg.carMileageKmPerL);
    const fuelPrice = parsePositiveOptionalAmount(cfg.carFuelPricePerL);
    if (mileage === null || mileage <= 0 || fuelPrice === null || fuelPrice <= 0) {
      return {
        range: null,
        available: false,
        sourceLabel: `${FARE_UNAVAILABLE_TEXT} — Enter positive car mileage (km/L) and fuel price (₹/L)`,
        formulaBreakdown: null,
        isOfficialTransitFare: false,
      };
    }

    const apiTollOneWay =
      route?.tollInfo?.hasTolls
        ? route.tollInfo.estimatedPrices
            .filter((p) => p.currencyCode === 'INR')
            .reduce((sum, p) => sum + p.amount, 0)
        : 0;
    const manualTolls = parsePositiveOptionalAmount(cfg.carTollsRoundTrip);
    const roundTripTolls =
      manualTolls !== null ? manualTolls : apiTollOneWay > 0 ? apiTollOneWay * 2 : 0;

    const roundTripKm = 2 * roadKm;
    const fuelCost = (roundTripKm / mileage) * fuelPrice;
    const total = Math.round(fuelCost + roundTripTolls);

    if (!isValidFiniteNumber(total) || total <= 0) {
      return {
        range: null,
        available: false,
        sourceLabel: FARE_UNAVAILABLE_TEXT,
        formulaBreakdown: null,
        isOfficialTransitFare: false,
      };
    }

    const tollNote =
      roundTripTolls > 0
        ? ` + ₹${Math.round(roundTripTolls)} ${manualTolls !== null ? 'tolls (user)' : 'tolls (Routes API × 2)'}`
        : '';

    return {
      range: { min: total, max: total },
      available: true,
      sourceLabel:
        'Estimated Travel Fare (Personal Car fuel formula · excludes parking/wear)',
      formulaBreakdown: `(${roundTripKm.toFixed(1)} km ÷ ${mileage} km/L) × ₹${fuelPrice}/L${tollNote} = ₹${total}`,
      isOfficialTransitFare: false,
    };
  }

  if (cfg.method === 'two_wheeler_fuel') {
    if (roadKm === null) {
      return {
        range: null,
        available: false,
        sourceLabel: `${FARE_UNAVAILABLE_TEXT} — Road distance is required to compute fuel cost`,
        formulaBreakdown: null,
        isOfficialTransitFare: false,
      };
    }
    const mileage = parsePositiveOptionalAmount(cfg.twoWheelerMileageKmPerL);
    const fuelPrice = parsePositiveOptionalAmount(cfg.twoWheelerFuelPricePerL);
    if (mileage === null || mileage <= 0 || fuelPrice === null || fuelPrice <= 0) {
      return {
        range: null,
        available: false,
        sourceLabel: `${FARE_UNAVAILABLE_TEXT} — Enter positive two-wheeler mileage (km/L) and fuel price (₹/L)`,
        formulaBreakdown: null,
        isOfficialTransitFare: false,
      };
    }

    const roundTripKm = 2 * roadKm;
    const total = Math.round((roundTripKm / mileage) * fuelPrice);
    if (!isValidFiniteNumber(total) || total <= 0) {
      return {
        range: null,
        available: false,
        sourceLabel: FARE_UNAVAILABLE_TEXT,
        formulaBreakdown: null,
        isOfficialTransitFare: false,
      };
    }

    return {
      range: { min: total, max: total },
      available: true,
      sourceLabel: 'Estimated Travel Fare (Two-Wheeler fuel formula)',
      formulaBreakdown: `(${roundTripKm.toFixed(1)} km ÷ ${mileage} km/L) × ₹${fuelPrice}/L = ₹${total}`,
      isOfficialTransitFare: false,
    };
  }

  return {
    range: null,
    available: false,
    sourceLabel: FARE_UNAVAILABLE_TEXT,
    formulaBreakdown: null,
    isOfficialTransitFare: false,
  };
}

export interface CostCalculationInput {
  category: ServiceCategory;
  charge: MedicalChargeRecord | null | undefined;
  manualRoundTripFare: string;
  travelCostConfig?: TravelCostConfig | null;
  routeModeResult?: TravelModeResult | null;
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
  const medicalChargeConfidenceLabel = getMedicalChargeConfidenceLabel(input.charge);

  if (!medicalChargeAvailable) {
    missingComponents.push(getCategoryChargeLabel(input.category));
  }

  // 2. Round-Trip Travel Expense
  const travelCalc = computeTravelRoundTripEstimate({
    travelCostConfig: input.travelCostConfig,
    routeModeResult: input.routeModeResult,
    manualRoundTripFare: input.manualRoundTripFare,
  });
  const travelAvailable = travelCalc.available;
  const travelRoundTrip = travelCalc.range;

  if (!travelAvailable) {
    missingComponents.push('Round-trip travel fare');
  }

  // 3. Accommodation & 4. Local Commute (only if requested)
  const accommodationIncluded = input.needsAccommodation;
  const safeNights =
    Number.isInteger(input.nights) && input.nights >= 1 ? input.nights : 1;

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
    const enteredDailyCommute = parsePositiveOptionalAmount(
      input.manualDailyCommuteFare
    );
    if (enteredDailyCommute !== null && enteredDailyCommute > 0) {
      const totalLocal = Math.round(enteredDailyCommute * safeNights);
      localCommuteExpense = { min: totalLocal, max: totalLocal };
      localCommuteAvailable = true;
      localCommuteAssumptions = `User-entered estimate: ₹${Math.round(enteredDailyCommute)}/day round-trip × ${safeNights} ${safeNights === 1 ? 'day' : 'days'} (accommodation ↔ hospital)`;
    } else {
      localCommuteAvailable = false;
      localCommuteAssumptions = `${FARE_UNAVAILABLE_TEXT} — assumes 1 hospital round-trip per stay day (${safeNights} ${safeNights === 1 ? 'day' : 'days'}); enter an optional daily estimate to include`;
      missingComponents.push('Local accommodation-to-hospital commute fare');
    }
  }

  // 5. Total Estimated Journey Cost & Estimate Confidence
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

  let estimateConfidence: EstimateConfidence = 'incomplete';
  let estimateConfidenceLabel = 'Incomplete — missing required cost components';

  if (isComplete && input.charge) {
    const status = input.charge.verificationStatus;
    if (
      status === 'verified' &&
      (travelCalc.isOfficialTransitFare ||
        input.travelCostConfig?.method === 'car_fuel' ||
        input.travelCostConfig?.method === 'two_wheeler_fuel')
    ) {
      estimateConfidence = 'high';
      estimateConfidenceLabel = 'High — verified medical tariff + structured travel basis';
    } else if (status === 'verified' || status === 'demo') {
      estimateConfidence = 'medium';
      estimateConfidenceLabel =
        status === 'demo'
          ? 'Demo — illustrative sample tariff & configured travel formula'
          : 'Medium — verified medical tariff + estimated travel fare';
    } else {
      estimateConfidence = 'low';
      estimateConfidenceLabel =
        'Low — includes unverified medical price pending verification';
    }
  }

  const conditionSuffix = input.charge?.includesNote
    ? ` (${input.charge.includesNote})`
    : '';

  return {
    medicalCharge: medicalRange,
    medicalChargeLabel: getCategoryChargeLabel(input.category),
    medicalChargeSource: input.charge
      ? `${input.charge.sourceName}${conditionSuffix}`
      : UNAVAILABLE_TEXT,
    medicalChargeVerified: input.charge?.lastVerified || UNAVAILABLE_TEXT,
    medicalChargeConfidenceLabel,
    medicalChargeAvailable,

    travelRoundTrip,
    travelSourceLabel: travelCalc.sourceLabel,
    travelFormulaBreakdown: travelCalc.formulaBreakdown,
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
    estimateConfidence,
    estimateConfidenceLabel,
    missingComponents,
  };
}
