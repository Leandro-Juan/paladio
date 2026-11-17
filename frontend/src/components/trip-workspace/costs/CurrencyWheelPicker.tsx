"use client";

import React, { useMemo } from 'react';
import { CurrencyInfo, SUPPORTED_CURRENCY_LIST } from '@/utils/currencyResolver';
import { FlagIcon } from './FlagIcon';
import { WheelDialPicker } from '@/components/common/WheelDialPicker';

export interface CurrencyWheelPickerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCurrency: string;
  onSelectCurrency: (currency: CurrencyInfo) => void;
  title?: string;
  defaultCurrency?: string;
  destinationCurrency?: string;
}

export function CurrencyWheelPicker({
  isOpen,
  onClose,
  selectedCurrency,
  onSelectCurrency,
  title = 'Select Currency',
  defaultCurrency,
  destinationCurrency,
}: CurrencyWheelPickerProps) {
  // Currencies list: 1st is default currency, 2nd is destination currency, followed by rest alphabetically
  const items = useMemo(() => {
    const list = [...SUPPORTED_CURRENCY_LIST];
    const defCode = (defaultCurrency || 'EUR').toUpperCase();
    const destCode = destinationCurrency ? destinationCurrency.toUpperCase() : null;

    const defItem = list.find((i) => i.code.toUpperCase() === defCode);
    const destItem = destCode && destCode !== defCode ? list.find((i) => i.code.toUpperCase() === destCode) : null;

    const remaining = list
      .filter((i) => i.code.toUpperCase() !== defCode && (!destCode || i.code.toUpperCase() !== destCode))
      .sort((a, b) => a.country.localeCompare(b.country));

    const result: CurrencyInfo[] = [];
    if (defItem) result.push(defItem);
    if (destItem) result.push(destItem);
    result.push(...remaining);
    return result;
  }, [defaultCurrency, destinationCurrency]);

  return (
    <WheelDialPicker<CurrencyInfo>
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle="Drag, scroll, or search to spin wheel"
      searchPlaceholder="Search country or currency..."
      items={items}
      selectedId={selectedCurrency}
      getItemId={(item) => item.code}
      keyExtractor={(item) => `${item.code}-${item.country}`}
      getItemSearchText={(item) => `${item.country} ${item.code} ${item.name}`}
      onSelect={onSelectCurrency}
      renderItem={(item, isCenter) => (
        <>
          <FlagIcon countryCode={item.countryCode} width={24} height={16} />
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
              {item.country}
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
              {item.code} ({item.symbol})
            </span>
          </div>
        </>
      )}
      renderActionButtonContent={(item) => (
        <>
          <FlagIcon countryCode={item.countryCode} width={20} height={14} />
          <span
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Use {item.country} — {item.code} ({item.symbol})
          </span>
        </>
      )}
    />
  );
}
