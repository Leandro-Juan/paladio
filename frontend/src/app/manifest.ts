import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Paladio Control Center',
    short_name: 'Paladio',
    description: 'Continuous Sovereign Travel Optimization Engine',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0a0e14',
    theme_color: '#0F4C5C',
    icons: [
      {
        src: '/logo-white.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/logo-white.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
