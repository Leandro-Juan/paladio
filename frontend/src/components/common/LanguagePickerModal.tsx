"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useIsMounted } from '@/hooks/useIsMounted';
import { useTranslation } from '@/hooks/useTranslation';
import { ALL_LOCALES, LocaleInfo } from '@/utils/locales';
import { useAuth } from '@/contexts/AuthContext';
import { updateProfileApi } from '@/utils/api';
import { CheckIcon } from '@/components/icons';

interface LanguagePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LanguagePickerModal({ isOpen, onClose }: LanguagePickerModalProps) {
  const { locale, setLocale, t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const isMounted = useIsMounted();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredLocales = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return ALL_LOCALES;
    return ALL_LOCALES.filter(
      (l) =>
        l.code.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const handleSelectLocale = async (targetLocale: LocaleInfo) => {
    if (targetLocale.code === locale) {
      onClose();
      return;
    }

    setIsUpdating(true);
    try {
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
    } catch (err) {
      console.error('Failed to update language:', err);
    } finally {
      setIsUpdating(false);
      onClose();
    }
  };

  if (!isOpen || !isMounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('nav.change_language')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(8, 28, 36, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--color-surface-card, #FAF6F0)',
          borderRadius: '12px',
          border: '1px solid var(--color-border, #E2D9CC)',
          boxShadow: 'var(--shadow-lg)',
          padding: '1.5rem',
          maxWidth: '480px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="font-display" style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>
            {t('nav.change_language')}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('common.search')}
            style={{
              width: '100%',
              padding: '0.625rem 0.875rem',
              borderRadius: '8px',
              border: '1px solid var(--color-border, #E2D9CC)',
              background: 'var(--color-surface-raised, #FFFFFF)',
              color: 'var(--color-text-primary, #1A2B32)',
              fontSize: '0.9rem',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            autoFocus
          />
        </div>

        {/* Locale List */}
        <div
          style={{
            maxHeight: '360px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.375rem',
            paddingRight: '0.25rem',
          }}
        >
          {filteredLocales.map((item) => {
            const isSelected = item.code.toLowerCase() === locale.toLowerCase();

            return (
              <button
                key={item.code}
                onClick={() => handleSelectLocale(item)}
                disabled={isUpdating}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.625rem 0.875rem',
                  borderRadius: '6px',
                  border: isSelected
                    ? '1.5px solid var(--color-accent-teal, #0F4C5C)'
                    : '1px solid var(--color-border-subtle, rgba(15, 76, 92, 0.08))',
                  background: isSelected
                    ? 'var(--color-surface-card, #FAF6F0)'
                    : 'var(--color-surface-raised, #FFFFFF)',
                  color: 'var(--color-text-primary, #1A2B32)',
                  cursor: isUpdating ? 'wait' : 'pointer',
                  textAlign: 'start',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '0.15rem 0.4rem',
                      borderRadius: '4px',
                      background: 'var(--color-surface-muted, rgba(148, 163, 184, 0.15))',
                      color: 'var(--color-text-muted, #566B76)',
                      minWidth: '2.5rem',
                      textAlign: 'center',
                    }}
                  >
                    {item.code.toUpperCase()}
                  </span>
                  <div>
                    <div style={{ fontWeight: isSelected ? 600 : 500, fontSize: '0.925rem' }}>
                      {item.nativeName}
                    </div>
                    {item.nativeName !== item.name && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #566B76)' }}>
                        {item.name}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {item.direction === 'rtl' && (
                    <span
                      style={{
                        fontSize: '0.65rem',
                        padding: '0.1rem 0.35rem',
                        borderRadius: '3px',
                        background: 'var(--color-surface-muted, rgba(148, 163, 184, 0.15))',
                        color: 'var(--color-text-muted, #566B76)',
                      }}
                    >
                      RTL
                    </span>
                  )}
                  {isSelected && (
                    <span style={{ color: 'var(--color-accent-teal, #0F4C5C)' }}>
                      <CheckIcon size={16} />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer info */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.75rem',
            color: 'var(--color-text-muted, #566B76)',
            borderTop: '1px solid var(--color-border, #E2D9CC)',
            paddingTop: '0.75rem',
          }}
        >
          <span>{filteredLocales.length} languages available</span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-accent-teal, #0F4C5C)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
