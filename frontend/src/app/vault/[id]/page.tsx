import React from 'react';
import Link from 'next/link';
import MapLoader from '@/components/MapLoader';

export default function VaultDetailPage({ params }: { params: { id: string } }) {
  // To be fetched based on params.id
  const tripDetails: any = null;

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
              <h4 className="font-mono text-muted text-sm mb-2">// GLOBAL INTERACTIVE MAP</h4>
              <div style={{ flex: 1, position: 'relative' }}>
                <MapLoader pois={tripDetails.pois || []} />
              </div>
            </div>
            
            <div className="bg-surface border-subtle" style={{ borderRadius: '8px', padding: '1rem' }}>
              <h4 className="font-mono text-muted text-sm mb-4">// PHOTO VAULT</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1rem' }}>
                {tripDetails.photos?.map((photo: string, idx: number) => (
                  <div key={idx} style={{ height: '150px', backgroundImage: `url(${photo})`, backgroundSize: 'cover', borderRadius: '4px' }}></div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="bg-surface border-subtle" style={{ borderRadius: '8px', padding: '1rem' }}>
              <h4 className="font-mono text-muted text-sm">// TICKET WALLET</h4>
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {tripDetails.tickets?.map((ticket: any, idx: number) => (
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
