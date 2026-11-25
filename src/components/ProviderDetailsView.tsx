import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BedDouble,
  Car,
  Check,
  ExternalLink,
  Navigation,
  Phone,
  Plus,
} from 'lucide-react';
import type {
  AppMode,
  DiscoveredProvider,
  JourneySearchInput,
  MedicalService,
  ProviderJourneyState,
  TravelMode,
} from '../types/medroute';
import {
  calculateAccommodationExpense,
  extractMedicalChargeRange,
  getMedicalChargeConfidenceLabel,
} from '../utils/costEngine';
import {
  buildGoogleMapsNavigationUrl,
  buildGoogleMapsPlaceUrl,
  displayTextOrUnavailable,
  formatDistanceKm,
  formatINRRange,
  sanitizeExternalUrl,
  sanitizeTelUri,
  UNAVAILABLE_TEXT,
} from '../utils/safety';
import { buildUberDeepLink } from '../utils/uberDeepLink';
import { DiagnosticAlert } from './DiagnosticAlert';

interface ProviderDetailsViewProps {
  mode: AppMode;
  searchInput: JourneySearchInput;
  selectedService: MedicalService | null;
  providerItem: DiscoveredProvider;
  journeyState: ProviderJourneyState;
  isCompared: boolean;
  canAddCompare: boolean;
  onBackToResults: () => void;
  onToggleCompare: () => void;
  onOpenCompare: () => void;
  onChangeTravelMode: (travelMode: TravelMode) => void;
  onSelectAccommodation: (accommodationId: string | null) => void;
  onChangeManualDailyCommuteFare?: (value: string) => void;
  onSwitchToDemo: () => void;
}

const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  DRIVE: 'Driving',
  TWO_WHEELER: 'Two-Wheeler',
  TRANSIT: 'Public Transit',
  WALK: 'Walking',
};

