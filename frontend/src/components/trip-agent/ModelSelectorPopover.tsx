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
import { ProviderBrandIcon } from '@/components/ProviderIcons';


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
                  {fam.provKey === 'ollama' && llmConfig?.hardware_profile && (
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', fontWeight: 400 }}>
                      {llmConfig.hardware_profile.recommended_num_ctx} ctx • {llmConfig.hardware_profile.total_ram_gb}GB RAM
                    </span>
                  )}
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

                    const isRecommended =
                      fam.provKey === 'ollama' &&
                      llmConfig?.hardware_profile?.recommended_model === modelName;

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
                          {isRecommended && (
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(56, 189, 248, 0.15)',
                                color: '#38bdf8',
                                fontWeight: 600,
                                letterSpacing: '0.02em',
                                marginLeft: '6px',
                              }}
                            >
                              Recommended
                            </span>
                          )}
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
