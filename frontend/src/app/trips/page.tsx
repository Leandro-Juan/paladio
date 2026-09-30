"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTrips, Trip, CollaboratorOption } from '@/hooks/useTrips';
import { Modal } from '@/components/Modal';
import { countWaypoints } from '@/utils/tripParser';

export default function TripsPage() {
  const { upcomingTrips, loading, deleteTrip, addParticipant, removeParticipant, getCollaboratorOptions } = useTrips();
  const [tripToDelete, setTripToDelete] = useState<string | null>(null);
  const [activeTripIdForCrew, setActiveTripIdForCrew] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<CollaboratorOption[]>([]);
  const [newTravelerName, setNewTravelerName] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isAddingTraveler, setIsAddingTraveler] = useState(false);

  useEffect(() => {
    async function loadOptions() {
      const opts = await getCollaboratorOptions();
      setCollaborators(opts);
    }
    loadOptions();
  }, [getCollaboratorOptions]);

  const activeTripForCrew = upcomingTrips.find(t => t.id === activeTripIdForCrew) || null;

  const handleAddTraveler = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTripForCrew?.id) return;
    setIsAddingTraveler(true);

    let name = newTravelerName.trim();
    let userId: string | undefined = undefined;
    let email: string | undefined = undefined;

    if (selectedUserId) {
      const user = collaborators.find(c => c.id === selectedUserId);
      if (user) {
        userId = user.id;
        name = name || user.username;
        email = user.email;
      }
    }

    if (!name) {
      setIsAddingTraveler(false);
      return;
    }

    await addParticipant(activeTripForCrew.id, {
      name,
      user_id: userId,
      email,
      role: 'traveler',
    });

    setNewTravelerName('');
    setSelectedUserId('');
    setIsAddingTraveler(false);
  };

  const handleRemoveTraveler = async (participantId: string) => {
    if (!activeTripForCrew?.id) return;
    await removeParticipant(activeTripForCrew.id, participantId);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 className="font-display">UPCOMING TRIPS</h2>
        <p className="font-mono text-muted text-sm mt-2">{'// CONFIRMED ITINERARIES & MULTI-USER MISSIONS'}</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <p className="font-mono text-muted">LOADING DATA...</p>
        ) : upcomingTrips.length === 0 ? (
          <div className="bg-surface border-subtle" style={{ padding: '3rem', textAlign: 'center', borderRadius: '8px' }}>
            <p className="font-mono text-muted">NO UPCOMING TRIPS FOUND.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {upcomingTrips.map((trip: Trip, idx: number) => {
              const participants = trip.participants || [];
              return (
                <div key={trip.id || idx} className="bg-surface border-subtle" style={{ borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ background: 'var(--color-accent-primary)', color: '#FFF', padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <h3 className="font-display" style={{ margin: 0, fontSize: '1.25rem' }}>{trip.destination}</h3>
                      <span className="font-mono text-xs" style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '4px' }}>
                        {participants.length} {participants.length === 1 ? 'TRAVELER' : 'TRAVELERS'}
                      </span>
                    </div>
                    <p className="font-mono text-sm" style={{ opacity: 0.8, marginTop: '4px' }}>
                      {new Date(trip.start_date).toLocaleDateString()} - {new Date(trip.end_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="font-mono text-sm text-muted">WAYPOINTS</span>
                      <span className="font-mono" style={{ fontWeight: 600 }}>
                        {countWaypoints(trip.itinerary_data)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="font-mono text-sm text-muted">STATUS</span>
                      <span className="font-mono text-accent" style={{ fontWeight: 600 }}>CONFIRMED</span>
                    </div>

                    {/* Crew / Participants Roster */}
                    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span className="font-mono text-xs text-muted">{'// CREW'}</span>
                        <button
                          onClick={() => setActiveTripIdForCrew(trip.id || null)}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text-primary)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontFamily: 'var(--font-mono)',
                            cursor: 'pointer',
                          }}
                        >
                          + MANAGE CREW
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                        {participants.length > 0 ? (
                          participants.map((p) => (
                            <span
                              key={p.id}
                              className="font-mono text-xs"
                              style={{
                                padding: '2px 8px',
                                background: p.role === 'organizer' ? 'rgba(30, 58, 138, 0.1)' : 'var(--color-surface-card)',
                                border: `1px solid ${p.role === 'organizer' ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                                borderRadius: '12px',
                                color: 'var(--color-text-primary)',
                                fontWeight: 500,
                              }}
                            >
                              {p.role === 'organizer' ? `* ${p.name}` : p.name}
                            </span>
                          ))
                        ) : (
                          <span className="font-mono text-xs text-muted">[ NO TRAVELERS ASSIGNED ]</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                      <Link
                        href={`/vault/${trip.id}`}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          background: 'var(--color-accent-primary)',
                          color: '#FFF',
                          borderRadius: '4px',
                          textAlign: 'center',
                          textDecoration: 'none',
                          fontFamily: 'var(--font-display)',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        VIEW MISSION
                      </Link>
                      <button 
                        onClick={() => setTripToDelete(trip.id || null)}
                        style={{ 
                          padding: '0.5rem 0.75rem', 
                          background: 'transparent', 
                          border: '1px solid var(--color-accent-secondary, #DC2626)', 
                          color: 'var(--color-accent-secondary, #DC2626)', 
                          borderRadius: '4px', 
                          cursor: 'pointer', 
                          fontFamily: 'var(--font-display)',
                          fontSize: '0.875rem',
                          transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.background = 'var(--color-accent-secondary, #DC2626)'; e.currentTarget.style.color = '#FFF'; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-accent-secondary, #DC2626)'; }}
                      >
                        ABORT
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Abort Trip Modal */}
      <Modal 
        isOpen={tripToDelete !== null}
        title="ABORT MISSION?"
        message="Are you sure you want to delete this itinerary? This action cannot be undone and the route data will be permanently purged from the system."
        confirmText="CONFIRM ABORT"
        cancelText="CANCEL"
        isDanger={true}
        onConfirm={async () => {
          if (tripToDelete) {
            await deleteTrip(tripToDelete);
            setTripToDelete(null);
          }
        }}
        onCancel={() => setTripToDelete(null)}
      />

      {/* Manage Crew / Travelers Modal */}
      {activeTripForCrew && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            className="bg-surface border-subtle"
            style={{
              width: '100%',
              maxWidth: '520px',
              borderRadius: '8px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 className="font-display" style={{ margin: 0, fontSize: '1.25rem' }}>
                  MISSION CREW: {activeTripForCrew.destination.toUpperCase()}
                </h3>
                <p className="font-mono text-muted text-xs mt-1">{'// MANAGE TRAVELERS ON THIS TRIP'}</p>
              </div>
              <button
                onClick={() => setActiveTripIdForCrew(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                }}
              >
                [X]
              </button>
            </div>

            {/* Existing Crew List */}
            <div>
              <span className="font-mono text-xs text-muted">CURRENT TRAVELERS</span>
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto' }}>
                {(activeTripForCrew.participants || []).length > 0 ? (
                  (activeTripForCrew.participants || []).map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid var(--color-border)',
                        borderRadius: '4px',
                        background: 'var(--color-surface-card)',
                      }}
                    >
                      <div>
                        <span className="font-mono text-sm" style={{ fontWeight: 600 }}>{p.name}</span>
                        {p.email && <span className="font-mono text-xs text-muted" style={{ marginLeft: '8px' }}>({p.email})</span>}
                        {p.role === 'organizer' && (
                          <span
                            className="font-mono text-xs"
                            style={{
                              marginLeft: '8px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(30, 58, 138, 0.1)',
                              color: 'var(--color-accent-primary)',
                              fontSize: '0.7rem',
                            }}
                          >
                            ORGANIZER
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveTraveler(p.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-accent-secondary, #DC2626)',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.75rem',
                        }}
                      >
                        REMOVE
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="font-mono text-xs text-muted">[ NO TRAVELERS REGISTERED ]</p>
                )}
              </div>
            </div>

            {/* Add Traveler Form */}
            <form onSubmit={handleAddTraveler} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
              <span className="font-mono text-xs text-muted">ADD TRAVELER TO TRIP</span>
              
              {collaborators.length > 0 && (
                <div>
                  <label className="font-mono text-xs text-muted block mb-1">SELECT REGISTERED USER</label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => {
                      setSelectedUserId(e.target.value);
                      if (e.target.value) {
                        const sel = collaborators.find(c => c.id === e.target.value);
                        if (sel) setNewTravelerName(sel.username);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-main)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <option value="">-- Choose registered user or enter custom name below --</option>
                    {collaborators.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.username} {c.email ? `(${c.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="font-mono text-xs text-muted block mb-1">OR ENTER TRAVELER NAME</label>
                <input
                  type="text"
                  placeholder="e.g. Alex, Maria, Marco..."
                  value={newTravelerName}
                  onChange={(e) => setNewTravelerName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-main)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setActiveTripIdForCrew(null)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'transparent',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                  }}
                >
                  CLOSE
                </button>
                <button
                  type="submit"
                  disabled={isAddingTraveler || (!newTravelerName.trim() && !selectedUserId)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'var(--color-accent-primary)',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    opacity: (isAddingTraveler || (!newTravelerName.trim() && !selectedUserId)) ? 0.5 : 1,
                  }}
                >
                  {isAddingTraveler ? 'ADDING...' : '+ ADD TRAVELER'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

