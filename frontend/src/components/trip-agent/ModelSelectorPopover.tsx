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

  if (p.includes('gemini') || p.includes('google')) {
    // Official Google Gemini 4-Point Sparkle Icon with signature gradient
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id="geminiSparkleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1BA1E3" />
            <stop offset="45%" stopColor="#5185EC" />
            <stop offset="85%" stopColor="#9B72CB" />
            <stop offset="100%" stopColor="#D96570" />
          </linearGradient>
        </defs>
        <path
          d="M12 2C12 7.523 7.523 12 2 12C7.523 12 12 16.477 12 22C12 16.477 16.477 12 22 12C16.477 12 12 7.523 12 2Z"
          fill="url(#geminiSparkleGrad)"
        />
      </svg>
    );
  }

  if (p.includes('openai') || p.includes('gpt')) {
    // Official OpenAI Logomark in sleek charcoal
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="#111827" style={{ flexShrink: 0 }}>
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 8.654a4.473 4.473 0 0 1 2.37-1.99v5.679a.763.763 0 0 0 .382.673l5.82 3.364-2.02 1.168a.075.075 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 8.654zm16.597 3.855l-5.833-3.387L15.119 8a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.669zm2.01-4.323l-.143-.085-4.773-2.782a.776.776 0 0 0-.785 0L9.409 8.688V6.355a.088.088 0 0 1 .038-.062l4.839-2.79a4.5 4.5 0 0 1 6.66 4.828zM11.055 9.493l2.87-1.656 2.868 1.656v3.313l-2.868 1.656-2.87-1.656z" />
      </svg>
    );
  }

  if (p.includes('anthropic') || p.includes('claude')) {
    // Official Anthropic Claude Radiating Sunburst Spark
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.1" strokeLinecap="round" style={{ flexShrink: 0 }}>
        <line x1="12" y1="2.5" x2="12" y2="21.5" />
        <line x1="2.5" y1="12" x2="21.5" y2="12" />
        <line x1="5.28" y1="5.28" x2="18.72" y2="18.72" />
        <line x1="18.72" y1="5.28" x2="5.28" y2="18.72" />
        <line x1="8.2" y1="3.2" x2="15.8" y2="20.8" />
        <line x1="15.8" y1="3.2" x2="8.2" y2="20.8" />
        <line x1="3.2" y1="8.2" x2="20.8" y2="15.8" />
        <line x1="3.2" y1="15.8" x2="20.8" y2="8.2" />
      </svg>
    );
  }

  if (p.includes('ollama')) {
    // Official Ollama Llama Silhouette
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="#0F4C5C" style={{ flexShrink: 0 }}>
        <path d="M14 3h-2a2 2 0 0 0-2 2v2H9a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h1v5a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-5h1a3 3 0 0 0 3-3v-2a3 3 0 0 0-3-3h-1V5a2 2 0 0 0-2-2zm-2 2h2v2h-2V5zm-2.5 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm5 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
      </svg>
    );
  }

  if (p.includes('groq') || p.includes('xai')) {
    // Official Grok / xAI Slash-Circle
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="9" />
        <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" strokeWidth="2.4" />
      </svg>
    );
  }

  if (p.includes('deepseek')) {
    // Official DeepSeek Leaping Dolphin
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="#1E60F6" style={{ flexShrink: 0 }}>
        <path d="M21.5 11.8c-.8-1.5-2.2-2.8-3.8-3.5-2.1-.9-4.5-.8-6.6-.1-1.8.6-3.4 1.7-4.7 3.1l-2.9 3.2c-.4.4-.2 1.1.3 1.2.6.1 1.2-.1 1.6-.5l2.2-2.4c1.1-1.2 2.6-2.1 4.2-2.5 1.7-.4 3.5-.3 5.1.4 1.1.5 2.1 1.3 2.8 2.3.3.4.8.6 1.3.4.5-.2.7-.8.5-1.3z" />
        <circle cx="16.5" cy="10" r="1.2" fill="#FFFFFF" />
      </svg>
    );
  }

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

  // Extract families: ONLY show the ones already available (configured with API key or local sovereign)
  const families = useMemo(() => {
    const configured = llmConfig?.configured_providers || {};
    const supported = llmConfig?.supported_providers || {};

    const availableList: Array<{
      provKey: string;
      name: string;
      models: string[];
    }> = [];

    const configuredEntries = Object.entries(configured);

    if (configuredEntries.length > 0) {
      for (const [provKey, confInfo] of configuredEntries) {
        // Only include if it doesn't require a key or has a configured key
        const isAvailable = !confInfo.requires_key || Boolean(confInfo.masked_key);
        if (isAvailable) {
          const meta = supported[provKey];
          const models = provKey === 'ollama' && confInfo.available_models && confInfo.available_models.length > 0
            ? confInfo.available_models
            : Array.from(
                new Set([
                  ...(confInfo.available_models || []),
                  ...(meta?.recommended_models || []),
                  ...(meta?.default_model ? [meta.default_model] : []),
                ])
              );

          availableList.push({
            provKey,
            name: confInfo.name || meta?.name || provKey,
            models: models.length > 0 ? models : [confInfo.active_model || 'default'],
          });
        }
      }

      if (availableList.length > 0) {
        return availableList;
      }
    }

    // Fallback if configured_providers not yet loaded or returned:
    const activeProv = llmConfig?.provider || currentProvider || 'google';
    const activeName = supported[activeProv]?.name || (activeProv.includes('google') ? 'Google Gemini' : activeProv);
    const activeModels = supported[activeProv]?.recommended_models || [currentModel || 'gemini-3.8-flash'];

    const fallbackList = [
      {
        provKey: activeProv,
        name: activeName,
        models: activeModels,
      },
    ];

    if (activeProv !== 'ollama') {
      fallbackList.push({
        provKey: 'ollama',
        name: 'Ollama (Local)',
        models: ['qwen2.5:3b', 'qwen2.5:latest', 'llama3.2:latest', 'llama3.1:latest'],
      });
    }

    return fallbackList;
  }, [llmConfig, currentProvider, currentModel]);

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
                </div>

                <div className={styles.modelRows}>
                  {fam.models.map((modelName) => {
                    const isProviderMatch =
                      llmConfig?.provider === fam.provKey ||
                      currentProvider === fam.provKey ||
                      ((fam.provKey === 'google' || fam.provKey === 'google_genai') &&
                        (currentProvider === 'google' || currentProvider === 'google_genai' || llmConfig?.provider === 'google' || llmConfig?.provider === 'google_genai'));

                    const isSelected =
                      isProviderMatch &&
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
