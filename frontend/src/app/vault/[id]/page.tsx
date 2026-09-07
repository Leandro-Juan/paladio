import React from 'react';
import Link from 'next/link';
import MapLoader from '@/components/MapLoader';

export default function VaultDetailPage({ params }: { params: { id: string } }) {
  const MOCK_TRIPS: Record<string, { id: string; destination: string; pois: { name: string; lat: number; lng: number }[]; photos: string[]; tickets: { title: string; subtitle: string }[] }> = {
    "tokyo-hyper": {
      id: "tokyo-hyper",
      destination: "Tokyo Hyper-Optimization",
      pois: [
        { name: "Shibuya Crossing", lat: 35.6595, lng: 139.7005 },
        { name: "Shinjuku Gyoen", lat: 35.6852, lng: 139.7100 },
        { name: "Meiji Shrine", lat: 35.6764, lng: 139.6993 }
      ],
      photos: [
        "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=400",
        "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=400",
        "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=400"
      ],
      tickets: [
        { title: "NRT Express Ticket", subtitle: "2024-05-12 14:00" },
        { title: "Mori Art Museum", subtitle: "2024-05-14 10:00" }
      ]
    },
    "paris-efficiency": {
      id: "paris-efficiency",
      destination: "Paris Efficiency Run",
      pois: [
        { name: "Eiffel Tower", lat: 48.8584, lng: 2.2945 },
        { name: "Louvre Museum", lat: 48.8606, lng: 2.3376 },
        { name: "Notre Dame", lat: 48.8529, lng: 2.3500 }
      ],
      photos: [
        "https://images.unsplash.com/photo-1502602898657-3e90760020c5?w=400",
        "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=400",
        "https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?w=400"
      ],
      tickets: [
        { title: "CDG RoissyBus", subtitle: "2023-09-21 08:30" },
        { title: "Louvre Entry Pass", subtitle: "2023-09-22 09:00" }
      ]
    }
  };

  const tripDetails = MOCK_TRIPS[params.id] || null;

  return (
    <div>
      <Link href="/vault" className="text-muted text-sm font-mono" style={{ textDecoration: 'none' }}>
        ← RETURN TO VAULT
      </Link>
      
      <h2 className="font-display" style={{ marginTop: '1rem' }}>MISSION DETAILS: {params.id.toUpperCase()}</h2>
      
      {tripDetails ? (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', marginTop: '2rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="bg-surface border-subtle" style={{ height: '400px', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
              <h4 className="font-mono text-muted text-sm mb-2">{'// GLOBAL INTERACTIVE MAP'}</h4>
              <div style={{ flex: 1, position: 'relative' }}>
                <MapLoader pois={tripDetails.pois || []} />
              </div>
            </div>
            
            <div className="bg-surface border-subtle" style={{ borderRadius: '8px', padding: '1rem' }}>
              <h4 className="font-mono text-muted text-sm mb-4">{'// PHOTO VAULT'}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1rem' }}>
                {tripDetails.photos?.map((photo: string, idx: number) => (
                  <div key={idx} style={{ height: '150px', backgroundImage: `url(${photo})`, backgroundSize: 'cover', borderRadius: '4px' }}></div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="bg-surface border-subtle" style={{ borderRadius: '8px', padding: '1rem' }}>
              <h4 className="font-mono text-muted text-sm">{'// TICKET WALLET'}</h4>
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {tripDetails.tickets?.map((ticket: { title: string; subtitle: string }, idx: number) => (
                  <div key={idx} style={{ padding: '1rem', border: '1px dashed var(--color-border)', borderRadius: '4px' }}>
                    <p className="font-display text-sm">{ticket.title}</p>
                    <p className="font-mono text-muted text-xs mt-1">{ticket.subtitle}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="font-mono text-muted text-sm mt-8">[ MISSION DATA NOT FOUND ]</div>
      )}
    </div>
  );
}
