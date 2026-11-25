"use client";

import React, { useState, useEffect, useRef } from 'react';
import { HELP_CATEGORIES, HelpArticle } from './helpData';
import { useTranslation } from '@/hooks/useTranslation';
import { useAnimatedMount } from '@/hooks/useAnimatedMount';

interface HelpSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectArticle: (article: HelpArticle) => void;
}

export function HelpSearchModal({ isOpen, onClose, onSelectArticle }: HelpSearchModalProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { shouldRender, dataState } = useAnimatedMount(isOpen, 150);

  // Flatten all articles
  const allArticles = HELP_CATEGORIES.flatMap((c) =>
    c.articles.map((a) => ({
      ...a,
      categoryName: c.title,
    }))
  );

  // Filter based on query across English originals and active translations
  const filtered = query.trim()
    ? allArticles.filter((a) => {
        const q = query.toLowerCase();
        const matchesQuery = (text?: string) =>
          Boolean(text && (text.toLowerCase().includes(q) || t(text).toLowerCase().includes(q)));
        return (
          matchesQuery(a.title) ||
          matchesQuery(a.excerpt) ||
          matchesQuery(a.tldr) ||
          matchesQuery(a.categoryName) ||
          matchesQuery(a.badge) ||
          a.sections.some(
            (s) =>
              matchesQuery(s.heading) ||
              s.content.some((p) => matchesQuery(p)) ||
              (s.parameterTable &&
                s.parameterTable.some(
                  (pt) => matchesQuery(pt.term) || matchesQuery(pt.meaning)
                ))
          )
        );
      })
    : allArticles.slice(0, 8); // show first 8 as suggestions

  const handleClose = React.useCallback(() => {
    setQuery('');
    setSelectedIndex(0);
    onClose();
  }, [onClose]);

  const handleSelect = React.useCallback((item: HelpArticle) => {
    setQuery('');
    setSelectedIndex(0);
    onSelectArticle(item);
    onClose();
  }, [onSelectArticle, onClose]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        handleSelect(filtered[selectedIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, handleClose, handleSelect]);

  if (!shouldRender) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('help.search_docs_aria')}
      className="paladio-modal-backdrop"
      data-state={dataState}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 76, 92, 0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onClick={handleClose}
    >
      <div
        className="paladio-modal-panel"
        data-state={dataState}
        style={{
          width: '90%',
          maxWidth: '600px',
          background: 'var(--color-surface-card, #FAF6F0)',
          borderRadius: '14px',
          border: '1px solid var(--color-border, #E2D9CC)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '75vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px 18px',
            borderBottom: '1px solid var(--color-border, #E2D9CC)',
            background: 'var(--color-surface-raised, #FFFFFF)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-ocean, #1B8FA6)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={t('help.search_modal_placeholder')}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '15px',
              color: 'var(--color-text-primary, #1A2B32)',
              background: 'transparent',
            }}
          />
          <kbd
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'var(--color-surface-hover, rgba(0,0,0,0.06))',
              border: '1px solid var(--color-border, #E2D9CC)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--color-text-muted, #566B76)',
            }}
          >
            {t('help.esc_key')}
          </kbd>
        </div>

        {/* Results List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--color-text-muted, #566B76)', fontSize: '13px' }}>
              {t('help.search_empty_state', {
                query,
                term1: '__EM1__',
                term2: '__EM2__',
                term3: '__EM3__',
                term4: '__EM4__',
                term5: '__EM5__',
              })
                .split(/(__EM[1-5]__)/)
                .map((part, idx) => {
                  if (part === '__EM1__') return <em key={idx}>{t('help.search_sample_transit')}</em>;
                  if (part === '__EM2__') return <em key={idx}>{t('help.search_sample_wallet')}</em>;
                  if (part === '__EM3__') return <em key={idx}>{t('help.search_sample_monitoring')}</em>;
                  if (part === '__EM4__') return <em key={idx}>{t('help.search_sample_lock')}</em>;
                  if (part === '__EM5__') return <em key={idx}>{t('help.search_sample_currency')}</em>;
                  return <React.Fragment key={idx}>{part}</React.Fragment>;
                })}
            </div>
          ) : (
            <ul className="paladio-stagger-list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {filtered.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: 'none',
                        background: isSelected ? 'var(--color-ocean, #1B8FA6)' : 'transparent',
                        color: isSelected ? '#FFFFFF' : 'var(--color-text-primary, #1A2B32)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        transition: 'background 0.1s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px' }}>{t(item.title)}</span>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            letterSpacing: '0.5px',
                            textTransform: 'uppercase',
                            color: isSelected ? 'rgba(255, 255, 255, 0.85)' : 'var(--color-text-muted, #566B76)',
                          }}
                        >
                          {t(item.categoryName)}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '11px',
                          color: isSelected ? 'rgba(255, 255, 255, 0.8)' : 'var(--color-text-muted, #566B76)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t(item.excerpt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer shortcuts info */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--color-border, #E2D9CC)',
            background: 'var(--color-surface-subtle, #FAF6F0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: 'var(--color-text-muted, #566B76)',
          }}
        >
          <span>{t('help.nav_arrows_hint')}</span>
          <span>{t('help.select_enter_hint')}</span>
        </div>
      </div>
    </div>
  );
}
