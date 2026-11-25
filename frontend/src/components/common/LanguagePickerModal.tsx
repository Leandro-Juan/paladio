"use client";

import React, { useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { SHIPPED_LOCALES, LocaleInfo } from '@/utils/locales';
import { useAuth } from '@/contexts/AuthContext';
import { updateProfileApi } from '@/utils/api';
import { WheelDialPicker } from './WheelDialPicker';

export interface LanguagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLanguage?: string;
  onSelectLanguage?: (locale: LocaleInfo) => void;
  title?: string;
}

export function LanguagePickerModal({
  isOpen,
  onClose,
  selectedLanguage,
  onSelectLanguage,
  title,
}: LanguagePickerModalProps) {
  const { locale, setLocale, t } = useTranslation();
  const { user, refreshUser } = useAuth();

  const activeCode = selectedLanguage || locale || 'en';

  // Items: put active language first, followed by remaining shipped locales
  const items = useMemo(() => {
    const list = [...SHIPPED_LOCALES];
    const defCode = activeCode.toLowerCase();
    const activeItem = list.find((i) => i.code.toLowerCase() === defCode);
    const remaining = list.filter((i) => i.code.toLowerCase() !== defCode);

    const result: LocaleInfo[] = [];
    if (activeItem) result.push(activeItem);
    result.push(...remaining);
    return result;
  }, [activeCode]);

  const getLocalizedName = (item: LocaleInfo) => {
    const key = `languages.${item.code}`;
    const translated = t(key);
    return translated === key ? item.name : translated;
  };

  const handleSelectLocale = async (targetLocale: LocaleInfo) => {
    try {
      if (onSelectLanguage) {
        onSelectLanguage(targetLocale);
      }

      if (targetLocale.code !== locale) {
        await setLocale(targetLocale.code);

        // Persist to user profile if logged in
        if (user) {
          const existingPrefs = user.preferences || {};
          await updateProfileApi({
            preferences: {
              ...existingPrefs,
              preferred_language: targetLocale.code,
            },
          });
          if (refreshUser) {
            await refreshUser();
          }
        }
      }
    } catch (err) {
      console.error('Failed to update language:', err);
    }
  };

  return (
    <WheelDialPicker<LocaleInfo>
      isOpen={isOpen}
      onClose={onClose}
      title={title || t('nav.change_language')}
      subtitle={t('config.wheel_subtitle')}
      searchPlaceholder={t('config.search_language_placeholder')}
      items={items}
      selectedId={activeCode}
      getItemId={(item) => item.code}
      keyExtractor={(item) => item.code}
      getItemSearchText={(item) => `${item.name} ${getLocalizedName(item)} ${item.nativeName} ${item.code}`}
      onSelect={handleSelectLocale}
      renderItem={(item, isCenter) => (
        <>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '34px',
              padding: '2px 6px',
              height: '22px',
              borderRadius: '4px',
              backgroundColor: isCenter ? 'rgba(239, 68, 68, 0.16)' : 'rgba(239, 68, 68, 0.08)',
              color: '#EF4444',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono, monospace)',
              border: '1px solid rgba(239, 68, 68, 0.28)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {item.code.toUpperCase()}
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
            <span
              style={{
                fontFamily: 'var(--font-display, "Jost", sans-serif)',
                fontWeight: isCenter ? 650 : 500,
                fontSize: isCenter ? '0.96rem' : '0.88rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flexShrink: 0,
                color: isCenter
                  ? 'var(--color-text-primary, var(--color-text-main, #111827))'
                  : 'var(--color-text-muted, #6B7280)',
              }}
            >
              {getLocalizedName(item)}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.74rem',
                fontWeight: isCenter ? 600 : 400,
                color: isCenter ? 'var(--color-accent-teal-deep, #0F4C5C)' : 'var(--color-text-muted, #9CA3AF)',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flexShrink: 1,
              }}
            >
              {item.nativeName} {item.direction === 'rtl' ? t('config.rtl_badge') : ''}
            </span>
          </div>
        </>
      )}
      renderActionButtonContent={(item) => (
        <>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: '#FFFFFF',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono, monospace)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {item.code.toUpperCase()}
          </span>
          <span
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {t('config.use_language_action', { name: getLocalizedName(item), nativeName: item.nativeName })}
          </span>
        </>
      )}
    />
  );
}

export const LanguageWheelPicker = LanguagePickerModal;
