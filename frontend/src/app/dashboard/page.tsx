import React from 'react';
import Link from 'next/link';

export default function DashboardPage() {
  const latestDeltas: string[] = [];

  return (
    <div>
      <h2 className="font-display">CONTROL CENTER</h2>
      <p className="font-mono text-muted text-sm mt-2">// SYSTEM OVERVIEW</p>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', marginTop: '2rem' }}>
        <div className="bg-surface border-subtle" style={{ padding: '2rem', borderRadius: '8px' }}>
          <h3 className="font-display">NEXT OPTIMIZATION</h3>
          <p className="text-muted" style={{ marginTop: '1rem' }}>No active itineraries queued. Awaiting parameters.</p>
          <Link href="/engine" style={{ textDecoration: 'none' }}>
            <button style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--color-accent-primary)', color: '#FFF', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}>
              INITIALIZE PROTOCOL
            </button>
          </Link>
        </div>

        <div className="bg-surface border-subtle" style={{ padding: '2rem', borderRadius: '8px' }}>
          <h3 className="font-display">ML TUNING DELTAS</h3>
          <ul className="font-mono text-sm text-muted" style={{ marginTop: '1rem', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {latestDeltas.length > 0 ? latestDeltas.map((d, i) => (
              <li key={i}>&gt; [INFO] {d}</li>
            )) : <li>[ NO RECENT DELTAS ]</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
