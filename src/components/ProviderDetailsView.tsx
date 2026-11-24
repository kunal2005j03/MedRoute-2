import {
  AlertTriangle,
  ArrowLeft,
  BedDouble,
  Car,
  Check,
  ExternalLink,
  Navigation,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import type {
  AccommodationRecord,
  AppMode,
  DiscoveredProvider,
  JourneySearchInput,
  MedicalService,
  ProviderJourneyState,
  TravelMode,
} from '../types/medroute';
import {
  calculateAccommodationExpense,
  calculateJourneyCostBreakdown,
  extractMedicalChargeRange,
} from '../utils/costEngine';
import {
  buildGoogleMapsNavigationUrl,
  displayTextOrUnavailable,
  FARE_UNAVAILABLE_TEXT,
  formatDistanceKm,
  formatINRRange,
  sanitizeExternalUrl,
  UNAVAILABLE_TEXT,
} from '../utils/safety';
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
  onChangeManualRoundTripFare: (value: string) => void;
  onSelectAccommodation: (accommodationId: string | null) => void;
  onChangeManualDailyCommuteFare: (value: string) => void;
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
  onChangeManualRoundTripFare,
  onSelectAccommodation,
  onChangeManualDailyCommuteFare,
  onSwitchToDemo,
}: ProviderDetailsViewProps) {
  const { provider, serviceVerification, charge, availableServices } =
    providerItem;

  const safeWebsite = sanitizeExternalUrl(provider.website);
  const chargeRange = extractMedicalChargeRange(charge);

  const selectedAccommodation: AccommodationRecord | null =
    journeyState.accommodations.find(
      (a) => a.accommodationId === journeyState.selectedAccommodationId
    ) || null;

  const activeRouteMode = journeyState.selectedTravelMode;
  const routeModeInfo = journeyState.travel?.modes?.[activeRouteMode] || null;

  const navigationUrl = buildGoogleMapsNavigationUrl(
    searchInput.startingLocation,
    { latitude: provider.latitude, longitude: provider.longitude },
    provider.name,
    activeRouteMode
  );

  const costBreakdown = calculateJourneyCostBreakdown({
    category: searchInput.category,
    charge,
    manualRoundTripFare: journeyState.manualRoundTripFare,
    needsAccommodation: searchInput.needsAccommodation,
    nights: searchInput.nights,
    selectedAccommodation,
    manualDailyCommuteFare: journeyState.manualDailyCommuteFare,
  });

  const verificationLabel =
    serviceVerification === 'verified'
      ? 'Verified Service Record'
      : serviceVerification === 'demo'
        ? 'Demo Data — Illustrative Sample'
        : 'Unverified Listing (Google Places)';

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
            <span
              className={`inline-flex items-center gap-1 font-medium ${
                serviceVerification === 'verified'
                  ? 'text-emerald-700'
                  : serviceVerification === 'demo'
                    ? 'text-[#0F766E]'
                    : 'text-amber-700'
              }`}
            >
              {serviceVerification === 'unverified' ? (
                <AlertTriangle className="w-3.5 h-3.5" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
              {verificationLabel}
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="text-slate-600">{provider.providerType}</span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="text-slate-500">
              Source: {provider.source}
            </span>
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
              {displayTextOrUnavailable(provider.phone)}
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

          <div>
            <dt className="text-xs font-medium text-slate-500">
              Published Medical Service Charge
            </dt>
            <dd className="mt-1 space-y-0.5">
              <div className="font-mono font-semibold text-base text-[#0F2942] tabular-nums">
                {chargeRange
                  ? formatINRRange(chargeRange.min, chargeRange.max)
                  : UNAVAILABLE_TEXT}
              </div>
              <div className="text-xs text-slate-500">
                {charge
                  ? `${charge.sourceName} · Verified ${charge.lastVerified}`
                  : 'No published charge record on file'}
              </div>
              {charge?.includesNote && (
                <div className="text-xs text-slate-600">{charge.includesNote}</div>
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
            Available Specialities & Services on Record
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

      {/* Step 7: Travel Information & Navigation */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold text-[#0F2942] flex items-center gap-2">
              <Car className="w-5 h-5 text-[#0F766E]" />
              Travel Information
            </h2>
            <p className="text-xs text-slate-500">
              {mode === 'live'
                ? 'Calculated using Google Maps Routes API from your starting location.'
                : 'Demo Mode: illustrative road distance and duration estimates based on coordinates.'}
            </p>
          </div>

          <a
            href={navigationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#0F2942] rounded-md hover:bg-[#163A5C] transition-colors whitespace-nowrap shrink-0"
          >
            <Navigation className="w-4 h-4" />
            Open in Google Maps
          </a>
        </div>

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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse">
            <div className="h-16 bg-slate-100 rounded-md" />
            <div className="h-16 bg-slate-100 rounded-md" />
            <div className="h-16 bg-slate-100 rounded-md" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-100 pt-4">
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-500">
                Road Distance ({TRAVEL_MODE_LABELS[activeRouteMode]})
              </div>
              <div className="text-lg font-semibold font-mono text-slate-900 tabular-nums">
                {routeModeInfo?.supported
                  ? formatDistanceKm(routeModeInfo.distanceKm)
                  : UNAVAILABLE_TEXT}
              </div>
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

            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-500">
                Confirmed Operator Fare
              </div>
              <div className="text-lg font-semibold text-amber-800">
                {FARE_UNAVAILABLE_TEXT}
              </div>
              <p className="text-xs text-slate-500">
                Google Routes API does not publish confirmed cab, train, or bus fares.
              </p>
            </div>
          </div>
        )}

        {/* Optional User-Entered Round-Trip Travel Estimate */}
        <div className="bg-slate-50 border border-slate-200 rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <label
              htmlFor="round-trip-fare-input"
              className="text-sm font-medium text-slate-900 block"
            >
              Optional: Enter your estimated round-trip travel expense (INR)
            </label>
            <p className="text-xs text-slate-600">
              Leave blank to keep as &ldquo;Fare unavailable&rdquo;. Any entered value is
              clearly labeled as a user-entered estimate, not a confirmed fare.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-mono text-slate-500">₹</span>
            <input
              id="round-trip-fare-input"
              type="number"
              min={0}
              step={50}
              placeholder="e.g. 600"
              value={journeyState.manualRoundTripFare}
              onChange={(e) => onChangeManualRoundTripFare(e.target.value)}
              className="w-36 h-10 px-3 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:border-[#0F766E] focus:outline-none"
            />
          </div>
        </div>
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

                return (
                  <div
                    key={acc.accommodationId}
                    className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                      isSelected ? 'bg-[#F0FDFA]/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">
                          {acc.accommodationType}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-[#0F2942]">
                          {formatDistanceKm(acc.distanceFromHospitalKm)} from hospital
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {acc.dataOrigin === 'demo'
                            ? 'Demo Data'
                            : acc.dataOrigin === 'verified'
                              ? 'Verified Record'
                              : 'Live Places Listing'}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {acc.name}
                      </h3>
                      <p className="text-xs text-slate-600">{acc.address}</p>
                      <p className="text-xs text-slate-500">
                        Source: {acc.priceSource} · Verified: {acc.lastVerified} ·
                        Room availability not confirmed
                      </p>
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
                );
              })}
            </div>
          )}

          {/* Local Commuting Expense (Calculated Separately) */}
          <div className="bg-slate-50 border border-slate-200 rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <label
                htmlFor="local-commute-input"
                className="text-sm font-medium text-slate-900 block"
              >
                Local commuting expense (Accommodation ↔ Hospital, per day in INR)
              </label>
              <p className="text-xs text-slate-600">
                Assumes 1 round-trip per stay day ({searchInput.nights}{' '}
                {searchInput.nights === 1 ? 'day' : 'days'}). Leave blank to show
                &ldquo;Fare unavailable&rdquo;.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-mono text-slate-500">₹/day</span>
              <input
                id="local-commute-input"
                type="number"
                min={0}
                step={20}
                placeholder="e.g. 160"
                value={journeyState.manualDailyCommuteFare}
                onChange={(e) => onChangeManualDailyCommuteFare(e.target.value)}
                className="w-32 h-10 px-3 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:border-[#0F766E] focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 9: Total Journey Cost Estimation Ledger */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-[#0F2942]">
              Estimated Medical Journey Cost Breakdown
            </h2>
            <p className="text-xs text-slate-500">
              Applies only the selected category charge ({costBreakdown.medicalChargeLabel}) — never combines consultation, diagnostics, and treatment automatically.
            </p>
          </div>
          <span
            className={`text-xs font-semibold whitespace-nowrap ${
              costBreakdown.isComplete ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {costBreakdown.isComplete
              ? 'Complete Estimate'
              : 'Incomplete Estimate'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <th className="py-3 px-6 font-medium">Cost Component</th>
                <th className="py-3 px-6 font-medium">Source & Basis</th>
                <th className="py-3 px-6 font-medium text-right">Amount (INR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="py-3.5 px-6 font-medium text-slate-900">
                  {costBreakdown.medicalChargeLabel}
                </td>
                <td className="py-3.5 px-6 text-xs text-slate-600">
                  {costBreakdown.medicalChargeAvailable
                    ? `Published / Sample Charge · ${costBreakdown.medicalChargeSource} · Verified ${costBreakdown.medicalChargeVerified}`
                    : 'No published medical charge available — not treated as ₹0'}
                </td>
                <td className="py-3.5 px-6 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                  {costBreakdown.medicalCharge
                    ? formatINRRange(
                        costBreakdown.medicalCharge.min,
                        costBreakdown.medicalCharge.max
                      )
                    : UNAVAILABLE_TEXT}
                </td>
              </tr>

              <tr>
                <td className="py-3.5 px-6 font-medium text-slate-900">
                  Estimated Round-Trip Travel Cost
                </td>
                <td className="py-3.5 px-6 text-xs text-slate-600">
                  {costBreakdown.travelSourceLabel}
                </td>
                <td className="py-3.5 px-6 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                  {costBreakdown.travelRoundTrip
                    ? formatINRRange(
                        costBreakdown.travelRoundTrip.min,
                        costBreakdown.travelRoundTrip.max
                      )
                    : FARE_UNAVAILABLE_TEXT}
                </td>
              </tr>

              {costBreakdown.accommodationIncluded && (
                <>
                  <tr>
                    <td className="py-3.5 px-6 font-medium text-slate-900">
                      Accommodation Expense ({costBreakdown.nights}{' '}
                      {costBreakdown.nights === 1 ? 'night' : 'nights'})
                    </td>
                    <td className="py-3.5 px-6 text-xs text-slate-600">
                      {costBreakdown.accommodationName
                        ? `${costBreakdown.accommodationName} · ${costBreakdown.accommodationSourceLabel}`
                        : costBreakdown.accommodationSourceLabel}
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {costBreakdown.accommodationExpense
                        ? formatINRRange(
                            costBreakdown.accommodationExpense.min,
                            costBreakdown.accommodationExpense.max
                          )
                        : UNAVAILABLE_TEXT}
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3.5 px-6 font-medium text-slate-900">
                      Local Commute Expense
                    </td>
                    <td className="py-3.5 px-6 text-xs text-slate-600">
                      {costBreakdown.localCommuteAssumptions}
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {costBreakdown.localCommuteExpense
                        ? formatINRRange(
                            costBreakdown.localCommuteExpense.min,
                            costBreakdown.localCommuteExpense.max
                          )
                        : FARE_UNAVAILABLE_TEXT}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <td
                  colSpan={2}
                  className="py-4 px-6 font-semibold text-[#0F2942]"
                >
                  Total Estimated Journey Cost
                </td>
                <td className="py-4 px-6 text-right font-mono tabular-nums text-lg font-bold text-[#0F2942] whitespace-nowrap">
                  {costBreakdown.isComplete && costBreakdown.totalRange
                    ? formatINRRange(
                        costBreakdown.totalRange.min,
                        costBreakdown.totalRange.max
                      )
                    : 'Incomplete Estimate'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="p-5 bg-slate-50/70 border-t border-slate-200 space-y-2 text-xs text-slate-600">
          {!costBreakdown.isComplete && (
            <p className="text-amber-800 font-medium">
              Missing required cost items:{' '}
              {costBreakdown.missingComponents.join(', ')}. Missing amounts are
              never substituted with zero.
            </p>
          )}
          <p>
            <strong>Important Notice:</strong> This is an estimated journey cost
            for planning and comparison only—not a final hospital bill. It
            excludes unknown prescribed medicines, diagnostic add-ons, and
            unforeseen treatment expenses.
          </p>
        </div>
      </div>
    </section>
  );
}
