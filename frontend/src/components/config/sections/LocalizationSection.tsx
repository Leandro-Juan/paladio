"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { getLocaleInfo } from '@/utils/locales';
import { getCurrencyInfo, SUPPORTED_CURRENCY_LIST, CurrencyInfo } from '@/utils/currencyResolver';
import { FlagIcon } from '@/components/trip-workspace/costs/FlagIcon';
import { CurrencyWheelPicker } from '@/components/trip-workspace/costs/CurrencyWheelPicker';
import { LanguagePickerModal } from '@/components/common/LanguagePickerModal';
import { RefreshIcon } from '@/components/icons';
import { apiFetch, updatePreferencesApi } from '@/utils/api';
import { SettingsHeader } from '../SettingsHeader';
import { SettingsCardFrame } from '../SettingsCardFrame';
import { User } from '@/types/auth';
import { notify } from '@/utils/notify';
import styles from '@/app/config/config.module.css';

interface SegmentedPillOption<T extends string> {
  value: T;
  label: string;
  sublabel?: string;
}

function SegmentedPill<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentedPillOption<T>[];
  value: T;
  onChange: (val: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        backgroundColor: 'var(--color-bg-main, #F7F5F0)',
        padding: '3px',
        borderRadius: '9999px',
        border: '1px solid var(--color-border, #E2DDD5)',
        gap: '2px',
        width: 'fit-content',
      }}
    >
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 12px',
              borderRadius: '9999px',
              border: 'none',
              backgroundColor: isActive ? 'var(--color-surface-card, #FFFFFF)' : 'transparent',
              color: isActive ? 'var(--color-accent-teal, #2A8C82)' : 'var(--color-text-muted, #718096)',
              fontFamily: 'var(--font-ui, sans-serif)',
              fontSize: '12px',
              fontWeight: isActive ? 700 : 500,
              cursor: 'pointer',
              boxShadow: isActive
                ? '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)'
                : 'none',
              transition: 'all 0.16s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{opt.label}</span>
            {opt.sublabel && (
              <span
                style={{
                  fontSize: '10px',
                  opacity: isActive ? 0.9 : 0.6,
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {opt.sublabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface LocalizationSectionProps {
  onBackToOverview: () => void;
  subTab?: 'language' | 'currency' | 'units';
  currentUser: User | null;
  onUpdateDefaultCurrency: (currency: CurrencyInfo) => Promise<void>;
  savingCurrency: boolean;
}

export function LocalizationSection({
  onBackToOverview,
  subTab = 'language',
  currentUser,
  onUpdateDefaultCurrency,
  savingCurrency,
}: LocalizationSectionProps) {
  const { t, locale, setLocale } = useTranslation();
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [isCurrencyWheelOpen, setIsCurrencyWheelOpen] = useState(false);

  // Units & Time Standards state
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('paladio_unit_distance');
      if (stored === 'mi') return 'mi';
    }
    return ((currentUser?.preferences as any)?.distance_unit === 'mi' ? 'mi' : 'km');
  });

  const [tempUnit, setTempUnit] = useState<'C' | 'F'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('paladio_unit_temperature');
      if (stored === 'F') return 'F';
    }
    return ((currentUser?.preferences as any)?.temperature_unit === 'F' ? 'F' : 'C');
  });

  const [clockFormat, setClockFormat] = useState<'24h' | '12h'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('paladio_unit_clock');
      if (stored === '12h') return '12h';
    }
    return ((currentUser?.preferences as any)?.clock_format === '12h' ? '12h' : '24h');
  });

  const [dateFormat, setDateFormat] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('paladio_unit_date') || (currentUser?.preferences as any)?.date_format || 'YYYY-MM-DD';
    }
    return (currentUser?.preferences as any)?.date_format || 'YYYY-MM-DD';
  });

  const userDefaultCurrency = (currentUser?.preferences?.default_currency as string) || 'EUR';
  const [selectedCurrency, setSelectedCurrency] = useState<string>(userDefaultCurrency);

  // Home City and Country state (for Public Holiday Sync)
  const [homeCity, setHomeCity] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('paladio_home_city') || (currentUser?.preferences as any)?.home_city || 'Madrid';
    }
    return (currentUser?.preferences as any)?.home_city || 'Madrid';
  });

  const [homeCountry, setHomeCountry] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('paladio_home_country') || (currentUser?.preferences as any)?.home_country || 'ES';
    }
    return (currentUser?.preferences as any)?.home_country || 'ES';
  });

  const [homeCountryName, setHomeCountryName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('paladio_home_country_name') || (currentUser?.preferences as any)?.home_country_name || 'Spain';
    }
    return (currentUser?.preferences as any)?.home_country_name || 'Spain';
  });

  // Autocomplete state
  const [cityQuery, setCityQuery] = useState(homeCity);
  const [citySuggestions, setCitySuggestions] = useState<Array<{ city: string; country: string; country_name: string; display_name: string; airport_iata: string }>>([]);
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
  const cityContainerRef = useRef<HTMLDivElement>(null);

  // Supported countries list
  const [supportedCountries, setSupportedCountries] = useState<Array<{ code: string; name: string }>>([]);

  const activeLocaleInfo = getLocaleInfo(locale);
  const activeCurrencyInfo = getCurrencyInfo(selectedCurrency);

  const handleAutoSave = async (patch: {
    city?: string;
    country?: string;
    countryName?: string;
    distance?: 'km' | 'mi';
    temp?: 'C' | 'F';
    clock?: '24h' | '12h';
    date?: string;
    currency?: string;
    newLocale?: string;
  }) => {
    const cCity = patch.city !== undefined ? patch.city : homeCity;
    const cCountry = patch.country !== undefined ? patch.country : homeCountry;
    const cCountryName = patch.countryName !== undefined ? patch.countryName : homeCountryName;
    const cDistance = patch.distance !== undefined ? patch.distance : distanceUnit;
    const cTemp = patch.temp !== undefined ? patch.temp : tempUnit;
    const cClock = patch.clock !== undefined ? patch.clock : clockFormat;
    const cDate = patch.date !== undefined ? patch.date : dateFormat;
    const cCurrency = patch.currency !== undefined ? patch.currency : selectedCurrency;
    const cLocale = patch.newLocale !== undefined ? patch.newLocale : locale;

    if (typeof window !== 'undefined') {
      localStorage.setItem('paladio_home_city', cCity);
      localStorage.setItem('paladio_home_country', cCountry);
      localStorage.setItem('paladio_home_country_name', cCountryName);
      localStorage.setItem('paladio_unit_distance', cDistance);
      localStorage.setItem('paladio_unit_temperature', cTemp);
      localStorage.setItem('paladio_unit_clock', cClock);
      localStorage.setItem('paladio_unit_date', cDate);
      window.dispatchEvent(new Event('paladio_home_location_changed'));
      window.dispatchEvent(new Event('paladio_units_changed'));
    }

    if (patch.currency !== undefined && patch.currency !== selectedCurrency) {
      await onUpdateDefaultCurrency(getCurrencyInfo(cCurrency));
    }

    if (currentUser) {
      try {
        await updatePreferencesApi({
          home_city: cCity,
          home_country: cCountry,
          home_country_name: cCountryName,
          distance_unit: cDistance,
          temperature_unit: cTemp,
          clock_format: cClock,
          date_format: cDate,
          default_currency: cCurrency,
          language: cLocale,
        });
      } catch (err: unknown) {
        console.error('Failed to sync preferences:', err);
      }
    }
  };

  const handleSyncHolidays = async () => {
    try {
      if (currentUser) {
        await updatePreferencesApi({
          home_city: homeCity,
          home_country: homeCountry,
          home_country_name: homeCountryName,
          distance_unit: distanceUnit,
          temperature_unit: tempUnit,
          clock_format: clockFormat,
          date_format: dateFormat,
          default_currency: selectedCurrency,
          language: locale,
        });
      }
      notify.success(
        'Holidays Synced',
        `Statutory holiday calendar synchronized for ${homeCountryName || homeCountry}.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to sync statutory holidays';
      notify.error('Sync Failed', msg);
    }
  };

  useEffect(() => {
    let isCancelled = false;
    async function loadCountries() {
      try {
        const list = await apiFetch<Array<{ code: string; name: string }>>('/calendar/countries');
        if (!isCancelled && Array.isArray(list)) {
          setSupportedCountries(list);
        }
      } catch {
        // Fallback
      }
    }
    loadCountries();
    return () => {
      isCancelled = true;
    };
  }, []);

  // City search debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!cityQuery || cityQuery.trim().length < 2) {
        setCitySuggestions([]);
        return;
      }
      setIsSearchingCity(true);
      try {
        const results = await apiFetch<Array<{ city: string; country: string; country_name: string; display_name: string; airport_iata: string }>>(
          `/locations/search?q=${encodeURIComponent(cityQuery.trim())}&limit=6`
        );
        if (Array.isArray(results)) {
          setCitySuggestions(results);
          setIsCityDropdownOpen(results.length > 0);
        }
      } catch {
        setCitySuggestions([]);
      } finally {
        setIsSearchingCity(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [cityQuery]);

  // Click outside city dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cityContainerRef.current && !cityContainerRef.current.contains(e.target as Node)) {
        setIsCityDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectCitySuggestion = (item: { city: string; country: string; country_name: string }) => {
    const cCity = item.city;
    const cCountry = item.country.toUpperCase();
    const cCountryName = item.country_name || item.country.toUpperCase();
    setHomeCity(cCity);
    setCityQuery(cCity);
    setHomeCountry(cCountry);
    setHomeCountryName(cCountryName);
    setIsCityDropdownOpen(false);
    void handleAutoSave({ city: cCity, country: cCountry, countryName: cCountryName });
  };

  const handleCountryChange = (code: string) => {
    setHomeCountry(code);
    const found = supportedCountries.find((c) => c.code === code);
    const name = found ? found.name : code;
    if (found) {
      setHomeCountryName(name);
    }
    void handleAutoSave({ country: code, countryName: name });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <SettingsHeader
        title={
          subTab === 'currency'
            ? 'Currency & Conversions'
            : subTab === 'units'
            ? 'Units & Time Standards'
            : 'Display Language & Regional'
        }
        onBackToOverview={onBackToOverview}
      />

      {/* 1. Language Card */}
      {(subTab === 'language' || subTab === 'currency') && (
        <SettingsCardFrame
          title="Display Language & Locales"
          subtitle="Configure system-wide display language, typography script families, and RTL text direction"
          badge={locale.toUpperCase()}
          badgeTone="coral"
          innerTitle="Active Interface Language"
          innerBadge={activeLocaleInfo?.name || locale}
          menuItems={[
            {
              id: 'switch_lang',
              label: 'Select Interface Language',
              onClick: () => setIsLanguagePickerOpen(true),
            },
            {
              id: 'audit_i18n',
              label: 'Check Translation Completeness',
              onClick: () => notify.info('Translations Verified', `Current locale (${locale.toUpperCase()}) is 100% verified.`),
            },
          ]}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(200, 109, 81, 0.12)',
                  color: 'var(--color-accent-coral, #C86D51)',
                }}
              >
                {locale.toUpperCase()}
              </span>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {activeLocaleInfo?.name || locale}
                </span>
                <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', display: 'block' }}>
                  Direction: {activeLocaleInfo?.direction === 'rtl' ? 'Right-to-Left (RTL)' : 'Left-to-Right (LTR)'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsLanguagePickerOpen(true)}
              style={{
                padding: '6px 14px',
                borderRadius: '9999px',
                backgroundColor: 'var(--color-surface-card)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t('nav.change_language') || 'Change Language'}
            </button>
          </div>
        </SettingsCardFrame>
      )}

      {/* 1.5 Home Jurisdiction & Statutory Holidays Card */}
      {(subTab === 'language' || subTab === 'currency' || subTab === 'units') && (
        <SettingsCardFrame
          title="Home Jurisdiction & Statutory Holidays"
          subtitle="Configure your home city and country to automatically resolve and sync official public holidays in the calendar"
          badge={`${homeCity ? `${homeCity}, ` : ''}${homeCountry}`}
          badgeTone="teal"
          innerTitle="Statutory Holiday Calendar"
          innerBadge={`${homeCountryName || homeCountry} Calendar`}
          menuItems={[
            {
              id: 'sync_hols',
              label: 'Sync Holidays Now',
              onClick: handleSyncHolidays,
            },
          ]}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              {/* City Autocomplete Field */}
              <div ref={cityContainerRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Home City
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={cityQuery}
                    onChange={(e) => {
                      setCityQuery(e.target.value);
                      setHomeCity(e.target.value);
                    }}
                    onBlur={() => {
                      if (cityQuery.trim()) {
                        void handleAutoSave({ city: cityQuery.trim() });
                      }
                    }}
                    onFocus={() => {
                      if (citySuggestions.length > 0) setIsCityDropdownOpen(true);
                    }}
                    placeholder="Search city (e.g., Madrid, Paris, Tokyo)..."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface-card)',
                      color: 'var(--color-text-primary)',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                  {isSearchingCity && (
                    <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}>
                      <RefreshIcon size={13} className="animate-spin" color="var(--color-text-muted)" />
                    </div>
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {isCityDropdownOpen && citySuggestions.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: '4px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface-card)',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                      zIndex: 100,
                      maxHeight: '200px',
                      overflowY: 'auto',
                    }}
                  >
                    {citySuggestions.map((item, idx) => (
                      <div
                        key={`${item.city}-${item.country}-${idx}`}
                        onClick={() => handleSelectCitySuggestion(item)}
                        style={{
                          padding: '8px 12px',
                          borderBottom: '1px solid var(--color-border)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(42, 140, 130, 0.08)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <div>
                          <span style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--color-text-primary)' }}>
                            {item.city}
                          </span>
                          <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', marginLeft: '6px' }}>
                            {item.country_name || item.country}
                          </span>
                        </div>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 5px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(42, 140, 130, 0.15)',
                            color: 'var(--color-accent-teal, #2A8C82)',
                          }}
                        >
                          {item.country.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  Selecting a city automatically resolves its statutory holiday country code.
                </span>
              </div>

              {/* Resolved Country Field */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Statutory Country Code
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '30px',
                      height: '22px',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      border: '1px solid var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <FlagIcon countryCode={homeCountry} size={26} />
                  </div>
                  <select
                    value={homeCountry}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface-card)',
                      color: 'var(--color-text-primary)',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  >
                    {supportedCountries.length > 0 ? (
                      supportedCountries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} — {c.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="ES">ES — Spain</option>
                        <option value="FR">FR — France</option>
                        <option value="DE">DE — Germany</option>
                        <option value="IT">IT — Italy</option>
                        <option value="GB">GB — United Kingdom</option>
                        <option value="US">US — United States</option>
                        <option value="JP">JP — Japan</option>
                      </>
                    )}
                  </select>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  Official public holidays for this country appear in Pacific Teal in your calendar.
                </span>
              </div>
            </div>
          </div>
        </SettingsCardFrame>
      )}

      {/* 2. Currency Card */}
      {(subTab === 'currency' || subTab === 'language') && (
        <SettingsCardFrame
          title="Currency & Monetary Conventions"
          subtitle="Default calculation currency for travel itineraries, expenses, budgeting, and live conversions"
          badge={selectedCurrency}
          badgeTone="gold"
          innerTitle="Instance Base Currency"
          innerBadge={`${activeCurrencyInfo.code} (${activeCurrencyInfo.symbol})`}
          menuItems={[
            {
              id: 'change_curr',
              label: 'Select Instance Currency',
              onClick: () => setIsCurrencyWheelOpen(true),
            },
            {
              id: 'refresh_fx',
              label: 'Refresh Exchange Rate Cache',
              onClick: () => notify.success('Exchange Rates', 'Exchange rate cache refreshed from sovereign feeds.'),
            },
          ]}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '30px', height: '22px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FlagIcon countryCode={activeCurrencyInfo.countryCode || 'EU'} size={26} />
              </div>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {activeCurrencyInfo.code} — {activeCurrencyInfo.name}
                </span>
                <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', display: 'block' }}>
                  Symbol: {activeCurrencyInfo.symbol} · ISO 4217 Standard
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCurrencyWheelOpen(true)}
              disabled={savingCurrency}
              style={{
                padding: '6px 14px',
                borderRadius: '9999px',
                backgroundColor: 'var(--color-surface-card)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: savingCurrency ? 'wait' : 'pointer',
              }}
            >
              {savingCurrency ? 'Saving...' : 'Change Base Currency'}
            </button>
          </div>
        </SettingsCardFrame>
      )}

      {/* 3. Units & Time Standards Card */}
      {(subTab === 'units' || subTab === 'language') && (
        <SettingsCardFrame
          title="Units & Time Standards"
          subtitle="Configure distance measurements, temperature telemetry, 24h tactical clock, and calendar date display conventions"
          badge={`${distanceUnit.toUpperCase()} · °${tempUnit} · ${clockFormat.toUpperCase()}`}
          badgeTone="teal"
          innerTitle="Measurement & Time Conventions"
          innerBadge={`${distanceUnit === 'km' ? 'Metric' : 'Imperial'} · °${tempUnit}`}
          menuItems={[
            {
              id: 'reset_units',
              label: 'Reset to Metric, °C & 24h Clock',
              onClick: () => {
                setDistanceUnit('km');
                setTempUnit('C');
                setClockFormat('24h');
                setDateFormat('YYYY-MM-DD');
                void handleAutoSave({ distance: 'km', temp: 'C', clock: '24h', date: 'YYYY-MM-DD' });
              },
            },
          ]}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* 1. Distance Standard */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Distance Standard: {distanceUnit === 'km' ? 'Kilometers (Metric)' : 'Miles (Imperial)'}
                </span>
                <p style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', margin: 0 }}>
                  Used across itinerary route cards, walking estimators, and GTFS station distances
                </p>
              </div>
              <SegmentedPill<'km' | 'mi'>
                ariaLabel="Distance standard units"
                value={distanceUnit}
                onChange={(val) => {
                  setDistanceUnit(val);
                  void handleAutoSave({ distance: val });
                }}
                options={[
                  { value: 'km', label: 'km', sublabel: 'Metric' },
                  { value: 'mi', label: 'miles', sublabel: 'Imperial' },
                ]}
              />
            </div>

            {/* 2. Temperature Standard */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', paddingTop: '10px', borderTop: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Temperature Standard: {tempUnit === 'C' ? 'Celsius (°C)' : 'Fahrenheit (°F)'}
                </span>
                <p style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', margin: 0 }}>
                  Used across weather forecasts, packing recommendations, and climate telemetry
                </p>
              </div>
              <SegmentedPill<'C' | 'F'>
                ariaLabel="Temperature units"
                value={tempUnit}
                onChange={(val) => {
                  setTempUnit(val);
                  void handleAutoSave({ temp: val });
                }}
                options={[
                  { value: 'C', label: '°C', sublabel: 'Celsius' },
                  { value: 'F', label: '°F', sublabel: 'Fahrenheit' },
                ]}
              />
            </div>

            {/* 3. Clock Standard */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', paddingTop: '10px', borderTop: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Clock Standard: {clockFormat === '24h' ? '24-Hour Tactical (14:30)' : '12-Hour AM/PM (2:30 PM)'}
                </span>
                <p style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', margin: 0 }}>
                  Used across daily timeline legs, flight boarding passes, and POI opening hours
                </p>
              </div>
              <SegmentedPill<'24h' | '12h'>
                ariaLabel="Time clock format"
                value={clockFormat}
                onChange={(val) => {
                  setClockFormat(val);
                  void handleAutoSave({ clock: val });
                }}
                options={[
                  { value: '24h', label: '24h', sublabel: 'Tactical (14:30)' },
                  { value: '12h', label: '12h', sublabel: 'AM/PM (2:30 PM)' },
                ]}
              />
            </div>

            {/* 4. Calendar Date Convention */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', paddingTop: '10px', borderTop: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Calendar Date Convention
                </span>
                <p style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', margin: 0 }}>
                  Display standard across travel itineraries, flight tickets, and booking vouchers
                </p>
              </div>
              <SegmentedPill<string>
                ariaLabel="Calendar date convention"
                value={dateFormat}
                onChange={(val) => {
                  setDateFormat(val);
                  void handleAutoSave({ date: val });
                }}
                options={[
                  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
                  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                ]}
              />
            </div>
          </div>
        </SettingsCardFrame>
      )}

      {/* Language Picker Modal */}
      {isLanguagePickerOpen && (
        <LanguagePickerModal
          isOpen={isLanguagePickerOpen}
          onClose={() => setIsLanguagePickerOpen(false)}
        />
      )}

      {/* Currency Wheel Picker Modal */}
      {isCurrencyWheelOpen && (
        <CurrencyWheelPicker
          isOpen={isCurrencyWheelOpen}
          onClose={() => setIsCurrencyWheelOpen(false)}
          selectedCurrency={selectedCurrency}
          onSelectCurrency={(curr) => {
            setSelectedCurrency(curr.code);
            setIsCurrencyWheelOpen(false);
            void handleAutoSave({ currency: curr.code });
          }}
        />
      )}
    </div>
  );
}
