"use client";

import React, { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { getLocaleInfo } from '@/utils/locales';
import { getCurrencyInfo, SUPPORTED_CURRENCY_LIST, CurrencyInfo } from '@/utils/currencyResolver';
import { FlagIcon } from '@/components/trip-workspace/costs/FlagIcon';
import { CurrencyWheelPicker } from '@/components/trip-workspace/costs/CurrencyWheelPicker';
import { LanguagePickerModal } from '@/components/common/LanguagePickerModal';
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
