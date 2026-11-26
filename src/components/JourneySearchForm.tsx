import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  LocateFixed,
  MapPin,
  Search,
  X,
} from 'lucide-react';
import type {
  AppMode,
  JourneySearchInput,
  MapsApiDiagnostic,
  MedicalService,
  ServiceCategory,
  StartingLocation,
} from '../types/medroute';
import { lookupDemoLocation } from '../data/demoDataset';
import { geocodeLocationViaBackend } from '../services/mapsApiClient';
import {
  formatNumber,
  isValidCoordinatePair,
  NOT_FOUND_SERVICE_IDS,
  parsePositiveWholeNights,
} from '../utils/safety';
import { DiagnosticAlert } from './DiagnosticAlert';

interface JourneySearchFormProps {
  mode: AppMode;
  services: MedicalService[];
  searchInput: JourneySearchInput;
  onChangeSearchInput: (next: JourneySearchInput) => void;
  onSubmitSearch: (resolvedInput: JourneySearchInput) => void;
  onSwitchMode: (mode: AppMode) => void;
  isSearching: boolean;
}

const CATEGORIES: ServiceCategory[] = [
  'Consultation',
  'Diagnostics',
  'Treatment and Procedures',
];

const QUICK_INDIA_CITIES = [
  'Esplanade, Kolkata',
  'Salt Lake, Kolkata',
  'Howrah Junction',
  'New Delhi 110001',
  'Bengaluru 560001',
  'Mumbai Dadar',
];

