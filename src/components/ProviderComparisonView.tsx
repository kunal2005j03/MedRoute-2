import { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Car,
  ExternalLink,
  Phone,
  Scale,
  Trash2,
} from 'lucide-react';
import type {
  AccommodationRecord,
  DiscoveredProvider,
  JourneySearchInput,
  MedicalService,
  ProviderJourneyState,
} from '../types/medroute';
import { calculateJourneyCostBreakdown } from '../utils/costEngine';
import {
  buildGoogleMapsPlaceUrl,
  FARE_UNAVAILABLE_TEXT,
  formatDistanceKm,
  formatINRRange,
  sanitizeExternalUrl,
  sanitizeTelUri,
  UNAVAILABLE_TEXT,
} from '../utils/safety';
import { buildUberDeepLink } from '../utils/uberDeepLink';

interface ProviderComparisonViewProps {
  searchInput: JourneySearchInput;
  selectedService: MedicalService | null;
  comparedProviders: DiscoveredProvider[];
  journeyStates: Record<string, ProviderJourneyState>;
  onRemoveProvider: (providerId: string) => void;
  onInspectProvider: (item: DiscoveredProvider) => void;
  onBackToResults: () => void;
}

export function ProviderComparisonView({
  searchInput,
  selectedService,
  comparedProviders,
  journeyStates,
  onRemoveProvider,
  onInspectProvider,
  onBackToResults,
}: ProviderComparisonViewProps) {
  const [compUberMessage, setCompUberMessage] = useState<string | null>(null);
  const [compUberFallbackUrl, setCompUberFallbackUrl] = useState<string | null>(null);

  const handleCheckFareToAccommodation = (acc: AccommodationRecord) => {
    setCompUberMessage(null);
    setCompUberFallbackUrl(null);

    const check = buildUberDeepLink({
      startingLocation: searchInput.startingLocation,
      locationMode: searchInput.locationMode,
      destination: acc,
    });

    if (!check.ready || !check.url) {
      setCompUberMessage(
        check.errorMessage ||
          'Unable to open Uber because required location details are missing.'
      );
      return;
    }

    try {
      const opened = window.open(
        check.url,
        '_blank',
        'noopener,noreferrer'
      );
      if (!opened) {
        setCompUberMessage(
          `Your browser blocked opening Uber in a new tab for ${acc.name}. Use the direct link below to check your fare in Uber.`
        );
        setCompUberFallbackUrl(check.url);
      }
    } catch {
      setCompUberMessage(
        `Browser navigation to Uber could not be launched automatically for ${acc.name}. Use the direct link below to check your fare in Uber.`
      );
      setCompUberFallbackUrl(check.url);
    }
  };

  const buildBreakdownFor = (item: DiscoveredProvider) => {
    const st = journeyStates[item.provider.providerId];
    const modeRes = st?.travel?.modes?.[st.selectedTravelMode] || null;
    const selectedAcc =
      st?.accommodations.find(
        (a) => a.accommodationId === st.selectedAccommodationId
      ) || null;
    return calculateJourneyCostBreakdown({
      category: searchInput.category,
      charge: item.charge,
      manualRoundTripFare: st?.manualRoundTripFare || '',
      travelCostConfig: st?.travelCostConfig,
      routeModeResult: modeRes,
      needsAccommodation: searchInput.needsAccommodation,
      nights: searchInput.nights,
      selectedAccommodation: selectedAcc,
      manualDailyCommuteFare: st?.manualDailyCommuteFare || '',
    });
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-[#0F766E]">
            Side-by-side medical journey expense comparison
          </p>
          <h1 className="text-2xl font-bold text-[#0F2942]">
            Provider Comparison
          </h1>
          <p className="text-sm text-slate-600">
            Comparing complete estimated journey expenses for{' '}
            <span className="font-medium text-slate-900">
              {selectedService
                ? `${selectedService.serviceName} (${selectedService.category})`
                : 'your selected service'}
            </span>
            . Default provider search results remain strictly proximity-sorted,
            and MedRoute never declares any hospital medically best.
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToResults}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Results
        </button>
      </div>

      {compUberMessage && (
        <div
          role="status"
          className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-xs sm:text-sm text-amber-900 flex flex-col gap-1.5"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
            <span>{compUberMessage}</span>
          </div>
          {compUberFallbackUrl && (
            <div className="pl-6">
              <a
                href={compUberFallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[#0F2942] underline hover:text-[#0F766E]"
              >
                Open Uber directly
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      )}

      {comparedProviders.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-4">
          <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <Scale className="w-5 h-5" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-lg font-semibold text-slate-900">
              No providers selected for comparison yet
            </h2>
            <p className="text-sm text-slate-600">
              Select up to 4 providers from your proximity results to compare
              their medical charges, travel distance, accommodation costs, and
              overall estimated journey expenses side by side.
            </p>
          </div>
          <button
            type="button"
            onClick={onBackToResults}
            className="px-4 py-2 text-sm font-medium text-white bg-[#0F2942] rounded-md hover:bg-[#163A5C] transition-colors whitespace-nowrap"
          >
            Browse Provider Results
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm min-w-[720px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-4 px-5 text-xs font-semibold text-slate-500 w-52 align-top">
                    Journey Expense Factor
                  </th>
                  {comparedProviders.map((item) => (
                    <th
                      key={item.provider.providerId}
                      className="py-4 px-5 align-top border-l border-slate-200"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-[#0F2942] text-sm leading-snug">
                            {item.provider.name}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove ${item.provider.name} from comparison`}
                            onClick={() =>
                              onRemoveProvider(item.provider.providerId)
                            }
                            className="p-1 text-slate-400 hover:text-red-700 transition-colors shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="text-xs font-normal text-slate-500">
                          {item.provider.providerType} ·{' '}
                          {item.serviceVerification === 'verified'
                            ? 'Verified'
                            : item.serviceVerification === 'demo'
                              ? 'Demo Data'
                              : 'Unverified Listing'}
                        </div>
                        <button
                          type="button"
                          onClick={() => onInspectProvider(item)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] hover:underline pt-1"
                        >
                          Configure Travel &amp; Stay
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {/* Distance & Travel Time */}
                <tr>
                  <td className="py-3.5 px-5 font-medium text-slate-700 bg-slate-50/40">
                    Distance &amp; Travel Time
                  </td>
                  {comparedProviders.map((item) => {
                    const st = journeyStates[item.provider.providerId];
                    const modeRes = st?.travel?.modes?.[st.selectedTravelMode];
                    return (
                      <td
                        key={item.provider.providerId}
                        className="py-3.5 px-5 border-l border-slate-200 font-mono tabular-nums text-xs text-slate-900"
                      >
                        {modeRes?.supported ? (
                          <div>
                            <div className="font-semibold">
                              {formatDistanceKm(modeRes.distanceKm)} road
                            </div>
                            <div className="text-slate-500">
                              {modeRes.durationText} ({st.selectedTravelMode})
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="font-semibold">
                              {formatDistanceKm(item.straightLineDistanceKm)}{' '}
                              straight-line
                            </div>
                            <div className="text-slate-500">
                              Open details to fetch road route
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* Medical Charge */}
                <tr>
                  <td className="py-3.5 px-5 font-medium text-slate-700 bg-slate-50/40">
                    Medical Service Charge
                  </td>
                  {comparedProviders.map((item) => {
                    const breakdown = buildBreakdownFor(item);
                    const safeUrl = sanitizeExternalUrl(item.charge?.sourceUrl);

                    return (
                      <td
                        key={item.provider.providerId}
                        className="py-3.5 px-5 border-l border-slate-200"
                      >
                        <div className="font-mono tabular-nums font-semibold text-slate-900">
                          {breakdown.medicalCharge
                            ? formatINRRange(
                                breakdown.medicalCharge.min,
                                breakdown.medicalCharge.max
                              )
                            : UNAVAILABLE_TEXT}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {breakdown.medicalChargeConfidenceLabel}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {safeUrl ? (
                            <a
                              href={safeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#0F766E] hover:underline"
                            >
                              {item.charge?.sourceName || 'Source'}
                            </a>
                          ) : (
                            item.charge?.sourceName || 'No tariff on file'
                          )}
                          {item.charge?.lastVerified
                            ? ` · ${item.charge.lastVerified}`
                            : ''}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Round-Trip Travel Estimate */}
                <tr>
                  <td className="py-3.5 px-5 font-medium text-slate-700 bg-slate-50/40">
                    Round-Trip Travel Estimate
                  </td>
                  {comparedProviders.map((item) => {
                    const breakdown = buildBreakdownFor(item);

                    return (
                      <td
                        key={item.provider.providerId}
                        className="py-3.5 px-5 border-l border-slate-200"
                      >
                        <div className="font-mono tabular-nums font-semibold text-slate-900">
                          {breakdown.travelRoundTrip
                            ? formatINRRange(
                                breakdown.travelRoundTrip.min,
                                breakdown.travelRoundTrip.max
                              )
                            : FARE_UNAVAILABLE_TEXT}
                        </div>
                        {breakdown.travelFormulaBreakdown && (
                          <div className="text-xs font-mono text-slate-500 mt-0.5">
                            {breakdown.travelFormulaBreakdown}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* Conditional Accommodation & Local Commute Rows */}
                {searchInput.needsAccommodation && (
                  <>
                    <tr>
                      <td className="py-3.5 px-5 font-medium text-slate-700 bg-slate-50/40">
                        Accommodation ({searchInput.nights}{' '}
                        {searchInput.nights === 1 ? 'night' : 'nights'})
                      </td>
                      {comparedProviders.map((item) => {
                        const st = journeyStates[item.provider.providerId];
                        const selectedAcc =
                          st?.accommodations.find(
                            (a) =>
                              a.accommodationId === st.selectedAccommodationId
                          ) || null;
                        const breakdown = buildBreakdownFor(item);
                        const safeAccWebsite = selectedAcc
                          ? sanitizeExternalUrl(selectedAcc.website)
                          : null;
                        const accMapsUrl = selectedAcc
                          ? buildGoogleMapsPlaceUrl(
                              selectedAcc.googleMapsUri,
                              {
                                latitude: selectedAcc.latitude,
                                longitude: selectedAcc.longitude,
                              },
                              selectedAcc.name
                            )
                          : null;
                        const telUri = selectedAcc
                          ? sanitizeTelUri(selectedAcc.phoneNumber)
                          : null;

                        return (
                          <td
                            key={item.provider.providerId}
                            className="py-3.5 px-5 border-l border-slate-200"
                          >
                            <div className="font-mono tabular-nums font-semibold text-slate-900">
                              {breakdown.accommodationExpense
                                ? formatINRRange(
                                    breakdown.accommodationExpense.min,
                                    breakdown.accommodationExpense.max
                                  )
                                : UNAVAILABLE_TEXT}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {selectedAcc
                                ? selectedAcc.name
                                : 'Open details to pick a stay'}
                            </div>
                            {selectedAcc && (
                              <div className="space-y-1.5 mt-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  {telUri && selectedAcc.phoneNumber && (
                                    <a
                                      href={telUri}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-slate-300 bg-white text-[#0F2942] hover:bg-slate-50 hover:border-slate-400 transition-colors whitespace-nowrap"
                                      title={`Call ${selectedAcc.name} at ${selectedAcc.phoneNumber}`}
                                    >
                                      <Phone className="w-3 h-3 text-[#0F766E]" />
                                      <span>Call <span className="font-mono tabular-nums">{selectedAcc.phoneNumber}</span></span>
                                    </a>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleCheckFareToAccommodation(selectedAcc)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-slate-300 bg-white text-[#0F2942] hover:bg-slate-50 hover:border-slate-400 transition-colors whitespace-nowrap"
                                    title={`Check fare in Uber to ${selectedAcc.name}`}
                                  >
                                    <Car className="w-3 h-3 text-[#0F766E]" />
                                    Check fare in Uber
                                  </button>
                                </div>

                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                                  {safeAccWebsite ? (
                                    <a
                                      href={safeAccWebsite}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 font-medium text-[#0F766E] hover:underline whitespace-nowrap"
                                    >
                                      Visit Website
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  ) : (
                                    <span className="text-slate-400">
                                      Website unavailable
                                    </span>
                                  )}
                                  {accMapsUrl && (
                                    <>
                                      <span aria-hidden="true" className="text-slate-300">
                                        ·
                                      </span>
                                      <a
                                        href={accMapsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 font-medium text-[#0F2942] hover:underline whitespace-nowrap"
                                      >
                                        View on Google Maps
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </>
                                  )}
                                  {!telUri && (
                                    <>
                                      <span aria-hidden="true" className="text-slate-300">
                                        ·
                                      </span>
                                      <span className="text-slate-400">
                                        Phone not available
                                      </span>
                                      {accMapsUrl && (
                                        <a
                                          href={accMapsUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-medium text-[#0F766E] hover:underline whitespace-nowrap"
                                        >
                                          (Inquire on Maps)
                                        </a>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    <tr>
                      <td className="py-3.5 px-5 font-medium text-slate-700 bg-slate-50/40">
                        Local Commute ({searchInput.nights}d)
                      </td>
                      {comparedProviders.map((item) => {
                        const breakdown = buildBreakdownFor(item);

                        return (
                          <td
                            key={item.provider.providerId}
                            className="py-3.5 px-5 border-l border-slate-200 font-mono tabular-nums text-slate-900"
                          >
                            {breakdown.localCommuteExpense
                              ? formatINRRange(
                                  breakdown.localCommuteExpense.min,
                                  breakdown.localCommuteExpense.max
                                )
                              : FARE_UNAVAILABLE_TEXT}
                          </td>
                        );
                      })}
                    </tr>
                  </>
                )}

                {/* Overall Total Row */}
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td className="py-4 px-5 font-semibold text-[#0F2942]">
                    Total Estimated Journey Cost
                  </td>
                  {comparedProviders.map((item) => {
                    const breakdown = buildBreakdownFor(item);

                    return (
                      <td
                        key={item.provider.providerId}
                        className="py-4 px-5 border-l border-slate-200"
                      >
                        {breakdown.isComplete && breakdown.totalRange ? (
                          <div className="space-y-1">
                            <div className="font-mono tabular-nums text-base font-bold text-[#0F2942]">
                              {formatINRRange(
                                breakdown.totalRange.min,
                                breakdown.totalRange.max
                              )}
                            </div>
                            <div className="text-xs text-slate-500">
                              Confidence: {breakdown.estimateConfidenceLabel}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-amber-800">
                              Incomplete Estimate
                            </div>
                            <div className="text-xs text-slate-500">
                              Missing: {breakdown.missingComponents.join(', ')}
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Disclaimer: Estimates are provided solely for transparent financial
            comparison and exclude unknown medicines and unforeseen clinical
            costs. MedRoute does not rank hospitals by medical quality or
            recommend a specific facility—the final decision belongs entirely to
            the patient and caregiver.
          </p>
        </div>
      )}
    </section>
  );
}
