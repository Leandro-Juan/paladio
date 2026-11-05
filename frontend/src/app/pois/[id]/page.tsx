"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { PoiDetailView } from '@/components/trip-workspace/PoiDetailView';
import { ChevronLeftIcon } from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';

export default function StandalonePoiPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const router = useRouter();
  const { t } = useTranslation();

  const handleClose = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg-app, #0F172A)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <button
          type="button"
          onClick={handleClose}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--color-surface-raised, #1E293B)',
            color: 'var(--color-text-primary, #F8FAFC)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '8px 14px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono, monospace)',
            transition: 'all 0.15s ease',
          }}
        >
          <ChevronLeftIcon size={16} />
          {t('workspace.return_to_search')}
        </button>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          height: 'calc(100vh - 100px)',
          background: 'var(--color-surface-card)',
          borderRadius: '16px',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg, 0 10px 25px -5px rgba(0, 0, 0, 0.3))',
        }}
      >
        <PoiDetailView
          poiId={id}
          onClose={handleClose}
        />
      </div>
    </div>
  );
}
