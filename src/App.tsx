import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { Database, LogIn, LogOut } from 'lucide-react';
import {
  DEMO_ACCOMMODATIONS,
  DEMO_MEDICAL_CHARGES,
  DEMO_PROVIDER_SERVICES,
  DEMO_PROVIDERS,
  SERVICE_CATALOG,
} from './data/demoDataset';
import type {
  AccommodationRecord,
  ActiveSection,
  AppMode,
  DiscoveredProvider,
  JourneySearchInput,
  MapsApiDiagnostic,
  MedicalChargeRecord,
  MedicalService,
  ProviderJourneyState,
  ProviderRecord,
  ProviderServiceRecord,
  TravelMode,
} from './types/medroute';
import { auth, googleProvider } from './services/firebase';
import {
  fetchFirestoreCatalog,
  seedSampleDatasetToFirestore,
  type FirestoreCatalogSnapshot,
} from './services/firestoreService';
import {
  buildDemoTravelSummary,
  computeLiveRoutesViaBackend,
  fetchMapsBackendStatus,
  searchLiveAccommodationsViaBackend,
  searchLiveProvidersViaBackend,
} from './services/mapsApiClient';
import { calculateHaversineKm, isValidCoordinatePair } from './utils/safety';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { JourneySearchForm } from './components/JourneySearchForm';
import { ProviderResultsList } from './components/ProviderResultsList';
import { ProviderDetailsView } from './components/ProviderDetailsView';
import { ProviderComparisonView } from './components/ProviderComparisonView';

const INITIAL_PAGE_SIZE = 5;
const STORAGE_KEY = 'medroute_journey_v1';

const DEFAULT_SEARCH_INPUT: JourneySearchInput = {
  category: 'Consultation',
  serviceId: 'cons-cardiology',
  locationMode: 'manual',
  manualLocationText: '',
  startingLocation: null,
  needsAccommodation: false,
  nights: 0,
};

function createEmptyProviderJourneyState(): ProviderJourneyState {
  return {
    travel: null,
    travelLoading: false,
    travelError: null,
    selectedTravelMode: 'DRIVE',
    manualRoundTripFare: '',
    accommodations: [],
    accommodationsLoading: false,
    accommodationsError: null,
    accommodationsFetched: false,
    selectedAccommodationId: null,
    manualDailyCommuteFare: '',
  };
}

function loadSavedModeAndSearch(): {
  mode: AppMode;
  searchInput: JourneySearchInput;
} {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { mode: 'live', searchInput: DEFAULT_SEARCH_INPUT };
    const parsed = JSON.parse(raw);
    const mode: AppMode = parsed?.mode === 'demo' ? 'demo' : 'live';
    const si = parsed?.searchInput;
    if (si && typeof si === 'object') {
      return {
        mode,
        searchInput: {
          category:
            si.category === 'Diagnostics' ||
            si.category === 'Treatment and Procedures'
              ? si.category
              : 'Consultation',
          serviceId:
            typeof si.serviceId === 'string' && si.serviceId
              ? si.serviceId
              : 'cons-cardiology',
          locationMode: si.locationMode === 'gps' ? 'gps' : 'manual',
          manualLocationText:
            typeof si.manualLocationText === 'string'
              ? si.manualLocationText
              : '',
          startingLocation:
            si.startingLocation &&
            isValidCoordinatePair(
              si.startingLocation.latitude,
              si.startingLocation.longitude
            )
              ? si.startingLocation
              : null,
          needsAccommodation: Boolean(si.needsAccommodation),
          nights:
            typeof si.nights === 'number' &&
            Number.isInteger(si.nights) &&
            si.nights >= 1
              ? si.nights
              : 0,
        },
      };
    }
  } catch {
    // Ignore storage read issues safely
  }
  return { mode: 'live', searchInput: DEFAULT_SEARCH_INPUT };
}

