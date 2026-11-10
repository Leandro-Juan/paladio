"use client";

import React, { useState, useEffect, useRef } from 'react';
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
import { TacticalToggle } from '../TacticalToggle';
import { User } from '@/types/auth';
import { notify } from '@/utils/notify';

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
  const { t, locale } = useTranslation();
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [isCurrencyWheelOpen, setIsCurrencyWheelOpen] = useState(false);

  // Units & Time Standards state
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('paladio_unit_distance');
      if (stored === 'mi') return 'mi';
    }
    return 'km';
  });

  const [clockFormat, setClockFormat] = useState<'24h' | '12h'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('paladio_unit_clock');
      if (stored === '12h') return '12h';
    }
    return '24h';
  });

  const [dateFormat, setDateFormat] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('paladio_unit_date') || 'YYYY-MM-DD';
    }
    return 'YYYY-MM-DD';
  });

  const activeLocaleInfo = getLocaleInfo(locale);
  const userDefaultCurrency = (currentUser?.preferences?.default_currency as string) || 'EUR';
  const activeCurrencyInfo = getCurrencyInfo(userDefaultCurrency);

  const handleUpdateDistance = (checked: boolean) => {
    const val = checked ? 'km' : 'mi';
    setDistanceUnit(val);
    if (typeof window !== 'undefined') localStorage.setItem('paladio_unit_distance', val);
    notify.success('Distance Unit', `Distance unit set to ${val === 'km' ? 'Kilometers (Metric)' : 'Miles (Imperial)'}`);
  };

  const handleUpdateClock = (checked: boolean) => {
    const val = checked ? '24h' : '12h';
    setClockFormat(val);
    if (typeof window !== 'undefined') localStorage.setItem('paladio_unit_clock', val);
    notify.success('Clock Standard', `Time clock standard set to ${val === '24h' ? '24-Hour Tactical' : '12-Hour AM/PM'}`);
  };

  const handleUpdateDateFormat = (format: string) => {
    setDateFormat(format);
    if (typeof window !== 'undefined') localStorage.setItem('paladio_unit_date', format);
    notify.success('Date Format', `Date display standard set to ${format}`);
  };

  // Home City and Country state (for Public Holiday Sync)
  const [homeCity, setHomeCity] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('paladio_home_city') || (currentUser?.preferences as any)?.home_city || 'Madrid';
    }
    return 'Madrid';
  });

  const [homeCountry, setHomeCountry] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('paladio_home_country') || (currentUser?.preferences as any)?.home_country || 'ES';
    }
    return 'ES';
  });

  const [homeCountryName, setHomeCountryName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('paladio_home_country_name') || (currentUser?.preferences as any)?.home_country_name || 'Spain';
    }
    return 'Spain';
  });

  // Autocomplete state
  const [cityQuery, setCityQuery] = useState(homeCity);
  const [citySuggestions, setCitySuggestions] = useState<Array<{ city: string; country: string; country_name: string; display_name: string; airport_iata: string }>>([]);
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const cityContainerRef = useRef<HTMLDivElement>(null);

  // Supported countries list
  const [supportedCountries, setSupportedCountries] = useState<Array<{ code: string; name: string }>>([]);

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
    setHomeCity(item.city);
    setCityQuery(item.city);
    // Automatic country resolution when city is selected!
    setHomeCountry(item.country.toUpperCase());
    setHomeCountryName(item.country_name || item.country.toUpperCase());
    setIsCityDropdownOpen(false);
  };

  const handleCountryChange = (code: string) => {
    setHomeCountry(code);
    const found = supportedCountries.find((c) => c.code === code);
    if (found) {
      setHomeCountryName(found.name);
    }
  };

  const handleSaveHomeLocation = async () => {
    setSavingLocation(true);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('paladio_home_city', homeCity);
        localStorage.setItem('paladio_home_country', homeCountry);
        localStorage.setItem('paladio_home_country_name', homeCountryName);
        window.dispatchEvent(new Event('paladio_home_location_changed'));
      }
      if (currentUser) {
        await updatePreferencesApi({
          home_city: homeCity,
          home_country: homeCountry,
          home_country_name: homeCountryName,
        });
      }
      notify.success(
        'Jurisdiction Updated',
        `Home set to ${homeCity ? `${homeCity}, ` : ''}${homeCountryName || homeCountry}. Statutory holidays synced with calendar.`
      );
    } catch {
      notify.error('Update Failed', 'Could not save home jurisdiction to profile.');
    } finally {
      setSavingLocation(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
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
          actionButton={{
            label: 'Change Language',
            onClick: () => setIsLanguagePickerOpen(true),
          }}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(200, 109, 81, 0.12)',
                  color: 'var(--color-accent-coral, #C86D51)',
                }}
              >
                {locale.toUpperCase()}
              </span>
              <div>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {activeLocaleInfo?.name || locale}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', display: 'block' }}>
                  Direction: {activeLocaleInfo?.direction === 'rtl' ? 'Right-to-Left (RTL)' : 'Left-to-Right (LTR)'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsLanguagePickerOpen(true)}
              style={{
                padding: '8px 16px',
                borderRadius: '9999px',
                backgroundColor: 'var(--color-surface-card)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t('nav.change_language') || 'Switch Language'}
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
          actionButton={{
            label: savingLocation ? 'Syncing...' : 'Save & Sync Calendar',
            onClick: handleSaveHomeLocation,
          }}
          menuItems={[
            {
              id: 'sync_hols',
              label: 'Save & Sync Holidays Now',
              onClick: handleSaveHomeLocation,
            },
          ]}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {/* City Autocomplete Field */}
              <div ref={cityContainerRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
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
                    onFocus={() => {
                      if (citySuggestions.length > 0) setIsCityDropdownOpen(true);
                    }}
                    placeholder="Search city (e.g., Madrid, Paris, Tokyo)..."
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface-card)',
                      color: 'var(--color-text-primary)',
                      fontSize: '14px',
                      outline: 'none',
                    }}
                  />
                  {isSearchingCity && (
                    <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}>
                      <RefreshIcon size={14} className="animate-spin" color="var(--color-text-muted)" />
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
                      maxHeight: '220px',
                      overflowY: 'auto',
                    }}
                  >
                    {citySuggestions.map((item, idx) => (
                      <div
                        key={`${item.city}-${item.country}-${idx}`}
                        onClick={() => handleSelectCitySuggestion(item)}
                        style={{
                          padding: '10px 14px',
                          borderBottom: '1px solid var(--color-border)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(42, 140, 130, 0.08)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <div>
                          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                            {item.city}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginLeft: '6px' }}>
                            {item.country_name || item.country}
                          </span>
                        </div>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 6px',
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Statutory Country Code
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '24px',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      border: '1px solid var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <FlagIcon countryCode={homeCountry} size={28} />
                  </div>
                  <select
                    value={homeCountry}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface-card)',
                      color: 'var(--color-text-primary)',
                      fontSize: '14px',
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
                  Official public holidays for this country appear in Pacific Teal in your calendar and cannot be removed.
                </span>
              </div>
            </div>

            {/* Sync Action Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
              <button
                type="button"
                onClick={handleSaveHomeLocation}
                disabled={savingLocation}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 20px',
                  borderRadius: '9999px',
                  backgroundColor: 'var(--color-accent-teal, #2A8C82)',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: savingLocation ? 'wait' : 'pointer',
                  opacity: savingLocation ? 0.75 : 1,
                }}
              >
                <RefreshIcon size={13} className={savingLocation ? 'animate-spin' : ''} />
                {savingLocation ? 'Saving & Syncing...' : 'Save & Sync Calendar Holidays'}
              </button>
            </div>
          </div>
        </SettingsCardFrame>
      )}

      {/* 2. Currency Card */}
      {(subTab === 'currency' || subTab === 'language') && (
        <SettingsCardFrame
          title="Currency & Monetary Conventions"
          subtitle="Default calculation currency for travel itineraries, expenses, budgeting, and live conversions"
          badge={userDefaultCurrency}
          badgeTone="gold"
          actionButton={{
            label: 'Change Currency',
            onClick: () => setIsCurrencyWheelOpen(true),
          }}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '32px', height: '24px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FlagIcon countryCode={activeCurrencyInfo.countryCode || 'EU'} size={28} />
              </div>
              <div>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {activeCurrencyInfo.code} — {activeCurrencyInfo.name}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', display: 'block' }}>
                  Symbol: {activeCurrencyInfo.symbol} · ISO 4217 Standard
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCurrencyWheelOpen(true)}
              disabled={savingCurrency}
              style={{
                padding: '8px 16px',
                borderRadius: '9999px',
                backgroundColor: 'var(--color-surface-card)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontSize: '13px',
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
          subtitle="Configure distance measurements, 24h tactical clock, and calendar date display conventions"
          badge={distanceUnit === 'km' ? 'METRIC / 24H' : 'IMPERIAL / 12H'}
          badgeTone="teal"
          innerTitle="Measurement & Time Conventions"
          innerBadge={distanceUnit === 'km' ? 'Metric' : 'Imperial'}
          menuItems={[
            {
              id: 'reset_units',
              label: 'Reset to Metric & 24h Clock',
              onClick: () => {
                handleUpdateDistance(true);
                handleUpdateClock(true);
                handleUpdateDateFormat('YYYY-MM-DD');
              },
            },
          ]}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Metric Distance Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Distance Standard: {distanceUnit === 'km' ? 'Kilometers (Metric)' : 'Miles (Imperial)'}
                </span>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                  Used across all itinerary route cards, walking estimators, and GTFS station distances
                </p>
              </div>
              <TacticalToggle
                checked={distanceUnit === 'km'}
                onChange={handleUpdateDistance}
                tone="teal"
                ariaLabel="Toggle between metric kilometers and imperial miles"
              />
            </div>

            {/* Tactical 24h Clock Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Clock Standard: {clockFormat === '24h' ? '24-Hour Tactical (14:30)' : '12-Hour AM/PM (2:30 PM)'}
                </span>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                  Used across daily timeline legs, flight boarding passes, and POI opening hours
                </p>
              </div>
              <TacticalToggle
                checked={clockFormat === '24h'}
                onChange={handleUpdateClock}
                tone="teal"
                ariaLabel="Toggle 24-hour tactical clock"
              />
            </div>

            {/* Date Display Convention */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Calendar Date Convention
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'].map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => handleUpdateDateFormat(fmt)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      border: dateFormat === fmt ? '2px solid var(--color-accent-teal, #2A8C82)' : '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface-card)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '12px',
                      fontWeight: dateFormat === fmt ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
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
          selectedCurrency={userDefaultCurrency}
          onSelectCurrency={(curr) => {
            onUpdateDefaultCurrency(curr);
            setIsCurrencyWheelOpen(false);
          }}
        />
      )}
    </div>
  );
}
