"use client";

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { LLMConfigResponse } from '@/utils/api';
import styles from './ModelSelectorPopover.module.css';

interface ModelSelectorPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  llmConfig: LLMConfigResponse | null;
  currentProvider: string;
  currentModel: string;
  onSelectModel: (provider: string, model: string) => void;
  isSwitching?: boolean;
}

// Brand SVG Icons
function ProviderBrandIcon({ provider, size = 18 }: { provider: string; size?: number }) {
  const p = provider.toLowerCase();

  if (p.includes('openai')) {
    // OpenAI Swirl Icon
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#10A37F', flexShrink: 0 }}>
        <path d="M12 2a10 10 0 0 0-7.07 17.07l1.41-1.41A8 8 0 1 1 20 12h-2a6 6 0 1 0-6 6v2a8 8 0 0 0 8-8c0-5.52-4.48-10-10-10Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  if (p.includes('anthropic') || p.includes('claude')) {
    // Anthropic Claude Starburst Icon (Terracotta / Orange)
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#D97706', flexShrink: 0 }}>
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (p.includes('gemini') || p.includes('google')) {
    // Google Gemini 4-point Sparkle Icon
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ color: '#2563EB', flexShrink: 0 }}>
        <path d="M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z" />
      </svg>
    );
  }

  if (p.includes('deepseek')) {
    // DeepSeek Whale / Wave Icon
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#3B82F6', flexShrink: 0 }}>
        <path d="M3 15c2.5-3 6-4 9-2s5 3 8 1" />
        <path d="M6 9c3-3 7-3 10-1" />
        <circle cx="17" cy="8" r="1.5" fill="currentColor" />
      </svg>
    );
  }

  if (p.includes('groq') || p.includes('xai')) {
    // Groq / Fast Inference Circle Slash Icon
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#F97316', flexShrink: 0 }}>
        <circle cx="12" cy="12" r="9" />
        <line x1="5.5" y1="5.5" x2="18.5" y2="18.5" />
      </svg>
    );
  }

  if (p.includes('ollama')) {
    // Ollama / Local Sovereign Engine Icon
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#0F4C5C', flexShrink: 0 }}>
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <circle cx="9" cy="10" r="1.5" fill="currentColor" />
        <circle cx="15" cy="10" r="1.5" fill="currentColor" />
        <path d="M9.5 15a3.5 3.5 0 0 0 5 0" />
      </svg>
    );
  }

  // Default / Other Multi-provider Icon
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#0F4C5C', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" />
      <polygon points="12 8 8 16 12 14 16 16 12 8" />
    </svg>
  );
}

export function ModelSelectorPopover({
  isOpen,
  onClose,
  llmConfig,
  currentProvider,
  currentModel,
  onSelectModel,
  isSwitching = false,
}: ModelSelectorPopoverProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    setTimeout(() => searchInputRef.current?.focus(), 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Extract families from configured_providers or fallback to supported_providers
  const families = useMemo(() => {
    const list: Array<{
      provKey: string;
      name: string;
      requiresKey: boolean;
      maskedKey: string | null;
      models: string[];
    }> = [];

    const configured = llmConfig?.configured_providers || {};
    const configuredKeys = Object.keys(configured);

    if (configuredKeys.length > 0) {
      for (const [provKey, info] of Object.entries(configured)) {
        list.push({
          provKey,
          name: info.name,
          requiresKey: info.requires_key,
          maskedKey: info.masked_key,
          models: info.available_models || [],
        });
      }
    } else if (llmConfig?.supported_providers) {
      for (const [provKey, meta] of Object.entries(llmConfig.supported_providers)) {
        list.push({
          provKey,
          name: meta.name,
          requiresKey: meta.requires_key,
          maskedKey: null,
          models: meta.recommended_models || [meta.default_model],
        });
      }
    }

    return list;
  }, [llmConfig]);

  // Filtered families based on search query
  const filteredFamilies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return families;

    return families
      .map((fam) => {
        const matchesFamilyName = fam.name.toLowerCase().includes(q) || fam.provKey.toLowerCase().includes(q);
        if (matchesFamilyName) {
          return fam;
        }
        const filteredModels = fam.models.filter((m) => m.toLowerCase().includes(q));
        if (filteredModels.length > 0) {
          return {
            ...fam,
            models: filteredModels,
          };
        }
        return null;
      })
      .filter((fam): fam is NonNullable<typeof fam> => fam !== null);
  }, [families, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className={styles.popoverOverlay}>
      <div ref={popoverRef} className={styles.popoverCard} role="dialog" aria-label="Select AI Model">
        {/* Search Header */}
        <div className={styles.searchHeader}>
          <div className={styles.searchBox}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={styles.searchIcon}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className={styles.clearSearchBtn}
                aria-label="Clear search"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Model Groups */}
        <div className={styles.modelListScroll}>
          {filteredFamilies.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No matching models found</p>
              <span>Try searching for &quot;gemini&quot;, &quot;claude&quot;, or &quot;gpt&quot;</span>
            </div>
          ) : (
            filteredFamilies.map((fam) => (
              <div key={fam.provKey} className={styles.familyGroup}>
                <div className={styles.familyHeader}>
                  <span className={styles.familyName}>{fam.name}</span>
                  <span className={styles.familyBadge}>
                    {fam.requiresKey ? (fam.maskedKey ? 'Configured' : 'API Key Required') : 'Sovereign'}
                  </span>
                </div>

                <div className={styles.modelRows}>
                  {fam.models.map((modelName) => {
                    const isSelected =
                      (llmConfig?.provider === fam.provKey || currentProvider === fam.provKey) &&
                      (llmConfig?.model === modelName || currentModel === modelName);

                    return (
                      <button
                        key={`${fam.provKey}-${modelName}`}
                        type="button"
                        disabled={isSwitching}
                        onClick={() => {
                          onSelectModel(fam.provKey, modelName);
                        }}
                        className={`${styles.modelItem} ${isSelected ? styles.modelItemSelected : ''}`}
                      >
                        <div className={styles.modelItemLeft}>
                          <ProviderBrandIcon provider={fam.provKey} size={18} />
                          <span className={styles.modelItemName}>{modelName}</span>
                        </div>

                        {isSelected && (
                          <div className={styles.selectedCheck}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className={styles.popoverFooter}>
          <a
            href="/config"
            target="_blank"
            rel="noreferrer"
            className={styles.footerLink}
            onClick={() => onClose()}
          >
            + Configure more providers in Settings
          </a>
        </div>
      </div>
    </div>
  );
}