function sortByProximity(items: DiscoveredProvider[]): DiscoveredProvider[] {
  return [...items].sort((a, b) => {
    const da = a.straightLineDistanceKm ?? Number.POSITIVE_INFINITY;
    const db = b.straightLineDistanceKm ?? Number.POSITIVE_INFINITY;
    return da - db;
  });
}

function MedRouteWorkspace() {
  const initial = useMemo(() => loadSavedModeAndSearch(), []);

  // Live Mode by default (per Phase 1 confirmed preference)
  const [mode, setMode] = useState<AppMode>(initial.mode);
  const [activeSection, setActiveSection] = useState<ActiveSection>('search');
  const [searchInput, setSearchInput] = useState<JourneySearchInput>(
    initial.searchInput
  );

  // Google Maps backend key & Demo Key quota banner state
  const [mapsKeyConfigured, setMapsKeyConfigured] = useState<boolean | null>(
    null
  );
  const [quotaReached, setQuotaReached] = useState(false);

  // Cloud Firestore catalog + optional admin auto-seeding state
  const [firestoreCatalog, setFirestoreCatalog] =
    useState<FirestoreCatalogSnapshot | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // Provider discovery state
  const [discoveredProviders, setDiscoveredProviders] = useState<
    DiscoveredProvider[]
  >([]);
  const [visibleCount, setVisibleCount] = useState<number>(INITIAL_PAGE_SIZE);
  const [liveNextPageToken, setLiveNextPageToken] = useState<string | null>(
    null
  );
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchDiagnostic, setSearchDiagnostic] =
    useState<MapsApiDiagnostic | null>(null);

  // Active provider & per-provider travel/accommodation/fare state
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null
  );
  const [comparedIds, setComparedIds] = useState<string[]>([]);
  const [journeyStates, setJourneyStates] = useState<
    Record<string, ProviderJourneyState>
  >({});

  // Persist mode + search input cleanly across page refreshes
  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ mode, searchInput })
      );
    } catch {
      // Non-critical storage error
    }
  }, [mode, searchInput]);

  // Listen for Demo Key quota events (Section 8 Case A of google-maps-platform skill)
  useEffect(() => {
    const onQuotaExceeded = () => setQuotaReached(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () =>
      window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  // Load Maps backend readiness + Firestore catalog + Auth listener
  const refreshFirestoreCatalog = useCallback(async () => {
    const snap = await fetchFirestoreCatalog();
    setFirestoreCatalog(snap);
    return snap;
  }, []);

  useEffect(() => {
    void fetchMapsBackendStatus().then((s) =>
      setMapsKeyConfigured(s.configured)
    );
    void refreshFirestoreCatalog();

    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsub();
  }, [refreshFirestoreCatalog]);

  // Auto-seed sample dataset into Firestore when collections are empty and admin is signed in
  useEffect(() => {
    if (
      currentUser?.emailVerified &&
      firestoreCatalog?.fromFirestore &&
      firestoreCatalog.isEmpty &&
      !isSeeding &&
      !seedMessage
    ) {
      setIsSeeding(true);
      void seedSampleDatasetToFirestore()
        .then(async (res) => {
          setSeedMessage(res.message);
          if (res.seeded) {
            await refreshFirestoreCatalog();
          }
        })
        .catch((err) => {
          setSeedMessage(
            err instanceof Error
              ? 'Firestore auto-seeding requires project owner permissions.'
              : 'Unable to seed Firestore.'
          );
        })
        .finally(() => setIsSeeding(false));
    }
  }, [
    currentUser,
    firestoreCatalog,
    isSeeding,
    seedMessage,
    refreshFirestoreCatalog,
  ]);

  const servicesCatalog: MedicalService[] = useMemo(() => {
    if (firestoreCatalog && firestoreCatalog.services.length > 0) {
      return firestoreCatalog.services;
    }
    return SERVICE_CATALOG;
  }, [firestoreCatalog]);

  const selectedService = useMemo(
    () =>
      servicesCatalog.find((s) => s.serviceId === searchInput.serviceId) ||
      null,
    [servicesCatalog, searchInput.serviceId]
  );

  // Build catalog lookup for Demo Mode (Firestore demo records if seeded, else built-in Demo dataset)
  const getActiveDemoDataset = useCallback(() => {
    const useFs =
      firestoreCatalog &&
      firestoreCatalog.fromFirestore &&
      firestoreCatalog.providers.some((p) => p.dataOrigin === 'demo');

    const providers: ProviderRecord[] = useFs
      ? firestoreCatalog.providers.filter((p) => p.dataOrigin === 'demo')
      : DEMO_PROVIDERS;
    const providerServices: ProviderServiceRecord[] = useFs
      ? firestoreCatalog.providerServices.filter((ps) => ps.dataOrigin === 'demo')
      : DEMO_PROVIDER_SERVICES;
    const medicalCharges: MedicalChargeRecord[] = useFs
      ? firestoreCatalog.medicalCharges.filter((c) => c.dataOrigin === 'demo')
      : DEMO_MEDICAL_CHARGES;
    const accommodations: AccommodationRecord[] = useFs
      ? firestoreCatalog.accommodations.filter((a) => a.dataOrigin === 'demo')
      : DEMO_ACCOMMODATIONS;

    return { providers, providerServices, medicalCharges, accommodations };
  }, [firestoreCatalog]);

  const buildCatalogProvidersForService = useCallback(
    (
      serviceId: string,
      originLat: number,
      originLng: number,
      providers: ProviderRecord[],
      providerServices: ProviderServiceRecord[],
      medicalCharges: MedicalChargeRecord[],
      maxDistanceKm: number | null
    ): DiscoveredProvider[] => {
      const matchingPS = providerServices.filter(
        (ps) => ps.serviceId === serviceId
      );
      const providerMap = new Map(providers.map((p) => [p.providerId, p]));
      const serviceNameMap = new Map(
        servicesCatalog.map((s) => [s.serviceId, s.serviceName])
      );

      const results: DiscoveredProvider[] = [];
      for (const ps of matchingPS) {
        const provider = providerMap.get(ps.providerId);
        if (!provider) continue;

        const distKm = calculateHaversineKm(
          { latitude: originLat, longitude: originLng },
          { latitude: provider.latitude, longitude: provider.longitude }
        );

        if (maxDistanceKm !== null && (distKm === null || distKm > maxDistanceKm)) {
          continue;
        }

        const charge =
          medicalCharges.find(
            (c) => c.providerId === provider.providerId && c.serviceId === serviceId
          ) || null;

        const allServicesForProvider = providerServices
          .filter((x) => x.providerId === provider.providerId)
          .map((x) => serviceNameMap.get(x.serviceId))
          .filter((name): name is string => Boolean(name));

        results.push({
          provider,
          serviceVerification: ps.verificationStatus,
          serviceSource: ps.source,
          serviceLastVerified: ps.lastVerified,
          availableServices: allServicesForProvider,
          charge,
          straightLineDistanceKm: distKm,
        });
      }

      return sortByProximity(results);
    },
    [servicesCatalog]
  );

  // Switch between Live Mode and Demo Mode cleanly without ever mixing data silently
  const handleSwitchMode = (nextMode: AppMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setDiscoveredProviders([]);
    setVisibleCount(INITIAL_PAGE_SIZE);
    setLiveNextPageToken(null);
    setSearchDiagnostic(null);
    setSelectedProviderId(null);
    setComparedIds([]);
    setJourneyStates({});
    setActiveSection('search');
  };

  const handleResetJourney = () => {
    setSearchInput(DEFAULT_SEARCH_INPUT);
    setDiscoveredProviders([]);
    setVisibleCount(INITIAL_PAGE_SIZE);
    setLiveNextPageToken(null);
    setSearchDiagnostic(null);
    setSelectedProviderId(null);
    setComparedIds([]);
    setJourneyStates({});
    setActiveSection('search');
  };

  // Step 5: Discover providers strictly sorted by geographical proximity
  const handleSearchProviders = async (resolvedInput: JourneySearchInput) => {
    setSearchInput(resolvedInput);
    setActiveSection('results');
    setSearchDiagnostic(null);
    setSelectedProviderId(null);
    setComparedIds([]);
    setJourneyStates({});
    setVisibleCount(INITIAL_PAGE_SIZE);
    setLiveNextPageToken(null);

    const origin = resolvedInput.startingLocation;
    const svc = servicesCatalog.find(
      (s) => s.serviceId === resolvedInput.serviceId
    );
    if (!origin || !svc) return;

    setIsSearching(true);

    if (mode === 'demo') {
      const demo = getActiveDemoDataset();
      // Filter to within 120 km so out-of-coverage cities honestly show empty results (Scenario 8)
      const matched = buildCatalogProvidersForService(
        svc.serviceId,
        origin.latitude,
        origin.longitude,
        demo.providers,
        demo.providerServices,
        demo.medicalCharges,
        120
      );
      setDiscoveredProviders(matched);
      setIsSearching(false);
      return;
    }

    // Live Mode:
    // 1. Collect any verified (non-demo) Firestore providers near origin
    const verifiedProviders =
      firestoreCatalog?.providers.filter((p) => p.dataOrigin === 'verified') ||
      [];
    const verifiedPS =
      firestoreCatalog?.providerServices.filter(
        (ps) => ps.dataOrigin === 'verified'
      ) || [];
    const verifiedCharges =
      firestoreCatalog?.medicalCharges.filter(
        (c) => c.dataOrigin === 'verified'
      ) || [];

    const curatedMatches = buildCatalogProvidersForService(
      svc.serviceId,
      origin.latitude,
      origin.longitude,
      verifiedProviders,
      verifiedPS,
      verifiedCharges,
      80
    );

    // 2. Query live Google Places API (New) via backend proxy
    const liveRes = await searchLiveProvidersViaBackend({
      serviceName: svc.serviceName,
      category: svc.category,
      latitude: origin.latitude,
      longitude: origin.longitude,
      city: origin.city,
    });

    if (!liveRes.ok) {
      setSearchDiagnostic(liveRes.diagnostic || null);
      // Do NOT silently substitute Demo Data; show curated verified records if any exist, else empty
      setDiscoveredProviders(curatedMatches);
      setIsSearching(false);
      return;
    }

    const existingNames = new Set(
      curatedMatches.map((m) => m.provider.name.trim().toLowerCase())
    );

    const liveItems: DiscoveredProvider[] = liveRes.places
      .filter((p) => !existingNames.has(p.name.trim().toLowerCase()))
      .map((p) => {
        const distKm = calculateHaversineKm(
          { latitude: origin.latitude, longitude: origin.longitude },
          { latitude: p.latitude, longitude: p.longitude }
        );
        return {
          provider: {
            providerId: `gplace-${p.placeId}`,
            name: p.name,
            providerType: p.providerType,
            address: p.address,
            city: origin.city || '',
            state: origin.state || '',
            pincode: null,
            latitude: p.latitude,
            longitude: p.longitude,
            phone: p.phone,
            website: p.website,
            source: 'Google Places API (New)',
            lastVerified: 'Live listing',
            dataOrigin: 'live_places',
            googleMapsUri: p.googleMapsUri,
          },
          serviceVerification: 'unverified',
          serviceSource: 'Google Places API (New) — department unverified',
          serviceLastVerified: 'Live listing',
          availableServices: [],
          charge: null,
          straightLineDistanceKm: distKm,
        };
      });

    const combined = sortByProximity([...curatedMatches, ...liveItems]);
    setDiscoveredProviders(combined);
    setLiveNextPageToken(liveRes.nextPageToken);
    setIsSearching(false);
  };

  // Load More Results preserving strict proximity ordering
  const handleLoadMore = async () => {
    if (visibleCount < discoveredProviders.length) {
      setVisibleCount((prev) => prev + INITIAL_PAGE_SIZE);
      return;
    }

    if (
      mode === 'live' &&
      liveNextPageToken &&
      searchInput.startingLocation &&
      selectedService
    ) {
      setIsLoadingMore(true);
      const origin = searchInput.startingLocation;
      const moreRes = await searchLiveProvidersViaBackend({
        serviceName: selectedService.serviceName,
        category: selectedService.category,
        latitude: origin.latitude,
        longitude: origin.longitude,
        city: origin.city,
        pageToken: liveNextPageToken,
      });
      setIsLoadingMore(false);

      if (!moreRes.ok) {
        setSearchDiagnostic(moreRes.diagnostic || null);
        return;
      }

      const existingIds = new Set(
        discoveredProviders.map((d) => d.provider.providerId)
      );
      const added: DiscoveredProvider[] = moreRes.places
        .filter((p) => !existingIds.has(`gplace-${p.placeId}`))
        .map((p) => ({
          provider: {
            providerId: `gplace-${p.placeId}`,
            name: p.name,
            providerType: p.providerType,
            address: p.address,
            city: origin.city || '',
            state: origin.state || '',
            pincode: null,
            latitude: p.latitude,
            longitude: p.longitude,
            phone: p.phone,
            website: p.website,
            source: 'Google Places API (New)',
            lastVerified: 'Live listing',
            dataOrigin: 'live_places',
            googleMapsUri: p.googleMapsUri,
          },
          serviceVerification: 'unverified',
          serviceSource: 'Google Places API (New) — department unverified',
          serviceLastVerified: 'Live listing',
          availableServices: [],
          charge: null,
          straightLineDistanceKm: calculateHaversineKm(
            { latitude: origin.latitude, longitude: origin.longitude },
            { latitude: p.latitude, longitude: p.longitude }
          ),
        }));

      const mergedSorted = sortByProximity([...discoveredProviders, ...added]);
      setDiscoveredProviders(mergedSorted);
      setVisibleCount((prev) => prev + INITIAL_PAGE_SIZE);
      setLiveNextPageToken(moreRes.nextPageToken);
    }
  };

  // Load travel routes & conditional nearby accommodation for a selected provider
  const loadProviderJourneyData = useCallback(
    async (item: DiscoveredProvider) => {
      const pid = item.provider.providerId;
      const origin = searchInput.startingLocation;
      if (!origin) return;

      const existing = journeyStates[pid] || createEmptyProviderJourneyState();

      // Fetch Travel Routes if not yet loaded
      if (!existing.travel && !existing.travelLoading) {
        if (mode === 'demo') {
          const demoTravel = buildDemoTravelSummary({
            origin: { latitude: origin.latitude, longitude: origin.longitude },
            destination: {
              latitude: item.provider.latitude,
              longitude: item.provider.longitude,
            },
            destinationName: item.provider.name,
            selectedMode: existing.selectedTravelMode,
          });
          setJourneyStates((prev) => ({
            ...prev,
            [pid]: {
              ...(prev[pid] || createEmptyProviderJourneyState()),
              travel: demoTravel,
              travelLoading: false,
              travelError: null,
            },
          }));
        } else {
          setJourneyStates((prev) => ({
            ...prev,
            [pid]: {
              ...(prev[pid] || createEmptyProviderJourneyState()),
              travelLoading: true,
              travelError: null,
            },
          }));

          const routeRes = await computeLiveRoutesViaBackend({
            origin: { latitude: origin.latitude, longitude: origin.longitude },
            destination: {
              latitude: item.provider.latitude,
              longitude: item.provider.longitude,
            },
            destinationName: item.provider.name,
            selectedMode: existing.selectedTravelMode,
          });

          setJourneyStates((prev) => ({
            ...prev,
            [pid]: {
              ...(prev[pid] || createEmptyProviderJourneyState()),
              travel: routeRes.summary || null,
              travelLoading: false,
              travelError: routeRes.ok ? null : routeRes.diagnostic || null,
            },
          }));
        }
      }

      // Fetch Accommodation ONLY if user requested accommodation (Step 4 === Yes)
      if (
        searchInput.needsAccommodation &&
        !existing.accommodationsFetched &&
        !existing.accommodationsLoading
      ) {
        if (mode === 'demo') {
          const demo = getActiveDemoDataset();
          const nearby = demo.accommodations
            .map((acc) => ({
              ...acc,
              distanceFromHospitalKm: calculateHaversineKm(
                {
                  latitude: item.provider.latitude,
                  longitude: item.provider.longitude,
                },
                { latitude: acc.latitude, longitude: acc.longitude }
              ),
            }))
            .filter(
              (acc) =>
                acc.distanceFromHospitalKm !== null &&
                acc.distanceFromHospitalKm <= 6.0
            )
            .sort(
              (a, b) =>
                (a.distanceFromHospitalKm ?? Infinity) -
                (b.distanceFromHospitalKm ?? Infinity)
            );

          setJourneyStates((prev) => ({
            ...prev,
            [pid]: {
              ...(prev[pid] || createEmptyProviderJourneyState()),
              accommodations: nearby,
              accommodationsLoading: false,
              accommodationsError: null,
              accommodationsFetched: true,
              selectedAccommodationId:
                prev[pid]?.selectedAccommodationId ??
                nearby[0]?.accommodationId ??
                null,
            },
          }));
        } else {
          setJourneyStates((prev) => ({
            ...prev,
            [pid]: {
              ...(prev[pid] || createEmptyProviderJourneyState()),
              accommodationsLoading: true,
              accommodationsError: null,
            },
          }));

          const accRes = await searchLiveAccommodationsViaBackend({
            latitude: item.provider.latitude,
            longitude: item.provider.longitude,
          });

          const verifiedAccs = (
            firestoreCatalog?.accommodations.filter(
              (a) => a.dataOrigin === 'verified'
            ) || []
          )
            .map((a) => ({
              ...a,
              distanceFromHospitalKm: calculateHaversineKm(
                {
                  latitude: item.provider.latitude,
                  longitude: item.provider.longitude,
                },
                { latitude: a.latitude, longitude: a.longitude }
              ),
            }))
            .filter(
              (a) =>
                a.distanceFromHospitalKm !== null &&
                a.distanceFromHospitalKm <= 5.0
            );

          const liveAccs: AccommodationRecord[] = accRes.ok
            ? accRes.places.map((p) => ({
                accommodationId: `gacc-${p.placeId}`,
                name: p.name,
                accommodationType: p.accommodationType,
                address: p.address,
                city: item.provider.city || '',
                latitude: p.latitude,
                longitude: p.longitude,
                minNightlyPrice: null,
                maxNightlyPrice: null,
                priceSource: 'Google Places API (New) — nightly tariff unavailable',
                lastVerified: 'Live listing',
                dataOrigin: 'live_places',
                distanceFromHospitalKm: calculateHaversineKm(
                  {
                    latitude: item.provider.latitude,
                    longitude: item.provider.longitude,
                  },
                  { latitude: p.latitude, longitude: p.longitude }
                ),
                googleMapsUri: p.googleMapsUri,
              }))
            : [];

          const combinedAccs = [...verifiedAccs, ...liveAccs].sort(
            (a, b) =>
              (a.distanceFromHospitalKm ?? Infinity) -
              (b.distanceFromHospitalKm ?? Infinity)
          );

          setJourneyStates((prev) => ({
            ...prev,
            [pid]: {
              ...(prev[pid] || createEmptyProviderJourneyState()),
              accommodations: combinedAccs,
              accommodationsLoading: false,
              accommodationsError: accRes.ok
                ? null
                : accRes.diagnostic || null,
              accommodationsFetched: true,
              selectedAccommodationId:
                prev[pid]?.selectedAccommodationId ??
                combinedAccs[0]?.accommodationId ??
                null,
            },
          }));
        }
      }
    },
    [
      firestoreCatalog,
      getActiveDemoDataset,
      journeyStates,
      mode,
      searchInput.needsAccommodation,
      searchInput.startingLocation,
    ]
  );

  const handleSelectProvider = (item: DiscoveredProvider) => {
    setSelectedProviderId(item.provider.providerId);
    setActiveSection('details');
    void loadProviderJourneyData(item);
  };

  const handleToggleCompare = (providerId: string) => {
    setComparedIds((prev) => {
      if (prev.includes(providerId)) {
        return prev.filter((id) => id !== providerId);
      }
      if (prev.length >= 4) return prev;
      return [...prev, providerId];
    });
  };

  const updateProviderJourneyField = (
    providerId: string,
    patch: Partial<ProviderJourneyState>
  ) => {
    setJourneyStates((prev) => ({
      ...prev,
      [providerId]: {
        ...(prev[providerId] || createEmptyProviderJourneyState()),
        ...patch,
      },
    }));
  };

  const handleOwnerSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setSeedMessage(
        err instanceof Error ? err.message : 'Sign-in cancelled.'
      );
    }
  };

  const selectedProviderItem = useMemo(
    () =>
      discoveredProviders.find(
        (d) => d.provider.providerId === selectedProviderId
      ) || null,
    [discoveredProviders, selectedProviderId]
  );

  const comparedProviders = useMemo(
    () =>
      comparedIds
        .map((id) =>
          discoveredProviders.find((d) => d.provider.providerId === id)
        )
        .filter((item): item is DiscoveredProvider => Boolean(item)),
    [comparedIds, discoveredProviders]
  );

  const activeProviderJourney = selectedProviderItem
    ? journeyStates[selectedProviderItem.provider.providerId] ||
      createEmptyProviderJourneyState()
    : createEmptyProviderJourneyState();

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Mandatory Demo Key Quota Banner (Section 8 Case A) */}
      {quotaReached && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Strict 3-Zone Top Bar */}
      <Header
        activeSection={activeSection}
        onNavigate={(section) => setActiveSection(section)}
        onResetJourney={handleResetJourney}
        hasResults={discoveredProviders.length > 0 || searchDiagnostic !== null}
        hasSelectedProvider={selectedProviderItem !== null}
        compareCount={comparedIds.length}
      />

      {/* Workspace Mode & Data Transparency Toolbar */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label="Application data mode"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
            >
              <button
                type="button"
                onClick={() => handleSwitchMode('live')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'live'
                    ? 'bg-white text-[#0F2942] shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Live Mode
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMode('demo')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'demo'
                    ? 'bg-white text-[#0F2942] shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Demo Mode
              </button>
            </div>

            <span className="text-xs text-slate-600">
              {mode === 'live' ? (
                <>
                  Using Google Maps APIs &amp; Cloud Firestore
                  {mapsKeyConfigured === false && (
                    <span className="text-amber-800 font-medium">
                      {' '}
                      · GOOGLE_MAPS_API_KEY not configured on server
                    </span>
                  )}
                </>
              ) : (
                'Demo Data (Greater Kolkata illustrative sample · Works offline without API keys)'
              )}
            </span>
          </div>

          {/* Optional Owner Sync Control for Firestore Empty-Collection Auto-Seeding */}
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {firestoreCatalog?.fromFirestore && (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Database className="w-3.5 h-3.5 text-[#0F766E]" />
                Firestore:{' '}
                {firestoreCatalog.isEmpty
                  ? 'Connected (0 records)'
                  : `${firestoreCatalog.providers.length} providers`}
              </span>
            )}

            {firestoreCatalog?.fromFirestore &&
              firestoreCatalog.isEmpty &&
              !currentUser && (
                <button
                  type="button"
                  onClick={() => void handleOwnerSignIn()}
                  className="inline-flex items-center gap-1 text-[#0F766E] font-medium hover:underline whitespace-nowrap"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Owner Sign-In to Auto-Seed
                </button>
              )}

            {currentUser && (
              <button
                type="button"
                onClick={() => void signOut(auth)}
                className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out ({currentUser.email})
              </button>
            )}
          </div>
        </div>

        {seedMessage && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-2.5 text-xs text-[#0F766E]">
            {seedMessage}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {activeSection === 'search' && (
          <JourneySearchForm
            mode={mode}
            services={servicesCatalog}
            searchInput={searchInput}
            onChangeSearchInput={setSearchInput}
            onSubmitSearch={handleSearchProviders}
            onSwitchMode={handleSwitchMode}
            isSearching={isSearching}
          />
        )}

        {activeSection === 'results' && (
          <ProviderResultsList
            mode={mode}
            searchInput={searchInput}
            selectedService={selectedService}
            providers={discoveredProviders}
            visibleCount={visibleCount}
            hasMoreRemote={mode === 'live' && Boolean(liveNextPageToken)}
            isLoading={isSearching}
            isLoadingMore={isLoadingMore}
            diagnostic={searchDiagnostic}
            comparedIds={comparedIds}
            onSelectProvider={handleSelectProvider}
            onToggleCompare={handleToggleCompare}
            onLoadMore={() => void handleLoadMore()}
            onBackToSearch={() => setActiveSection('search')}
            onOpenCompare={() => setActiveSection('compare')}
            onSwitchToDemo={() => handleSwitchMode('demo')}
          />
        )}

        {activeSection === 'details' && selectedProviderItem && (
          <ProviderDetailsView
            mode={mode}
            searchInput={searchInput}
            selectedService={selectedService}
            providerItem={selectedProviderItem}
            journeyState={activeProviderJourney}
            isCompared={comparedIds.includes(
              selectedProviderItem.provider.providerId
            )}
            canAddCompare={comparedIds.length < 4}
            onBackToResults={() => setActiveSection('results')}
            onToggleCompare={() =>
              handleToggleCompare(selectedProviderItem.provider.providerId)
            }
            onOpenCompare={() => setActiveSection('compare')}
            onChangeTravelMode={(travelMode: TravelMode) =>
              updateProviderJourneyField(
                selectedProviderItem.provider.providerId,
                { selectedTravelMode: travelMode }
              )
            }
            onChangeManualRoundTripFare={(val) =>
              updateProviderJourneyField(
                selectedProviderItem.provider.providerId,
                { manualRoundTripFare: val }
              )
            }
            onSelectAccommodation={(accId) =>
              updateProviderJourneyField(
                selectedProviderItem.provider.providerId,
                { selectedAccommodationId: accId }
              )
            }
            onChangeManualDailyCommuteFare={(val) =>
              updateProviderJourneyField(
                selectedProviderItem.provider.providerId,
                { manualDailyCommuteFare: val }
              )
            }
            onSwitchToDemo={() => handleSwitchMode('demo')}
          />
        )}

        {activeSection === 'compare' && (
          <ProviderComparisonView
            searchInput={searchInput}
            selectedService={selectedService}
            comparedProviders={comparedProviders}
            journeyStates={journeyStates}
            onRemoveProvider={(pid) => handleToggleCompare(pid)}
            onInspectProvider={handleSelectProvider}
            onBackToResults={() =>
              setActiveSection(
                discoveredProviders.length > 0 ? 'results' : 'search'
              )
            }
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            MedRoute — Pan-India Healthcare Journey Planning &amp; Cost Comparison Platform
          </span>
          <span>
            Information only · Not a medical diagnosis or treatment advisory tool
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MedRouteWorkspace />
    </ErrorBoundary>
  );
}
