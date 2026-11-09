"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchLlmConfigApi,
  updateLlmConfigApi,
  testLlmConfigApi,
  LLMConfigResponse,
  SupportedProviderMeta,
  TestLLMConnectionResponse,
} from '@/utils/api';
import { Spinner, CheckIcon, ProviderBrandIcon } from '@/components/icons';
import { notify } from '@/utils/notify';

export function LlmConfigCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestLLMConnectionResponse | null>(null);

  const [activeConfig, setActiveConfig] = useState<LLMConfigResponse | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('ollama');
  const [selectedModel, setSelectedModel] = useState<string>('qwen2.5:latest');
  const [customModel, setCustomModel] = useState<string>('');
  const [isCustomModelMode, setIsCustomModelMode] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [baseUrl, setBaseUrl] = useState<string>('');

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
      const msg = err instanceof Error ? err.message : 'Failed to load LLM configuration';
      notify.error('LLM Config Error', msg);
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
          const msg = err instanceof Error ? err.message : 'Failed to load LLM configuration';
          notify.error('LLM Config Error', msg);
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  const handleProviderSelect = (provKey: string) => {
    setSelectedProvider(provKey);
    setTestResult(null);

    const meta = activeConfig?.supported_providers?.[provKey];
    if (meta) {
      setSelectedModel(meta.default_model);
      setIsCustomModelMode(false);
      setCustomModel('');
      setBaseUrl(meta.default_base_url || '');
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
    }
  };

  const handleSave = async () => {
    const effectiveModel = isCustomModelMode ? customModel.trim() : selectedModel.trim();
    if (!effectiveModel) {
      notify.error('Invalid Model', 'Please specify a valid model name.');
      return;
    }

    setSaving(true);
    try {
      const res = await updateLlmConfigApi({
        provider: selectedProvider,
        model: effectiveModel,
        api_key: apiKey.trim() ? apiKey.trim() : null,
        base_url: baseUrl.trim() ? baseUrl.trim() : null,
      });

      if (res.status === 'success') {
        notify.success('LLM Configuration Saved', `Active provider is now ${selectedProvider.toUpperCase()} (${effectiveModel}).`);
        setApiKey('');
        await loadConfig();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save LLM configuration';
      notify.error('Save Failed', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    const effectiveModel = isCustomModelMode ? customModel.trim() : selectedModel.trim();
    if (!effectiveModel) {
      notify.error('Missing Model', 'Please specify a model before testing.');
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
        notify.success('Connection Successful', `Latency: ${result.latency_ms}ms. Response: "${result.response}"`);
      } else {
        notify.error('Connection Failed', result.error || 'LLM API rejected the connection request.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error testing connection';
      setTestResult({
        success: false,
        error: msg,
        provider: selectedProvider,
        model: effectiveModel,
      });
      notify.error('Connection Failed', msg);
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
            LOADING LLM CONFIGURATION...
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
            AI &amp; LLM Provider Engine
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
              ACTIVE: <strong>{activeConfig.provider.toUpperCase()}</strong> ({activeConfig.model})
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
                ? `KEY ACTIVE — OLLAMA DISPATCHED (${activeConfig.masked_api_key})`
                : 'DEFAULT — LOCAL OLLAMA ACTIVE'}
            </span>
          </div>
        )}
      </div>

      {/* Configured & Ready Engines Visual Confirmation Showcase */}
      {(() => {
        const configuredEntries = Object.entries(activeConfig?.configured_providers || {});
        if (configuredEntries.length === 0) return null;

        return (
          <div
            style={{
              marginBottom: '1.5rem',
              padding: '1.1rem 1.25rem',
              borderRadius: '8px',
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--color-success, #10B981)',
                    display: 'inline-block',
                    boxShadow: '0 0 8px rgba(16, 185, 129, 0.4)',
                  }}
                />
                <span className="font-mono text-xs" style={{ fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-text-primary)' }}>
                  CONFIGURED &amp; AVAILABLE ENGINES
                </span>
              </div>
              <span className="font-mono text-muted" style={{ fontSize: '11px' }}>
                {configuredEntries.length} Engine{configuredEntries.length > 1 ? 's' : ''} Ready to Dispatch
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '10px',
              }}
            >
              {configuredEntries.map(([provKey, info]) => {
                const isActive = activeConfig?.provider === provKey;
                return (
                  <div
                    key={provKey}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      background: isActive
                        ? 'var(--color-accent-teal-soft, rgba(13, 148, 136, 0.08))'
                        : 'var(--color-surface)',
                      border: isActive
                        ? '1.5px solid var(--color-accent-teal, #0D9488)'
                        : '1px solid var(--color-border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ProviderBrandIcon provider={provKey} size={16} />
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: isActive ? 'var(--color-accent-teal, #0D9488)' : 'var(--color-success, #10B981)',
                          }}
                        />
                        <strong style={{ fontSize: '13px', fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}>
                          {info.name}
                        </strong>
                      </div>

                      {isActive ? (
                        <span
                          className="font-mono"
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'var(--color-accent-teal, #0D9488)',
                            color: '#FFFFFF',
                          }}
                        >
                          ACTIVE
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleProviderSelect(provKey)}
                          className="font-mono"
                          style={{
                            fontSize: '10px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            border: '1px solid var(--color-border-subtle)',
                            background: 'var(--color-surface-card)',
                            color: 'var(--color-text-secondary)',
                            cursor: 'pointer',
                          }}
                        >
                          SELECT
                        </button>
                      )}
                    </div>

                    {info.masked_key && (
                      <div className="font-mono text-muted" style={{ fontSize: '10px' }}>
                        Key: <code style={{ color: 'var(--color-text-primary)' }}>{info.masked_key}</code>
                      </div>
                    )}

                    <div>
                      <span className="font-mono text-muted" style={{ fontSize: '10px', display: 'block', marginBottom: '4px' }}>
                        AVAILABLE MODELS:
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {info.available_models.map((m) => {
                          const isCurrentActive = isActive && activeConfig?.model === m;
                          return (
                            <span
                              key={m}
                              className="font-mono"
                              style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                background: isCurrentActive
                                  ? 'var(--color-accent-teal-soft, rgba(13, 148, 136, 0.2))'
                                  : 'var(--color-surface-card)',
                                border: isCurrentActive
                                  ? '1px solid var(--color-accent-teal, #0D9488)'
                                  : '1px solid var(--color-border-subtle)',
                                color: isCurrentActive
                                  ? 'var(--color-accent-teal, #0D9488)'
                                  : 'var(--color-text-secondary)',
                                fontWeight: isCurrentActive ? 700 : 400,
                              }}
                            >
                              {m} {isCurrentActive && '✓'}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Provider Selector Grid */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label className="font-mono text-xs text-muted" style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
          SELECT LLM PROVIDER:
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

            return (
              <button
                key={key}
                type="button"
                onClick={() => handleProviderSelect(key)}
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
                  {isSelected && <CheckIcon size={14} color="var(--color-accent-teal, #0D9488)" />}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {isCurrentlyActive ? (
                    <span className="font-mono" style={{ fontSize: '10px', color: 'var(--color-accent-teal, #0D9488)', fontWeight: 700 }}>
                      ● ACTIVE ENGINE
                    </span>
                  ) : isConfigured ? (
                    <span className="font-mono" style={{ fontSize: '10px', color: 'var(--color-success, #10B981)', fontWeight: 600 }}>
                      ● {configuredMeta?.requires_key ? 'KEY SAVED' : 'LOCAL READY'}
                    </span>
                  ) : (
                    <span className="font-mono text-muted" style={{ fontSize: '10px' }}>
                      {meta.requires_key ? '○ Requires API Key' : 'Local / Custom'}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Configuration Form Rows */}
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
            MODEL IDENTIFIER:
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
              <option value="__custom__">{'-- Custom Model Name --'}</option>
            </select>
          ) : (
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="e.g. gpt-4o, claude-3-7-sonnet"
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
                PRESETS
              </button>
            </div>
          )}
          <span className="font-mono text-muted" style={{ fontSize: '10px', display: 'block', marginTop: '4px' }}>
            Default for {activeProviderMeta?.name || selectedProvider}: {activeProviderMeta?.default_model || 'default'}
          </span>
        </div>

        {/* API Key Input */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label className="font-mono text-xs text-muted" style={{ fontWeight: 600 }}>
              API KEY {requiresKey ? '(REQUIRED)' : '(OPTIONAL)'}:
            </label>
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-text-muted)',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {showApiKey ? 'HIDE' : 'SHOW'}
            </button>
          </div>
          <input
            type={showApiKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              activeConfig?.configured_providers?.[selectedProvider]?.masked_key
                ? `Keeping saved key (${activeConfig.configured_providers[selectedProvider].masked_key})`
                : activeConfig?.has_api_key && activeConfig.provider === selectedProvider
                ? `Keeping current key (${activeConfig.masked_api_key})`
                : requiresKey
                ? 'Enter your provider API key (e.g. sk-...)'
                : 'Optional for local / non-authenticated endpoints'
            }
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
            Stored locally in your private database. Never exported or shared.
          </span>
        </div>

        {/* Custom Base URL Input */}
        <div>
          <label className="font-mono text-xs text-muted" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
            API ENDPOINT BASE URL:
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
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
            Optional custom proxy, vLLM endpoint, or local server.
          </span>
        </div>
      </div>

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
              <strong>✓ CONNECTION VERIFIED:</strong> Connected successfully to {testResult.provider.toUpperCase()} ({testResult.model}) in {testResult.latency_ms}ms.
            </div>
          ) : (
            <div>
              <strong>✕ CONNECTION FAILED:</strong> {testResult.error || 'Authentication error or model unavailable.'}
            </div>
          )}
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
          {testing ? 'TESTING LLM API...' : 'TEST CONNECTION'}
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || testing}
          style={{
            padding: '8px 20px',
            borderRadius: '6px',
            border: 'none',
            background: 'var(--color-accent-teal, #0D9488)',
            color: '#FFFFFF',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {saving && <Spinner size={12} color="#FFFFFF" />}
          {saving ? 'SAVING...' : 'SAVE CONFIGURATION'}
        </button>
      </div>
    </div>
  );
}
