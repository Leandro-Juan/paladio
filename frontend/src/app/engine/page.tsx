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
  const {
    status,
    itinerary,
    missingFields,
    verificationPayload,
    overlapWarning,
    clearOverlapWarning,
    sendMessage,
    sendFeedback,
    sendResume,
  } = usePaladioSocket();
  const { logs, clearLogs } = useLogStore();
  const { saveTrip } = useTrips();
  const [activeTab, setActiveTab] = useState<'prep' | 'telemetry'>('prep');
  const [input, setInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [savedTripId, setSavedTripId] = useState<string | null>(null);
  const [clarificationData, setClarificationData] = useState<Record<string, string>>({});
  const endOfLogsRef = useRef<HTMLDivElement>(null);

  const activeConstraints = (verificationPayload?.constraints || {}) as Record<string, unknown>;
  const originCity = clarificationData.origin_city ?? (activeConstraints.origin_city as string) ?? '';
  const destinationCity = clarificationData.destination_city ?? (activeConstraints.destination_city as string) ?? '';
  const startDate = clarificationData.start_date ?? (activeConstraints.start_date as string) ?? '';
  const endDate = clarificationData.end_date ?? (activeConstraints.end_date as string) ?? '';
  const budgetUsd = clarificationData.budget_usd ?? (activeConstraints.budget_usd !== undefined ? String(activeConstraints.budget_usd) : '');

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
    const newThreadId = 'paladio_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    sendMessage(prompt, { ...extras, thread_id: newThreadId });
    setActiveTab('telemetry');
  };

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const extras: Record<string, unknown> = {};
    if (status === 'error' || status === 'connected' || status === 'disconnected') {
      extras.thread_id = 'paladio_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    }
    sendMessage(input, extras);
    setInput('');
  };

  const handleSaveTrip = async () => {
    setIsSaving(true);
    
    const destination = extractDestination(itinerary);
    let startDate = new Date();
    if (itinerary?.travel_constraints?.start_date) {
      const parsed = new Date(itinerary.travel_constraints.start_date);
      if (!isNaN(parsed.getTime())) startDate = parsed;
    } else if (itinerary?.days?.[0]?.flight_info?.departure_time) {
      const parsed = new Date(itinerary.days[0].flight_info.departure_time);
      if (!isNaN(parsed.getTime())) startDate = parsed;
    }
    const daysLength = itinerary?.days?.length || 3;
    
    // DST-safe calendar date arithmetic: avoid naive millisecond math
    let endDate: Date | null = null;
    if (itinerary?.travel_constraints?.end_date) {
      const parsed = new Date(itinerary.travel_constraints.end_date);
      if (!isNaN(parsed.getTime())) endDate = parsed;
    }
    if (!endDate && itinerary?.days && itinerary.days.length > 0) {
      const lastDayFlight = itinerary.days[itinerary.days.length - 1]?.flight_info?.departure_time;
      if (lastDayFlight) {
        const parsed = new Date(lastDayFlight);
        if (!isNaN(parsed.getTime())) endDate = parsed;
      }
    }
    if (!endDate) {
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + Math.max(0, daysLength - 1));
    }
    
    const saved = await saveTrip({
      destination: destination,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      itinerary_data: itinerary
    });
    if (saved?.id) {
      setSavedTripId(saved.id);
    }
    
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
            
            {status === 'awaiting_input' && (verificationPayload || missingFields.length > 0) ? (
              <div style={{ marginTop: '1rem', borderTop: '1px dashed var(--color-accent-primary)', paddingTop: '1rem' }} className="text-accent font-mono">
                <div style={{ marginBottom: '0.75rem', fontWeight: 'bold' }}>
                  {'>'} VERIFICATION REQUIRED: REVIEW TRIP PARAMETERS
                </div>
                {verificationPayload?.message && (
                  <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {verificationPayload.message}
                  </div>
                )}

                {missingFields.length > 0 && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-accent-warning, #D97706)', marginBottom: '0.75rem' }}>
                    [MISSING FIELDS DETECTED]: {missingFields.join(', ').toUpperCase()}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Origin City:</label>
                    <input 
                      type="text" 
                      value={originCity}
                      onChange={(e) => setClarificationData({ ...clarificationData, origin_city: e.target.value })}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        padding: '0.3rem 0.5rem',
                        fontFamily: 'var(--font-mono)'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Destination City:</label>
                    <input 
                      type="text" 
                      value={destinationCity}
                      onChange={(e) => setClarificationData({ ...clarificationData, destination_city: e.target.value })}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        padding: '0.3rem 0.5rem',
                        fontFamily: 'var(--font-mono)'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Departure Date:</label>
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={(e) => setClarificationData({ ...clarificationData, start_date: e.target.value })}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        padding: '0.3rem 0.5rem',
                        fontFamily: 'var(--font-mono)'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Return Date:</label>
                    <input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setClarificationData({ ...clarificationData, end_date: e.target.value })}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        padding: '0.3rem 0.5rem',
                        fontFamily: 'var(--font-mono)'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Budget ($ USD):</label>
                    <input 
                      type="number" 
                      value={budgetUsd}
                      onChange={(e) => setClarificationData({ ...clarificationData, budget_usd: e.target.value })}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        padding: '0.3rem 0.5rem',
                        fontFamily: 'var(--font-mono)'
                      }}
                    />
                  </div>
                </div>

                {/* Extracted Anchors Preview */}
                {verificationPayload?.booking_anchors && (
                  <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: 'var(--color-surface-card)', border: '1px solid var(--color-border)', fontSize: '0.8rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>EXTRACTED BOOKING ANCHORS:</div>
                    {(verificationPayload.booking_anchors as Record<string, any>).hotel?.name && (
                      <div>Hotel: {(verificationPayload.booking_anchors as Record<string, any>).hotel.name} ({(verificationPayload.booking_anchors as Record<string, any>).hotel.city})</div>
                    )}
                    {(verificationPayload.booking_anchors as Record<string, any>).outbound_flight?.origin_iata && (
                      <div>Outbound: Flight {(verificationPayload.booking_anchors as Record<string, any>).outbound_flight.flight_number || ''} ({(verificationPayload.booking_anchors as Record<string, any>).outbound_flight.origin_iata} &rarr; {(verificationPayload.booking_anchors as Record<string, any>).outbound_flight.destination_iata})</div>
                    )}
                    {(verificationPayload.booking_anchors as Record<string, any>).return_flight?.origin_iata && (
                      <div>Return: Flight {(verificationPayload.booking_anchors as Record<string, any>).return_flight.flight_number || ''} ({(verificationPayload.booking_anchors as Record<string, any>).return_flight.origin_iata} &rarr; {(verificationPayload.booking_anchors as Record<string, any>).return_flight.destination_iata})</div>
                    )}
                  </div>
                )}

                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={() => {
                      const payloadToSend: Record<string, unknown> = {
                        origin_city: originCity,
                        destination_city: destinationCity,
                        start_date: startDate,
                        end_date: endDate,
                        budget_usd: Number(budgetUsd) || 1500,
                        ...clarificationData
                      };
                      sendResume(payloadToSend);
                      setClarificationData({});
                    }}
                    style={{
                      background: 'var(--color-accent-primary)',
                      color: '#FFF',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600
                    }}
                  >
                    CONFIRM &amp; PROCEED
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
              <TripTimeline itinerary={itinerary} tripId={savedTripId || undefined} />
              
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

      <Modal 
        isOpen={Boolean(overlapWarning)}
        variant="warning"
        title={overlapWarning?.warning_title || "[WARNING] TRIP SCHEDULE OVERLAP"}
        message={overlapWarning?.message || "A scheduling overlap was detected with an existing trip in your database."}
        confirmText="PROCEED ANYWAY"
        cancelText="ABORT"
        onConfirm={() => {
          sendResume({ approved: true, proceed: true });
          clearOverlapWarning();
        }}
        onCancel={() => {
          sendResume({ approved: false, abort: true });
          clearOverlapWarning();
        }}
      >
        {overlapWarning?.overlapping_trip && (
          <div style={{
            background: 'var(--color-accent-warning-bg, rgba(217, 119, 6, 0.08))',
            border: '1px solid var(--color-accent-warning-border, rgba(217, 119, 6, 0.3))',
            borderRadius: '4px',
            padding: '0.75rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem'
          }}>
            <div style={{ fontWeight: 600, color: 'var(--color-accent-warning, #D97706)', marginBottom: '0.25rem' }}>
              CONFLICTING TRIP DETAILS:
            </div>
            <div>Destination: {overlapWarning.overlapping_trip.destination}</div>
            <div>Dates: {overlapWarning.overlapping_trip.start_date} to {overlapWarning.overlapping_trip.end_date}</div>
          </div>
        )}
      </Modal>
    </div>
  );
}
