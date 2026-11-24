"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { apiFetch } from '@/utils/api';
import { notify } from '@/utils/notify';
import { useTranslation } from '@/hooks/useTranslation';

interface DemoStatusResponse {
  demo_mode: boolean;
  next_reset_at: number;
  server_now: number;
}

function formatCountdown(ms: number): string {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function DemoResetTimer() {
  const { t } = useTranslation();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [nextResetAt, setNextResetAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(3600_000);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const clockSkewRef = useRef<number>(0);
  const triggeredAutoResetRef = useRef<boolean>(false);

  const handleResetNow = useCallback(async (isAuto = false) => {
    if (isResetting) return;
    setIsResetting(true);
    try {
      const res = await apiFetch<{ status: string; next_reset_at: number }>('/demo/reset', {
        method: 'POST',
      });
      if (typeof res.next_reset_at === 'number') {
        setNextResetAt(res.next_reset_at);
        setRemainingMs(Math.max(0, res.next_reset_at - (Date.now() + clockSkewRef.current)));
      }
      triggeredAutoResetRef.current = false;
      notify.info(
        isAuto ? tRef.current('demo.hourly_reset_title') : tRef.current('demo.reset_title'),
        tRef.current('demo.reset_sandbox_msg')
      );
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('paladio_poi_photos_cache');
        sessionStorage.removeItem('paladio_poi_photos_cache_v2');
        window.location.reload();
      }
    } catch {
      setIsResetting(false);
    }
  }, [isResetting]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<DemoStatusResponse>('/demo/status')
      .then((data) => {
        if (cancelled) return;
        if (typeof data.next_reset_at === 'number') {
          if (typeof data.server_now === 'number') {
            clockSkewRef.current = data.server_now - Date.now();
          }
          setNextResetAt(data.next_reset_at);
          setRemainingMs(Math.max(0, data.next_reset_at - (Date.now() + clockSkewRef.current)));
          triggeredAutoResetRef.current = false;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNextResetAt((prev) => prev ?? Date.now() + 3600_000);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!nextResetAt) return;
    const timer = setInterval(() => {
      const nowAdjusted = Date.now() + clockSkewRef.current;
      const diff = Math.max(0, nextResetAt - nowAdjusted);
      setRemainingMs(diff);
      if (diff <= 0 && !triggeredAutoResetRef.current) {
        triggeredAutoResetRef.current = true;
        void handleResetNow(true);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [nextResetAt, handleResetNow]);

  return (
    <div
      data-testid="demo-reset-timer"
      data-position="bottom-right"
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        zIndex: 1100,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 8px 6px 8px',
        borderRadius: '9999px',
        background: 'var(--color-surface-raised, #FFFFFF)',
        border: '1.5px solid #1B8FA6',
        boxShadow: 'var(--shadow-md, 0 4px 14px rgba(2, 132, 199, 0.18))',
        backdropFilter: 'blur(8px)',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: '11px',
        color: 'var(--color-text-primary, #1A2B32)',
        pointerEvents: 'auto',
      }}
    >
      <span
        style={{
          fontWeight: 700,
          letterSpacing: '0.08em',
          background: 'linear-gradient(135deg, #1B8FA6 0%, #0284C7 100%)',
          color: '#FFFFFF',
          padding: '2px 8px',
          borderRadius: '9999px',
        }}
      >
        {t('demo.badge_short')}
      </span>
      <span
        style={{
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 600,
          color: 'var(--color-text-muted, #566B76)',
        }}
      >
        {t('demo.resets_in', { time: '__DEMO_TIME__' })
          .split('__DEMO_TIME__')
          .map((part, idx, arr) => (
            <React.Fragment key={idx}>
              {part}
              {idx < arr.length - 1 && (
                <strong style={{ color: '#12708A' }}>
                  {formatCountdown(remainingMs)}
                </strong>
              )}
            </React.Fragment>
          ))}
      </span>
      <button
        type="button"
        onClick={() => void handleResetNow(false)}
        disabled={isResetting}
        title={t('demo.reset_now_aria')}
        aria-label={t('demo.reset_now_aria')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, #1B8FA6 0%, #0284C7 100%)',
          color: '#FFFFFF',
          boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)',
          cursor: isResetting ? 'wait' : 'pointer',
          padding: 0,
          transition: 'opacity 0.15s ease',
        }}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={isResetting ? { animation: 'spin 1s linear infinite' } : undefined}
        >
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>
    </div>
  );
}
