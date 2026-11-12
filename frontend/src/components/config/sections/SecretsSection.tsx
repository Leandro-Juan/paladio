"use client";

import React, { useState, useEffect } from 'react';
import {
  fetchSecretsStatusApi,
  updateSecretApi,
  deleteSecretApi,
  SecretItemResponse,
} from '@/utils/api';
import { SettingsHeader } from '../SettingsHeader';
import { SettingsCardFrame } from '../SettingsCardFrame';
import { Spinner } from '@/components/icons';
import { notify } from '@/utils/notify';
import Link from 'next/link';

interface SecretsSectionProps {
  onBackToOverview: () => void;
}

export function SecretsSection({ onBackToOverview }: SecretsSectionProps) {
  const [loading, setLoading] = useState(true);
  const [aviasalesSecret, setAviasalesSecret] = useState<SecretItemResponse | null>(null);

  // Form states
  const [inputToken, setInputToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showInput, setShowInput] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetchSecretsStatusApi()
      .then((data) => {
        if (!ignore && data?.secrets?.aviasales) {
          setAviasalesSecret(data.secrets.aviasales);
          setShowInput(!data.secrets.aviasales.configured);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : 'Failed to load secrets status';
          notify.error('Secrets Error', msg);
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputToken.trim();
    if (!trimmed) {
      notify.error('Validation Error', 'Please enter a valid Aviasales API token');
      return;
    }

    setSaving(true);
    try {
      const res = await updateSecretApi('aviasales', trimmed);
      setAviasalesSecret(res.secret);
      setInputToken('');
      setShowInput(false);
      notify.success('Token Saved', 'Aviasales token saved and activated in Deal Engine');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save Aviasales token';
      notify.error('Save Failed', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteToken = async () => {
    if (!confirm('Are you sure you want to delete your configured Aviasales token? This will deactivate live flight sweeps.')) {
      return;
    }

    setDeleting(true);
    try {
      const res = await deleteSecretApi('aviasales');
      setAviasalesSecret(res.secret);
      setInputToken('');
      setShowInput(true);
      notify.success('Token Removed', 'Aviasales token deleted. Enter a new token to resume sweeps.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete Aviasales token';
      notify.error('Delete Failed', msg);
    } finally {
      setDeleting(false);
    }
  };

  const isConfigured = aviasalesSecret?.configured ?? false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <SettingsHeader
        title="API Keys & Secrets"
        subtitle="Manage external provider credentials, flight scraper tokens, and API authentication"
        onBackToOverview={onBackToOverview}
      />

      {/* 1. Aviasales / Travelpayouts Card */}
      <SettingsCardFrame
        title="Aviasales / Travelpayouts Flight Data API"
        subtitle="Primary flight cache aggregator for forward calendar sweeps, price drops, and live booking verification"
        badge={isConfigured ? 'Active' : 'Unconfigured'}
        badgeTone={isConfigured ? 'teal' : 'coral'}
        innerTitle="Credential Vault"
        innerBadge={aviasalesSecret?.source === 'database' ? 'Database Stored' : aviasalesSecret?.source === 'env' ? 'Environment Fallback' : undefined}
      >
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
            <Spinner size={24} />
            <span style={{ marginLeft: '12px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
              READING CREDENTIAL VAULT...
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Configured State: Obfuscated Display with Delete Action */}
            {isConfigured && !showInput ? (
              <div
                style={{
                  background: 'var(--color-surface-card)',
                  padding: '1.25rem',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                <div>
                  <label className="font-mono text-xs text-muted" style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                    ACTIVE API TOKEN (OBFUSCATED):
                  </label>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: '6px',
                      padding: '10px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-teal, #0D9488)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '14px',
                          letterSpacing: '2px',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {aviasalesSecret?.masked_token || '••••••••••••••••••••••••••••••••'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={handleDeleteToken}
                        disabled={deleting}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid rgba(200, 109, 81, 0.4)',
                          background: 'rgba(200, 109, 81, 0.1)',
                          color: 'var(--color-accent-coral, #C86D51)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: deleting ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                        title="Delete current token and enter a new one"
                      >
                        {deleting ? (
                          <Spinner size={12} />
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                        )}
                        <span>DELETE TOKEN</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  <span>
                    Storage: <strong>{aviasalesSecret?.source === 'database' ? 'PostgreSQL system_config' : 'Environment (.env)'}</strong>
                  </span>
                  {aviasalesSecret?.updated_at && (
                    <span>Last updated: {new Date(aviasalesSecret.updated_at).toLocaleString()}</span>
                  )}
                </div>
              </div>
            ) : (
              /* Input State: Enter New Token */
              <form
                onSubmit={handleSaveToken}
                style={{
                  background: 'var(--color-surface-card)',
                  padding: '1.25rem',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label className="font-mono text-xs text-muted" style={{ fontWeight: 600 }}>
                      ENTER AVIASALES / TRAVELPAYOUTS TOKEN:
                    </label>
                    {isConfigured && (
                      <button
                        type="button"
                        onClick={() => setShowInput(false)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-text-muted)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        CANCEL
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="password"
                      value={inputToken}
                      onChange={(e) => setInputToken(e.target.value)}
                      placeholder="e.g. 32-character hexadecimal token (a1b2c3d4...)"
                      autoComplete="off"
                      spellCheck="false"
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border-subtle)',
                        background: 'var(--color-surface)',
                        color: 'var(--color-text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={saving || !inputToken.trim()}
                      style={{
                        padding: '10px 18px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'var(--color-accent-teal, #0D9488)',
                        color: '#FFFFFF',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: saving || !inputToken.trim() ? 'not-allowed' : 'pointer',
                        opacity: saving || !inputToken.trim() ? 0.6 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      {saving && <Spinner size={14} color="#FFFFFF" />}
                      <span>SAVE TOKEN</span>
                    </button>
                  </div>
                </div>

                {/* Helpful instructions */}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '6px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border-subtle)',
                    fontSize: '12px',
                    lineHeight: '1.6',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <strong style={{ color: 'var(--color-text-primary)', display: 'block', marginBottom: '4px' }}>
                    How to obtain your Aviasales API token:
                  </strong>
                  <ol style={{ margin: 0, paddingLeft: '18px' }}>
                    <li>Create a free account on <a href="https://www.travelpayouts.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-teal, #0D9488)', textDecoration: 'underline' }}>Travelpayouts</a>.</li>
                    <li>Go to <strong>Programs</strong> → <strong>Aviasales</strong> → <strong>API</strong>.</li>
                    <li>Copy your API token and paste it into the field above.</li>
                    <li>Once saved, your token will immediately be obfuscated and encrypted in PostgreSQL.</li>
                  </ol>
                </div>
              </form>
            )}
          </div>
        )}
      </SettingsCardFrame>

      {/* 2. Overview of Connected API Services */}
      <SettingsCardFrame
        title="Connected Provider Ecosystem"
        subtitle="Status of all flight, routing, and intelligence service connections"
        badge="Zero Synthetic Data"
        badgeTone="teal"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {/* Card 1: Aviasales */}
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                Aviasales Global Aggregator
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: isConfigured ? 'rgba(13, 148, 136, 0.15)' : 'rgba(200, 109, 81, 0.15)',
                  color: isConfigured ? 'var(--color-accent-teal, #0D9488)' : 'var(--color-accent-coral, #C86D51)',
                }}
              >
                {isConfigured ? 'CONNECTED' : 'UNCONFIGURED'}
              </span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0 }}>
              Official Travelpayouts v2/v3 REST API for global flight price calendar matrices and live verification.
            </p>
          </div>

          {/* Card 2: Ryanair */}
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                Ryanair Direct Carrier
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(13, 148, 136, 0.15)',
                  color: 'var(--color-accent-teal, #0D9488)',
                }}
              >
                READY (NO KEY)
              </span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0 }}>
              Direct carrier JSON API for European point-to-point flights without intermediary markups.
            </p>
          </div>

          {/* Card 3: AI Engine */}
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-text-primary)' }}>
                LLM & AI Providers
              </span>
              <Link
                href="/config?tab=llm"
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-accent-teal, #0D9488)',
                  textDecoration: 'underline',
                }}
              >
                CONFIGURE →
              </Link>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0 }}>
              Google Gemini, Anthropic Claude, OpenAI, Groq, DeepSeek, and local Ollama keys configured in the AI tab.
            </p>
          </div>
        </div>
      </SettingsCardFrame>
    </div>
  );
}
