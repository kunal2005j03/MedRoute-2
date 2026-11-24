import {
  ArrowRight,
  Check,
  ChevronDown,
  MapPin,
  Plus,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import type {
  AppMode,
  DiscoveredProvider,
  JourneySearchInput,
  MapsApiDiagnostic,
  MedicalService,
} from '../types/medroute';
import {
  formatDistanceKm,
  formatINRRange,
  UNAVAILABLE_TEXT,
} from '../utils/safety';
import { extractMedicalChargeRange } from '../utils/costEngine';
import { DiagnosticAlert } from './DiagnosticAlert';

interface ProviderResultsListProps {
  mode: AppMode;
  searchInput: JourneySearchInput;
  selectedService: MedicalService | null;
  providers: DiscoveredProvider[];
  visibleCount: number;
  hasMoreRemote: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  diagnostic: MapsApiDiagnostic | null;
  comparedIds: string[];
  onSelectProvider: (item: DiscoveredProvider) => void;
  onToggleCompare: (providerId: string) => void;
  onLoadMore: () => void;
  onBackToSearch: () => void;
  onOpenCompare: () => void;
  onSwitchToDemo: () => void;
}

export function ProviderResultsList({
  mode,
  searchInput,
  selectedService,
  providers,
  visibleCount,
  hasMoreRemote,
  isLoading,
  isLoadingMore,
  diagnostic,
  comparedIds,
  onSelectProvider,
  onToggleCompare,
  onLoadMore,
  onBackToSearch,
  onOpenCompare,
  onSwitchToDemo,
}: ProviderResultsListProps) {
  const displayedProviders = providers.slice(0, visibleCount);
  const canLoadMore = visibleCount < providers.length || hasMoreRemote;

  return (
    <section className="space-y-6">
      {/* Results Header Bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-[#0F766E]">
            Sorted strictly by geographical proximity · Nearest first
          </p>
          <h1 className="text-2xl font-bold text-[#0F2942]">
            {selectedService
              ? `${selectedService.serviceName} (${selectedService.category})`
              : 'Provider Results'}
          </h1>
          <p className="text-sm text-slate-600">
            From{' '}
            <span className="font-medium text-slate-900">
              {searchInput.startingLocation?.formattedAddress || UNAVAILABLE_TEXT}
            </span>
            {searchInput.needsAccommodation
              ? ` · Accommodation requested (${searchInput.nights} ${searchInput.nights === 1 ? 'night' : 'nights'})`
              : ' · No accommodation requested'}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onBackToSearch}
            className="px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            Edit Search
          </button>
          {comparedIds.length > 0 && (
            <button
              type="button"
              onClick={onOpenCompare}
              className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#0F766E] rounded-md hover:bg-[#115E59] transition-colors whitespace-nowrap shrink-0"
            >
              Compare Selected ({comparedIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Live API Diagnostic Banner (Never silently substitutes Demo Data) */}
      {diagnostic && (
        <DiagnosticAlert
          diagnostic={diagnostic}
          title="Live Provider Discovery Error"
          onSwitchToDemo={mode === 'live' ? onSwitchToDemo : undefined}
        />
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading providers">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="bg-white border border-slate-200 rounded-lg p-5 animate-pulse space-y-3"
            >
              <div className="h-5 w-1/2 bg-slate-200 rounded" />
              <div className="h-4 w-3/4 bg-slate-100 rounded" />
              <div className="h-4 w-1/3 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Empty Results State */}
      {!isLoading && displayedProviders.length === 0 && !diagnostic && (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-4">
          <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <MapPin className="w-5 h-5" />
          </div>
          <div className="max-w-lg mx-auto space-y-1.5">
            <h2 className="text-lg font-semibold text-slate-900">
              No matching providers found near this location
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {mode === 'demo'
                ? 'Demo Mode contains a sample Greater Kolkata dataset only. No sample hospitals exist near the selected city. Try a Greater Kolkata starting location (such as Esplanade, Salt Lake, or Howrah) or switch to Live Mode for Pan-India discovery.'
                : 'No verified database providers or Google Places listings were returned near your chosen location for this service. Try broadening the city or locality name.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onBackToSearch}
              className="px-4 py-2 text-sm font-medium text-white bg-[#0F2942] rounded-md hover:bg-[#163A5C] transition-colors whitespace-nowrap"
            >
              Change Starting Location
            </button>
            {mode === 'live' && (
              <button
                type="button"
                onClick={onSwitchToDemo}
                className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                Explore Demo Data (Kolkata)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Provider Rows */}
      {!isLoading && displayedProviders.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Showing{' '}
              <strong className="font-mono tabular-nums text-slate-800">
                {displayedProviders.length}
              </strong>{' '}
              of{' '}
              <strong className="font-mono tabular-nums text-slate-800">
                {providers.length}
              </strong>{' '}
              discovered providers (ordered strictly nearest to farthest)
            </span>
            <span>
              No paid ranking · No ratings sorting · User makes final choice
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
            {displayedProviders.map((item, idx) => {
              const { provider, serviceVerification, charge, straightLineDistanceKm } =
                item;
              const chargeRange = extractMedicalChargeRange(charge);
              const isCompared = comparedIds.includes(provider.providerId);

              const verificationLabel =
                serviceVerification === 'verified'
                  ? 'Verified Service'
                  : serviceVerification === 'demo'
                    ? 'Demo Data (Sample)'
                    : 'Unverified Listing (Google Places)';

              return (
                <article
                  key={provider.providerId}
                  className="p-5 hover:bg-slate-50/60 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                >
                  <div className="space-y-2 min-w-0 flex-1">
                    {/* Clean Unboxed Metadata Line (Zero-Pill Discipline) */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="font-mono font-semibold text-slate-500 tabular-nums">
                        #{idx + 1}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
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
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
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
                      <span className="font-mono font-medium text-[#0F2942] tabular-nums">
                        {formatDistanceKm(straightLineDistanceKm)} straight-line
                      </span>
                    </div>

                    <h2 className="text-lg font-semibold text-slate-900 leading-snug">
                      {provider.name}
                    </h2>

                    <p className="text-sm text-slate-600 leading-relaxed">
                      {provider.address}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-0.5">
                      <span>
                        Published charge:{' '}
                        <strong className="font-mono tabular-nums text-slate-900">
                          {chargeRange
                            ? formatINRRange(chargeRange.min, chargeRange.max)
                            : UNAVAILABLE_TEXT}
                        </strong>
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span>
                        Source: {charge?.sourceName || item.serviceSource}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span>
                        Verified: {charge?.lastVerified || item.serviceLastVerified}
                      </span>
                    </div>

                    {serviceVerification === 'unverified' && (
                      <p className="text-xs text-amber-800">
                        Live Google Places listing: please confirm directly with
                        this facility that {selectedService?.serviceName || 'this service'} is
                        available.
                      </p>
                    )}
                  </div>

                  {/* Action Controls */}
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleCompare(provider.providerId)}
                      disabled={!isCompared && comparedIds.length >= 4}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                        isCompared
                          ? 'bg-[#F0FDFA] text-[#0F766E] border-[#0F766E]'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 disabled:opacity-50'
                      }`}
                    >
                      {isCompared ? (
                        <>
                          <Check className="w-4 h-4" />
                          In Compare
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          Compare
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectProvider(item)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#0F2942] rounded-md hover:bg-[#163A5C] transition-colors whitespace-nowrap shrink-0"
                    >
                      View Details
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Load More Results (Preserves Proximity Ordering) */}
          {canLoadMore && (
            <div className="pt-2 flex justify-center">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[#0F2942] bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                <ChevronDown className="w-4 h-4" />
                {isLoadingMore
                  ? 'Loading More Providers...'
                  : 'Load More Results'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
