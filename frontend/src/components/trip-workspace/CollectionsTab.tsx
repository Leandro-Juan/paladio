"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import {
  useTripCollections,
  TripCollection,
  CollectionItem,
  CollectionPoiSummary,
  CollectionItemVisitStatus,
} from '@/hooks/useTripCollections';
import type { PlaceItem } from '@/types/workspace';
import { PoiCategoryIcon } from '@/components/PoiCategoryBadge';
import { getCountryForDestination } from '@/components/VaultMap';
import {
  startCustomDragPreview,
  cleanupCustomDragPreview,
  markPaladioDropHandled,
  resetPaladioDropHandled,
  isPaladioDropHandled,
} from '@/utils/dragPreview';
import { notify } from '@/utils/notify';

interface CollectionsTabProps {
  tripId: string;
  destinationCity?: string;
  onPlaceClick?: (place: PlaceItem) => void;
  onInspectPoi?: (
    poiId: string,
    fallback?: { id?: string; name: string; category?: string; [key: string]: unknown },
    options?: { focusMap?: boolean }
  ) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAddToDay?: (dayNumber: number, poi: any) => void;
  tripDaysCount?: number;
  currencySymbol?: string;
}

const regionDisplayNames =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

function resolveCountryName(countryCode?: string | null, country?: string | null): string | null {
  const trimmedCountry = country?.trim();
  if (trimmedCountry && trimmedCountry.length > 2) {
    return trimmedCountry;
  }
  const code = (countryCode || (trimmedCountry && trimmedCountry.length === 2 ? trimmedCountry : '')).trim().toUpperCase();
  if (code && code.length === 2 && regionDisplayNames) {
    try {
      const resolved = regionDisplayNames.of(code);
      if (resolved && resolved.toUpperCase() !== code) return resolved;
    } catch {
      // Ignore invalid region codes
    }
  }
  return trimmedCountry || (code || null);
}

function formatCityCountry(poi?: CollectionPoiSummary | null): string | null {
  if (!poi) return null;
  const city = poi.city?.trim() || null;
  const country = resolveCountryName(poi.country_code, poi.country);
  if (city && country) {
    if (city.toLowerCase() === country.toLowerCase()) return city;
    return `${city}, ${country}`;
  }
  if (city) return city;
  if (country) return country;
  if (poi.formatted_address) {
    const parts = poi.formatted_address
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
    }
    return parts[0] || null;
  }
  return null;
}

function isSameTripCountry(poi?: CollectionPoiSummary | null, tripDestination?: string): boolean {
  if (!tripDestination || !poi) return true;
  const tripCountry = getCountryForDestination(tripDestination);
  const poiCountry =
    resolveCountryName(poi.country_code, poi.country) ||
    (poi.city ? getCountryForDestination(poi.city) : null);

  if (
    !tripCountry ||
    tripCountry === 'International' ||
    !poiCountry ||
    poiCountry === 'International'
  ) {
    if (poi.city && tripDestination) {
      return poi.city.trim().toLowerCase() === tripDestination.trim().toLowerCase();
    }
    return true;
  }

  return tripCountry.trim().toLowerCase() === poiCountry.trim().toLowerCase();
}

