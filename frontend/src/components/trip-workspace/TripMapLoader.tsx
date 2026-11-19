"use client";

import dynamic from 'next/dynamic';
import { useTranslation } from '@/hooks/useTranslation';

function TripMapLoadingFallback() {
  const { t } = useTranslation();
  return (
    <div
      className="font-mono text-muted text-sm"
      style={{
        padding: '2rem',
        textAlign: 'center',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg-main)',
      }}
    >
      {t('workspace.loading_geo_service')}
    </div>
  );
}

const TripMapView = dynamic(() => import('./TripMapView'), {
  ssr: false,
  loading: () => <TripMapLoadingFallback />,
});

export default TripMapView;
