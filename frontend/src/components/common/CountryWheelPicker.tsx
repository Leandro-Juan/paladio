"use client";

import React, { useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { FlagIcon } from '@/components/trip-workspace/costs/FlagIcon';
import { CountryOption, DEFAULT_COUNTRIES, getCountryDisplayName } from '@/utils/countries';
import { WheelDialPicker } from './WheelDialPicker';

export interface CountryWheelPickerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCountry: string;
  onSelectCountry: (country: CountryOption) => void;
  title?: string;
  countries?: CountryOption[];
}

interface EnrichedCountryOption extends CountryOption {
  localizedName: string;
}

export function CountryWheelPicker({
  isOpen,
  onClose,
  selectedCountry,
  onSelectCountry,
  title,
  countries,
}: CountryWheelPickerProps) {
  const { t, locale } = useTranslation();
  const activeCode = (selectedCountry || 'ES').toUpperCase().trim();
  const resolvedTitle = title !== undefined ? t(title) : t('config.select_statutory_country');

  const items = useMemo(() => {
    const sourceList = countries && countries.length > 0 ? countries : DEFAULT_COUNTRIES;
    // Normalize and enrich each country with friendly display name, strictly filtering standard ISO 2-letter codes
    const enriched: EnrichedCountryOption[] = sourceList
      .filter((c) => c.code && c.code.trim().length === 2)
      .map((c) => {
        const code = c.code.toUpperCase().trim();
        const englishName =
          c.name && c.name !== c.code ? c.name : getCountryDisplayName(code, undefined, 'en');
        return {
          code,
          name: englishName,
          localizedName: getCountryDisplayName(code, englishName, locale),
        };
      });

    const defItem = enriched.find((i) => i.code === activeCode);
    const remaining = enriched
      .filter((i) => i.code !== activeCode)
      .sort((a, b) => a.localizedName.localeCompare(b.localizedName, locale));

    const result: EnrichedCountryOption[] = [];
    if (defItem) result.push(defItem);
    result.push(...remaining);
    return result;
  }, [countries, activeCode, locale]);

  return (
    <WheelDialPicker<EnrichedCountryOption>
      isOpen={isOpen}
      onClose={onClose}
      title={resolvedTitle}
      subtitle={t('config.wheel_subtitle')}
      searchPlaceholder={t('config.search_country_placeholder')}
      items={items}
      selectedId={activeCode}
      getItemId={(item) => item.code}
      keyExtractor={(item) => item.code}
      getItemSearchText={(item) => `${item.localizedName} ${item.name} ${item.code}`}
      onSelect={(item) => onSelectCountry({ code: item.code, name: item.name })}
      renderItem={(item, isCenter) => (
        <>
          <FlagIcon countryCode={item.code} width={24} height={16} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0 }}>
            <span
              style={{
                fontFamily: 'var(--font-display, "Jost", sans-serif)',
                fontWeight: isCenter ? 650 : 500,
                fontSize: isCenter ? '0.98rem' : '0.9rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: isCenter
                  ? 'var(--color-text-primary, var(--color-text-main, #111827))'
                  : 'var(--color-text-muted, #6B7280)',
              }}
            >
              {item.localizedName}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.74rem',
                fontWeight: isCenter ? 600 : 400,
                color: isCenter ? 'var(--color-accent-teal-deep, #0F4C5C)' : 'var(--color-text-muted, #9CA3AF)',
                letterSpacing: '0.02em',
              }}
            >
              ({item.code})
            </span>
          </div>
        </>
      )}
      renderActionButtonContent={(item) => (
        <>
          <FlagIcon countryCode={item.code} width={20} height={14} />
          <span
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {t('config.use_country_action', { name: item.localizedName, code: item.code })}
          </span>
        </>
      )}
    />
  );
}
