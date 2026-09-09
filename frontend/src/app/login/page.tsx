"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

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
    <div
      style={{
        width: '100%',
        maxWidth: '440px',
        margin: '2rem auto',
        padding: '2.5rem',
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid var(--color-border)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
        <img
          src="/logo.jpeg"
          alt="Paladio Logo"
          style={{ width: '38px', height: '38px', borderRadius: '8px', objectFit: 'cover' }}
        />
        <div>
          <h1 className="font-display text-accent" style={{ fontSize: '1.5rem', margin: 0 }}>
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
            background: '#EFF6FF',
            border: '1px solid #BFDBFE',
            color: '#1E3A8A',
            padding: '12px',
            borderRadius: '6px',
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
                background: '#1E3A8A',
                color: '#FFF',
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
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#DC2626',
            padding: '10px 14px',
            borderRadius: '6px',
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
            className="font-mono"
            style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: 'var(--color-text-primary)' }}
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
              border: '1px solid var(--color-border)',
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
            className="font-mono"
            style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: 'var(--color-text-primary)' }}
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
              border: '1px solid var(--color-border)',
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
            color: '#FFFFFF',
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
          borderTop: '1px solid var(--color-border)',
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
  );
}
