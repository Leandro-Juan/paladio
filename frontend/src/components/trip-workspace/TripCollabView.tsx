"use client";

import React, { useState, useEffect } from 'react';
import { Trip, CollaboratorOption, useTrips } from '@/hooks/useTrips';

interface TripCollabViewProps {
  trip: Trip;
  onTripUpdated?: () => void;
}

export function TripCollabView({ trip, onTripUpdated }: TripCollabViewProps) {
  const { addParticipant, removeParticipant, getCollaboratorOptions } = useTrips();
  const [collaborators, setCollaborators] = useState<CollaboratorOption[]>([]);
  const [newTravelerName, setNewTravelerName] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOptions() {
      const opts = await getCollaboratorOptions();
      setCollaborators(opts);
    }
    loadOptions();
  }, [getCollaboratorOptions]);

  const participants = trip.participants || [];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsAdding(true);

    let name = newTravelerName.trim();
    let userId: string | undefined = undefined;
    let email: string | undefined = undefined;

    if (selectedUserId) {
      const u = collaborators.find((c) => c.id === selectedUserId);
      if (u) {
        userId = u.id;
        name = name || u.username;
        email = u.email;
      }
    }

    if (!name) {
      setError('Please enter a traveler name or choose a registered user.');
      setIsAdding(false);
      return;
    }

    if (userId && participants.some((p) => p.user_id === userId)) {
      setError('This user is already part of the trip.');
      setIsAdding(false);
      return;
    }

    if (participants.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) {
      setError(`A traveler with the name "${name}" is already registered.`);
      setIsAdding(false);
      return;
    }

    if (!trip.id) {
      setError('Trip ID missing.');
      setIsAdding(false);
      return;
    }

    const res = await addParticipant(trip.id, {
      name,
      user_id: userId,
      email,
      role: 'traveler',
    });

    if (res) {
      setNewTravelerName('');
      setSelectedUserId('');
      onTripUpdated?.();
    } else {
      setError('Failed to add traveler.');
    }
    setIsAdding(false);
  };

  const handleRemove = async (participantId: string) => {
    setError(null);
    if (!trip.id) return;
    if (participants.length <= 1) {
      setError('A trip must have at least one participant.');
      return;
    }
    await removeParticipant(trip.id, participantId);
    onTripUpdated?.();
  };

  return (
    <div
      style={{
        padding: '2rem',
        maxWidth: '900px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
      }}
    >
      <div>
        <h2 className="font-display" style={{ margin: 0, fontSize: '1.4rem', color: 'var(--color-text-primary)' }}>
          COLLABORATORS & TRIP CREW
        </h2>
        <p className="font-mono text-muted text-sm mt-1">
          {'// MULTI-TRAVELER ACCESS & EXPENSE ROSTER'}
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: 'var(--color-danger-soft)',
            border: '1px solid var(--color-danger)',
            borderRadius: '8px',
            color: 'var(--color-danger)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
          }}
        >
          [ERROR] {error}
        </div>
      )}

      {/* Add Traveler Form */}
      <div
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '14px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <span className="font-mono text-muted text-xs">{'// ENROLL NEW TRAVELER'}</span>
        <form onSubmit={handleAdd} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label className="font-mono text-muted text-xs">GUEST NAME</label>
            <input
              type="text"
              placeholder="e.g. Alex Smith"
              value={newTravelerName}
              onChange={(e) => setNewTravelerName(e.target.value)}
              style={{
                padding: '8px 12px',
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border-input)',
                borderRadius: '6px',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                fontSize: '0.85rem',
              }}
            />
          </div>

          {collaborators.length > 0 && (
            <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label className="font-mono text-muted text-xs">OR LINK REGISTERED USER</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={{
                  padding: '8px 12px',
                  background: 'var(--color-surface-card)',
                  border: '1px solid var(--color-border-input)',
                  borderRadius: '6px',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'inherit',
                  fontSize: '0.85rem',
                }}
              >
                <option value="">-- Select Registered User --</option>
                {collaborators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.username} ({c.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={isAdding}
            style={{
              padding: '8px 18px',
              background: 'var(--color-accent-primary)',
              color: 'var(--color-btn-primary-text)',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'var(--font-display, inherit)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: isAdding ? 'wait' : 'pointer',
              height: '38px',
            }}
          >
            {isAdding ? 'ADDING...' : '+ ADD TRAVELER'}
          </button>
        </form>
      </div>

      {/* Current Roster */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <span className="font-mono text-muted text-xs">{'// ROSTER'} ({participants.length} MEMBERS)</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {participants.map((p) => (
            <div
              key={p.id}
              style={{
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '12px',
                padding: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'var(--color-accent-teal-soft)',
                    color: 'var(--color-accent-teal)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {p.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '0.9rem' }}>{p.name}</div>
                  <div className="font-mono text-muted" style={{ fontSize: '11px' }}>
                    {p.role || 'traveler'} {p.email ? `• ${p.email}` : ''}
                  </div>
                </div>
              </div>

              {participants.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemove(p.id)}
                  title="Remove Traveler"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-danger)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '4px',
                  }}
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