export function JourneySearchForm({
  mode,
  services,
  searchInput,
  onChangeSearchInput,
  onSubmitSearch,
  onSwitchMode,
  isSearching,
}: JourneySearchFormProps) {
  const [locatingGps, setLocatingGps] = useState(false);
  const [geocodingManual, setGeocodingManual] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [locationDiagnostic, setLocationDiagnostic] =
    useState<MapsApiDiagnostic | null>(null);
  const [nightsText, setNightsText] = useState<string>(
    String(searchInput.nights || 1)
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const serviceSearchInputRef = useRef<HTMLInputElement | null>(null);

  const notFoundIdForCategory = NOT_FOUND_SERVICE_IDS[searchInput.category];
  const isNotFoundSelected = searchInput.serviceId === notFoundIdForCategory;

  const categoryServices = services.filter(
    (s) => s.category === searchInput.category
  );

  const normalizedServiceQuery = serviceSearchQuery.toLowerCase().trim();
  const filteredCategoryServices = normalizedServiceQuery
    ? categoryServices.filter((s) =>
        s.serviceName.toLowerCase().includes(normalizedServiceQuery)
      )
    : categoryServices;

  const selectedService = isNotFoundSelected
    ? null
    : categoryServices.find((s) => s.serviceId === searchInput.serviceId) ||
      categoryServices[0] ||
      null;

  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    if (isDropdownOpen) {
      const timer = window.setTimeout(() => {
        serviceSearchInputRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [isDropdownOpen]);

  const handleCategoryChange = (category: ServiceCategory) => {
    const firstInCategory = services.find((s) => s.category === category);
    setFormError(null);
    setServiceSearchQuery('');
    setIsDropdownOpen(false);
    onChangeSearchInput({
      ...searchInput,
      category,
      serviceId: firstInCategory ? firstInCategory.serviceId : '',
      customServiceName: '',
    });
  };

  const handleSelectPredefinedService = (svc: MedicalService) => {
    setFormError(null);
    setServiceSearchQuery('');
    setIsDropdownOpen(false);
    onChangeSearchInput({
      ...searchInput,
      serviceId: svc.serviceId,
      customServiceName: '',
    });
  };

  const handleSelectNotFound = () => {
    setFormError(null);
    setServiceSearchQuery('');
    setIsDropdownOpen(false);
    onChangeSearchInput({
      ...searchInput,
      serviceId: notFoundIdForCategory,
      customServiceName: searchInput.customServiceName || '',
    });
  };

  const handleUseCurrentLocation = () => {
    setFormError(null);
    setLocationDiagnostic(null);
    setLocationNotice(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationNotice(
        'Browser geolocation is unavailable on this device. Please enter your starting location manually below.'
      );
      onChangeSearchInput({ ...searchInput, locationMode: 'manual' });
      return;
    }

    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        if (!isValidCoordinatePair(lat, lng)) {
          setLocatingGps(false);
          setLocationNotice(
            'Unable to obtain valid GPS coordinates from your device. Please enter a starting location manually.'
          );
          onChangeSearchInput({ ...searchInput, locationMode: 'manual' });
          return;
        }

        let resolved: StartingLocation = {
          label: 'Current GPS Location',
          formattedAddress: `${formatNumber(lat, 4)}, ${formatNumber(lng, 4)}`,
          city: null,
          state: null,
          pincode: null,
          latitude: lat,
          longitude: lng,
          source: 'gps',
        };

        if (mode === 'live') {
          const rev = await geocodeLocationViaBackend({
            latitude: lat,
            longitude: lng,
          });
          if (rev.ok && rev.location) {
            resolved = { ...rev.location, source: 'gps' };
          } else if (rev.diagnostic) {
            setLocationNotice(
              'GPS coordinates captured, though address lookup was unavailable. Coordinates will still be used for proximity sorting.'
            );
          }
        }

        setLocatingGps(false);
        onChangeSearchInput({
          ...searchInput,
          locationMode: 'gps',
          startingLocation: resolved,
        });
      },
      (err) => {
        setLocatingGps(false);
        const reason =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. You can continue by entering any Indian city, locality, PIN code, or address manually.'
            : 'Unable to detect your current location right now. Please enter a starting location manually.';
        setLocationNotice(reason);
        onChangeSearchInput({
          ...searchInput,
          locationMode: 'manual',
        });
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };

  const resolveManualLocation = async (
    queryOverride?: string
  ): Promise<StartingLocation | null> => {
    const queryText = (queryOverride ?? searchInput.manualLocationText).trim();
    setLocationNotice(null);
    setLocationDiagnostic(null);
    setFormError(null);

    if (!queryText) {
      setFormError('Enter a starting city, locality, PIN code, or address.');
      return null;
    }

    if (mode === 'demo') {
      const matched = lookupDemoLocation(queryText);
      if (!matched) {
        setLocationNotice(
          `Demo Mode includes offline reference locations for major Indian cities (such as Kolkata, Salt Lake, Howrah, New Delhi, Mumbai, Bengaluru, Chennai, Hyderabad, Pune, Patna, Bhubaneswar, Guwahati, Durgapur, and Siliguri). Select a supported city or switch to Live Mode for full Pan-India geocoding.`
        );
        return null;
      }
      onChangeSearchInput({
        ...searchInput,
        locationMode: 'manual',
        manualLocationText: queryText,
        startingLocation: matched,
      });
      return matched;
    }

    // Live Mode: Geocode via backend Google Geocoding API
    setGeocodingManual(true);
    const res = await geocodeLocationViaBackend({ address: queryText });
    setGeocodingManual(false);

    if (!res.ok) {
      setLocationDiagnostic(res.diagnostic || null);
      return null;
    }

    if (!res.location) {
      setLocationNotice(
        `No matching Indian location found for "${queryText}". Try adding a city name or 6-digit PIN code.`
      );
      return null;
    }

    onChangeSearchInput({
      ...searchInput,
      locationMode: 'manual',
      manualLocationText: queryText,
      startingLocation: res.location,
    });
    return res.location;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (isNotFoundSelected) {
      const trimmedCustom = (searchInput.customServiceName || '').trim();
      if (!trimmedCustom) {
        setFormError(
          'Please enter the medical service you are looking for before searching.'
        );
        return;
      }
    } else if (!selectedService) {
      setFormError('Please select a medical service before searching.');
      return;
    }

    let validatedNights = 1;
    if (searchInput.needsAccommodation) {
      const parsed = parsePositiveWholeNights(nightsText);
      if (parsed === null) {
        setFormError(
          'Number of nights must be a positive whole number (for example, 1, 2, or 3).'
        );
        return;
      }
      validatedNights = parsed;
    }

    let resolvedLocation = searchInput.startingLocation;
    if (
      searchInput.locationMode === 'manual' &&
      (!resolvedLocation ||
        resolvedLocation.label.toLowerCase() !==
          searchInput.manualLocationText.trim().toLowerCase())
    ) {
      if (searchInput.manualLocationText.trim()) {
        resolvedLocation = await resolveManualLocation();
      }
    }

    if (!resolvedLocation) {
      if (!locationDiagnostic && !locationNotice) {
        setFormError(
          'Please set your starting location using GPS or manual location entry.'
        );
      }
      return;
    }

    const resolvedServiceId = isNotFoundSelected
      ? notFoundIdForCategory
      : selectedService!.serviceId;

    onSubmitSearch({
      ...searchInput,
      serviceId: resolvedServiceId,
      customServiceName: isNotFoundSelected
        ? (searchInput.customServiceName || '').trim()
        : '',
      startingLocation: resolvedLocation,
      nights: searchInput.needsAccommodation ? validatedNights : 0,
    });
  };

  return (
    <section className="space-y-8">
      {/* Intro Heading */}
      <div className="max-w-3xl space-y-2">
        <p className="text-sm font-medium text-[#0F766E]">
          Plan your healthcare journey.
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0F2942]">
          Compare medical services, road travel, and nearby stay expenses across India
        </h1>
        <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
          MedRoute is an information and cost-comparison platform. Providers are
          always listed strictly by geographical proximity—never by paid placement,
          ratings, or automated medical recommendations.
        </p>
      </div>

      {/* Main 4-Step Search Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200"
      >
        {/* Step 1: Healthcare Category */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              1. Select healthcare category
            </h2>
            <p className="text-sm text-slate-500">
              Choose one category so cost estimation applies only the relevant medical charge.
            </p>
          </div>
          <div
            role="radiogroup"
            aria-label="Healthcare category"
            className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1 bg-slate-100 rounded-lg"
          >
            {CATEGORIES.map((category) => {
              const active = searchInput.category === category;
              return (
                <button
                  key={category}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => handleCategoryChange(category)}
                  className={`px-4 py-2.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white text-[#0F2942] shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Specific Medical Service */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="medroute-service-select"
              className="block text-base font-semibold text-slate-900"
            >
              2. Select specific medical service
            </label>
            <p className="text-sm text-slate-500">
              Only facilities matching or checked against the chosen service will be shown.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <div className="space-y-3">
              {/* Custom Searchable Dropdown (single source of truth) */}
              <div ref={dropdownRef} className="relative">
                <button
                  id="medroute-service-select"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={isDropdownOpen}
                  onClick={() => setIsDropdownOpen((prev) => !prev)}
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 hover:border-slate-400 focus:border-[#0F766E] focus:outline-none flex items-center justify-between gap-2 text-left transition-colors"
                >
                  <span className="truncate font-medium">
                    {isNotFoundSelected
                      ? 'Not Found / Other Service'
                      : selectedService?.serviceName || 'Select a medical service'}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${
                      isDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isDropdownOpen && (
                  <div
                    role="listbox"
                    aria-label={`${searchInput.category} services`}
                    className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-slate-300 rounded-md shadow-lg overflow-hidden"
                  >
                    {/* Integrated Search Filter */}
                    <div className="p-2 border-b border-slate-200 bg-slate-50/70">
                      <div className="relative flex items-center">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                        <input
                          ref={serviceSearchInputRef}
                          type="text"
                          value={serviceSearchQuery}
                          onChange={(e) => setServiceSearchQuery(e.target.value)}
                          placeholder={`Search ${searchInput.category.toLowerCase()} services...`}
                          aria-label="Search medical services"
                          className="w-full h-9 pl-9 pr-8 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:border-[#0F766E] focus:outline-none placeholder:text-slate-400"
                        />
                        {serviceSearchQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setServiceSearchQuery('');
                              serviceSearchInputRef.current?.focus();
                            }}
                            aria-label="Clear service search"
                            className="absolute right-2 p-1 text-slate-400 hover:text-slate-700"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Options List */}
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                      {filteredCategoryServices.length === 0 ? (
                        <div className="p-3 space-y-2 text-sm">
                          <p className="font-medium text-slate-700">
                            No matching services found
                          </p>
                          <button
                            type="button"
                            onClick={handleSelectNotFound}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-[#0F766E] bg-[#F0FDFA] border border-[#0F766E]/30 rounded-md hover:bg-[#CCFBF1]/60 transition-colors"
                          >
                            Can&apos;t find your service? Select Not Found / Other Service
                          </button>
                        </div>
                      ) : (
                        filteredCategoryServices.map((svc) => {
                          const isCurrent =
                            !isNotFoundSelected &&
                            selectedService?.serviceId === svc.serviceId;
                          return (
                            <button
                              key={svc.serviceId}
                              type="button"
                              role="option"
                              aria-selected={isCurrent}
                              onClick={() => handleSelectPredefinedService(svc)}
                              className={`w-full px-3.5 py-2.5 text-sm text-left flex items-center justify-between gap-2 transition-colors ${
                                isCurrent
                                  ? 'bg-[#F0FDFA] text-[#0F766E] font-medium'
                                  : 'text-slate-800 hover:bg-slate-50'
                              }`}
                            >
                              <span className="truncate">{svc.serviceName}</span>
                              {isCurrent && (
                                <Check className="w-4 h-4 text-[#0F766E] shrink-0" />
                              )}
                            </button>
                          );
                        })
                      )}

                      {/* Final Option: Not Found / Other Service */}
                      <div className="border-t border-slate-200 bg-slate-50/50">
                        <button
                          type="button"
                          role="option"
                          aria-selected={isNotFoundSelected}
                          onClick={handleSelectNotFound}
                          className={`w-full px-3.5 py-2.5 text-sm text-left flex items-center justify-between gap-2 transition-colors ${
                            isNotFoundSelected
                              ? 'bg-amber-50 text-amber-900 font-medium'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span>Not Found / Other Service</span>
                          {isNotFoundSelected && (
                            <Check className="w-4 h-4 text-amber-700 shrink-0" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Custom Service Input when Not Found / Other Service is active */}
              {isNotFoundSelected && (
                <div className="space-y-1.5 pt-1">
                  <label
                    htmlFor="medroute-custom-service-input"
                    className="block text-sm font-medium text-slate-800"
                  >
                    Enter the medical service you are looking for
                  </label>
                  <input
                    id="medroute-custom-service-input"
                    type="text"
                    value={searchInput.customServiceName || ''}
                    onChange={(e) => {
                      setFormError(null);
                      onChangeSearchInput({
                        ...searchInput,
                        customServiceName: e.target.value,
                      });
                    }}
                    placeholder={`e.g. Custom ${searchInput.category} service`}
                    className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:border-[#0F766E] focus:outline-none placeholder:text-slate-400"
                  />
                </div>
              )}
            </div>

            {/* Synchronized Service Description / Unverified Notice Panel */}
            {isNotFoundSelected ? (
              <div className="text-sm text-amber-900 bg-amber-50/80 border border-amber-200 rounded-md px-4 py-3 space-y-1">
                <div className="font-semibold text-amber-950">
                  {searchInput.customServiceName?.trim()
                    ? `${searchInput.customServiceName.trim()} (Unverified Custom Service)`
                    : 'Not Found / Other Service'}
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  This service is not currently available in MedRoute&apos;s predefined verified service list and will not be treated as a verified service.
                </p>
              </div>
            ) : (
              selectedService && (
                <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-4 py-2.5">
                  <span className="font-medium text-slate-800">
                    {selectedService.serviceName}:
                  </span>{' '}
                  {selectedService.description}
                </div>
              )
            )}
          </div>
        </div>

        {/* Step 3: Starting Location */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              3. Select starting location
            </h2>
            <p className="text-sm text-slate-500">
              Use your current location or enter any Indian city, locality, PIN code, or street address.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={locatingGps}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                searchInput.locationMode === 'gps' &&
                searchInput.startingLocation
                  ? 'bg-[#F0FDFA] text-[#0F766E] border-[#0F766E]'
                  : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <LocateFixed className="w-4 h-4" />
              {locatingGps ? 'Detecting Location...' : 'Use My Current Location'}
            </button>

            <button
              type="button"
              onClick={() => {
                setLocationNotice(null);
                onChangeSearchInput({ ...searchInput, locationMode: 'manual' });
              }}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                searchInput.locationMode === 'manual'
                  ? 'bg-[#F0FDFA] text-[#0F766E] border-[#0F766E]'
                  : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <MapPin className="w-4 h-4" />
              Enter Preferred Location Manually
            </button>
          </div>

          {searchInput.locationMode === 'manual' && (
            <div className="space-y-3 pt-1">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={searchInput.manualLocationText}
                  onChange={(e) => {
                    setLocationNotice(null);
                    setLocationDiagnostic(null);
                    onChangeSearchInput({
                      ...searchInput,
                      manualLocationText: e.target.value,
                    });
                  }}
                  placeholder={
                    mode === 'live'
                      ? 'e.g., Salt Lake Kolkata, 700091, Indiranagar Bengaluru, or Connaught Place New Delhi'
                      : 'e.g., Esplanade Kolkata, Salt Lake, Howrah, New Delhi, Bengaluru, or Mumbai'
                  }
                  aria-label="Starting city, locality, PIN code, or address"
                  className="flex-1 h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none"
                />
                <button
                  type="button"
                  disabled={geocodingManual}
                  onClick={() => void resolveManualLocation()}
                  className="px-4 py-2.5 text-sm font-medium text-[#0F2942] bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  {geocodingManual ? 'Resolving...' : 'Verify Location'}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>Quick examples:</span>
                {QUICK_INDIA_CITIES.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => {
                      onChangeSearchInput({
                        ...searchInput,
                        locationMode: 'manual',
                        manualLocationText: city,
                      });
                      void resolveManualLocation(city);
                    }}
                    className="text-[#0F766E] hover:underline whitespace-nowrap"
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>
          )}

          {searchInput.startingLocation && (
            <div className="bg-slate-50 border border-slate-200 rounded-md px-4 py-3 text-sm space-y-0.5">
              <div className="font-medium text-slate-900">
                Starting point set: {searchInput.startingLocation.formattedAddress}
              </div>
              <div className="text-xs font-mono text-slate-500 tabular-nums">
                Coordinates: {formatNumber(searchInput.startingLocation.latitude, 4)},{' '}
                {formatNumber(searchInput.startingLocation.longitude, 4)} · Source:{' '}
                {searchInput.startingLocation.source === 'gps'
                  ? 'Device GPS'
                  : searchInput.startingLocation.source === 'geocode_live'
                    ? 'Google Geocoding API'
                    : 'Demo Pan-India Reference'}
              </div>
            </div>
          )}

          {locationNotice && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3.5 text-sm text-amber-900">
              {locationNotice}
            </div>
          )}

          {locationDiagnostic && (
            <DiagnosticAlert
              diagnostic={locationDiagnostic}
              title="Location Lookup Diagnostic"
              onSwitchToDemo={
                mode === 'live' ? () => onSwitchMode('demo') : undefined
              }
            />
          )}
        </div>

        {/* Step 4: Accommodation Requirement */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              4. Do you need accommodation near the hospital?
            </h2>
            <p className="text-sm text-slate-500">
              If No, accommodation discovery and hospital-to-stay local commuting expenses are excluded from your journey estimate.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  onChangeSearchInput({
                    ...searchInput,
                    needsAccommodation: false,
                    nights: 0,
                  });
                }}
                className={`px-5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  !searchInput.needsAccommodation
                    ? 'bg-white text-[#0F2942] shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  const validNights = parsePositiveWholeNights(nightsText) || 1;
                  setNightsText(String(validNights));
                  onChangeSearchInput({
                    ...searchInput,
                    needsAccommodation: true,
                    nights: validNights,
                  });
                }}
                className={`px-5 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  searchInput.needsAccommodation
                    ? 'bg-white text-[#0F2942] shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Yes
              </button>
            </div>

            {searchInput.needsAccommodation && (
              <div className="flex items-center gap-3">
                <label
                  htmlFor="medroute-nights-input"
                  className="text-sm font-medium text-slate-800 whitespace-nowrap"
                >
                  Number of nights:
                </label>
                <input
                  id="medroute-nights-input"
                  type="number"
                  min={1}
                  max={365}
                  step={1}
                  value={nightsText}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNightsText(val);
                    const parsed = parsePositiveWholeNights(val);
                    if (parsed !== null) {
                      setFormError(null);
                      onChangeSearchInput({ ...searchInput, nights: parsed });
                    }
                  }}
                  className="w-24 h-10 px-3 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md text-slate-900 focus:border-[#0F766E] focus:outline-none"
                />
                <span className="text-xs text-slate-500">
                  Positive whole number
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Form Error & Submit Bar */}
        <div className="p-5 sm:p-6 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex-1">
            {formError ? (
              <div className="flex items-center gap-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Results will show the 5 nearest suitable providers first, strictly ordered by geographical proximity.
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={isSearching || geocodingManual || locatingGps}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-[#0F2942] rounded-md hover:bg-[#163A5C] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
          >
            <Search className="w-4 h-4" />
            {isSearching ? 'Finding Providers...' : 'Find Nearest Providers'}
          </button>
        </div>
      </form>
    </section>
  );
}
