"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User } from '@/types/auth';
import { useTranslation } from '@/hooks/useTranslation';
import { getLocaleInfo } from '@/utils/locales';
import { getCurrencyInfo, getLocalizedCurrencyName } from '@/utils/currencyResolver';
import { FlagIcon } from '@/components/trip-workspace/costs/FlagIcon';
import { CurrencyWheelPicker } from '@/components/trip-workspace/costs/CurrencyWheelPicker';
import { LanguagePickerModal } from '@/components/common/LanguagePickerModal';
import { CountryWheelPicker } from '@/components/common/CountryWheelPicker';
import { getCountryDisplayName } from '@/utils/countries';
import { apiFetch, updateProfileApi } from '@/utils/api';
import { SettingsHeader } from '../SettingsHeader';
import { SettingsCardFrame } from '../SettingsCardFrame';
import { notify } from '@/utils/notify';
import { EyeIcon, EyeOffIcon } from '@/components/icons';
import { DemoFeatureGate } from '@/components/common/DemoFeatureGate';

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

export interface PersonalAccountSectionProps {
  onBackToOverview: () => void;
  currentUser: User | null;
  refreshUser: () => Promise<void>;
  onProfileUpdated?: () => Promise<void> | void;
  getSafeAvatarUrl: (url: unknown) => string | null;
}

