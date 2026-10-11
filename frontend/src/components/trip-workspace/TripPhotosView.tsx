"use client";

import React from 'react';

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
        <h2 className="font-display" style={{ margin: 0, fontSize: '1.4rem', color: '#FFF' }}>
          PHOTO VAULT & SIGHTS
        </h2>
        <p className="font-mono text-muted text-sm mt-1">
          {'// DESTINATION PHOTOGRAPHY & WAYPOINT MEDIA'}
        </p>
      </div>

      {photos.length === 0 ? (
        <div
          className="font-mono text-muted text-sm"
          style={{
            padding: '3rem',
            textAlign: 'center',
            background: 'rgba(30, 41, 59, 0.4)',
            border: '1px dashed rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
          }}
        >
          [ NO PHOTOS CAPTURED OR ATTACHED TO THIS TRIP RECORD ]
        </div>
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
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3)';
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
