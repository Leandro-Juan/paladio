import React from 'react';
import PreferenceRadar from '@/components/PreferenceRadar';

export default function ModelPage() {
  // Base zero-state telemetry to render the empty radar shape.
  // In a real application, this is overwritten by the real backend array.
  const telemetryData = [
    { subject: 'Nature / Outdoors', A: 0, fullMark: 100 },
    { subject: 'Historical Sites', A: 0, fullMark: 100 },
    { subject: 'Density / Pace', A: 0, fullMark: 100 },
    { subject: 'Budget Sensitivity', A: 0, fullMark: 100 },
    { subject: 'Culinary / Food', A: 0, fullMark: 100 },
    { subject: 'Nightlife', A: 0, fullMark: 100 },
  ];

  return (
    <div>
      <h2 className="font-display">PREFERENCE MODEL</h2>
      <p className="font-mono text-muted text-sm mt-2">{'// JAX ML VECTOR EMBEDDINGS'}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
        <div className="bg-surface border-subtle" style={{ padding: '2rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h4 className="font-mono text-muted text-sm mb-4">{'// AFFINITY RADAR'}</h4>
          
          {/* Always render the radar component so the UI doesn't look broken, just zeroed out */}
          <PreferenceRadar data={telemetryData} />
        </div>

        <div className="bg-surface border-subtle" style={{ padding: '2rem', borderRadius: '8px' }}>
          <h4 className="font-mono text-muted text-sm mb-4">{'// RAW TELEMETRY'}</h4>
          
          <div className="font-mono text-sm" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <span className="text-muted">[ WAITING FOR LIVE TELEMETRY UPDATE ]</span>
            {telemetryData.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.5 }}>
                <span className="text-muted">{item.subject}</span>
                <span className="text-accent">{(item.A / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>
          
          <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid var(--color-border)' }}>
            <p className="text-sm text-muted">
              These weights are updated in real-time as you provide feedback on POIs during active optimizations. The C++ engine uses these exact tensors.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
