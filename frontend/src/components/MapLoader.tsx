"use client";
import dynamic from 'next/dynamic';

// Next.js cannot server-side render leaflet maps because it relies on window
const Map = dynamic(() => import('./Map'), {
  ssr: false,
  loading: () => <div className="font-mono text-muted text-sm" style={{ padding: '2rem', textAlign: 'center', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>[ LOADING MAP TILE SERVICE... ]</div>
});

export default Map;
