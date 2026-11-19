"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';
import { WaveAndSunIllustration, SunMark } from '@/components/auth/AuthIllustration';
import { PaladioLoader } from '@/components/common/PaladioLoader';
import { isNetworkOrServerDownError } from '@/utils/api';

export default function SetupPage() {
  const { setupAdmin } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  const [username, setUsername] = useState('admin');
  const [email, setEmail] = useState('admin@paladio.internal');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isWaitingForBackend, setIsWaitingForBackend] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password) {
      setError('auth.all_fields_required');
      return;
    }
    if (password.length < 6) {
      setError('auth.password_min_length');
      return;
    }
    if (password !== confirmPassword) {
      setError('auth.passwords_do_not_match');
      return;
    }

    setSubmitting(true);
    setError(null);

    const attemptSetup = async () => {
      try {
        await setupAdmin({
          username: username.trim(),
          email: email.trim(),
          password,
        });
        router.push('/dashboard');
      } catch (err: unknown) {
        if (isNetworkOrServerDownError(err)) {
          // Backend is restarting or offline: show spinner with logo until fully loaded!
          setIsWaitingForBackend(true);
          setError(null);
          pollTimerRef.current = setTimeout(() => {
            attemptSetup();
          }, 1200);
          return;
        }

        setIsWaitingForBackend(false);
        setSubmitting(false);
        const message = err instanceof Error ? err.message : 'auth.setup_failed';
        setError(message);
      }
    };

    attemptSetup();
  };

  if (isWaitingForBackend) {
    return <PaladioLoader variant="fullscreen" />;
  }

  return (
    <div className="auth-split-layout">
      {/* Left Hero Panel (Desktop) */}
      <div className="auth-hero-panel">
        <div>
          <div className="font-display" style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '0.12em' }}>
            {t('auth.setup_title')}
          </div>
          <p className="font-mono text-xs" style={{ margin: '4px 0 0', opacity: 0.75, letterSpacing: '0.08em' }}>
            {t('auth.setup_subtitle')}
          </p>
        </div>

        <div style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '1.5rem' }}>
          <WaveAndSunIllustration />
          <p className="font-mono text-xs" style={{ maxWidth: '280px', lineHeight: 1.6, opacity: 0.85 }}>
            {t('auth.setup_hero_desc')}
          </p>
        </div>

        <div className="font-mono text-xs" style={{ opacity: 0.65, fontSize: '10px' }}>
          {t('auth.setup_hero_badges')}
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="auth-form-panel">
        <div
          style={{
            width: '100%',
            maxWidth: '480px',
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
            <img
              src="/logo.png"
              alt={t('common.paladio_logo')}
              style={{ width: '42px', height: '42px', objectFit: 'contain' }}
            />
            <div>
              <h1 className="font-display text-accent" style={{ fontSize: '1.5rem', margin: 0, color: 'var(--color-text-primary)' }}>
                {t('auth.setup_title')}
              </h1>
              <p className="font-mono text-muted" style={{ fontSize: '11px', margin: 0 }}>
                {t('auth.setup_subtitle')}
              </p>
            </div>
          </div>

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
            <strong>{t('auth.first_run_provisioning')}</strong> {t('auth.first_run_provisioning_desc')}
          </div>

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
                htmlFor="setup-username"
                className="font-mono text-muted"
                style={{ display: 'block', fontSize: '12px', marginBottom: '6px' }}
              >
                {t('auth.admin_username_label')}
              </label>
              <input
                id="setup-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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
                required
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="setup-email"
                className="font-mono text-muted"
                style={{ display: 'block', fontSize: '12px', marginBottom: '6px' }}
              >
                {t('auth.admin_email_label')}
              </label>
              <input
                id="setup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                required
              />
            </div>

            <div>
              <label
                htmlFor="setup-password"
                className="font-mono text-muted"
                style={{ display: 'block', fontSize: '12px', marginBottom: '6px' }}
              >
                {t('auth.master_password_label')}
              </label>
              <input
                id="setup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.password_min_placeholder')}
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
                required
              />
            </div>

            <div>
              <label
                htmlFor="setup-confirm-password"
                className="font-mono text-muted"
                style={{ display: 'block', fontSize: '12px', marginBottom: '6px' }}
              >
                {t('auth.confirm_master_password_label')}
              </label>
              <input
                id="setup-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('auth.reenter_password_placeholder')}
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
                required
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
                color: 'var(--color-btn-primary-text)',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '14px',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
                letterSpacing: '0.5px',
              }}
            >
              {submitting ? t('auth.provisioning_instance') : t('auth.initialize_master_administrator')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
