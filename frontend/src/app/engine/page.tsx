"use client";
import React, { useState, useEffect, useRef } from 'react';
import { usePaladioSocket } from '@/hooks/usePaladioSocket';

export default function EnginePage() {
  const { status, logs, itinerary, sendMessage, sendFeedback } = usePaladioSocket();
  const [input, setInput] = useState('');
  const endOfLogsRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal
  useEffect(() => {
    endOfLogsRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', height: '100%' }}>
      {/* Left Pane: Terminal / Command Center */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
        <h2 className="font-display">ACTIVE ENGINE</h2>
        
        <div className="bg-surface border-subtle" style={{ 
          flex: 1, 
          borderRadius: '8px', 
          padding: '1rem', 
          display: 'flex', 
          flexDirection: 'column',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.875rem'
        }}>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {logs.map((log, i) => (
              <div key={i} className={log.includes('ERROR') ? 'text-accent' : 'text-muted'}>
                {log}
              </div>
            ))}
            <div ref={endOfLogsRef} />
          </div>
          
          <form onSubmit={handleSubmit} style={{ marginTop: '1rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <span className="text-accent">{'>'}</span>
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Define target destination and constraints..." 
              disabled={status === 'disconnected' || status === 'inferencing'}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-mono)',
                width: '100%',
                outline: 'none'
              }}
            />
          </form>
        </div>
      </div>

      {/* Right Pane: Live Itinerary Output */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="font-display">OUTPUT TELEMETRY</h2>
          <span className="font-mono text-sm text-muted">
            STATUS: <span className={status === 'connected' ? 'text-accent' : ''}>{status.toUpperCase()}</span>
          </span>
        </div>
        
        <div className="bg-surface border-subtle" style={{ 
          flex: 1, 
          borderRadius: '8px', 
          padding: itinerary ? '1rem' : '2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: itinerary ? 'stretch' : 'center',
          justifyContent: itinerary ? 'flex-start' : 'center',
          textAlign: itinerary ? 'left' : 'center',
          overflowY: 'auto'
        }}>
          {!itinerary ? (
            <>
              <div className={status === 'inferencing' ? 'engine-active' : ''} style={{ 
                width: '60px', 
                height: '60px', 
                borderRadius: '50%', 
                border: `2px solid ${status === 'inferencing' ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                marginBottom: '2rem',
                transition: 'all 0.3s ease'
              }}></div>
              <h3 className="font-display">{status === 'inferencing' ? 'SOLVER ACTIVE...' : 'AWAITING PARAMETERS'}</h3>
              <p className="text-muted mt-2">
                {status === 'inferencing' 
                  ? 'LangGraph swarm is currently orchestrating the C++ branch-and-bound optimization.'
                  : 'Initialize the LangGraph swarm to begin C++ optimization.'}
              </p>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 className="font-display">OPTIMIZED ITINERARY</h3>
              {/* Note: This assumes the data structure from backend is a dict of days/pois */}
              {/* For now, just dumping the raw JSON to show the connection works */}
              <pre className="font-mono text-sm text-muted" style={{ whiteSpace: 'pre-wrap', background: 'var(--color-bg-main)', padding: '1rem', borderRadius: '4px' }}>
                {JSON.stringify(itinerary, null, 2)}
              </pre>
              
              <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                <button 
                  onClick={() => sendFeedback({ name: 'TEST_POI' }, 100.0)}
                  style={{ flex: 1, padding: '0.5rem', background: 'var(--color-accent-primary)', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-display)' }}
                >
                  SIMULATE POSITIVE FEEDBACK (TUNE ML)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
