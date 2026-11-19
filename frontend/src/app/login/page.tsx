"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';
import { WaveAndSunIllustration, SunMark } from '@/components/auth/AuthIllustration';
import { PaladioLoader } from '@/components/common/PaladioLoader';
import { isNetworkOrServerDownError } from '@/utils/api';

export default function LoginPage() {
  const { login, setupRequired } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isWaitingForBackend, setIsWaitingForBackend] = useState(false);
  const [retryAttempts, setRetryAttempts] = useState(0);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('auth.enter_credentials_error');
      return;
    }

    setSubmitting(true);
    setError(null);
    setRetryAttempts(0);

    const attemptLogin = async () => {
      try {
        await login(identifier.trim(), password);
        router.push('/dashboard');
      } catch (err: unknown) {
        if (isNetworkOrServerDownError(err)) {
          // Backend is restarting or offline: show spinner with logo until fully loaded!
          setIsWaitingForBackend(true);
          setError(null);
          setRetryAttempts((prev) => prev + 1);
          pollTimerRef.current = setTimeout(() => {
            attemptLogin();
          }, 1200);
          return;
        }

        setIsWaitingForBackend(false);
        setSubmitting(false);
        const message = err instanceof Error ? err.message : 'auth.authentication_failed';
        setError(message);
      }
    };

    attemptLogin();
  };

  if (isWaitingForBackend) {
    let reconnectMessage: React.ReactNode = null;
    if (retryAttempts >= 3) {
      reconnectMessage = (
        <div style={{ textAlign: 'center', maxWidth: '340px' }}>
          <p className="font-mono text-xs" style={{ opacity: 0.7, letterSpacing: '0.08em', margin: 0 }}>
            {t('auth.connecting_core')}
          </p>
          {retryAttempts >= 10 && (
            <p className="font-mono text-xs" style={{ opacity: 0.5, fontSize: '11px', marginTop: '6px' }}>
              {t('auth.engine_startup_slow')}
            </p>
          )}
        </div>
      );
    }
    return <PaladioLoader variant="fullscreen" message={reconnectMessage} />;
  }

  return (
    <div className="auth-split-layout">
      {/* Left Hero Panel (Desktop) */}
      <div
        className="auth-hero-panel"
        style={{
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div style={{ padding: '3.5rem 3rem 0' }}>
          <img
            src="/logo_horizontal_dark.png"
            alt="Paladio"
            style={{ height: '60px', width: 'auto', objectFit: 'contain' }}
          />
        </div>

        <div style={{ width: '100%', marginTop: 'auto', lineHeight: 0 }}>
          <WaveAndSunIllustration maxWidth="none" />
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="auth-form-panel">
        <div
          style={{
            width: '100%',
            maxWidth: '440px',
            padding: '2.5rem',
            background: 'var(--color-surface-card)',
            borderRadius: '16px',
            border: '1px solid var(--color-border-subtle)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {/* Mobile Sun Mark (Shown only below 768px) */}
          <div className="auth-mobile-sun" style={{ flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem', gap: '8px' }}>
            <SunMark size={38} />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <h1 className="font-display text-accent" style={{ fontSize: '1.5rem', margin: 0, color: 'var(--color-text-primary)' }}>
              PALADIO
            </h1>
          </div>

          {setupRequired && (
            <div
              style={{
                background: 'var(--color-accent-teal-soft)',
                border: '1px solid var(--color-border-subtle)',
                color: 'var(--color-text-primary)',
                padding: '12px',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                fontSize: '12px',
                lineHeight: 1.5,
              }}
            >
              <strong>{t('auth.first_run_detected')}</strong> {t('auth.no_admin_initialized')}
              <div style={{ marginTop: '8px' }}>
                <button
                  onClick={() => router.push('/setup')}
                  style={{
                    background: 'var(--color-accent-primary)',
                    color: 'var(--color-btn-primary-text, #FFFFFF)',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {t('auth.initialize_master_admin')}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                background: 'var(--color-danger-soft)',
                border: '1px solid var(--color-danger)',
                color: 'var(--color-danger)',
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                fontSize: '13px',
              }}
            >
              {t(error)}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label
                htmlFor="identifier-input"
                className="font-mono text-muted"
                style={{ display: 'block', fontSize: '12px', marginBottom: '6px' }}
              >
                {t('auth.username_or_email_label')}
              </label>
              <input
                id="identifier-input"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={t('auth.username_or_email_placeholder')}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border-input)',
                  background: 'var(--color-surface-card)',
                  color: 'var(--color-text-primary)',
                  fontSize: '14px',
                  outline: 'none',
                  fontFamily: 'var(--font-body)',
                }}
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="password-input"
                className="font-mono text-muted"
                style={{ display: 'block', fontSize: '12px', marginBottom: '6px' }}
              >
                {t('auth.password_label')}
              </label>
              <input
                id="password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border-input)',
                  background: 'var(--color-surface-card)',
                  color: 'var(--color-text-primary)',
                  fontSize: '14px',
                  outline: 'none',
                  fontFamily: 'var(--font-body)',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="font-display"
              style={{
                marginTop: '0.5rem',
                padding: '12px',
                background: 'var(--color-accent-primary)',
                color: 'var(--color-btn-primary-text, #FFFFFF)',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '14px',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
                letterSpacing: '0.5px',
                transition: 'opacity 0.2s',
              }}
            >
              {submitting ? t('auth.authenticating') : t('auth.authenticate')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
