"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function SetupPage() {
  const { setupAdmin } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState('admin');
  const [email, setEmail] = useState('admin@paladio.internal');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password) {
      setError('All fields are required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await setupAdmin({
        username: username.trim(),
        email: email.trim(),
        password,
      });
      router.push('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Setup failed. Instance may already be initialized.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '480px',
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
          src="/logo.png"
          alt="Paladio Logo"
          style={{ width: '42px', height: '42px', objectFit: 'contain' }}
        />
        <div>
          <h1 className="font-display text-accent" style={{ fontSize: '1.5rem', margin: 0 }}>
            PALADIO SETUP
          </h1>
          <p className="font-mono text-muted" style={{ fontSize: '11px', margin: 0 }}>
            {'// MASTER ADMINISTRATOR INITIALIZATION'}
          </p>
        </div>
      </div>

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
        <strong>First-Run Provisioning:</strong> This account will be granted full Master Administrator authority.
        Once configured, open registration is permanently closed.
      </div>

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
            htmlFor="setup-username"
            className="font-mono"
            style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: 'var(--color-text-primary)' }}
          >
            ADMINISTRATOR USERNAME
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
              border: '1px solid var(--color-border)',
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
            className="font-mono"
            style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: 'var(--color-text-primary)' }}
          >
            ADMINISTRATOR EMAIL
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
              border: '1px solid var(--color-border)',
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
            className="font-mono"
            style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: 'var(--color-text-primary)' }}
          >
            MASTER PASSWORD
          </label>
          <input
            id="setup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 6 characters"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
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
            className="font-mono"
            style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: 'var(--color-text-primary)' }}
          >
            CONFIRM MASTER PASSWORD
          </label>
          <input
            id="setup-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
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
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            fontSize: '14px',
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.7 : 1,
            letterSpacing: '0.5px',
          }}
        >
          {submitting ? 'PROVISIONING INSTANCE...' : 'INITIALIZE MASTER ADMINISTRATOR'}
        </button>
      </form>
    </div>
  );
}