export function PersonalAccountSection({
  onBackToOverview,
  currentUser,
  refreshUser,
  onProfileUpdated,
  getSafeAvatarUrl,
}: PersonalAccountSectionProps) {
  const { locale, t } = useTranslation();
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [isCurrencyWheelOpen, setIsCurrencyWheelOpen] = useState(false);
  const [isCountryWheelOpen, setIsCountryWheelOpen] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile Credentials State
  const initialUsername = currentUser?.username || '';
  const initialEmail = currentUser?.email || '';
  const userPrefs = (currentUser?.preferences || {}) as Record<string, any>;
  const initialAvatar = (currentUser as any)?.avatar_url || userPrefs.avatar_url || '';

  const [username, setUsername] = useState(initialUsername);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar);

  // Localization & Formatting State
  const initialDistance = userPrefs.distance_unit === 'mi' ? 'mi' : 'km';
  const initialTemp = userPrefs.temperature_unit === 'F' ? 'F' : 'C';
  const initialClock = userPrefs.clock_format === '12h' ? '12h' : '24h';
  const initialDate = userPrefs.date_format || 'YYYY-MM-DD';
  const initialCurrency = (userPrefs.default_currency as string) || 'EUR';
  const initialHomeCity = (userPrefs.home_city as string) || (typeof window !== 'undefined' ? localStorage.getItem('paladio_home_city') || 'Madrid' : 'Madrid');
  const initialHomeCountry = (userPrefs.home_country as string) || (typeof window !== 'undefined' ? localStorage.getItem('paladio_home_country') || 'ES' : 'ES');
  const initialHomeCountryName = (userPrefs.home_country_name as string) || (typeof window !== 'undefined' ? localStorage.getItem('paladio_home_country_name') || 'Spain' : 'Spain');

  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>(initialDistance);
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>(initialTemp);
  const [clockFormat, setClockFormat] = useState<'24h' | '12h'>(initialClock);
  const [dateFormat, setDateFormat] = useState<string>(initialDate);
  const [selectedCurrency, setSelectedCurrency] = useState<string>(initialCurrency);
  const [homeCity, setHomeCity] = useState<string>(initialHomeCity);
  const [homeCountry, setHomeCountry] = useState<string>(initialHomeCountry);
  const [homeCountryName, setHomeCountryName] = useState<string>(initialHomeCountryName);

  // City Search & Public Holidays
  const [cityQuery, setCityQuery] = useState(homeCity);
  const [citySuggestions, setCitySuggestions] = useState<Array<{ city: string; country: string; country_name: string; display_name: string; airport_iata: string }>>([]);
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
  const isCityFocusedRef = useRef(false);
  const [isCityFocused, setIsCityFocused] = useState(false);
  const [supportedCountries, setSupportedCountries] = useState<Array<{ code: string; name: string }>>([]);
  const cityContainerRef = useRef<HTMLDivElement>(null);

  // Update local states when currentUser changes
  const [prevUser, setPrevUser] = useState(currentUser);
  if (currentUser !== prevUser) {
    setPrevUser(currentUser);
    if (currentUser) {
      setUsername(currentUser.username || '');
      setEmail(currentUser.email || '');
      const prefs = (currentUser.preferences || {}) as Record<string, unknown>;
      setAvatarUrl((currentUser as unknown as { avatar_url?: string })?.avatar_url || (prefs.avatar_url as string) || '');
      if (prefs.distance_unit) setDistanceUnit(prefs.distance_unit === 'mi' ? 'mi' : 'km');
      if (prefs.temperature_unit) setTempUnit(prefs.temperature_unit === 'F' ? 'F' : 'C');
      if (prefs.clock_format) setClockFormat(prefs.clock_format === '12h' ? '12h' : '24h');
      if (prefs.date_format) setDateFormat(prefs.date_format as string);
      if (prefs.default_currency) setSelectedCurrency(prefs.default_currency as string);
      if (prefs.home_city) {
        setHomeCity(prefs.home_city as string);
        setCityQuery(prefs.home_city as string);
      }
      if (prefs.home_country) setHomeCountry(prefs.home_country as string);
      if (prefs.home_country_name) setHomeCountryName(prefs.home_country_name as string);
    }
  }

  // Load supported holiday countries
  useEffect(() => {
    let isCancelled = false;
    async function loadCountries() {
      try {
        const list = await apiFetch<Array<{ code: string; name: string }>>('/calendar/countries');
        if (!isCancelled && Array.isArray(list)) {
          const normalized = list
            .filter((item) => item.code && item.code.trim().length === 2)
            .map((item) => {
              const code = item.code.toUpperCase().trim();
              return {
                code,
                name:
                  locale === 'en' && item.name && item.name !== item.code
                    ? item.name
                    : getCountryDisplayName(code, item.name, locale),
              };
            });
          setSupportedCountries(normalized);
        }
      } catch {
        // Fallback gracefully
      }
    }
    loadCountries();
    return () => {
      isCancelled = true;
    };
  }, [locale]);

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
          if (isCityFocusedRef.current) {
            setIsCityDropdownOpen(results.length > 0);
          }
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
        setIsCityFocused(false);
        isCityFocusedRef.current = false;
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectCitySuggestion = (item: { city: string; country: string; country_name: string }) => {
    const cCity = item.city;
    const cCountry = item.country.toUpperCase();
    const cCountryName = item.country_name || item.country.toUpperCase();
    setIsCityDropdownOpen(false);
    setIsCityFocused(false);
    isCityFocusedRef.current = false;
    setHomeCity(cCity);
    setCityQuery(cCity);
    setHomeCountry(cCountry);
    setHomeCountryName(cCountryName);
    void handleAutoSaveProfile({ city: cCity, country: cCountry, countryName: cCountryName });
  };

  const handleCountryChange = (code: string, countryName?: string) => {
    setHomeCountry(code);
    const found = supportedCountries.find((c) => c.code.toUpperCase() === code.toUpperCase());
    const resolvedName =
      locale === 'en'
        ? countryName || (found && found.name && found.name !== found.code ? found.name : getCountryDisplayName(code, undefined, locale))
        : getCountryDisplayName(code, countryName || found?.name, locale);
    setHomeCountryName(resolvedName);
    void handleAutoSaveProfile({ country: code, countryName: resolvedName });
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      notify.error(t('config.invalid_file_title'), t('config.invalid_image_file_personal'));
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      notify.error(t('config.file_too_large_title'), t('config.avatar_too_large_2mb'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setAvatarUrl(dataUrl);
      void handleAutoSaveProfile({ avatarUrl: dataUrl });
      notify.success(t('config.avatar_updated_title'), t('config.avatar_updated_msg'));
    };
    reader.readAsDataURL(file);
  };

  // Safe avatar URL
  const safeAvatar = getSafeAvatarUrl(avatarUrl);
  const activeLocaleInfo = getLocaleInfo(locale);
  const activeLocaleName = (() => {
    const langKey = `languages.${activeLocaleInfo?.code || locale}`;
    const translated = t(langKey);
    return translated === langKey ? activeLocaleInfo?.name || locale : translated;
  })();
  const activeCurrencyInfo = getCurrencyInfo(selectedCurrency);
  const activeCountryName = useMemo(() => {
    const found = supportedCountries.find((c) => c.code.toUpperCase() === (homeCountry || '').toUpperCase());
    if (locale === 'en' && found && found.name && found.name !== found.code) return found.name;
    return getCountryDisplayName(homeCountry, found?.name || homeCountryName || 'Spain', locale);
  }, [supportedCountries, homeCountry, homeCountryName, locale]);

  const handleAutoSaveProfile = async (patch: {
    username?: string;
    email?: string;
    avatarUrl?: string;
    city?: string;
    country?: string;
    countryName?: string;
    distance?: 'km' | 'mi';
    temp?: 'C' | 'F';
    clock?: '24h' | '12h';
    date?: string;
    currency?: string;
  }) => {
    const cUsername = patch.username !== undefined ? patch.username.trim() : username.trim();
    const cEmail = patch.email !== undefined ? patch.email.trim() : email.trim();
    const cAvatar = patch.avatarUrl !== undefined ? patch.avatarUrl : avatarUrl;
    const cCity = patch.city !== undefined ? patch.city : homeCity;
    const cCountry = patch.country !== undefined ? patch.country : homeCountry;
    const cCountryName = patch.countryName !== undefined ? patch.countryName : homeCountryName;
    const cDistance = patch.distance !== undefined ? patch.distance : distanceUnit;
    const cTemp = patch.temp !== undefined ? patch.temp : tempUnit;
    const cClock = patch.clock !== undefined ? patch.clock : clockFormat;
    const cDate = patch.date !== undefined ? patch.date : dateFormat;
    const cCurrency = patch.currency !== undefined ? patch.currency : selectedCurrency;

    // 1. Sync client localStorage mirrors
    if (typeof window !== 'undefined') {
      localStorage.setItem('paladio_home_city', cCity);
      localStorage.setItem('paladio_home_country', cCountry);
      localStorage.setItem('paladio_home_country_name', cCountryName);
      localStorage.setItem('paladio_unit_distance', cDistance);
      localStorage.setItem('paladio_unit_temperature', cTemp);
      localStorage.setItem('paladio_unit_clock', cClock);
      localStorage.setItem('paladio_unit_date', cDate);
      localStorage.setItem('paladio_currency', cCurrency);
      window.dispatchEvent(new Event('paladio_home_location_changed'));
      window.dispatchEvent(new Event('paladio_units_changed'));
      window.dispatchEvent(new Event('paladio_currency_changed'));
    }

    const validatedAvatar = cAvatar ? getSafeAvatarUrl(cAvatar) : null;

    try {
      const existingPrefs = { ...(((currentUser?.preferences || {}) as Record<string, unknown>)) };
      const updatedPrefs = {
        ...existingPrefs,
        avatar_url: cAvatar ? validatedAvatar : null,
        default_currency: cCurrency,
        preferred_language: locale,
        home_city: cCity,
        home_country: cCountry,
        home_country_name: cCountryName,
        distance_unit: cDistance,
        temperature_unit: cTemp,
        clock_format: cClock,
        date_format: cDate,
        units_preferences: {
          distance_unit: cDistance,
          temperature_unit: cTemp.toLowerCase(),
          time_format: cClock,
          date_format: cDate,
        },
      };

      if (currentUser) {
        await updateProfileApi({
          username: cUsername || currentUser.username,
          email: cEmail || null,
          avatar_url: cAvatar ? validatedAvatar : null,
          preferences: updatedPrefs,
        });
        await refreshUser();
        await onProfileUpdated?.();
      }
    } catch (err: unknown) {
      console.error('Failed to auto-save personal profile settings:', err);
      const msg = err instanceof Error ? err.message : t('config.update_failed_title');
      notify.error(t('config.update_failed_title'), msg);
    }
  };

  const isPasswordMismatch = Boolean(confirmPassword && password !== confirmPassword);
  const isPasswordTooShort = Boolean(password && password.length < 6);
  const isPasswordValid = Boolean(password && confirmPassword && password.length >= 6 && password === confirmPassword);

  const handleUpdatePassword = async () => {
    if (!isPasswordValid) return;
    setIsUpdatingPassword(true);
    try {
      await updateProfileApi({ password });
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setShowConfirmPassword(false);
      notify.success(t('config.security_updated_title'), t('config.password_updated_msg'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('config.password_update_failed');
      notify.error(t('config.update_failed_title'), msg);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <SettingsHeader
        title={t('config.item_profile_title')}
        onBackToOverview={onBackToOverview}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <DemoFeatureGate
        message={t('demo.locked_account_profile')}
        borderRadius="14px"
      >
      {/* 1. Active Account Identity Card */}
      <SettingsCardFrame
        title={t('config.personal_profile_card_title')}
        subtitle={t('config.personal_profile_card_subtitle')}
        innerTitle={t('config.personal_profile_inner_title')}
        menuItems={[
          {
            id: 'export_data',
            label: t('config.export_account_data_menu'),
            onClick: () => notify.info(t('config.account_export_title'), t('config.account_export_msg')),
          },
        ]}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-surface-hover, rgba(42, 140, 130, 0.12))',
              border: '2px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {safeAvatar ? (
              <img src={safeAvatar} alt={username || t('config.avatar_alt')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-accent-teal)' }}>
                {(username || 'U')[0].toUpperCase()}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {currentUser?.username || t('config.authenticated_traveler')}
              </span>
            </div>
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
              {currentUser?.email || t('config.no_email_attached')}
            </span>
          </div>
        </div>
      </SettingsCardFrame>

      {/* 2. Inline Credentials & Security Form */}
      <SettingsCardFrame
        title={t('config.credentials_security_title')}
        subtitle={t('config.credentials_security_subtitle')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Avatar Edit Controls */}
          <div>
            <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '8px', textTransform: 'uppercase' }}>
              {t('config.profile_avatar_label')}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'var(--color-surface-page, #F7F5F0)',
                  color: 'var(--color-text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                  fontWeight: 700,
                  overflow: 'hidden',
                  flexShrink: 0,
                  border: '2px solid var(--color-border)',
                }}
              >
                {safeAvatar ? (
                  <img
                    src={safeAvatar}
                    alt={username || t('config.avatar_alt')}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  (username || 'U').charAt(0).toUpperCase()
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '220px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleAvatarFileChange}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '9999px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface-card)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {t('workspace.upload_photo')}
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarUrl('');
                        void handleAutoSaveProfile({ avatarUrl: '' });
                        notify.info(t('config.avatar_removed_title'), t('config.avatar_removed_msg'));
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '9999px',
                        border: '1px solid rgba(200, 109, 81, 0.3)',
                        background: 'rgba(200, 109, 81, 0.08)',
                        color: 'var(--color-accent-coral, #C86D51)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {t('config.remove_photo_btn')}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  onBlur={() => void handleAutoSaveProfile({ avatarUrl })}
                  placeholder={t('config.avatar_url_placeholder')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-main)',
                    color: 'var(--color-text-primary)',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono, monospace)',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Username & Email Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div>
              <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase' }}>
                {t('auth.username_placeholder')}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onBlur={() => void handleAutoSaveProfile({ username })}
                required
                placeholder={t('config.traveler_username_placeholder')}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-main)',
                  color: 'var(--color-text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase' }}>
                {t('config.email_address_label')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => void handleAutoSaveProfile({ email })}
                placeholder="name@domain.com"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-main)',
                  color: 'var(--color-text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Password Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div>
              <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase' }}>
                {t('config.new_passphrase_label')}
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('config.leave_blank_unchanged_placeholder')}
                  autoComplete="new-password"
                  style={{
                    width: '100%',
                    padding: '9px 36px 9px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-main)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? t('config.hide_passphrase_aria') : t('config.show_passphrase_aria')}
                  title={showPassword ? t('config.hide_passphrase_aria') : t('config.show_passphrase_aria')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    padding: '4px',
                    cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                  }}
                >
                  {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase' }}>
                {t('config.confirm_passphrase_label')}
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('config.confirm_passphrase_placeholder')}
                  autoComplete="new-password"
                  style={{
                    width: '100%',
                    padding: '9px 36px 9px 12px',
                    borderRadius: '8px',
                    border: isPasswordMismatch
                      ? '1px solid var(--color-danger, #B3261E)'
                      : '1px solid var(--color-border)',
                    background: 'var(--color-bg-main)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? t('config.hide_confirm_passphrase_aria') : t('config.show_confirm_passphrase_aria')}
                  title={showConfirmPassword ? t('config.hide_confirm_passphrase_aria') : t('config.show_confirm_passphrase_aria')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    padding: '4px',
                    cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                  }}
                >
                  {showConfirmPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', gap: '12px' }}>
            <div>
              {isPasswordMismatch ? (
                <span
                  data-testid="password-mismatch-error"
                  style={{
                    color: 'var(--color-danger, #B3261E)',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  {t('config.passwords_dont_match')}
                </span>
              ) : isPasswordTooShort ? (
                <span
                  data-testid="password-length-error"
                  style={{
                    color: 'var(--color-danger, #B3261E)',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  {t('config.password_min_length_long')}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleUpdatePassword}
              disabled={!isPasswordValid || isUpdatingPassword}
              style={{
                marginLeft: 'auto',
                padding: '8px 24px',
                borderRadius: '8px',
                border: isPasswordValid
                  ? '1px solid var(--color-accent-primary, #0F4C5C)'
                  : '1px solid var(--color-border, #E2DDD5)',
                backgroundColor: isPasswordValid
                  ? 'var(--color-accent-primary, #0F4C5C)'
                  : 'var(--color-surface-sunken, #CAD2D3)',
                color: isPasswordValid
                  ? '#FFFFFF'
                  : 'var(--color-text-muted, #718096)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 700,
                letterSpacing: '0.06em',
                cursor: isPasswordValid && !isUpdatingPassword ? 'pointer' : 'not-allowed',
                transition: 'all 0.18s ease',
                boxShadow: isPasswordValid ? '0 2px 6px rgba(15, 76, 92, 0.25)' : 'none',
              }}
            >
              {t('config.save_upper')}
            </button>
          </div>
        </div>
      </SettingsCardFrame>
      </DemoFeatureGate>

      {/* 3. Display Language & Locales Card */}
      <SettingsCardFrame
        title={t('config.display_language_title')}
        subtitle={t('config.display_language_subtitle')}
        innerTitle={t('config.display_language_inner')}
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
                {activeLocaleName}
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', display: 'block' }}>
                {t('config.direction_label', {
                  direction:
                    activeLocaleInfo?.direction === 'rtl'
                      ? t('config.direction_rtl')
                      : t('config.direction_ltr'),
                })}
              </span>
            </div>
          </div>

          <button
            type="button"
            data-testid="change-language-button"
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
            {t('nav.change_language')}
          </button>
        </div>
      </SettingsCardFrame>

      {/* 4. Home Jurisdiction & Statutory Holidays Card */}
      <SettingsCardFrame
        title={t('config.home_jurisdiction_title')}
        subtitle={t('config.home_jurisdiction_subtitle')}
        innerTitle={t('config.home_jurisdiction_inner')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            {/* City Autocomplete */}
            <div ref={cityContainerRef} style={{ position: 'relative' }}>
              <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase' }}>
                {t('config.home_city_anchor_label')}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={cityQuery}
                  onChange={(e) => {
                    setCityQuery(e.target.value);
                    setHomeCity(e.target.value);
                    isCityFocusedRef.current = true;
                    setIsCityFocused(true);
                  }}
                  onBlur={() => {
                    if (cityQuery.trim() && cityQuery.trim() !== homeCity) {
                      setHomeCity(cityQuery.trim());
                      void handleAutoSaveProfile({ city: cityQuery.trim() });
                    }
                  }}
                  onFocus={() => {
                    isCityFocusedRef.current = true;
                    setIsCityFocused(true);
                    if (citySuggestions.length > 0) setIsCityDropdownOpen(true);
                  }}
                  placeholder={t('config.home_city_placeholder')}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-main)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                {isSearchingCity && (
                  <span
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '10px',
                      color: 'var(--color-text-muted)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {t('config.searching_upper')}
                  </span>
                )}
              </div>

              {isCityDropdownOpen && isCityFocused && citySuggestions.length > 0 && (
                <div
                  data-testid="city-suggestions-dropdown"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    backgroundColor: 'var(--color-surface-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
                    zIndex: 40,
                    maxHeight: '200px',
                    overflowY: 'auto',
                  }}
                >
                  {citySuggestions.map((item, idx) => (
                    <button
                      key={`${item.city}-${item.country}-${idx}`}
                      type="button"
                      onClick={() => handleSelectCitySuggestion(item)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--color-border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '12px',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{item.city}</span>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                        {item.country ? getCountryDisplayName(item.country, item.country_name || item.country, locale) : item.country_name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Country Selector */}
            <div>
              <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase' }}>
                {t('config.statutory_country_label')}
              </label>
              <button
                type="button"
                onClick={() => setIsCountryWheelOpen(true)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-bg-main)',
                  color: 'var(--color-text-primary)',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  textAlign: 'left',
                }}
                className="hover:border-primary transition-colors"
                title={t('config.change_statutory_country_title')}
                data-testid="statutory-country-button"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <FlagIcon countryCode={homeCountry || 'ES'} width={20} height={14} />
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeCountryName} ({homeCountry || 'ES'})
                  </span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </SettingsCardFrame>

      {/* 5. Currency & Monetary Conventions Card */}
      <SettingsCardFrame
        title={t('config.currency_conventions_title')}
        subtitle={t('config.currency_conventions_subtitle')}
        innerTitle={t('config.currency_conventions_inner')}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '30px', height: '22px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FlagIcon countryCode={activeCurrencyInfo.countryCode || 'EU'} size={26} />
            </div>
            <div>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {activeCurrencyInfo.code} — {getLocalizedCurrencyName(activeCurrencyInfo.code, locale)}
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', display: 'block' }}>
                {t('config.currency_symbol_iso', { symbol: activeCurrencyInfo.symbol })}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsCurrencyWheelOpen(true)}
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
            {t('config.change_base_currency_btn')}
          </button>
        </div>
      </SettingsCardFrame>

      {/* 6. Units & Time Standards Card */}
      <SettingsCardFrame
        title={t('config.units_time_title')}
        subtitle={t('config.units_time_subtitle')}
        innerTitle={t('config.units_time_inner')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Distance Standard */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', display: 'block' }}>
                {t('config.distance_standard_title')}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                {t('config.distance_standard_desc')}
              </span>
            </div>
            <SegmentedPill
              ariaLabel={t('config.distance_unit_aria')}
              value={distanceUnit}
              onChange={(val) => {
                setDistanceUnit(val);
                void handleAutoSaveProfile({ distance: val });
              }}
              options={[
                { value: 'km', label: t('config.unit_metric_title'), sublabel: t('config.unit_metric_sublabel') },
                { value: 'mi', label: t('config.unit_imperial_title'), sublabel: t('config.unit_imperial_sublabel') },
              ]}
            />
          </div>

          {/* Temperature Standard */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', paddingTop: '10px', borderTop: '1px solid var(--color-border-subtle)' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', display: 'block' }}>
                {t('config.temperature_standard_title')}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                {t('config.temperature_standard_desc')}
              </span>
            </div>
            <SegmentedPill
              ariaLabel={t('config.temperature_unit_aria')}
              value={tempUnit}
              onChange={(val) => {
                setTempUnit(val);
                void handleAutoSaveProfile({ temp: val });
              }}
              options={[
                { value: 'C', label: t('config.temp_celsius_label'), sublabel: '°C' },
                { value: 'F', label: t('config.temp_fahrenheit_label'), sublabel: '°F' },
              ]}
            />
          </div>

          {/* Clock Format */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', paddingTop: '10px', borderTop: '1px solid var(--color-border-subtle)' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', display: 'block' }}>
                {t('config.clock_presentation_title')}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                {t('config.clock_presentation_desc')}
              </span>
            </div>
            <SegmentedPill
              ariaLabel={t('config.clock_format_aria')}
              value={clockFormat}
              onChange={(val) => {
                setClockFormat(val);
                void handleAutoSaveProfile({ clock: val });
              }}
              options={[
                { value: '24h', label: t('config.clock_24h_label'), sublabel: '14:30' },
                { value: '12h', label: t('config.clock_12h_label'), sublabel: t('config.clock_12h_example') },
              ]}
            />
          </div>

          {/* Date Format */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', paddingTop: '10px', borderTop: '1px solid var(--color-border-subtle)' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', display: 'block' }}>
                {t('config.date_format_title')}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                {t('config.date_format_desc')}
              </span>
            </div>
            <SegmentedPill
              ariaLabel={t('config.date_format_aria')}
              value={dateFormat}
              onChange={(val) => {
                setDateFormat(val);
                void handleAutoSaveProfile({ date: val });
              }}
              options={[
                { value: 'YYYY-MM-DD', label: t('config.date_iso_label'), sublabel: 'YYYY-MM-DD' },
                { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
              ]}
            />
          </div>
        </div>
      </SettingsCardFrame>
      </div>

      {/* Language Picker Modal */}
      {isLanguagePickerOpen && (
        <LanguagePickerModal
          isOpen={isLanguagePickerOpen}
          onClose={() => setIsLanguagePickerOpen(false)}
        />
      )}

      {/* Country Wheel Picker Modal */}
      {isCountryWheelOpen && (
        <CountryWheelPicker
          isOpen={isCountryWheelOpen}
          onClose={() => setIsCountryWheelOpen(false)}
          selectedCountry={homeCountry}
          countries={supportedCountries}
          onSelectCountry={(country) => {
            handleCountryChange(country.code, country.name);
            setIsCountryWheelOpen(false);
          }}
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
            void handleAutoSaveProfile({ currency: curr.code });
          }}
        />
      )}
    </div>
  );
}
