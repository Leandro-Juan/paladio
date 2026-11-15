'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import type { Trip } from '@/hooks/useTrips';
import type { TripCollection, CollectionPoiSummary } from '@/hooks/useTripCollections';
import { PoiCategoryIcon } from '@/components/PoiCategoryBadge';
import { CloseIcon, SearchIcon, PlusIcon, CheckIcon } from '@/components/icons';
import { extractTripTitle } from '@/utils/tripParser';
import { resolveApiMediaUrl } from '@/utils/api';

interface TripPoiCandidate {
  poiId: string;
  tripId: string;
  tripLabel: string;
  tripDestination: string;
  summary: CollectionPoiSummary;
}

interface AddPoiFromTripsModalProps {
  isOpen: boolean;
  onClose: () => void;
  collection: TripCollection | null;
  trips: Trip[];
  onAddPoi: (
    collectionId: string,
    poiId: string,
    summary: CollectionPoiSummary
  ) => Promise<void>;
}

export function AddPoiFromTripsModal({
  isOpen,
  onClose,
  collection,
  trips,
  onAddPoi,
}: AddPoiFromTripsModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTripId, setSelectedTripId] = useState<string>('all');
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const tripOptions = useMemo(() => {
    return trips
      .filter((trip): trip is Trip & { id: string } => Boolean(trip.id))
      .map((trip) => ({
        id: trip.id,
        label: extractTripTitle(trip) || trip.destination || 'Trip',
        destination: trip.destination || '',
      }));
  }, [trips]);

  const candidates = useMemo(() => {
    const list: TripPoiCandidate[] = [];
    const seenPerTrip = new Set<string>();

    for (const trip of trips) {
      if (!trip.id) continue;
      if (selectedTripId !== 'all' && trip.id !== selectedTripId) continue;

      const tripLabel = extractTripTitle(trip) || trip.destination || 'Trip';
      const tripDestination = trip.destination || '';
      const itin = trip.itinerary_data as {
        days?: Array<{
          itinerary?: {
            path?: Array<{
              poi?: {
                id?: string;
                name?: string;
                category?: string;
                duration_mins?: number;
                durationMins?: number;
                cost_eur?: number;
                costEur?: number;
                photo_url?: string | null;
                thumbnail_url?: string | null;
                lat?: number | null;
                lng?: number | null;
                location?: { latitude?: number; longitude?: number; city?: string; country?: string };
                city?: string | null;
                country?: string | null;
                description?: string | null;
                address?: string | null;
                formatted_address?: string | null;
              };
            }>;
          };
        }>;
      } | null;

      if (!itin?.days) continue;

      for (const day of itin.days) {
        const stops = day?.itinerary?.path;
        if (!Array.isArray(stops)) continue;

        for (const stop of stops) {
          const p = stop?.poi;
          if (!p?.id || !p?.name) continue;
          const dedupKey = `${trip.id}:${p.id}`;
          if (seenPerTrip.has(dedupKey)) continue;
          seenPerTrip.add(dedupKey);

          const rawPhoto = p.photo_url || p.thumbnail_url || null;
          const resolvedPhoto = rawPhoto ? resolveApiMediaUrl(rawPhoto) : null;

          list.push({
            poiId: p.id,
            tripId: trip.id,
            tripLabel,
            tripDestination,
            summary: {
              id: p.id,
              name: p.name,
              category: p.category || 'attraction',
              cost_eur: p.cost_eur ?? p.costEur ?? 0,
              duration_mins: p.duration_mins ?? p.durationMins ?? 60,
              lat: p.lat ?? p.location?.latitude ?? null,
              lng: p.lng ?? p.location?.longitude ?? null,
              photo_url: resolvedPhoto,
              thumbnail_url: resolvedPhoto,
              formatted_address: p.formatted_address || p.address || null,
              description: p.description || null,
              city: p.city || p.location?.city || tripDestination || null,
              country: p.country || p.location?.country || null,
            },
          });
        }
      }
    }

    return list;
  }, [trips, selectedTripId]);

  const filteredCandidates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      const name = c.summary.name.toLowerCase();
      const cat = (c.summary.category || '').toLowerCase();
      const city = (c.summary.city || '').toLowerCase();
      const trip = c.tripLabel.toLowerCase();
      return name.includes(q) || cat.includes(q) || city.includes(q) || trip.includes(q);
    });
  }, [candidates, searchQuery]);

  const existingPoiIds = useMemo(() => {
    const ids = new Set<string>();
    if (!collection) return ids;
    for (const item of collection.items) {
      if (item.poi_id) ids.add(item.poi_id.toLowerCase());
      if (item.poi?.id) ids.add(item.poi.id.toLowerCase());
    }
    return ids;
  }, [collection]);

  if (!isOpen || !collection || typeof document === 'undefined') return null;

  const handleAdd = async (cand: TripPoiCandidate) => {
    if (addingIds.has(cand.poiId)) return;
    setAddingIds((prev) => new Set(prev).add(cand.poiId));
    try {
      await onAddPoi(collection.id, cand.poiId, cand.summary);
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev);
        next.delete(cand.poiId);
        return next;
      });
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-from-trips-modal-title"
      data-testid="add-from-trips-modal"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '640px',
          maxHeight: '85vh',
          background: 'var(--color-surface-raised, #FFFFFF)',
          border: '1px solid var(--color-border, #E2D9CC)',
          borderRadius: '20px',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 22px 14px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <h2
              id="add-from-trips-modal-title"
              style={{
                margin: 0,
                fontSize: '17px',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-display, inherit)',
              }}
            >
              Add Places from Your Trips
            </h2>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Adding to <strong>{collection.name}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              color: 'var(--color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div
          style={{
            padding: '12px 22px',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-bg-main, #FAF8F5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span
              style={{
                position: 'absolute',
                left: '12px',
                color: 'var(--color-text-muted)',
                display: 'flex',
                pointerEvents: 'none',
              }}
            >
              <SearchIcon size={14} />
            </span>
            <input
              type="text"
              data-testid="add-from-trips-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search places by name, category, city, or trip..."
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px 8px 34px',
                borderRadius: '10px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-card, #FFFFFF)',
                fontSize: '13px',
                color: 'var(--color-text-primary)',
                outline: 'none',
              }}
            />
          </div>

          {tripOptions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setSelectedTripId('all')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border:
                    selectedTripId === 'all'
                      ? '1px solid var(--color-accent-primary, #0F4C5C)'
                      : '1px solid var(--color-border)',
                  background:
                    selectedTripId === 'all'
                      ? 'var(--color-accent-primary, #0F4C5C)'
                      : 'var(--color-surface-card, #FFFFFF)',
                  color: selectedTripId === 'all' ? '#FFFFFF' : 'var(--color-text-secondary)',
                }}
              >
                All Trips
              </button>
              {tripOptions.map((trip) => (
                <button
                  key={trip.id}
                  type="button"
                  onClick={() => setSelectedTripId(trip.id)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border:
                      selectedTripId === trip.id
                        ? '1px solid var(--color-accent-primary, #0F4C5C)'
                        : '1px solid var(--color-border)',
                    background:
                      selectedTripId === trip.id
                        ? 'var(--color-accent-primary, #0F4C5C)'
                        : 'var(--color-surface-card, #FFFFFF)',
                    color: selectedTripId === trip.id ? '#FFFFFF' : 'var(--color-text-secondary)',
                  }}
                >
                  {trip.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Places List */}
        <div
          style={{
            padding: '14px 22px 20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            flex: 1,
          }}
        >
          {filteredCandidates.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '32px 16px',
                color: 'var(--color-text-muted)',
                fontSize: '13px',
              }}
            >
              {trips.length === 0
                ? 'You have no trips yet. Add a place manually instead!'
                : 'No matching places found in your trips.'}
            </div>
          ) : (
            filteredCandidates.map((cand) => {
              const isAdded = existingPoiIds.has(cand.poiId.toLowerCase());
              const isAdding = addingIds.has(cand.poiId);
              const photo = cand.summary.thumbnail_url || cand.summary.photo_url;

              return (
                <div
                  key={`${cand.tripId}-${cand.poiId}`}
                  data-testid={`trip-poi-candidate-${cand.poiId}`}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-card, #FFFFFF)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        flexShrink: 0,
                        background: 'var(--color-surface-sunken)',
                        border: '1px solid var(--color-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {photo ? (
                        <Image
                          src={photo}
                          alt={cand.summary.name}
                          width={36}
                          height={36}
                          unoptimized
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <PoiCategoryIcon
                          category={cand.summary.category}
                          name={cand.summary.name}
                          size={16}
                        />
                      )}
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--color-text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {cand.summary.name}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {cand.tripLabel}
                        {cand.summary.category ? ` · ${cand.summary.category}` : ''}
                        {cand.summary.duration_mins ? ` · ${cand.summary.duration_mins}m` : ''}
                      </div>
                    </div>
                  </div>

                  {isAdded ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '5px 10px',
                        borderRadius: '9999px',
                        background: 'rgba(42, 157, 143, 0.12)',
                        color: '#2A9D8F',
                        fontSize: '11px',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      <CheckIcon size={12} />
                      Added
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-testid={`add-trip-poi-btn-${cand.poiId}`}
                      disabled={isAdding}
                      onClick={() => handleAdd(cand)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '5px 12px',
                        borderRadius: '9999px',
                        border: 'none',
                        background: 'var(--color-accent-primary, #0F4C5C)',
                        color: '#FFFFFF',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: isAdding ? 'wait' : 'pointer',
                        opacity: isAdding ? 0.7 : 1,
                        flexShrink: 0,
                      }}
                    >
                      <PlusIcon size={12} />
                      {isAdding ? 'Adding...' : 'Add'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
