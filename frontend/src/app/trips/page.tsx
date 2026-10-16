"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTrips, Trip, CollaboratorOption } from '@/hooks/useTrips';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/EmptyState';
import { countWaypoints } from '@/utils/tripParser';
import { CheckIcon, CloseIcon } from '@/components/icons';

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
  const [crewError, setCrewError] = useState<string | null>(null);

  const handleAddTraveler = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTripForCrew?.id) return;
    setCrewError(null);
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
      setCrewError("Please enter a traveler name or select a registered user.");
      setIsAddingTraveler(false);
      return;
    }

    // Check duplicate user ID
    const existingParts = activeTripForCrew.participants || [];
    if (userId && existingParts.some(p => p.user_id === userId)) {
      setCrewError("This user is already a traveler in this trip.");
      setIsAddingTraveler(false);
      return;
    }

    // Check duplicate name (case-insensitive)
    if (existingParts.some(p => p.name.trim().toLowerCase() === name.toLowerCase())) {
      setCrewError(`A traveler with the name "${name}" is already in this trip.`);
      setIsAddingTraveler(false);
      return;
    }

    const res = await addParticipant(activeTripForCrew.id, {
      name,
      user_id: userId,
      email,
      role: 'traveler',
    });

    if (!res) {
      setCrewError("Failed to add traveler. Duplicate or invalid participant.");
    } else {
      setNewTravelerName('');
      setSelectedUserId('');
    }
    setIsAddingTraveler(false);
  };

  const handleRemoveTraveler = async (participantId: string) => {
    if (!activeTripForCrew?.id) return;
    setCrewError(null);

    const existingParts = activeTripForCrew.participants || [];
    if (existingParts.length <= 1) {
      setCrewError("A trip must have at least one participant. You cannot remove the only remaining participant.");
      return;
    }

    await removeParticipant(activeTripForCrew.id, participantId);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      <div>
        <h2 className="font-display" style={{ fontSize: '32px', fontWeight: 300, color: 'var(--color-text-primary)', margin: 0 }}>
          UPCOMING TRIPS
        </h2>
        <p className="font-mono text-muted text-sm mt-2">
          Confirmed itineraries and multi-user missions
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <p className="font-mono text-muted">LOADING DATA...</p>
        ) : upcomingTrips.length === 0 ? (
          <EmptyState
            type="no-trips"
            title="No Upcoming Trips"
            description="Plan a new multi-day journey or initialize an itinerary protocol from the dashboard."
            action={
              <Link
                href="/dashboard"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-accent-teal-deep)',
                  color: '#FFFFFF',
                  textDecoration: 'none',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                Go to Dashboard
              </Link>
            }
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {upcomingTrips.map((trip: Trip, idx: number) => {
              const participants = trip.participants || [];
              return (
                <div key={trip.id || idx} className="bg-surface border-subtle" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  {/* Card Header */}
                  <div style={{ padding: '1.25rem 1.25rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <h3 className="font-display" style={{ margin: 0, fontSize: '20px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        {trip.destination}
                      </h3>
                      <span className="font-mono text-xs" style={{ background: 'var(--color-bg-main)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
                        {participants.length} {participants.length === 1 ? 'TRAVELER' : 'TRAVELERS'}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-muted" style={{ marginTop: '6px', margin: 0 }}>
                      {new Date(trip.start_date).toLocaleDateString()} – {new Date(trip.end_date).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Card Body */}
                  <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="font-mono text-xs text-muted">WAYPOINTS</span>
                      <span className="font-mono text-sm" style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {countWaypoints(trip.itinerary_data)} STOPS
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="font-mono text-xs text-muted">STATUS</span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'rgba(31, 122, 77, 0.12)',
                          border: '1px solid var(--color-success)',
                          color: 'var(--color-success)',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                        }}
                      >
                        <CheckIcon size={12} color="var(--color-success)" />
                        CONFIRMED
                      </span>
                    </div>

                    {/* Crew / Participants Roster */}
                    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem', marginTop: 'auto' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span className="font-mono text-xs text-muted">CREW</span>
                        <button
                          onClick={() => {
                            setActiveTripIdForCrew(trip.id || null);
                            setCrewError(null);
                            setNewTravelerName('');
                            setSelectedUserId('');
                          }}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text-primary)',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.72rem',
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
                                background: p.role === 'organizer' ? 'rgba(15, 76, 92, 0.1)' : 'var(--color-bg-main)',
                                border: `1px solid ${p.role === 'organizer' ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                                borderRadius: 'var(--radius-full)',
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

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                      <Link
                        href={`/trips/${trip.id}`}
                        style={{
                          flex: 1,
                          padding: '0.55rem',
                          background: 'var(--color-accent-primary)',
                          color: '#FFFFFF',
                          borderRadius: 'var(--radius-md)',
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
                          padding: '0.55rem 0.85rem', 
                          background: 'transparent', 
                          border: '1px solid var(--color-danger)', 
                          color: 'var(--color-danger)', 
                          borderRadius: 'var(--radius-md)', 
                          cursor: 'pointer', 
                          fontFamily: 'var(--font-display)',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          transition: 'all 0.2s',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
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
            inset: 0,
            background: 'rgba(8, 28, 36, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
          onClick={() => setActiveTripIdForCrew(null)}
        >
          <div
            className="bg-surface border-subtle"
            style={{
              width: '100%',
              maxWidth: '520px',
              borderRadius: 'var(--radius-lg)',
              padding: '1.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 className="font-display" style={{ margin: 0, fontSize: '1.35rem', fontWeight: 300, color: 'var(--color-text-primary)' }}>
                  MISSION CREW: {activeTripForCrew.destination.toUpperCase()}
                </h3>
                <p className="font-mono text-muted text-xs mt-1">Manage travelers on this trip</p>
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
                <CloseIcon size={14} />
              </button>
            </div>

            {crewError && (
              <div
                style={{
                  padding: '0.6rem 0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-danger)',
                  background: 'rgba(179, 38, 30, 0.08)',
                  color: 'var(--color-danger)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                [ERROR] {crewError}
              </div>
            )}

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
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-bg-main)',
                      }}
                    >
                      <div>
                        <span className="font-mono text-sm" style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{p.name}</span>
                        {p.email && <span className="font-mono text-xs text-muted" style={{ marginLeft: '8px' }}>({p.email})</span>}
                        {p.role === 'organizer' && (
                          <span
                            className="font-mono text-xs"
                            style={{
                              marginLeft: '8px',
                              padding: '1px 6px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'rgba(15, 76, 92, 0.1)',
                              color: 'var(--color-accent-primary)',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                            }}
                          >
                            ORGANIZER
                          </span>
                        )}
                      </div>
                      {(activeTripForCrew.participants || []).length <= 1 ? (
                        <span
                          className="font-mono text-xs text-muted"
                          style={{ opacity: 0.5, fontStyle: 'italic', cursor: 'not-allowed' }}
                          title="A trip must have at least one participant."
                        >
                          [LOCKED]
                        </span>
                      ) : (
                        <button
                          onClick={() => handleRemoveTraveler(p.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-danger)',
                            cursor: 'pointer',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          REMOVE
                        </button>
                      )}
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
              
              {(() => {
                const existingUserIds = new Set(
                  (activeTripForCrew.participants || []).map((p) => p.user_id).filter(Boolean)
                );
                const availableCollaborators = collaborators.filter((c) => !existingUserIds.has(c.id));
                if (availableCollaborators.length === 0) return null;
                return (
                  <div>
                    <label className="font-mono text-xs text-muted block mb-1">SELECT REGISTERED USER</label>
                    <select
                      value={selectedUserId}
                      onChange={(e) => {
                        setSelectedUserId(e.target.value);
                        if (e.target.value) {
                          const sel = availableCollaborators.find((c) => c.id === e.target.value);
                          if (sel) setNewTravelerName(sel.username);
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg-main)',
                        color: 'var(--color-text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                    >
                      <option value="">-- Choose registered user or enter custom name below --</option>
                      {availableCollaborators.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.username} {c.email ? `(${c.email})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}

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
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-main)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                    outline: 'none',
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
                    color: 'var(--color-text-primary)',
                    borderRadius: 'var(--radius-md)',
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
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
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
