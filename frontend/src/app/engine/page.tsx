"use client";
import React, { useState, useEffect, useRef } from 'react';
import { usePaladioSocket } from '@/hooks/usePaladioSocket';
import { TripTimeline } from '@/components/TripTimeline';
import { useTrips } from '@/hooks/useTrips';
import { Modal } from '@/components/Modal';
import { extractDestination } from '@/utils/tripParser';
import { Virtuoso } from 'react-virtuoso';
import { useLogStore } from '@/contexts/SocketContext';
import { TripPreparationForm } from '@/components/TripPreparationForm';


export default function EnginePage() {
  const { status, itinerary, missingFields, sendMessage, sendFeedback, sendResume } = usePaladioSocket();
  const { logs, clearLogs } = useLogStore();
  const { saveTrip } = useTrips();
  const [activeTab, setActiveTab] = useState<'prep' | 'telemetry'>('prep');
  const [input, setInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clarificationData, setClarificationData] = useState<Record<string, string>>({});
  const endOfLogsRef = useRef<HTMLDivElement>(null);

  const hasClearedRef = useRef(false);

  // Clear logs when entering page if idle and no itinerary is present
  useEffect(() => {
    if (!hasClearedRef.current && status === 'connected' && logs.length > 3 && !itinerary) {
      clearLogs();
      hasClearedRef.current = true;
    }
  }, [status, logs.length, itinerary, clearLogs]);

  // Auto-scroll terminal
  useEffect(() => {
    if (endOfLogsRef.current) { endOfLogsRef.current.scrollTop = endOfLogsRef.current.scrollHeight; }
  }, [logs]);



  const handlePrepSubmit = (prompt: string, extras: Record<string, unknown>) => {
    sendMessage(prompt, extras);
    setActiveTab('telemetry');
  };

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  const handleSaveTrip = async () => {
    setIsSaving(true);
    
    const destination = extractDestination(itinerary);
    let startDate = new Date();
    if (itinerary?.days?.[0]?.flight_info?.departure_time) {
       const parsed = new Date(itinerary.days[0].flight_info.departure_time);
       if (!isNaN(parsed.getTime())) startDate = parsed;
    }
    const daysLength = itinerary?.days?.length || 3;
    
    await saveTrip({
      destination: destination,
      start_date: startDate.toISOString(),
      end_date: new Date(startDate.getTime() + 86400000 * daysLength).toISOString(),
      itinerary_data: itinerary
    });
    
    setIsSaving(false);
    setIsModalOpen(true);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', height: '100%' }}>
      {/* Left Pane: Preparation Cockpit / Command Center */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="font-display">ACTIVE ENGINE</h2>
          {status === 'inferencing' && (
            <span className="font-mono text-xs text-accent" style={{ fontWeight: 600 }}>
              ● SWARM INFERENCING
            </span>
          )}
        </div>

        {/* Segmented Tab Switcher */}
        <div
          style={{
            display: 'flex',
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '4px',
            gap: '6px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('prep')}
            style={{
              flex: 1,
              padding: '0.6rem',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'var(--font-display)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'prep' ? 'var(--color-accent-primary)' : 'transparent',
              color: activeTab === 'prep' ? '#FFF' : 'var(--color-text-muted)',
              transition: 'all 0.2s',
            }}
          >
            01 // MISSION PREPARATION
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('telemetry')}
            style={{
              flex: 1,
              padding: '0.6rem',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'var(--font-display)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'telemetry' ? 'var(--color-accent-primary)' : 'transparent',
              color: activeTab === 'telemetry' ? '#FFF' : 'var(--color-text-muted)',
              transition: 'all 0.2s',
            }}
          >
            02 // TELEMETRY CONSOLE
          </button>
        </div>

        {/* Tab 1: Mission Preparation Form */}
        {activeTab === 'prep' ? (
          <div
            className="bg-surface border-subtle"
            style={{
              flex: 1,
              borderRadius: '8px',
              padding: '1.25rem',
              overflowY: 'auto',
            }}
          >
            <TripPreparationForm
              onSubmit={handlePrepSubmit}
              disabled={status === 'disconnected' || status === 'inferencing'}
            />
          </div>
        ) : (
          /* Tab 2: Terminal / Logs Command Center */
          <div className="bg-surface border-subtle" style={{ 
            flex: 1, 
            borderRadius: '8px', 
            padding: '1rem', 
            display: 'flex', 
            flexDirection: 'column',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.875rem',
            overflow: 'hidden',
          }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Virtuoso
                style={{ flex: 1, height: '400px' }}
                data={logs}
                itemContent={(index, log) => (
                    <div className={log.includes('ERROR') ? 'text-accent' : 'text-muted'}>
                      {log}
                    </div>
                )}
                followOutput="smooth"
              />
            </div>
            
            {status === 'awaiting_input' && missingFields.length > 0 ? (
              <div style={{ marginTop: '1rem', borderTop: '1px dashed var(--color-accent-primary)', paddingTop: '1rem' }} className="text-accent font-mono">
                <div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>{'>'} CLARIFICATION REQUIRED:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: '1rem' }}>
                  {missingFields.map(field => (
                    <div key={field} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <label style={{ width: '120px', textTransform: 'uppercase' }}>{field.replace('_', ' ')}:</label>
                      <input 
                        type={field.includes('date') ? 'date' : field.includes('budget') ? 'number' : 'text'}
                        value={clarificationData[field] || ''}
                        onChange={(e) => setClarificationData({ ...clarificationData, [field]: e.target.value })}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--color-accent-primary)',
                          color: 'var(--color-accent-primary)',
                          padding: '0.2rem 0.5rem',
                          flex: 1,
                          fontFamily: 'var(--font-mono)'
                        }}
                      />
                    </div>
                  ))}
                  <button 
                    onClick={() => {
                      sendResume(clarificationData);
                      setClarificationData({});
                    }}
                    style={{
                      background: 'var(--color-accent-primary)',
                      color: '#FFF',
                      border: 'none',
                      padding: '0.5rem',
                      marginTop: '0.5rem',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                      alignSelf: 'flex-start'
                    }}
                  >
                    SUBMIT CLARIFICATION
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleQuickSubmit} style={{ marginTop: '1rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <span className="text-accent">{'>'}</span>
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Quick prompt or constraint adjustment..." 
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
            )}
          </div>
        )}
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
                  : 'Configure travel parameters in Mission Preparation to begin C++ optimization.'}
              </p>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 className="font-display">OPTIMIZED ITINERARY</h3>
              <TripTimeline itinerary={itinerary} />
              
              <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                <button 
                  onClick={handleSaveTrip}
                  disabled={isSaving}
                  style={{ flex: 1, padding: '0.5rem', background: 'var(--color-bg-main)', color: 'var(--color-accent-primary)', border: '1px solid var(--color-accent-primary)', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-display)' }}
                >
                  {isSaving ? 'SAVING...' : 'SAVE ITINERARY'}
                </button>
                <button 
                  onClick={() => {
                    const firstPoi = itinerary?.days?.[0]?.itinerary?.path?.[0]?.poi 
                      || (itinerary as any)?.path?.[0]?.poi;
                    if (firstPoi) {
                      sendFeedback(firstPoi, 100.0);
                    }
                  }}
                  style={{ flex: 1, padding: '0.5rem', background: 'var(--color-accent-primary)', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-display)' }}
                >
                  TUNE PREFERENCE
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal 
        isOpen={isModalOpen}
        title="MISSION SAVED"
        message="Your itinerary has been successfully saved to the Vault. You can view and manage it from the Upcoming Trips dashboard."
        onConfirm={() => setIsModalOpen(false)}
        onCancel={() => setIsModalOpen(false)}
        cancelText=""
      />
    </div>
  );
}
