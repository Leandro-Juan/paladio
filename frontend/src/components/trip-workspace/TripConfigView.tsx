"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Trip, CollaboratorOption, useTrips } from '@/hooks/useTrips';
import type { RouteItineraryData } from '@/types/domain';
import { extractTripTitle } from '@/utils/tripParser';

interface TripConfigViewProps {
  trip: Trip;
  itinerary?: RouteItineraryData | null;
  onTripUpdated?: () => void;
}

const CURRENCIES = [
  { code: 'EUR', label: 'EUR (€) - Euro' },
  { code: 'USD', label: 'USD ($) - US Dollar' },
  { code: 'GBP', label: 'GBP (£) - British Pound' },
  { code: 'JPY', label: 'JPY (¥) - Japanese Yen' },
  { code: 'CHF', label: 'CHF (Fr) - Swiss Franc' },
  { code: 'CAD', label: 'CAD ($) - Canadian Dollar' },
  { code: 'AUD', label: 'AUD ($) - Australian Dollar' },
];

const PACES = [
  { id: 'relaxed', label: 'Relaxed', desc: 'Leisurely pace with ample downtime' },
  { id: 'balanced', label: 'Balanced', desc: 'Even spread of highlights & rest' },
  { id: 'packed', label: 'Packed / High Tempo', desc: 'Maximum sights & active exploration' },
];

