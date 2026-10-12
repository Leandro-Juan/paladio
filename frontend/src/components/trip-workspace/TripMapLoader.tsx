"use client";

import dynamic from 'next/dynamic';

const TripMapView = dynamic(() => import('./TripMapView'), {
  ssr: false,
  loading: () => (
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
      [ LOADING TACTICAL GEO-SERVICE... ]
    </div>
  ),
});

export default TripMapView;