function CollectionPoiAvatar({
  photoUrl,
  name,
  category,
}: {
  photoUrl?: string | null;
  name: string;
  category?: string;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      style={{
        width: '38px',
        height: '38px',
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
      {photoUrl && !imgError ? (
        <Image
          src={photoUrl}
          alt={name}
          width={38}
          height={38}
          unoptimized
          onError={() => setImgError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '50%',
          }}
        />
      ) : (
        <PoiCategoryIcon category={category} name={name} size={18} />
      )}
    </div>
  );
}

const PALADIO_COLORS = [
  { hex: '#0F4C5C', label: 'Pacific Teal' },
  { hex: '#E36414', label: 'Warm Amber' },
  { hex: '#2A9D8F', label: 'Sage Teal' },
  { hex: '#6366F1', label: 'Indigo' },
  { hex: '#E11D48', label: 'Crimson Rose' },
  { hex: '#F59E0B', label: 'Gold' },
];

export function CollectionsTab({
  tripId,
  destinationCity,
  onPlaceClick,
  onInspectPoi,
  onAddToDay,
  tripDaysCount = 7,
  currencySymbol = '€',
}: CollectionsTabProps) {
  const {
    collections,
    loading,
    error,
    createCollection,
    updateCollection,
    deleteCollection,
    removeItemFromCollection,
    updateItemVisitStatus,
    togglePoiInCollection,
  } = useTripCollections(tripId);

  // New Collection Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColDesc, setNewColDesc] = useState('');
  const [newColColor, setNewColColor] = useState(PALADIO_COLORS[0].hex);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Editing state
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  // User-toggled expansion state map
  const [toggledColIds, setToggledColIds] = useState<Record<string, boolean>>({});

  // Drag over target state for collections
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  // Custom delete confirmation modal state
  const [pendingDeleteCol, setPendingDeleteCol] = useState<TripCollection | null>(null);
  const [isDeletingCol, setIsDeletingCol] = useState(false);

  useEffect(() => {
    if (!pendingDeleteCol) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeletingCol) {
        setPendingDeleteCol(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingDeleteCol, isDeletingCol]);

  const handleDropOnCollection = async (col: TripCollection, e: React.DragEvent) => {
    cleanupCustomDragPreview();
    markPaladioDropHandled();

    let payload: {
      source?: string;
      id?: string;
      poi_id?: string;
      poi?: {
        id?: string;
        name?: string;
        category?: string;
        cost_eur?: number;
        costEur?: number;
        duration_mins?: number;
        durationMins?: number;
        photo_url?: string | null;
        thumbnail_url?: string | null;
        formatted_address?: string | null;
        rating?: number | null;
        lat?: number | null;
        lng?: number | null;
        location?: { latitude?: number; longitude?: number };
      };
      name?: string;
      category?: string;
      cost_eur?: number;
      duration_mins?: number;
    } | null = null;

    try {
      const raw = e.dataTransfer.getData('application/paladio-poi') || e.dataTransfer.getData('text/plain');
      if (raw) payload = JSON.parse(raw);
    } catch {
      payload = null;
    }

    if (!payload && typeof window !== 'undefined') {
      const win = window as unknown as { __paladioActivePoi?: unknown; __paladioActiveSearchPoi?: unknown };
      payload = (win.__paladioActivePoi || win.__paladioActiveSearchPoi) as typeof payload;
    }

    if (!payload) return;

    const rawPoi = (payload.poi || payload) as {
      id?: string;
      name?: string;
      category?: string;
      cost_eur?: number;
      costEur?: number;
      duration_mins?: number;
      durationMins?: number;
      photo_url?: string | null;
      thumbnail_url?: string | null;
      formatted_address?: string | null;
      rating?: number | null;
      lat?: number | null;
      lng?: number | null;
      location?: { latitude?: number; longitude?: number };
    };
    const poiId = payload.poi?.id || payload.id || payload.poi_id;
    if (!poiId) return;

    const alreadyInCol = col.items.some((it) => {
      const sameId =
        (it.poi_id && poiId && it.poi_id.toLowerCase() === poiId.toLowerCase()) ||
        (it.poi?.id && poiId && it.poi.id.toLowerCase() === poiId.toLowerCase());
      const sameName = Boolean(
        it.poi?.name &&
          rawPoi.name &&
          it.poi.name.trim().toLowerCase() === rawPoi.name.trim().toLowerCase()
      );
      return sameId || sameName;
    });
    if (alreadyInCol) {
      notify.info('Already Saved', `"${rawPoi.name || 'Place'}" is already in "${col.name}"`);
      return;
    }

    const summary: CollectionPoiSummary = {
      id: poiId,
      name: rawPoi.name || `Place #${poiId}`,
      category: rawPoi.category,
      cost_eur: rawPoi.cost_eur ?? rawPoi.costEur ?? 0,
      duration_mins: rawPoi.duration_mins ?? rawPoi.durationMins ?? 60,
      photo_url: rawPoi.photo_url || rawPoi.thumbnail_url || null,
      thumbnail_url: rawPoi.thumbnail_url || rawPoi.photo_url || null,
      formatted_address: rawPoi.formatted_address || null,
      rating: rawPoi.rating ?? null,
      lat: rawPoi.lat ?? rawPoi.location?.latitude ?? null,
      lng: rawPoi.lng ?? rawPoi.location?.longitude ?? null,
    };

    try {
      await togglePoiInCollection(col.id, poiId, summary);
      notify.success('Added to Collection', `Added "${summary.name}" to "${col.name}"`);
      setToggledColIds((prev) => ({ ...prev, [col.id]: true }));
    } catch {
      notify.error('Action Failed', `Failed to add place to "${col.name}"`);
    }
  };

  const toggleExpand = (colId: string, defaultOpen: boolean) => {
    setToggledColIds((prev) => {
      const current = prev[colId] !== undefined ? prev[colId] : defaultOpen;
      return { ...prev, [colId]: !current };
    });
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const created = await createCollection(newColName.trim(), newColDesc.trim() || undefined, newColColor);
      if (created) {
        notify.success('Collection Created', `Created collection "${created.name}"`);
        setNewColName('');
        setNewColDesc('');
        setShowCreateForm(false);
        setToggledColIds((prev) => ({ ...prev, [created.id]: true }));
      }
    } catch {
      notify.error('Error', 'Failed to create collection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCollection = (col: TripCollection) => {
    setPendingDeleteCol(col);
  };

  const confirmDeleteCollection = async () => {
    if (!pendingDeleteCol || isDeletingCol) return;
    setIsDeletingCol(true);
    try {
      await deleteCollection(pendingDeleteCol.id);
      notify.info('Collection Deleted', `Deleted "${pendingDeleteCol.name}"`);
      setPendingDeleteCol(null);
    } catch {
      notify.error('Error', 'Failed to delete collection.');
    } finally {
      setIsDeletingCol(false);
    }
  };

  const handleSaveEdit = async (colId: string) => {
    if (!editName.trim()) return;
    try {
      await updateCollection(colId, { name: editName.trim(), color: editColor });
      notify.success('Collection Updated', 'Updated collection details.');
      setEditingColId(null);
    } catch {
      notify.error('Error', 'Failed to update collection.');
    }
  };

  const handleRemovePoi = async (collectionId: string, poiId: string, poiName: string) => {
    try {
      await removeItemFromCollection(collectionId, poiId);
      notify.info('Place Removed', `Removed "${poiName}" from collection.`);
    } catch {
      notify.error('Error', 'Failed to remove place from collection.');
    }
  };

  if (loading && collections.length === 0) {
    return (
      <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
        Loading collections...
      </div>
    );
  }

  return (
    <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Collections ({collections.length})
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
            Organize & curate places for your trip
          </div>
        </div>

        <button
          type="button"
          data-testid="create-new-collection-btn"
          onClick={() => setShowCreateForm((prev) => !prev)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: 'var(--radius-full, 9999px)',
            background: showCreateForm ? 'var(--color-surface-sunken)' : 'var(--color-accent-primary)',
            color: showCreateForm ? 'var(--color-text-secondary)' : '#FFFFFF',
            border: showCreateForm ? '1px solid var(--color-border)' : 'none',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <span>{showCreateForm ? 'Cancel' : '+ New Collection'}</span>
        </button>
      </div>

      {error && (
        <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', fontSize: '12px' }}>
          {error}
        </div>
      )}

      {/* Inline Create Collection Panel */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateCollection}
          data-testid="create-collection-form"
          style={{
            padding: '14px',
            borderRadius: '14px',
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-accent-primary)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: 'var(--shadow-sm)',
            animation: 'paladioFadeIn 0.15s ease-out',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent-primary)' }}>
            NEW COLLECTION
          </div>

          <input
            type="text"
            data-testid="input-new-collection-name"
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            placeholder="Collection name (e.g. Hidden Gems, Nightlife)"
            maxLength={60}
            required
            autoFocus
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-raised, #FAFAFA)',
              fontSize: '13px',
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />

          <input
            type="text"
            value={newColDesc}
            onChange={(e) => setNewColDesc(e.target.value)}
            placeholder="Description (optional)"
            maxLength={120}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-raised, #FAFAFA)',
              fontSize: '12px',
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />

          {/* Color Chooser */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Color:</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {PALADIO_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={c.label}
                  onClick={() => setNewColColor(c.hex)}
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: c.hex,
                    border: newColColor === c.hex ? '2px solid #FFFFFF' : 'none',
                    outline: newColColor === c.hex ? `2px solid ${c.hex}` : 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="submit-collection-btn"
              disabled={!newColName.trim() || isSubmitting}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--color-accent-primary)',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 600,
                cursor: !newColName.trim() || isSubmitting ? 'not-allowed' : 'pointer',
                opacity: !newColName.trim() || isSubmitting ? 0.6 : 1,
              }}
            >
              {isSubmitting ? 'Creating...' : 'Create Collection'}
            </button>
          </div>
        </form>
      )}

      {/* Empty State */}
      {collections.length === 0 && !showCreateForm ? (
        <div
          data-testid="collections-empty-state"
          style={{
            textAlign: 'center',
            padding: '40px 16px',
            background: 'var(--color-surface-card)',
            borderRadius: '16px',
            border: '1px dashed var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'rgba(15, 76, 92, 0.08)',
              color: 'var(--color-accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            No Collections Yet
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', maxWidth: '280px', lineHeight: 1.4 }}>
            Create collections to save places, bookmark backup plans, and curate must-see spots for this trip.
          </div>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            style={{
              padding: '8px 18px',
              borderRadius: 'var(--radius-full, 9999px)',
              background: 'var(--color-accent-primary)',
              color: '#FFFFFF',
              border: 'none',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: '4px',
            }}
          >
            + Create First Collection
          </button>
        </div>
      ) : (
        /* Collections List Accordion */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {collections.map((col, index) => {
            const isDefaultOpen = index === 0;
            const isExpanded = toggledColIds[col.id] !== undefined ? toggledColIds[col.id] : isDefaultOpen;
            const isEditing = editingColId === col.id;
            const isDragOver = dragOverColId === col.id;

            // Deduplicate items in this collection by normalized ID and name
            const seenIds = new Set<string>();
            const seenNames = new Set<string>();
            const uniqueItems = (col.items || []).filter((item) => {
              const rawId = (item.poi_id || item.poi?.id || '').trim().toLowerCase();
              const rawName = (item.poi?.name || '').trim().toLowerCase();
              if (rawId && seenIds.has(rawId)) return false;
              if (rawName && seenNames.has(rawName)) return false;
              if (rawId) seenIds.add(rawId);
              if (rawName) seenNames.add(rawName);
              return true;
            });

            return (
              <div
                key={col.id}
                data-testid={`collection-card-${col.id}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  if (dragOverColId !== col.id) {
                    setDragOverColId(col.id);
                  }
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    if (dragOverColId === col.id) setDragOverColId(null);
                  }
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  setDragOverColId(null);
                  await handleDropOnCollection(col, e);
                }}
                style={{
                  borderRadius: '14px',
                  border: isDragOver
                    ? `2px dashed ${col.color || 'var(--color-accent-primary)'}`
                    : isExpanded
                    ? '1.5px solid var(--color-border)'
                    : '1px solid var(--color-border)',
                  background: isDragOver
                    ? 'rgba(15, 76, 92, 0.05)'
                    : 'var(--color-surface-card)',
                  overflow: 'hidden',
                  boxShadow: isDragOver
                    ? '0 6px 20px rgba(15, 76, 92, 0.16)'
                    : 'var(--shadow-sm)',
                  transition: 'all 0.18s ease',
                  transform: isDragOver ? 'scale(1.01)' : 'none',
                }}
              >
                {/* Drag over drop target hint banner */}
                {isDragOver && (
                  <div
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(15, 76, 92, 0.10)',
                      borderBottom: '1px dashed var(--color-accent-primary)',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--color-accent-primary)',
                      textAlign: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Drop here to add to {col.name}
                  </div>
                )}

                {/* Collection Accordion Header */}
                <div
                  onClick={() => !isEditing && toggleExpand(col.id, isDefaultOpen)}
                  style={{
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: isEditing ? 'default' : 'pointer',
                    background: isExpanded ? 'var(--color-surface-raised, #FAFAFA)' : 'transparent',
                    borderBottom: isExpanded ? '1px solid var(--color-border)' : 'none',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: col.color || 'var(--color-accent-primary)',
                        flexShrink: 0,
                      }}
                    />

                    {isEditing ? (
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={60}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-accent-primary)',
                            fontSize: '13px',
                            fontWeight: 600,
                            flex: 1,
                            outline: 'none',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(col.id)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            background: 'var(--color-accent-primary)',
                            color: '#FFFFFF',
                            border: 'none',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingColId(null)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            background: 'transparent',
                            color: 'var(--color-text-secondary)',
                            border: '1px solid var(--color-border)',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '13px',
                            fontWeight: 700,
                            color: 'var(--color-text-primary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {col.name}
                        </div>
                        {col.description && (
                          <div
                            style={{
                              fontSize: '11px',
                              color: 'var(--color-text-muted)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {col.description}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Header Right Controls */}
                  {!isEditing && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '9999px',
                          background: 'rgba(15, 76, 92, 0.08)',
                          color: 'var(--color-accent-primary)',
                        }}
                      >
                        {uniqueItems.length}
                      </span>

                      {/* Edit Button */}
                      <button
                        type="button"
                        title="Edit collection name"
                        onClick={() => {
                          setEditingColId(col.id);
                          setEditName(col.name);
                          setEditColor(col.color || PALADIO_COLORS[0].hex);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--color-text-muted)',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        title="Delete collection"
                        onClick={() => handleDeleteCollection(col)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--color-text-muted)',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>

                      {/* Chevron Toggle */}
                      <div
                        style={{
                          color: 'var(--color-text-muted)',
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>

                {/* Collection Content (Saved POIs) */}
                {isExpanded && (
                  <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {uniqueItems.length === 0 ? (
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '20px 10px',
                          color: 'var(--color-text-muted)',
                          fontSize: '12px',
                          fontStyle: 'italic',
                        }}
                      >
                        No places saved in this collection yet.
                        <br />
                        Click bookmark on any place in Search or Route to add it here.
                      </div>
                    ) : (
                      uniqueItems.map((item: CollectionItem) => {
                        const poiName = item.poi?.name || item.poi_id;
                        const poiCategory = item.poi?.category || 'place';
                        const poiPhoto = item.poi?.thumbnail_url || item.poi?.photo_url;
                        const durationMins = item.poi?.duration_mins || 60;
                        const costEur = item.poi?.cost_eur ?? 0;
                        const visitStatus: CollectionItemVisitStatus =
                          item.visit_status === 'visited' ? 'visited' : 'want_to_go';
                        const isVisited = visitStatus === 'visited';
                        const cityCountryLabel = formatCityCountry(item.poi);
                        const sameCountry = isSameTripCountry(item.poi, destinationCity);

                        const handleToggleVisitStatus = async (e: React.MouseEvent) => {
                          e.stopPropagation();
                          const nextStatus: CollectionItemVisitStatus = isVisited ? 'want_to_go' : 'visited';
                          try {
                            await updateItemVisitStatus(col.id, item.poi_id, nextStatus);
                          } catch {
                            notify.error('Error', 'Failed to update place status.');
                          }
                        };

                        const handlePoiClick = () => {
                          if (sameCountry && onPlaceClick) {
                            onPlaceClick({
                              id: item.poi_id,
                              name: poiName,
                              lat: item.poi?.lat ?? 0,
                              lng: item.poi?.lng ?? 0,
                              category: poiCategory,
                              durationMins,
                              costEur,
                              description: item.poi?.description || undefined,
                            });
                          }
                          if (onInspectPoi) {
                            onInspectPoi(
                              item.poi_id,
                              {
                                id: item.poi_id,
                                name: poiName,
                                lat: item.poi?.lat,
                                lng: item.poi?.lng,
                                category: poiCategory,
                                duration_mins: durationMins,
                                cost_eur: costEur,
                                description: item.poi?.description,
                              },
                              { focusMap: sameCountry }
                            );
                          }
                        };

                        return (
                          <div
                            key={item.id}
                            data-testid={`collection-item-${item.poi_id}`}
                            draggable={true}
                            onDragStart={(e) => {
                              startCustomDragPreview(e, {
                                name: poiName,
                                category: poiCategory,
                                duration_mins: durationMins,
                                cost_eur: costEur,
                              });
                              const payload = {
                                source: 'collection',
                                fromCollectionId: col.id,
                                id: item.poi_id,
                                poi: {
                                  id: item.poi_id,
                                  name: poiName,
                                  category: poiCategory,
                                  cost_eur: costEur,
                                  duration_mins: durationMins,
                                  photo_url: poiPhoto,
                                  lat: item.poi?.lat,
                                  lng: item.poi?.lng,
                                  location:
                                    item.poi?.lat && item.poi?.lng
                                      ? { latitude: item.poi.lat, longitude: item.poi.lng }
                                      : undefined,
                                },
                              };
                              const serialized = JSON.stringify(payload);
                              if (typeof window !== 'undefined') {
                                const win = window as unknown as {
                                  __paladioActivePoi?: unknown;
                                  __paladioActiveSearchPoi?: unknown;
                                };
                                win.__paladioActivePoi = payload;
                                win.__paladioActiveSearchPoi = payload;
                              }
                              resetPaladioDropHandled();
                              e.dataTransfer.setData('application/paladio-poi', serialized);
                              e.dataTransfer.setData('text/plain', serialized);
                              e.dataTransfer.effectAllowed = 'copyMove';

                              // Automatically switch sidebar to route tab so user can drop into any day
                              window.dispatchEvent(new CustomEvent('paladio:switch-to-route'));
                            }}
                            onDragEnd={() => {
                              cleanupCustomDragPreview();
                              if (typeof window !== 'undefined') {
                                const win = window as unknown as {
                                  __paladioActivePoi?: unknown;
                                  __paladioActiveSearchPoi?: unknown;
                                };
                                win.__paladioActivePoi = null;
                                win.__paladioActiveSearchPoi = null;
                              }
                              resetPaladioDropHandled();
                            }}
                            onClick={handlePoiClick}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '10px',
                              border: '1px solid var(--color-border)',
                              background: 'var(--color-surface-card)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              cursor: 'grab',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {/* POI Info (Click to inspect and focus on map if in current trip country) */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                minWidth: 0,
                                flex: 1,
                              }}
                            >
                              <CollectionPoiAvatar
                                key={poiPhoto || poiCategory}
                                photoUrl={poiPhoto}
                                name={poiName}
                                category={poiCategory}
                              />

                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div
                                  style={{
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    color: 'var(--color-text-primary)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {poiName}
                                </div>
                                {cityCountryLabel && (
                                  <div
                                    title={cityCountryLabel}
                                    style={{
                                      fontSize: '10.5px',
                                      color: 'var(--color-text-secondary, #475569)',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      lineHeight: 1.3,
                                    }}
                                  >
                                    {cityCountryLabel}
                                  </div>
                                )}
                                <div
                                  style={{
                                    fontSize: '10px',
                                    color: 'var(--color-text-muted)',
                                    textTransform: 'capitalize',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {poiCategory} · {durationMins}m · {costEur === 0 ? 'Free' : `${currencySymbol}${costEur}`}
                                </div>
                              </div>
                            </div>

                            {/* Item Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                              {/* Visited / Want to go toggle */}
                              <button
                                type="button"
                                data-testid={`collection-item-status-${item.poi_id}`}
                                title={isVisited ? 'Visited — click to mark as Want to go' : 'Want to go — click to mark as Visited'}
                                aria-pressed={isVisited}
                                onClick={handleToggleVisitStatus}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '3px 7px',
                                  borderRadius: '9999px',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                  transition: 'all 0.15s ease',
                                  background: isVisited
                                    ? 'rgba(42, 157, 143, 0.14)'
                                    : 'rgba(15, 76, 92, 0.07)',
                                  color: isVisited
                                    ? '#2A9D8F'
                                    : 'var(--color-accent-primary, #0F4C5C)',
                                  border: isVisited
                                    ? '1px solid rgba(42, 157, 143, 0.35)'
                                    : '1px solid rgba(15, 76, 92, 0.2)',
                                }}
                              >
                                {isVisited ? (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                  </svg>
                                )}
                                <span>{isVisited ? 'Visited' : 'Want to go'}</span>
                              </button>

                              {/* Remove from Collection */}
                              <button
                                type="button"
                                title="Remove from collection"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemovePoi(col.id, item.poi_id, poiName);
                                }}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: 'var(--color-text-muted)',
                                  padding: '4px',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {pendingDeleteCol &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-collection-modal-title"
            data-testid="delete-collection-confirm-modal"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              backgroundColor: 'rgba(15, 23, 42, 0.52)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
            onClick={() => {
              if (!isDeletingCol) setPendingDeleteCol(null);
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '380px',
                background: 'var(--color-surface-raised, #FFFFFF)',
                border: '1px solid var(--color-border, #E2D9CC)',
                borderRadius: '18px',
                boxShadow: '0 24px 60px rgba(15, 23, 42, 0.24)',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'rgba(225, 29, 72, 0.1)',
                    border: '1px solid rgba(225, 29, 72, 0.22)',
                    color: '#E11D48',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3
                    id="delete-collection-modal-title"
                    style={{
                      margin: 0,
                      fontSize: '15px',
                      fontWeight: 700,
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-display, inherit)',
                    }}
                  >
                    Delete collection?
                  </h3>
                  <p
                    style={{
                      margin: '5px 0 0 0',
                      fontSize: '12.5px',
                      lineHeight: 1.45,
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    Are you sure you want to delete{' '}
                    <strong style={{ color: 'var(--color-text-primary)' }}>
                      &ldquo;{pendingDeleteCol.name}&rdquo;
                    </strong>
                    ? This action cannot be undone.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  disabled={isDeletingCol}
                  onClick={() => setPendingDeleteCol(null)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '9px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-card)',
                    color: 'var(--color-text-primary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: isDeletingCol ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-delete-collection-btn"
                  disabled={isDeletingCol}
                  onClick={confirmDeleteCollection}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '9px',
                    border: 'none',
                    background: '#E11D48',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: isDeletingCol ? 'not-allowed' : 'pointer',
                    opacity: isDeletingCol ? 0.7 : 1,
                  }}
                >
                  {isDeletingCol ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
