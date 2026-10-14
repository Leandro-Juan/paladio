"use client";

import React from 'react';
import { EmptyState } from '@/components/EmptyState';

interface TripPhotosViewProps {
  photos?: string[];
}

export function TripPhotosView({ photos = [] }: TripPhotosViewProps) {
  return (
    <div
      style={{
        padding: '2rem',
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}
    >
      <div>
        <h2 className="font-display" style={{ margin: 0, fontSize: '1.4rem', color: 'var(--color-text-primary)' }}>
          PHOTO VAULT & SIGHTS
        </h2>
        <p className="font-mono text-muted text-sm mt-1">
          {'// DESTINATION PHOTOGRAPHY & WAYPOINT MEDIA'}
        </p>
      </div>

      {photos.length === 0 ? (
        <EmptyState
          type="no-photos"
          title="No Captured Memories"
          description="Photos attached to itinerary waypoints and notes will appear here."
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {photos.map((photoUrl, idx) => (
            <div
              key={idx}
              style={{
                height: '220px',
                borderRadius: '12px',
                backgroundImage: `url(${photoUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                border: '1px solid var(--color-border-subtle)',
                boxShadow: 'var(--shadow-card)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.boxShadow = 'var(--shadow-modal)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = 'var(--shadow-card)';
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
