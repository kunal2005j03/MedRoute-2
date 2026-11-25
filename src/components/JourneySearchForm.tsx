import React, { useState } from 'react';
import { LocateFixed, MapPin, Search, AlertCircle } from 'lucide-react';
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

  const categoryServices = services.filter(
    (s) => s.category === searchInput.category
  );

  const filteredCategoryServices = categoryServices.filter((s) =>
    s.serviceName.toLowerCase().includes(serviceSearchQuery.toLowerCase().trim())
  );

  const selectedService =
    categoryServices.find((s) => s.serviceId === searchInput.serviceId) ||
    categoryServices[0] ||
    null;

  const handleCategoryChange = (category: ServiceCategory) => {
    const firstInCategory = services.find((s) => s.category === category);
    setFormError(null);
    setServiceSearchQuery('');
    onChangeSearchInput({
      ...searchInput,
      category,
      serviceId: firstInCategory ? firstInCategory.serviceId : '',
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

    if (!selectedService) {
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

    onSubmitSearch({
      ...searchInput,
      serviceId: selectedService.serviceId,
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
            <div className="space-y-2.5">
              <input
                type="text"
                value={serviceSearchQuery}
                onChange={(e) => setServiceSearchQuery(e.target.value)}
                placeholder="Search services (e.g. Cardiology, MRI, Dialysis)..."
                className="w-full h-10 px-3.5 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:border-[#0F766E] focus:outline-none placeholder:text-slate-400"
              />
              <select
                id="medroute-service-select"
                value={selectedService?.serviceId || ''}
                onChange={(e) =>
                  onChangeSearchInput({
                    ...searchInput,
                    serviceId: e.target.value,
                  })
                }
                className="w-full h-11 px-3.5 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:border-[#0F766E] focus:outline-none"
              >
                {filteredCategoryServices.length === 0 ? (
                  <option value="" disabled>No matching services found</option>
                ) : (
                  filteredCategoryServices.map((svc) => (
                    <option key={svc.serviceId} value={svc.serviceId}>
                      {svc.serviceName}
                    </option>
                  ))
                )}
              </select>
            </div>

            {selectedService && (
              <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-4 py-2.5">
                <span className="font-medium text-slate-800">
                  {selectedService.serviceName}:
                </span>{' '}
                {selectedService.description}
              </div>
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
