"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { WaveAndSunIllustration, SunMark } from '@/components/auth/AuthIllustration';

export default function LoginPage() {
  const { login, setupRequired } = useAuth();
  const router = useRouter();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Please enter your username/email and password.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await login(identifier.trim(), password);
      router.push('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed. Verify credentials.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-split-layout">
      {/* Left Hero Panel (Desktop) */}
      <div className="auth-hero-panel">
        <div>
          <div className="font-display" style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '0.12em' }}>
            PALADIO
          </div>
          <p className="font-mono text-xs" style={{ margin: '4px 0 0', opacity: 0.75, letterSpacing: '0.08em' }}>
            {'// DETERMINISTIC TRAVEL COCKPIT'}
          </p>
        </div>

        <div style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '1.5rem' }}>
          <WaveAndSunIllustration />
          <p className="font-mono text-xs" style={{ maxWidth: '280px', lineHeight: 1.6, opacity: 0.85 }}>
            Autonomous multi-agent itinerary solver powered by deterministic C++20 algorithms.
          </p>
        </div>

        <div className="font-mono text-xs" style={{ opacity: 0.65, fontSize: '10px' }}>
          100% SELF-HOSTED // ZERO CLOUD APIS // PRIVATE &amp; AIR-GAPPABLE
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
            <img
              src="/logo.png"
              alt="Paladio Logo"
              style={{ width: '42px', height: '42px', objectFit: 'contain' }}
            />
            <div>
              <h1 className="font-display text-accent" style={{ fontSize: '1.5rem', margin: 0, color: 'var(--color-text-primary)' }}>
                PALADIO
              </h1>
              <p className="font-mono text-muted" style={{ fontSize: '11px', margin: 0 }}>
                {'// SOVEREIGN GATEWAY ACCESS'}
              </p>
            </div>
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
              <strong>First Run Detected:</strong> This Paladio instance has no administrator initialized.
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
                  INITIALIZE MASTER ADMIN
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
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label
                htmlFor="identifier-input"
                className="font-mono text-muted"
                style={{ display: 'block', fontSize: '12px', marginBottom: '6px' }}
              >
                USERNAME OR EMAIL
              </label>
              <input
                id="identifier-input"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="admin or user@paladio.internal"
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
                PASSWORD
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
              {submitting ? 'AUTHENTICATING...' : 'AUTHENTICATE // ACCESS COCKPIT'}
            </button>
          </form>

          <div
            className="font-mono text-muted"
            style={{
              marginTop: '2rem',
              paddingTop: '1.25rem',
              borderTop: '1px solid var(--color-border-subtle)',
              fontSize: '11px',
              lineHeight: 1.6,
              textAlign: 'center',
            }}
          >
            <p>100% SELF-HOSTED SOVEREIGN DEPLOYMENT</p>
            <p style={{ marginTop: '4px', fontSize: '10px' }}>
              Registration is closed. Additional users are managed in the Configuration console.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
