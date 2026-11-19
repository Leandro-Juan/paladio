"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
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

interface SecretsSectionProps {
  onBackToOverview: () => void;
}

export function SecretsSection({ onBackToOverview }: SecretsSectionProps) {
  const { t, locale } = useTranslation();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

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
          const msg = err instanceof Error ? err.message : tRef.current('config.secrets_load_failed');
          notify.error(tRef.current('config.secrets_error_title'), msg);
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
      notify.error(t('config.validation_error_title'), t('config.aviasales_invalid_token_msg'));
      return;
    }

    setSaving(true);
    try {
      const res = await updateSecretApi('aviasales', trimmed);
      setAviasalesSecret(res.secret);
      setInputToken('');
      setShowInput(false);
      notify.success(t('config.token_saved_title'), t('config.aviasales_token_saved_msg'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('config.aviasales_save_failed');
      notify.error(t('config.save_failed_title'), msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteToken = async () => {
    if (!confirm(t('config.aviasales_delete_confirm'))) {
      return;
    }

    setDeleting(true);
    try {
      const res = await deleteSecretApi('aviasales');
      setAviasalesSecret(res.secret);
      setInputToken('');
      setShowInput(true);
      notify.success(t('config.token_removed_title'), t('config.aviasales_token_removed_msg'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('config.aviasales_delete_failed');
      notify.error(t('config.delete_failed_title'), msg);
    } finally {
      setDeleting(false);
    }
  };

  const isConfigured = aviasalesSecret?.configured ?? false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <SettingsHeader
        title={t('config.item_secrets_title')}
        subtitle={t('config.secrets_header_subtitle')}
        onBackToOverview={onBackToOverview}
      />

      {/* 1. Aviasales / Travelpayouts Card */}
      <SettingsCardFrame
        title={t('config.aviasales_card_title')}
        subtitle={t('config.aviasales_card_subtitle')}
        badge={isConfigured ? t('config.badge_active_title') : t('config.badge_unconfigured')}
        badgeTone={isConfigured ? 'teal' : 'coral'}
        innerTitle={t('config.aviasales_inner_title')}
        innerBadge={
          aviasalesSecret?.source === 'database'
            ? t('config.aviasales_source_db')
            : aviasalesSecret?.source === 'env'
            ? t('config.aviasales_source_env')
            : undefined
        }
      >
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
            <Spinner size={24} />
            <span style={{ marginLeft: '12px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
              {t('config.reading_credential_vault')}
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
                    {t('config.active_api_token_label')}
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
                        title={t('config.delete_token_title')}
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
                        <span>{t('config.delete_token_upper')}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  <span>
                    {t('config.storage_label')}{' '}
                    <strong>
                      {aviasalesSecret?.source === 'database'
                        ? t('config.storage_postgres')
                        : t('config.storage_env')}
                    </strong>
                  </span>
                  {aviasalesSecret?.updated_at && (
                    <span>
                      {t('config.last_updated_label', {
                        datetime: new Date(aviasalesSecret.updated_at).toLocaleString(locale === 'en' ? undefined : locale),
                      })}
                    </span>
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
                      {t('config.enter_aviasales_token_label')}
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
                        {t('config.cancel_upper')}
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="password"
                      value={inputToken}
                      onChange={(e) => setInputToken(e.target.value)}
                      placeholder={t('config.aviasales_token_placeholder')}
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
                      <span>{t('config.save_token_upper')}</span>
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
                    {t('config.aviasales_how_to_title')}
                  </strong>
                  <ol style={{ margin: 0, paddingLeft: '18px' }}>
                    <li>
                      {t('config.aviasales_step1_prefix')}
                      <a href="https://www.travelpayouts.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-teal, #0D9488)', textDecoration: 'underline' }}>
                        Travelpayouts
                      </a>
                      {t('config.aviasales_step1_suffix')}
                    </li>
                    <li>
                      {t('config.aviasales_step2_prefix')}
                      <strong>{t('config.aviasales_step2_programs')}</strong> → <strong>Aviasales</strong> →{' '}
                      <strong>{t('config.aviasales_step2_api')}</strong>
                      {t('config.aviasales_step2_suffix')}
                    </li>
                    <li>{t('config.aviasales_step3')}</li>
                    <li>{t('config.aviasales_step4')}</li>
                  </ol>
                </div>
              </form>
            )}
          </div>
        )}
      </SettingsCardFrame>
    </div>
  );
}