export function TripConfigView({ trip, onTripUpdated }: TripConfigViewProps) {
  const router = useRouter();
  const { updateTrip, deleteTrip, addParticipant, removeParticipant, getCollaboratorOptions } = useTrips();

  // Extract initial values from trip and itinerary_data
  const itin = useMemo(() => {
    return (trip.itinerary_data || {}) as Record<string, any>;
  }, [trip.itinerary_data]);

  const travelConstraints = useMemo(() => {
    return (itin.travel_constraints || {}) as Record<string, any>;
  }, [itin]);

  // Form states
  const [title, setTitle] = useState(extractTripTitle(trip));
  const [destination, setDestination] = useState(trip.destination || '');
  const [startDate, setStartDate] = useState(trip.start_date || '');
  const [endDate, setEndDate] = useState(trip.end_date || '');
  const [description, setDescription] = useState(itin.description || '');
  const [notes, setNotes] = useState(itin.notes || '');
  const [budget, setBudget] = useState<string>(
    travelConstraints.budget_usd !== undefined
      ? String(travelConstraints.budget_usd)
      : itin.budget !== undefined
      ? String(itin.budget)
      : ''
  );
  const [currency, setCurrency] = useState(travelConstraints.currency || itin.currency || 'EUR');
  const [pace, setPace] = useState(travelConstraints.pace || 'balanced');
  const [status, setStatus] = useState(trip.status || 'active');

  // Photo state
  const initialPhoto = useMemo(() => {
    if (Array.isArray(itin.photos) && itin.photos.length > 0 && itin.photos[0]) {
      return itin.photos[0];
    }
    return itin.cover_photo || itin.photo_url || '';
  }, [itin]);

  const [photoUrl, setPhotoUrl] = useState(initialPhoto);
  const [photoPreviewError, setPhotoPreviewError] = useState(false);

  // Available photos from itinerary / POIs for quick picker
  const availablePhotos = useMemo(() => {
    const list: string[] = [];
    if (Array.isArray(itin.photos)) {
      itin.photos.forEach((p: unknown) => {
        if (typeof p === 'string' && p.trim() && !list.includes(p)) list.push(p);
      });
    }
    if (Array.isArray(itin.days)) {
      itin.days.forEach((d: any) => {
        if (Array.isArray(d?.itinerary?.path)) {
          d.itinerary.path.forEach((stop: any) => {
            const url = stop?.poi?.photo_url;
            if (typeof url === 'string' && url.trim() && !list.includes(url)) {
              list.push(url);
            }
          });
        }
      });
    }
    return list;
  }, [itin]);

  // Duration calculation
  const durationText = useMemo(() => {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const diffTime = end.getTime() - start.getTime();
    const days = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
    if (days <= 0) return null;
    const nights = Math.max(0, days - 1);
    return `${days} ${days === 1 ? 'day' : 'days'} • ${nights} ${nights === 1 ? 'night' : 'nights'}`;
  }, [startDate, endDate]);

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Integrants / Collaborators state
  const [collaborators, setCollaborators] = useState<CollaboratorOption[]>([]);
  const [newTravelerName, setNewTravelerName] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('traveler');
  const [isAddingTraveler, setIsAddingTraveler] = useState(false);
  const [travelerError, setTravelerError] = useState<string | null>(null);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    async function loadOptions() {
      const opts = await getCollaboratorOptions();
      setCollaborators(opts);
    }
    loadOptions();
  }, [getCollaboratorOptions]);

  // Save General Configuration
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip.id) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const existingPhotos = Array.isArray(itin.photos) ? [...itin.photos] : [];
      let updatedPhotos = existingPhotos;
      if (photoUrl && photoUrl.trim()) {
        const cleanUrl = photoUrl.trim();
        updatedPhotos = [cleanUrl, ...existingPhotos.filter((p) => p !== cleanUrl)];
      }

      const updatedTravelConstraints = {
        ...travelConstraints,
        title: title.trim(),
        destination_city: destination.trim(),
        start_date: startDate,
        end_date: endDate,
        budget_usd: budget ? Number(budget) : undefined,
        currency: currency,
        pace: pace,
      };

      const updatedItinData = {
        ...itin,
        title: title.trim(),
        destination: destination.trim(),
        description: description.trim(),
        notes: notes.trim(),
        photos: updatedPhotos,
        cover_photo: photoUrl.trim() || undefined,
        budget: budget ? Number(budget) : undefined,
        currency: currency,
        travel_constraints: updatedTravelConstraints,
      };

      const res = await updateTrip(trip.id, {
        destination: destination.trim() || title.trim(),
        start_date: startDate,
        end_date: endDate,
        status: status,
        itinerary_data: updatedItinData,
      });

      if (res) {
        setSaveSuccess(true);
        onTripUpdated?.();
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setSaveError('Failed to save trip configuration. Please check your network connection.');
      }
    } catch (err: any) {
      setSaveError(err?.message || 'An unexpected error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  // Add Participant
  const handleAddTraveler = async (e: React.FormEvent) => {
    e.preventDefault();
    setTravelerError(null);
    setIsAddingTraveler(true);

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
      setTravelerError('Please enter a traveler name or select a registered user.');
      setIsAddingTraveler(false);
      return;
    }

    const participants = trip.participants || [];

    if (userId && participants.some((p) => p.user_id === userId)) {
      setTravelerError('This user is already part of the trip crew.');
      setIsAddingTraveler(false);
      return;
    }

    if (participants.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) {
      setTravelerError(`A crew member with the name "${name}" is already registered.`);
      setIsAddingTraveler(false);
      return;
    }

    if (!trip.id) {
      setTravelerError('Trip ID missing.');
      setIsAddingTraveler(false);
      return;
    }

    const res = await addParticipant(trip.id, {
      name,
      user_id: userId,
      email,
      role: selectedRole,
    });

    if (res) {
      setNewTravelerName('');
      setSelectedUserId('');
      setSelectedRole('traveler');
      onTripUpdated?.();
    } else {
      setTravelerError('Failed to add participant to the crew.');
    }
    setIsAddingTraveler(false);
  };

  // Remove Participant
  const handleRemoveTraveler = async (participantId: string) => {
    setTravelerError(null);
    if (!trip.id) return;
    const participants = trip.participants || [];
    if (participants.length <= 1) {
      setTravelerError('A trip expedition must retain at least one participant.');
      return;
    }
    await removeParticipant(trip.id, participantId);
    onTripUpdated?.();
  };

  // Delete Trip
  const handleDeleteTrip = async () => {
    if (!trip.id) return;
    setIsDeleting(true);
    try {
      await deleteTrip(trip.id);
      router.push('/dashboard');
    } catch {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const participants = trip.participants || [];

  return (
    <div
      style={{
        padding: '2rem',
        maxWidth: '1000px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '2.5rem',
      }}
    >
      {/* View Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 className="font-display" style={{ margin: 0, fontSize: '1.6rem', color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
            TRIP CONFIGURATION
          </h2>
          <p className="font-mono text-muted text-sm mt-1">
            {'// EXPEDITION PARAMETERS, MEDIA, BUDGET & CREW ROSTER'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 22px',
            background: saveSuccess ? 'var(--color-accent-teal)' : 'var(--color-accent-primary)',
            color: 'var(--color-btn-primary-text, #fff)',
            border: 'none',
            borderRadius: '8px',
            fontFamily: 'var(--font-display, inherit)',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: isSaving ? 'wait' : 'pointer',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all 0.2s ease',
          }}
        >
          {isSaving ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
              SAVING...
            </>
          ) : saveSuccess ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              SAVED!
            </>
          ) : (
            'SAVE CHANGES'
          )}
        </button>
      </div>

      {saveSuccess && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            background: 'var(--color-accent-teal-soft, rgba(46, 125, 50, 0.1))',
            border: '1px solid var(--color-accent-teal, #2e7d32)',
            borderRadius: '10px',
            color: 'var(--color-accent-teal, #2e7d32)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          ✓ Trip parameters updated successfully and synchronized to database.
        </div>
      )}

      {saveError && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            background: 'var(--color-danger-soft)',
            border: '1px solid var(--color-danger)',
            borderRadius: '10px',
            color: 'var(--color-danger)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
          }}
        >
          [ERROR] {saveError}
        </div>
      )}

      {/* Section 1: Trip Identity & Destination */}
      <section
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <span className="font-mono text-muted text-xs">{'// 01. EXPEDITION IDENTITY'}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="font-mono text-muted text-xs">TRIP NAME / TITLE</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Tokyo Sakura Season Expedition"
              style={{
                padding: '10px 14px',
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border-input)',
                borderRadius: '8px',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                fontSize: '0.95rem',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="font-mono text-muted text-xs">DESTINATION CITY</label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Tokyo"
              style={{
                padding: '10px 14px',
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border-input)',
                borderRadius: '8px',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                fontSize: '0.95rem',
              }}
            />
          </div>
        </div>
      </section>

      {/* Section 2: Cover Photo & Visual Media */}
      <section
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="font-mono text-muted text-xs">{'// 02. COVER PHOTOGRAPHY & MEDIA'}</span>
          {photoUrl && (
            <button
              type="button"
              onClick={() => {
                setPhotoUrl('');
                setPhotoPreviewError(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-danger)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Clear Cover Photo
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Photo Preview Frame */}
          <div
            style={{
              width: '100%',
              height: '180px',
              borderRadius: '10px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-main)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            {photoUrl && !photoPreviewError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="Trip Cover Preview"
                onError={() => setPhotoPreviewError(true)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-muted)', margin: '0 auto 8px' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <div className="font-mono text-muted text-xs">
                  {photoPreviewError ? 'Invalid image URL' : 'No Cover Photo Set'}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label className="font-mono text-muted text-xs">IMAGE URL (WEB LINK)</label>
              <input
                type="url"
                value={photoUrl}
                onChange={(e) => {
                  setPhotoUrl(e.target.value);
                  setPhotoPreviewError(false);
                }}
                placeholder="https://images.unsplash.com/..."
                style={{
                  padding: '10px 14px',
                  background: 'var(--color-bg-main)',
                  border: '1px solid var(--color-border-input)',
                  borderRadius: '8px',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'inherit',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            {/* Quick Picker from Itinerary Waypoints */}
            {availablePhotos.length > 0 && (
              <div>
                <span className="font-mono text-muted text-xs" style={{ display: 'block', marginBottom: '6px' }}>
                  CHOOSE FROM ITINERARY MEDIA ({availablePhotos.length} SIGHTS)
                </span>
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px' }}>
                  {availablePhotos.slice(0, 8).map((url, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => {
                        setPhotoUrl(url);
                        setPhotoPreviewError(false);
                      }}
                      style={{
                        flexShrink: 0,
                        width: '54px',
                        height: '54px',
                        borderRadius: '6px',
                        border: photoUrl === url ? '2px solid var(--color-accent-primary)' : '1px solid var(--color-border)',
                        backgroundImage: `url(${url})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'transform 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
                      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                      title="Use this photo"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Section 3: Narrative & Field Briefing */}
      <section
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <span className="font-mono text-muted text-xs">{'// 03. NARRATIVE & BRIEFING NOTES'}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="font-mono text-muted text-xs">TRIP DESCRIPTION</label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Overview of the mission, highlights, theme, or travel philosophy..."
              style={{
                padding: '10px 14px',
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border-input)',
                borderRadius: '8px',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="font-mono text-muted text-xs">INTERNAL FIELD NOTES & REMINDERS</label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Packing lists, emergency contacts, SIM cards, reservation codes, keys..."
              style={{
                padding: '10px 14px',
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border-input)',
                borderRadius: '8px',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                resize: 'vertical',
              }}
            />
          </div>
        </div>
      </section>

      {/* Section 4: Budget, Currency & Financial Bounds */}
      <section
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <span className="font-mono text-muted text-xs">{'// 04. FINANCIAL PARAMETERS'}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="font-mono text-muted text-xs">TARGET BUDGET</label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                min="0"
                step="50"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="e.g. 2500"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--color-bg-main)',
                  border: '1px solid var(--color-border-input)',
                  borderRadius: '8px',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.95rem',
                }}
              />
            </div>
            <span className="font-mono text-muted text-xs">Target cap evaluated by Knapsack solver & Cost ledger</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="font-mono text-muted text-xs">BASE CURRENCY</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={{
                padding: '10px 14px',
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border-input)',
                borderRadius: '8px',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
              }}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <span className="font-mono text-muted text-xs">Default currency for split ledgers and tickets</span>
          </div>
        </div>
      </section>

      {/* Section 5: Timeline & Travel Tempo */}
      <section
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="font-mono text-muted text-xs">{'// 05. EXPEDITION DATES & TEMPO'}</span>
          {durationText && (
            <span
              className="font-mono"
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontWeight: 600,
              }}
            >
              {durationText}
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="font-mono text-muted text-xs">START DATE</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                padding: '10px 14px',
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border-input)',
                borderRadius: '8px',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.9rem',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="font-mono text-muted text-xs">END DATE</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                padding: '10px 14px',
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border-input)',
                borderRadius: '8px',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.9rem',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label className="font-mono text-muted text-xs">EXPLORATION PACE</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            {PACES.map((p) => {
              const active = pace === p.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPace(p.id)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    textAlign: 'left',
                    background: active ? 'var(--color-accent-teal-soft, rgba(46, 125, 50, 0.08))' : 'var(--color-bg-main)',
                    border: active ? '1.5px solid var(--color-accent-teal, #2e7d32)' : '1px solid var(--color-border-subtle)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', color: active ? 'var(--color-accent-teal, #2e7d32)' : 'var(--color-text-primary)' }}>
                    {p.label}
                  </div>
                  <div className="font-mono text-muted" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                    {p.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 6: Integrants & Crew Roster (Subsumes Collab tab) */}
      <section
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="font-mono text-muted text-xs">
            {'// 06. INTEGRANTS & CREW ROSTER'} ({participants.length} {participants.length === 1 ? 'MEMBER' : 'MEMBERS'})
          </span>
        </div>

        {travelerError && (
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
            [ERROR] {travelerError}
          </div>
        )}

        {/* Enrollment Form */}
        <form
          onSubmit={handleAddTraveler}
          style={{
            background: 'var(--color-bg-main)',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            padding: '1rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'flex-end',
          }}
        >
          <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label className="font-mono text-muted text-xs">GUEST NAME</label>
            <input
              type="text"
              placeholder="e.g. Alex Chen"
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
              <label className="font-mono text-muted text-xs">OR LINK SYSTEM USER</label>
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
                <option value="">-- Choose registered account --</option>
                {collaborators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.username} ({c.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ flex: '0 1 130px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label className="font-mono text-muted text-xs">ROLE</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
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
              <option value="traveler">Traveler</option>
              <option value="organizer">Organizer</option>
              <option value="co-pilot">Co-Pilot</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={isAddingTraveler}
            style={{
              padding: '8px 18px',
              background: 'var(--color-accent-primary)',
              color: 'var(--color-btn-primary-text, #fff)',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'var(--font-display, inherit)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: isAddingTraveler ? 'wait' : 'pointer',
              height: '38px',
            }}
          >
            {isAddingTraveler ? 'ENROLLING...' : '+ ENROLL MEMBER'}
          </button>
        </form>

        {/* Current Roster Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {participants.map((p) => (
            <div
              key={p.id}
              style={{
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                padding: '0.9rem 1.1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: 'var(--color-accent-teal-soft, rgba(46, 125, 50, 0.12))',
                    color: 'var(--color-accent-teal, #2e7d32)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                  }}
                >
                  {p.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '0.92rem' }}>
                    {p.name}
                  </div>
                  <div className="font-mono text-muted" style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                    {p.role || 'traveler'} {p.email ? `• ${p.email}` : ''}
                  </div>
                </div>
              </div>

              {participants.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveTraveler(p.id)}
                  title="Remove from crew"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-danger)',
                    cursor: 'pointer',
                    fontSize: '18px',
                    padding: '4px 8px',
                    lineHeight: 1,
                  }}
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Section 7: Status & Lifecycle */}
      <section
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <span className="font-mono text-muted text-xs">{'// 07. MISSION LIFECYCLE & STATUS'}</span>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {[
            { id: 'active', label: 'Active Expedition', desc: 'In planning or currently traveling' },
            { id: 'completed', label: 'Completed (Archived in Vault)', desc: 'Mission fulfilled' },
            { id: 'archived', label: 'Draft / On Hold', desc: 'Paused exploration' },
          ].map((s) => {
            const active = status === s.id;
            return (
              <button
                type="button"
                key={s.id}
                onClick={() => setStatus(s.id)}
                style={{
                  flex: '1 1 200px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  textAlign: 'left',
                  background: active ? 'var(--color-accent-teal-soft, rgba(46, 125, 50, 0.08))' : 'var(--color-bg-main)',
                  border: active ? '1.5px solid var(--color-accent-teal, #2e7d32)' : '1px solid var(--color-border-subtle)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: active ? 'var(--color-accent-teal, #2e7d32)' : 'var(--color-text-primary)' }}>
                  {s.label}
                </div>
                <div className="font-mono text-muted" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                  {s.desc}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Section 8: Danger Zone */}
      <section
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-danger, #d32f2f)',
          borderRadius: '14px',
          padding: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div>
          <span className="font-mono text-xs" style={{ color: 'var(--color-danger)' }}>{'// DANGER ZONE'}</span>
          <h4 style={{ margin: '4px 0 0', fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>
            Delete Expedition & Purge All Records
          </h4>
          <p className="font-mono text-muted text-xs" style={{ margin: '4px 0 0' }}>
            Irreversibly removes itinerary waypoints, ticket attachments, expense splits, and memory photos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          style={{
            padding: '9px 18px',
            background: 'var(--color-danger-soft)',
            border: '1px solid var(--color-danger)',
            borderRadius: '6px',
            color: 'var(--color-danger)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          DELETE EXPEDITION
        </button>
      </section>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-danger)',
              borderRadius: '14px',
              padding: '1.75rem',
              maxWidth: '460px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
              boxShadow: 'var(--shadow-modal, 0 16px 40px rgba(0,0,0,0.3))',
            }}
          >
            <div>
              <span className="font-mono text-xs" style={{ color: 'var(--color-danger)' }}>
                {'// PERMANENT EXPEDITION PURGE'}
              </span>
              <h3 className="font-display" style={{ margin: '6px 0 0', fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>
                Confirm Deletion of &ldquo;{title || destination}&rdquo;?
              </h3>
            </div>

            <p className="font-mono text-muted text-xs" style={{ margin: 0, lineHeight: 1.5 }}>
              This action cannot be undone. All database records, route schedules, wallet passes, and participant splits associated with this trip ID will be deleted.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                style={{
                  padding: '8px 16px',
                  background: 'var(--color-bg-main)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'inherit',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDeleteTrip}
                disabled={isDeleting}
                style={{
                  padding: '8px 18px',
                  background: 'var(--color-danger)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: isDeleting ? 'wait' : 'pointer',
                }}
              >
                {isDeleting ? 'PURGING...' : 'CONFIRM PURGE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