export function ProviderDetailsView({
  mode,
  searchInput,
  selectedService,
  providerItem,
  journeyState,
  isCompared,
  canAddCompare,
  onBackToResults,
  onToggleCompare,
  onOpenCompare,
  onChangeTravelMode,
  onSelectAccommodation,
  onSwitchToDemo,
}: ProviderDetailsViewProps) {
  const { provider, charge, availableServices } =
    providerItem;

  const [uberClickMessage, setUberClickMessage] = useState<string | null>(null);
  const [uberFallbackUrl, setUberFallbackUrl] = useState<string | null>(null);
  const [accUberMessage, setAccUberMessage] = useState<string | null>(null);
  const [accUberFallbackUrl, setAccUberFallbackUrl] = useState<string | null>(null);

  useEffect(() => {
    setUberClickMessage(null);
    setUberFallbackUrl(null);
    setAccUberMessage(null);
    setAccUberFallbackUrl(null);
  }, [
    provider.providerId,
    searchInput.locationMode,
    searchInput.startingLocation?.latitude,
    searchInput.startingLocation?.longitude,
  ]);

  const safeWebsite = sanitizeExternalUrl(provider.website);
  const providerTelUri = sanitizeTelUri(provider.phone);
  const providerMapsUrl = buildGoogleMapsPlaceUrl(
    provider.googleMapsUri,
    { latitude: provider.latitude, longitude: provider.longitude },
    provider.name
  );
  const safeChargeSourceUrl = sanitizeExternalUrl(charge?.sourceUrl);
  const chargeRange = extractMedicalChargeRange(charge);
  const chargeConfidenceLabel = getMedicalChargeConfidenceLabel(charge);

  const activeRouteMode = journeyState.selectedTravelMode;
  const routeModeInfo = journeyState.travel?.modes?.[activeRouteMode] || null;

  const navigationUrl = buildGoogleMapsNavigationUrl(
    searchInput.startingLocation,
    { latitude: provider.latitude, longitude: provider.longitude },
    provider.name,
    activeRouteMode
  );

  const uberCheck = buildUberDeepLink({
    startingLocation: searchInput.startingLocation,
    locationMode: searchInput.locationMode,
    provider,
  });

  const isUberDisabled =
    uberCheck.issue === 'INVALID_DESTINATION_COORDINATES';

  const handleCheckFareInUber = () => {
    setUberClickMessage(null);
    setUberFallbackUrl(null);

    const latestCheck = buildUberDeepLink({
      startingLocation: searchInput.startingLocation,
      locationMode: searchInput.locationMode,
      provider,
    });

    if (!latestCheck.ready || !latestCheck.url) {
      setUberClickMessage(
        latestCheck.errorMessage ||
          'Unable to open Uber because required location details are missing.'
      );
      return;
    }

    try {
      const opened = window.open(
        latestCheck.url,
        '_blank',
        'noopener,noreferrer'
      );
      if (!opened) {
        setUberClickMessage(
          'Your browser blocked opening Uber in a new tab. Use the direct link below to check your fare in Uber.'
        );
        setUberFallbackUrl(latestCheck.url);
      }
    } catch {
      setUberClickMessage(
        'Browser navigation to Uber could not be launched automatically. Use the direct link below to check your fare in Uber.'
      );
      setUberFallbackUrl(latestCheck.url);
    }
  };

  const handleCheckFareToAccommodation = (acc: DiscoveredProvider['charge'] extends null ? any : any) => {
    setAccUberMessage(null);
    setAccUberFallbackUrl(null);

    const check = buildUberDeepLink({
      startingLocation: searchInput.startingLocation,
      locationMode: searchInput.locationMode,
      destination: acc,
    });

    if (!check.ready || !check.url) {
      setAccUberMessage(
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
        setAccUberMessage(
          `Your browser blocked opening Uber in a new tab for ${acc.name}. Use the direct link below to check your fare in Uber.`
        );
        setAccUberFallbackUrl(check.url);
      }
    } catch {
      setAccUberMessage(
        `Browser navigation to Uber could not be launched automatically for ${acc.name}. Use the direct link below to check your fare in Uber.`
      );
      setAccUberFallbackUrl(check.url);
    }
  };



  const tollEstimateText =
    routeModeInfo?.tollInfo?.hasTolls && routeModeInfo.tollInfo.estimatedPrices.length > 0
      ? routeModeInfo.tollInfo.estimatedPrices.map((p) => p.formattedText).join(' + ')
      : null;

  return (
    <section className="space-y-8">
      {/* Top Action & Breadcrumb Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <button
          type="button"
          onClick={onBackToResults}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#0F2942] transition-colors whitespace-nowrap"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Proximity Results
        </button>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleCompare}
            disabled={!isCompared && !canAddCompare}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              isCompared
                ? 'bg-[#F0FDFA] text-[#0F766E] border-[#0F766E]'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 disabled:opacity-50'
            }`}
          >
            {isCompared ? (
              <>
                <Check className="w-4 h-4" />
                Added to Comparison
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add to Compare
              </>
            )}
          </button>

          {isCompared && (
            <button
              type="button"
              onClick={onOpenCompare}
              className="px-4 py-2 text-sm font-medium text-white bg-[#0F766E] rounded-md hover:bg-[#115E59] transition-colors whitespace-nowrap shrink-0"
            >
              View Comparison
            </button>
          )}
        </div>
      </div>

      {/* Step 6: Provider Details */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">

            <span className="text-slate-600">{provider.providerType}</span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="text-slate-500">Source: {provider.source}</span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="text-slate-500">
              Last verified: {provider.lastVerified}
            </span>
          </div>

          <h1 className="text-2xl font-bold text-[#0F2942]">{provider.name}</h1>
        </div>

        <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5 text-sm border-t border-slate-100 pt-5">
          <div>
            <dt className="text-xs font-medium text-slate-500">Complete Address</dt>
            <dd className="mt-1 text-slate-900 leading-relaxed">
              {displayTextOrUnavailable(provider.address)}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-slate-500">Contact Number</dt>
            <dd className="mt-1 font-mono text-slate-900 tabular-nums">
              {providerTelUri && provider.phone ? (
                <a
                  href={providerTelUri}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-[#0F2942] hover:bg-slate-50 hover:border-slate-400 transition-colors whitespace-nowrap"
                  title={`Call ${provider.name} at ${provider.phone}`}
                >
                  <Phone className="w-3.5 h-3.5 text-[#0F766E]" />
                  <span>Call <span className="font-mono tabular-nums">{provider.phone}</span></span>
                </a>
              ) : (
                <span className="text-slate-500 inline-flex items-center gap-1.5 text-xs font-sans">
                  <span>Phone not available</span>
                  {providerMapsUrl && (
                    <a
                      href={providerMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[#0F766E] hover:underline"
                    >
                      (Inquire on Maps)
                    </a>
                  )}
                </span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-slate-500">Official Website</dt>
            <dd className="mt-1">
              {safeWebsite ? (
                <a
                  href={safeWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#0F766E] hover:underline break-all"
                >
                  {safeWebsite.replace(/^https?:\/\//, '')}
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              ) : (
                <span className="text-slate-500">{UNAVAILABLE_TEXT}</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-slate-500">
              Selected Medical Service
            </dt>
            <dd className="mt-1 font-medium text-slate-900">
              {selectedService
                ? `${selectedService.serviceName} (${selectedService.category})`
                : UNAVAILABLE_TEXT}
            </dd>
          </div>

          <div className="md:col-span-1 lg:col-span-1">
            <dt className="text-xs font-medium text-slate-500">
              {charge ? chargeConfidenceLabel : 'Published Medical Service Charge'}
            </dt>
            <dd className="mt-1 space-y-1">
              <div className="font-mono font-semibold text-base text-[#0F2942] tabular-nums">
                {chargeRange
                  ? formatINRRange(chargeRange.min, chargeRange.max)
                  : UNAVAILABLE_TEXT}
                {charge && chargeRange && (
                  <span className="ml-1.5 text-xs font-sans font-normal text-slate-500">
                    ({charge.chargeType.replace(/_/g, ' ')})
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-600">
                {charge ? (
                  <>
                    Source:{' '}
                    {safeChargeSourceUrl ? (
                      <a
                        href={safeChargeSourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#0F766E] hover:underline"
                      >
                        {charge.sourceName}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      charge.sourceName
                    )}{' '}
                    · Verified: {charge.lastVerified}
                  </>
                ) : (
                  'No published charge record on file'
                )}
              </div>
              {charge?.includesNote && (
                <div className="text-xs text-slate-600">
                  Notes: {charge.includesNote}
                </div>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-slate-500">
              Distance from Starting Location
            </dt>
            <dd className="mt-1 font-mono text-slate-900 tabular-nums">
              {routeModeInfo?.supported && routeModeInfo.distanceKm !== null
                ? `${formatDistanceKm(routeModeInfo.distanceKm)} by road`
                : `${formatDistanceKm(providerItem.straightLineDistanceKm)} straight-line`}
            </dd>
          </div>
        </dl>

        <div className="border-t border-slate-100 pt-4 text-sm">
          <span className="text-xs font-medium text-slate-500 block mb-1">
            Available Specialities &amp; Services on Record
          </span>
          {availableServices.length > 0 ? (
            <p className="text-slate-800 leading-relaxed">
              {availableServices.join(' · ')}
            </p>
          ) : (
            <p className="text-amber-800 text-xs">
              {UNAVAILABLE_TEXT} — Google Places listings do not confirm specific
              medical departments. Verify service availability directly with the
              hospital.
            </p>
          )}
        </div>
      </div>

      {/* Step 7: Travel & Navigation */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold text-[#0F2942] flex items-center gap-2">
              <Car className="w-5 h-5 text-[#0F766E]" />
              Travel &amp; Navigation
            </h2>
            <p className="text-xs text-slate-500">
              {mode === 'live'
                ? 'Calculated using Google Maps Routes API from your starting location.'
                : 'Demo Mode: illustrative road distance and duration estimates based on coordinates.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <a
              href={navigationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#0F2942] rounded-md hover:bg-[#163A5C] transition-colors whitespace-nowrap shrink-0"
            >
              <Navigation className="w-4 h-4" />
              Open in Google Maps
            </a>

            <button
              type="button"
              onClick={handleCheckFareInUber}
              disabled={isUberDisabled}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-[#0F2942] bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
            >
              <ExternalLink className="w-4 h-4" />
              Check fare in Uber
            </button>
          </div>
        </div>

        {(isUberDisabled && uberCheck.errorMessage) || uberClickMessage ? (
          <div
            role="status"
            className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-xs sm:text-sm text-amber-900 flex flex-col gap-1.5"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <span>
                {uberClickMessage || uberCheck.errorMessage}
              </span>
            </div>
            {uberFallbackUrl && (
              <div className="pl-6">
                <a
                  href={uberFallbackUrl}
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
        ) : null}

        {journeyState.travelError && (
          <DiagnosticAlert
            diagnostic={journeyState.travelError}
            title="Routes API Diagnostic"
            onSwitchToDemo={mode === 'live' ? onSwitchToDemo : undefined}
          />
        )}

        {/* Travel Mode Tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          {(['DRIVE', 'TWO_WHEELER', 'TRANSIT', 'WALK'] as TravelMode[]).map(
            (m) => {
              const active = activeRouteMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChangeTravelMode(m)}
                  className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white text-[#0F2942] shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {TRAVEL_MODE_LABELS[m]}
                </button>
              );
            }
          )}
        </div>

        {journeyState.travelLoading ? (
          <div
            className={`grid grid-cols-1 ${
              activeRouteMode === 'TRANSIT' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
            } gap-4 animate-pulse`}
          >
            <div className="h-16 bg-slate-100 rounded-md" />
            <div className="h-16 bg-slate-100 rounded-md" />
            {activeRouteMode === 'TRANSIT' && (
              <div className="h-16 bg-slate-100 rounded-md" />
            )}
          </div>
        ) : (
          <div
            className={`grid grid-cols-1 ${
              activeRouteMode === 'TRANSIT' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
            } gap-4 border-t border-slate-100 pt-4`}
          >
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-500">
                Road Distance ({TRAVEL_MODE_LABELS[activeRouteMode]})
              </div>
              <div className="text-lg font-semibold font-mono text-slate-900 tabular-nums">
                {routeModeInfo?.supported
                  ? formatDistanceKm(routeModeInfo.distanceKm)
                  : UNAVAILABLE_TEXT}
              </div>
              {tollEstimateText && (
                <p className="text-xs text-slate-600">
                  Routes API toll estimate (one-way): {tollEstimateText}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-500">
                Estimated Travel Time (One-Way)
              </div>
              <div className="text-lg font-semibold font-mono text-slate-900 tabular-nums">
                {routeModeInfo?.supported
                  ? routeModeInfo.durationText
                  : UNAVAILABLE_TEXT}
              </div>
              {routeModeInfo && !routeModeInfo.supported && routeModeInfo.errorMessage && (
                <p className="text-xs text-amber-800">{routeModeInfo.errorMessage}</p>
              )}
            </div>

            {activeRouteMode === 'TRANSIT' && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-slate-500">
                  Google Routes Transit Fare (One-Way)
                </div>
                {routeModeInfo?.transitFare ? (
                  <>
                    <div className="text-lg font-semibold font-mono text-[#0F766E] tabular-nums">
                      {routeModeInfo.transitFare.formattedText}
                    </div>
                    <p className="text-xs text-slate-500">
                      Returned by Google Routes API ({routeModeInfo.transitFare.currencyCode}).
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-lg font-semibold text-amber-800">
                      Fare Data Unavailable
                    </div>
                    <p className="text-xs text-slate-500">
                      Google Routes API did not publish transit ticket pricing for this corridor.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">
          Live ride fares are not estimated or retrieved by MedRoute. Click Check fare in Uber above to check actual ride pricing directly inside Uber.
          {!uberCheck.hasConfiguredClientId
            ? ' Optional: VITE_UBER_CLIENT_ID is not set, so Uber opens directly without a client_id.'
            : ''}
          {uberCheck.hasIncompleteDestinationAddress
            ? ' Note: street address details for this provider are partial; Uber will use its exact coordinates and name.'
            : ''}
        </p>
      </div>

      {/* Step 8: Conditional Accommodation Discovery (ONLY when user answered Yes) */}
      {searchInput.needsAccommodation && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-[#0F2942] flex items-center gap-2">
              <BedDouble className="w-5 h-5 text-[#0F766E]" />
              Nearby Accommodation ({searchInput.nights}{' '}
              {searchInput.nights === 1 ? 'Night' : 'Nights'})
            </h2>
            <p className="text-xs text-slate-500">
              Select a stay near {provider.name} to include accommodation expenses
              in your journey estimate. Room availability is not claimed without a
              live booking inventory source.
            </p>
          </div>

          {accUberMessage && (
            <div
              role="status"
              className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-xs sm:text-sm text-amber-900 flex flex-col gap-1.5"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                <span>{accUberMessage}</span>
              </div>
              {accUberFallbackUrl && (
                <div className="pl-6">
                  <a
                    href={accUberFallbackUrl}
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

          {journeyState.accommodationsError && (
            <DiagnosticAlert
              diagnostic={journeyState.accommodationsError}
              title="Accommodation Discovery Diagnostic"
              onSwitchToDemo={mode === 'live' ? onSwitchToDemo : undefined}
            />
          )}

          {journeyState.accommodationsLoading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-16 bg-slate-100 rounded-md" />
              <div className="h-16 bg-slate-100 rounded-md" />
            </div>
          ) : journeyState.accommodations.length === 0 ? (
            <div className="bg-amber-50/70 border border-amber-200 rounded-md p-4 text-sm text-amber-900">
              No nearby accommodation records were found within 5 km of this
              healthcare provider. Your overall cost estimate will remain marked
              as incomplete until accommodation pricing is available.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-md divide-y divide-slate-200">
              {journeyState.accommodations.map((acc) => {
                const isSelected =
                  journeyState.selectedAccommodationId === acc.accommodationId;
                const stayTotal = calculateAccommodationExpense(
                  acc,
                  searchInput.nights
                );
                const nightlyText = formatINRRange(
                  acc.minNightlyPrice,
                  acc.maxNightlyPrice
                );

                const safeAccWebsite = sanitizeExternalUrl(acc.website);
                const accMapsUrl = buildGoogleMapsPlaceUrl(
                  acc.googleMapsUri,
                  { latitude: acc.latitude, longitude: acc.longitude },
                  acc.name
                );
                const telUri = sanitizeTelUri(acc.phoneNumber);

                return (
                  <div
                    key={acc.accommodationId}
                    className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                      isSelected ? 'bg-[#F0FDFA]/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-slate-900">
                        {acc.name}
                      </h3>
                      <p className="text-xs text-slate-600">{acc.address}</p>
                      <p className="text-xs text-slate-500">
                        Source: {acc.priceSource} · Verified: {acc.lastVerified} ·
                        Room availability not confirmed
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs pt-1">
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

                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 shrink-0">
                      <div className="text-left sm:text-right">
                        <div className="text-xs text-slate-500">Nightly Price</div>
                        <div className="text-sm font-semibold font-mono tabular-nums text-slate-900">
                          {nightlyText}
                        </div>
                        <div className="text-xs font-mono tabular-nums text-[#0F766E]">
                          {stayTotal
                            ? `${searchInput.nights}N total: ${formatINRRange(stayTotal.min, stayTotal.max)}`
                            : 'Stay total unavailable'}
                        </div>
                      </div>

                      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                        {telUri && acc.phoneNumber && (
                          <a
                            href={telUri}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white text-[#0F2942] hover:bg-slate-50 hover:border-slate-400 transition-colors whitespace-nowrap shrink-0"
                            title={`Call ${acc.name} at ${acc.phoneNumber}`}
                          >
                            <Phone className="w-3.5 h-3.5 text-[#0F766E]" />
                            <span>Call <span className="font-mono tabular-nums">{acc.phoneNumber}</span></span>
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCheckFareToAccommodation(acc)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white text-[#0F2942] hover:bg-slate-50 hover:border-slate-400 transition-colors whitespace-nowrap shrink-0"
                          title={`Check fare in Uber to ${acc.name}`}
                        >
                          <Car className="w-3.5 h-3.5 text-[#0F766E]" />
                          Check fare in Uber
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            onSelectAccommodation(
                              isSelected ? null : acc.accommodationId
                            )
                          }
                          className={`px-3.5 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                            isSelected
                              ? 'bg-[#0F766E] text-white border-[#0F766E]'
                              : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {isSelected ? 'Selected' : 'Select Stay'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </section>
  );
}
