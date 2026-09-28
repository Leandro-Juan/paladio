import React from 'react';

interface ActiveTripTicketProps {
  destination: string;
  startDate: string;
  endDate: string;
  poisCount: number;
}

export function ActiveTripTicket({ destination, startDate, endDate, poisCount }: ActiveTripTicketProps) {
  // Calculate days until trip
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  const isOngoing = now.getTime() >= start.getTime() && now.getTime() <= end.getTime();
  const diffTime = start.getTime() - now.getTime();
  const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  return (
    <div style={{
      border: '1px solid var(--color-accent-primary)',
      borderRadius: '8px',
      background: 'var(--color-bg-main)',
      display: 'flex',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Left stub/barcode area */}
      <div style={{
        width: '60px',
        background: 'var(--color-accent-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
        color: '#FFF',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.875rem',
        letterSpacing: '2px',
        padding: '1rem 0'
      }}>
        ACTIVE // PROTOCOL
      </div>

      <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 className="font-display" style={{ fontSize: '1.5rem', margin: 0 }}>{destination}</h3>
            <p className="font-mono text-muted text-sm mt-1">{start.toLocaleDateString()} - {new Date(endDate).toLocaleDateString()}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            {diffDays > 0 ? (
              <>
                <span className="font-mono" style={{ fontSize: '2rem', lineHeight: 1, color: 'var(--color-accent-primary)', fontWeight: 600 }}>T-{diffDays}</span>
                <p className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>DAYS OUT</p>
              </>
            ) : isOngoing ? (
              <>
                <span className="font-mono" style={{ fontSize: '2rem', lineHeight: 1, color: '#10B981', fontWeight: 600 }}>ACTIVE</span>
                <p className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>IN PROGRESS</p>
              </>
            ) : (
              <>
                <span className="font-mono" style={{ fontSize: '2rem', lineHeight: 1, color: 'var(--color-accent-primary)', fontWeight: 600 }}>TODAY</span>
                <p className="font-mono text-muted" style={{ fontSize: '0.75rem' }}>DEPARTURE</p>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem' }}>
          <div>
            <p className="font-mono text-muted" style={{ fontSize: '0.75rem', marginBottom: '4px' }}>WAYPOINTS</p>
            <p className="font-mono" style={{ fontWeight: 500 }}>{poisCount} STOPS</p>
          </div>
          <div>
            <p className="font-mono text-muted" style={{ fontSize: '0.75rem', marginBottom: '4px' }}>STATUS</p>
            <p className="font-mono text-accent" style={{ fontWeight: 500 }}>CONFIRMED</p>
          </div>
        </div>
      </div>
    </div>
  );
}
