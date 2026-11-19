"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  fetchLlmConfigApi,
  updateLlmConfigApi,
  testLlmConfigApi,
  LLMConfigResponse,
  SupportedProviderMeta,
  TestLLMConnectionResponse,
} from '@/utils/api';
import { Spinner, CheckIcon, ChevronDownIcon, ProviderBrandIcon } from '@/components/icons';
import { notify } from '@/utils/notify';

export function LlmConfigCard() {
  const { t } = useTranslation();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestLLMConnectionResponse | null>(null);

  const [activeConfig, setActiveConfig] = useState<LLMConfigResponse | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('ollama');
  const [selectedModel, setSelectedModel] = useState<string>('qwen2.5:3b');
  const [customModel, setCustomModel] = useState<string>('');
  const [isCustomModelMode, setIsCustomModelMode] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [openMenuProvider, setOpenMenuProvider] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const data = await fetchLlmConfigApi();
      setActiveConfig(data);
      setSelectedProvider(data.provider);
      setSelectedModel(data.model);
      setBaseUrl(data.base_url || '');

      const meta = data.supported_providers?.[data.provider];
      const isKnownModel = meta?.recommended_models?.includes(data.model);
      if (!isKnownModel && data.model) {
        setIsCustomModelMode(true);
        setCustomModel(data.model);
      } else {
        setIsCustomModelMode(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : tRef.current('config.llm_load_failed');
      notify.error(tRef.current('config.llm_config_error'), msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    fetchLlmConfigApi()
      .then((data) => {
        if (!ignore) {
          setActiveConfig(data);
          setSelectedProvider(data.provider);
          setSelectedModel(data.model);
          setBaseUrl(data.base_url || '');

          const meta = data.supported_providers?.[data.provider];
          const isKnownModel = meta?.recommended_models?.includes(data.model);
          if (!isKnownModel && data.model) {
            setIsCustomModelMode(true);
            setCustomModel(data.model);
          } else {
            setIsCustomModelMode(false);
          }
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : tRef.current('config.llm_load_failed');
          notify.error(tRef.current('config.llm_config_error'), msg);
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  // Close custom model dropdown on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest('[data-llm-dropdown]')) {
        setOpenMenuProvider(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenuProvider(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleActivateModel = async (provKey: string, modelName: string) => {
    setSelectedProvider(provKey);
    setSelectedModel(modelName);
    setOpenMenuProvider(null);
    setTestResult(null);

    setSaving(true);
    try {
      const res = await updateLlmConfigApi({
        provider: provKey,
        model: modelName,
      });
      if (res.status === 'success') {
        notify.success(
          t('config.llm_saved_title'),
          t('config.llm_active_provider_msg', { provider: provKey.toUpperCase(), model: modelName })
        );
        await loadConfig();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('config.llm_switch_failed');
      notify.error(t('config.llm_activation_failed'), msg);
    } finally {
      setSaving(false);
    }
  };

  const handleProviderSelect = async (provKey: string) => {
    setSelectedProvider(provKey);
    setTestResult(null);
    setOpenMenuProvider(null);

    const configured = activeConfig?.configured_providers?.[provKey];
    if (configured) {
      const targetModel =
        configured.active_model ||
        configured.available_models[0] ||
        activeConfig?.supported_providers?.[provKey]?.default_model ||
        selectedModel;
      setSelectedModel(targetModel);
      setIsCustomModelMode(false);
      setCustomModel('');
      setBaseUrl(activeConfig?.supported_providers?.[provKey]?.default_base_url || '');

      setSaving(true);
      try {
        const res = await updateLlmConfigApi({
          provider: provKey,
          model: targetModel,
        });
        if (res.status === 'success') {
          notify.success(
            t('config.llm_saved_title'),
            t('config.llm_active_provider_msg', { provider: provKey.toUpperCase(), model: targetModel })
          );
          await loadConfig();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : t('config.llm_save_failed');
        notify.error(t('config.save_failed_title'), msg);
      } finally {
        setSaving(false);
      }
      return;
    }

    const meta = activeConfig?.supported_providers?.[provKey];
    if (meta) {
      setSelectedModel(meta.default_model);
      setIsCustomModelMode(false);
      setCustomModel('');
      setBaseUrl(meta.default_base_url || '');
    }
  };

  const handleAutoSaveUnconfigured = async (newKey?: string, newModel?: string, newUrl?: string) => {
    const k = (newKey !== undefined ? newKey : apiKey).trim();
    const m = (newModel !== undefined ? newModel : (isCustomModelMode ? customModel : selectedModel)).trim();
    const u = (newUrl !== undefined ? newUrl : baseUrl).trim();

    if (!m) return;
    const reqKey = activeConfig?.supported_providers?.[selectedProvider]?.requires_key ?? true;
    if (reqKey && !k) return;

    setSaving(true);
    try {
      const res = await updateLlmConfigApi({
        provider: selectedProvider,
        model: m,
        api_key: k ? k : null,
        base_url: u ? u : null,
      });

      if (res.status === 'success') {
        notify.success(
          t('config.llm_saved_title'),
          t('config.llm_active_provider_msg', { provider: selectedProvider.toUpperCase(), model: m })
        );
        setApiKey('');
        await loadConfig();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('config.llm_save_failed');
      notify.error(t('config.save_failed_title'), msg);
    } finally {
      setSaving(false);
    }
  };

  const handleModelSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setIsCustomModelMode(true);
      setCustomModel(selectedModel);
    } else {
      setIsCustomModelMode(false);
      setSelectedModel(val);
      void handleAutoSaveUnconfigured(apiKey, val, baseUrl);
    }
  };

  const handleTestConnection = async () => {
    const effectiveModel = isCustomModelMode ? customModel.trim() : selectedModel.trim();
    if (!effectiveModel) {
      notify.error(t('config.llm_missing_model_title'), t('config.llm_missing_model_msg'));
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const result = await testLlmConfigApi({
        provider: selectedProvider,
        model: effectiveModel,
        api_key: apiKey.trim() ? apiKey.trim() : null,
        base_url: baseUrl.trim() ? baseUrl.trim() : null,
      });
      setTestResult(result);
      if (result.success) {
        notify.success(
          t('config.connection_successful_title'),
          t('config.llm_latency_response', { latency: result.latency_ms ?? 0, response: result.response ?? '' })
        );
        if (apiKey.trim() || baseUrl.trim() || !activeConfig?.configured_providers?.[selectedProvider]) {
          void handleAutoSaveUnconfigured(apiKey, effectiveModel, baseUrl);
        }
      } else {
        notify.error(t('config.connection_failed_title'), result.error || t('config.llm_rejected_msg'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('config.llm_test_error');
      setTestResult({
        success: false,
        error: msg,
        provider: selectedProvider,
        model: effectiveModel,
      });
      notify.error(t('config.connection_failed_title'), msg);
    } finally {
      setTesting(false);
    }
  };

  const activeProviderMeta: SupportedProviderMeta | undefined =
    activeConfig?.supported_providers?.[selectedProvider];

  const requiresKey = activeProviderMeta ? activeProviderMeta.requires_key : selectedProvider !== 'ollama';

  if (loading) {
    return (
      <div className="bg-surface border-subtle" style={{ borderRadius: '10px', padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Spinner size={16} />
          <span className="font-mono text-muted" style={{ fontSize: '12px' }}>
            {t('config.llm_loading')}
          </span>
        </div>
      </div>
    );
  }

  const supportedMap = activeConfig?.supported_providers || {};
  const providerList = Object.entries(supportedMap);

  return (
    <div className="bg-surface border-subtle" style={{ borderRadius: '10px', padding: '1.5rem', marginBottom: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <h3 className="font-display" style={{ fontSize: '1.2rem', margin: 0 }}>
            {t('config.llm_card_title')}
          </h3>
        </div>

        {/* Current Active Baseline Badge */}
        {activeConfig && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              className="font-mono"
              style={{
                fontSize: '11px',
                padding: '4px 8px',
                borderRadius: '4px',
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border-subtle)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <ProviderBrandIcon provider={activeConfig.provider} size={14} />
              {t('config.llm_active_prefix')} <strong>{activeConfig.provider.toUpperCase()}</strong> ({activeConfig.model})
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: '4px',
                background: activeConfig.has_api_key
                  ? 'var(--color-accent-teal-soft, rgba(13, 148, 136, 0.12))'
                  : 'var(--color-success-soft, rgba(16, 185, 129, 0.12))',
                color: activeConfig.has_api_key
                  ? 'var(--color-accent-teal, #0D9488)'
                  : 'var(--color-success)',
              }}
            >
              {activeConfig.has_api_key
                ? t('config.llm_key_active_badge', { maskedKey: activeConfig.masked_api_key ?? '' })
                : t('config.llm_default_local_badge')}
            </span>
          </div>
        )}
      </div>

      {/* Provider Selector Grid */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label className="font-mono text-xs text-muted" style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
          {t('config.llm_select_provider_label')}
        </label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '8px',
          }}
        >
          {providerList.map(([key, meta]) => {
            const isSelected = selectedProvider === key;
            const configuredMeta = activeConfig?.configured_providers?.[key];
            const isConfigured = Boolean(configuredMeta);
            const isCurrentlyActive = activeConfig?.provider === key;
            const availableModels =
              configuredMeta?.available_models && configuredMeta.available_models.length > 0
                ? configuredMeta.available_models
                : meta.recommended_models || [];

            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => handleProviderSelect(key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleProviderSelect(key);
                  }
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: isSelected
                    ? '2px solid var(--color-accent-teal, #0D9488)'
                    : isConfigured
                    ? '1px solid var(--color-accent-teal-soft, rgba(13, 148, 136, 0.4))'
                    : '1px solid var(--color-border-subtle)',
                  background: isSelected
                    ? 'var(--color-accent-teal-soft, rgba(13, 148, 136, 0.12))'
                    : 'var(--color-surface-card)',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ProviderBrandIcon provider={key} size={18} />
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '13px' }}>
                      {meta.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isSelected && <CheckIcon size={14} color="var(--color-accent-teal, #0D9488)" />}
                    {isConfigured && (
                      <button
                        type="button"
                        data-llm-dropdown
                        aria-label={t('config.llm_available_models_aria', { name: meta.name })}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuProvider(openMenuProvider === key ? null : key);
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '2px 4px',
                          borderRadius: '4px',
                          border: '1px solid var(--color-border-subtle)',
                          background:
                            openMenuProvider === key
                              ? 'var(--color-accent-teal-soft, rgba(13, 148, 136, 0.2))'
                              : 'var(--color-surface)',
                          color:
                            openMenuProvider === key
                              ? 'var(--color-accent-teal, #0D9488)'
                              : 'var(--color-text-muted)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <ChevronDownIcon size={12} />
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {isCurrentlyActive ? (
                    <span className="font-mono" style={{ fontSize: '10px', color: 'var(--color-accent-teal, #0D9488)', fontWeight: 700 }}>
                      {t('config.llm_status_active_engine')}
                    </span>
                  ) : isConfigured ? (
                    <span className="font-mono" style={{ fontSize: '10px', color: 'var(--color-success, #10B981)', fontWeight: 600 }}>
                      ● {configuredMeta?.requires_key ? t('config.llm_status_key_saved') : t('config.llm_status_local_ready')}
                    </span>
                  ) : (
                    <span className="font-mono text-muted" style={{ fontSize: '10px' }}>
                      {meta.requires_key ? t('config.llm_status_requires_key') : t('config.llm_status_local_custom')}
                    </span>
                  )}
                </div>

                {/* Custom Model Picker Dropdown Menu */}
                {isConfigured && openMenuProvider === key && (
                  <div
                    data-llm-dropdown
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      zIndex: 60,
                      background: 'var(--color-surface-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                      padding: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      maxHeight: '220px',
                      overflowY: 'auto',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {availableModels.map((m) => {
                      const isCurrentActive =
                        isCurrentlyActive && (activeConfig?.model === m || selectedModel === m);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => handleActivateModel(key, m)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            borderRadius: '5px',
                            border: 'none',
                            background: isCurrentActive
                              ? 'var(--color-accent-teal-soft, rgba(13, 148, 136, 0.15))'
                              : 'transparent',
                            color: isCurrentActive
                              ? 'var(--color-accent-teal, #0D9488)'
                              : 'var(--color-text-primary)',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: isCurrentActive ? 700 : 400,
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                            transition: 'background 0.1s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (!isCurrentActive) {
                              e.currentTarget.style.background = 'var(--color-surface-hover, rgba(0,0,0,0.05))';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isCurrentActive) {
                              e.currentTarget.style.background = 'transparent';
                            }
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m}
                          </span>
                          {isCurrentActive && <CheckIcon size={12} color="var(--color-accent-teal, #0D9488)" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Configuration Form Rows - only displayed for providers that are not yet configured */}
      {!activeConfig?.configured_providers?.[selectedProvider] && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1rem',
            background: 'var(--color-surface-card)',
            padding: '1.25rem',
            borderRadius: '8px',
            border: '1px solid var(--color-border-subtle)',
            marginBottom: '1.25rem',
          }}
        >
          {/* Model Selection */}
          <div>
            <label className="font-mono text-xs text-muted" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
              {t('config.llm_model_identifier_label')}
            </label>
            {!isCustomModelMode ? (
              <select
                value={selectedModel}
                onChange={handleModelSelectChange}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                }}
              >
                {(activeProviderMeta?.recommended_models || [selectedModel]).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                <option value="__custom__">{t('config.llm_custom_model_option')}</option>
              </select>
            ) : (
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  onBlur={() => void handleAutoSaveUnconfigured(apiKey, customModel, baseUrl)}
                  placeholder={t('config.llm_custom_model_placeholder')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-subtle)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setIsCustomModelMode(false)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-subtle)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-secondary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  {t('config.llm_presets_btn')}
                </button>
              </div>
            )}
            <span className="font-mono text-muted" style={{ fontSize: '10px', display: 'block', marginTop: '4px' }}>
              {t('config.llm_default_model_hint', {
                provider: activeProviderMeta?.name || selectedProvider,
                model: activeProviderMeta?.default_model || t('config.llm_default_fallback'),
              })}
            </span>
          </div>

          {/* API Key Input */}
          <div>
            <div style={{ marginBottom: '6px' }}>
              <label className="font-mono text-xs text-muted" style={{ fontWeight: 600 }}>
                {requiresKey ? t('config.llm_api_key_required_label') : t('config.llm_api_key_optional_label')}
              </label>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  activeConfig?.configured_providers?.[selectedProvider]?.masked_key
                    ? t('config.llm_keeping_saved_key', {
                        key: activeConfig.configured_providers[selectedProvider].masked_key ?? '',
                      })
                    : activeConfig?.has_api_key && activeConfig.provider === selectedProvider
                    ? t('config.llm_keeping_current_key', {
                        key: activeConfig.masked_api_key ?? '',
                      })
                    : requiresKey
                    ? t('config.llm_api_key_placeholder_req')
                    : t('config.llm_api_key_placeholder_opt')
                }
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                }}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border-subtle)',
                  backgroundColor: 'var(--color-surface-hover)',
                  color: 'var(--color-text-primary)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {showApiKey ? t('config.hide_upper') : t('config.show_upper')}
              </button>
              <button
                type="button"
                onClick={() => void handleAutoSaveUnconfigured(apiKey, undefined, baseUrl)}
                disabled={saving || !apiKey.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--color-accent-teal, #0D9488)',
                  color: '#FFFFFF',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: saving || !apiKey.trim() ? 'not-allowed' : 'pointer',
                  opacity: saving || !apiKey.trim() ? 0.6 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                }}
              >
                {saving && <Spinner size={12} color="#FFFFFF" />}
                <span>{t('config.save_key_upper')}</span>
              </button>
            </div>
            <span className="font-mono text-muted" style={{ fontSize: '10px', display: 'block', marginTop: '4px' }}>
              {t('config.llm_key_storage_hint')}
            </span>
          </div>

          {/* Custom Base URL Input */}
          <div>
            <label className="font-mono text-xs text-muted" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
              {t('config.llm_base_url_label')}
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              onBlur={() => void handleAutoSaveUnconfigured(apiKey, undefined, baseUrl)}
              placeholder={activeProviderMeta?.default_base_url || 'https://api.example.com/v1'}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
              }}
            />
            <span className="font-mono text-muted" style={{ fontSize: '10px', display: 'block', marginTop: '4px' }}>
              {t('config.llm_base_url_hint')}
            </span>
          </div>
        </div>
      )}

      {/* Test Result Feedback Box (if any) */}
      {testResult && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '6px',
            background: testResult.success
              ? 'var(--color-success-soft, rgba(16, 185, 129, 0.1))'
              : 'var(--color-danger-soft, rgba(239, 68, 68, 0.1))',
            border: `1px solid ${
              testResult.success ? 'var(--color-success)' : 'var(--color-danger)'
            }`,
            marginBottom: '1.25rem',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            color: testResult.success ? 'var(--color-success)' : 'var(--color-danger)',
          }}
        >
          {testResult.success ? (
            <div>
              <strong>{t('config.llm_connection_verified_prefix')}</strong>{' '}
              {t('config.llm_connection_verified_body', {
                provider: testResult.provider.toUpperCase(),
                model: testResult.model,
                latency: testResult.latency_ms ?? 0,
              })}
            </div>
          ) : (
            <div>
              <strong>{t('config.llm_connection_failed_prefix')}</strong>{' '}
              {testResult.error || t('config.llm_auth_error_fallback')}
            </div>
          )}
        </div>
      )}

      {selectedProvider === 'ollama' && activeConfig?.hardware_profile && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '10px 14px',
            borderRadius: '6px',
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div>
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>{t('config.llm_host_hardware_prefix')} </span>
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {t('config.llm_hardware_ram_cores', {
                total: activeConfig.hardware_profile.total_ram_gb,
                avail: activeConfig.hardware_profile.available_ram_gb,
                swap: activeConfig.hardware_profile.swap_total_gb,
                cores: activeConfig.hardware_profile.cpu_logical_cores,
              })}
              {activeConfig.hardware_profile.has_gpu
                ? ` • ${activeConfig.hardware_profile.gpu_name || t('config.llm_gpu_fallback')}`
                : ` • ${t('config.llm_cpu_inference')}`}
            </span>
            {activeConfig.hardware_profile.memory_warning && (
              <div style={{ color: '#f59e0b', marginTop: '4px', fontSize: '11px' }}>
                {activeConfig.hardware_profile.memory_warning}
              </div>
            )}
          </div>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>
            {t('config.llm_recommended_model', {
              model: activeConfig.hardware_profile.recommended_model,
              ctx: activeConfig.hardware_profile.recommended_num_ctx,
            })}
          </span>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={testing || saving}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid var(--color-border-subtle)',
            background: 'var(--color-surface-card)',
            color: 'var(--color-text-primary)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            cursor: testing ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {testing && <Spinner size={12} />}
          {testing ? t('config.llm_testing_btn') : t('config.llm_test_connection_btn')}
        </button>
      </div>
    </div>
  );
}
