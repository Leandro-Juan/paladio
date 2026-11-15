"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useTranslation } from '@/hooks/useTranslation';
import {
  useSavedCollections,
  TripCollection,
  CollectionItem,
  CollectionPoiSummary,
  CollectionItemVisitStatus,
} from '@/hooks/useTripCollections';
import type { Trip } from '@/hooks/useTrips';
import { PoiCategoryIcon } from '@/components/PoiCategoryBadge';
import { AddPoiModal } from '@/components/trip-workspace/AddPoiModal';
import { AddPoiFromTripsModal } from './AddPoiFromTripsModal';
import { notify } from '@/utils/notify';
import styles from './SavedCollectionsSection.module.css';

interface SavedCollectionsSectionProps {
  initialCollections?: TripCollection[];
  loading?: boolean;
  trips?: Trip[];
}

const PALADIO_COLORS = [
  { hex: '#0F4C5C', label: 'Pacific Teal' },
  { hex: '#E36414', label: 'Warm Amber' },
  { hex: '#2A9D8F', label: 'Sage Teal' },
  { hex: '#6366F1', label: 'Indigo' },
  { hex: '#E11D48', label: 'Crimson Rose' },
  { hex: '#F59E0B', label: 'Gold' },
];

const regionDisplayNames =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

function resolveCountryName(countryCode?: string | null, country?: string | null): string | null {
  const trimmedCountry = country?.trim();
  if (trimmedCountry && trimmedCountry.length > 2) {
    return trimmedCountry;
  }
  const code = (
    countryCode || (trimmedCountry && trimmedCountry.length === 2 ? trimmedCountry : '')
  )
    .trim()
    .toUpperCase();
  if (code && code.length === 2 && regionDisplayNames) {
    try {
      const resolved = regionDisplayNames.of(code);
      if (resolved && resolved.toUpperCase() !== code) return resolved;
    } catch {
      // Ignore invalid region codes
    }
  }
  return trimmedCountry || code || null;
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
        background: 'var(--color-surface-sunken, #EDE6DC)',
        border: '1px solid var(--color-border, rgba(0, 0, 0, 0.08))',
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

export function SavedCollectionsSection({
  initialCollections,
  loading: externalLoading,
  trips = [],
}: SavedCollectionsSectionProps) {
  const { t } = useTranslation();
  const {
    collections: fetchedCollections,
    loading: hookLoading,
    createCollection,
    updateCollection,
    deleteCollection,
    addItemToCollection,
    updateItemVisitStatus,
    removeItemFromCollection,
  } = useSavedCollections();

  const collections = initialCollections ?? fetchedCollections;
  const loading = externalLoading ?? hookLoading;

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColDesc, setNewColDesc] = useState('');
  const [newColColor, setNewColColor] = useState(PALADIO_COLORS[0].hex);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit collection state
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  // Delete confirmation modal state
  const [pendingDeleteCol, setPendingDeleteCol] = useState<TripCollection | null>(null);
  const [isDeletingCol, setIsDeletingCol] = useState(false);

  // Add POI modals state
  const [tripsPickerCol, setTripsPickerCol] = useState<TripCollection | null>(null);
  const [manualAddCol, setManualAddCol] = useState<TripCollection | null>(null);

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

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const created = await createCollection(
        newColName.trim(),
        newColDesc.trim() || undefined,
        newColColor
      );
      if (created) {
        notify.success('Collection Created', `Created collection "${created.name}"`);
        setNewColName('');
        setNewColDesc('');
        setShowCreateForm(false);
      }
    } catch {
      notify.error('Error', 'Failed to create collection.');
    } finally {
      setIsSubmitting(false);
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

  const handleAddPoiFromTrip = async (
    collectionId: string,
    poiId: string,
    summary: CollectionPoiSummary
  ) => {
    try {
      await addItemToCollection(collectionId, poiId, summary);
      notify.success('Added to Collection', `Added "${summary.name}"`);
    } catch {
      notify.error('Action Failed', `Failed to add "${summary.name}"`);
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

  // Keep tripsPickerCol synced with latest collections state so "Added" badges update live
  const activeTripsPickerCol = tripsPickerCol
    ? collections.find((c) => c.id === tripsPickerCol.id) || tripsPickerCol
    : null;

  return (
    <section
      className={styles.section}
      data-testid="saved-collections-section"
      aria-label={t('dashboard.saved_collections_title')}
    >
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h2 className={styles.title}>{t('dashboard.saved_collections')}</h2>
          <span className={styles.countBadge} data-testid="saved-collections-count">
            {loading ? t('common.loading') : `${collections.length} CURATED`}
          </span>
        </div>

        <button
          type="button"
          data-testid="dashboard-create-collection-btn"
          onClick={() => setShowCreateForm((prev) => !prev)}
          className={showCreateForm ? styles.secondaryBtn : styles.primaryBtn}
        >
          {showCreateForm ? 'Cancel' : '+ New Collection'}
        </button>
      </div>

      {/* Inline Create Collection Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateCollection}
          data-testid="dashboard-create-collection-form"
          className={styles.createForm}
        >
          <div className={styles.createFormTitle}>NEW COLLECTION</div>

          <div className={styles.createFormFields}>
            <input
              type="text"
              data-testid="dashboard-new-collection-name"
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              placeholder="Collection name (e.g. Hidden Gems, Bucket List)"
              maxLength={60}
              required
              autoFocus
              className={styles.textInput}
            />
            <input
              type="text"
              data-testid="dashboard-new-collection-desc"
              value={newColDesc}
              onChange={(e) => setNewColDesc(e.target.value)}
              placeholder="Description (optional)"
              maxLength={120}
              className={styles.textInput}
            />
          </div>

          <div className={styles.createFormFooter}>
            <div className={styles.colorRow}>
              <span className={styles.colorLabel}>Color:</span>
              <div className={styles.colorSwatches}>
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

            <div className={styles.createFormActions}>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className={styles.secondaryBtn}
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="dashboard-submit-collection-btn"
                disabled={!newColName.trim() || isSubmitting}
                className={styles.primaryBtn}
              >
                {isSubmitting ? 'Creating...' : 'Create Collection'}
              </button>
            </div>
          </div>
        </form>
      )}

      {loading && collections.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyDesc}>{t('dashboard.syncing_collections')}</p>
        </div>
      ) : collections.length === 0 && !showCreateForm ? (
        <div className={styles.emptyState} data-testid="saved-collections-empty">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.6 }}
            aria-hidden="true"
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <h3 className={styles.emptyTitle}>{t('dashboard.no_saved_collections')}</h3>
          <p className={styles.emptyDesc}>{t('dashboard.no_collections_desc')}</p>
          <button
            type="button"
            data-testid="dashboard-empty-create-btn"
            onClick={() => setShowCreateForm(true)}
            className={styles.primaryBtn}
          >
            + Create First Collection
          </button>
        </div>
      ) : (
        <div className={styles.grid} data-testid="saved-collections-grid">
          {collections.map((col) => {
            const isEditing = editingColId === col.id;

            // Deduplicate items by normalized ID and name
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
                className={styles.card}
                data-testid={`saved-collection-card-${col.id}`}
              >
                <div
                  className={styles.colorBar}
                  style={{ backgroundColor: col.color || '#0F4C5C' }}
                />

                <div className={styles.cardBody}>
                  <div className={styles.cardHeaderRow}>
                    {isEditing ? (
                      <div className={styles.editRow}>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={60}
                          className={styles.editInput}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(col.id)}
                          className={styles.editSaveBtn}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingColId(null)}
                          className={styles.editCancelBtn}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className={styles.cardTitleGroup}>
                          <h3 className={styles.colName}>{col.name}</h3>
                          {col.trip_destination && (
                            <span className={styles.destinationBadge}>
                              {col.trip_destination}
                            </span>
                          )}
                        </div>

                        <div className={styles.cardActions}>
                          <button
                            type="button"
                            title="Edit collection name"
                            data-testid={`edit-collection-btn-${col.id}`}
                            onClick={() => {
                              setEditingColId(col.id);
                              setEditName(col.name);
                              setEditColor(col.color || PALADIO_COLORS[0].hex);
                            }}
                            className={styles.iconBtn}
                          >
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            title="Delete collection"
                            data-testid={`delete-collection-btn-${col.id}`}
                            onClick={() => setPendingDeleteCol(col)}
                            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                          >
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {col.description && (
                    <p className={styles.colDescription}>{col.description}</p>
                  )}

                  {/* Add Place Actions */}
                  <div className={styles.addPoiToolbar}>
                    <button
                      type="button"
                      data-testid={`add-from-trips-btn-${col.id}`}
                      onClick={() => setTripsPickerCol(col)}
                      className={styles.addPoiBtn}
                    >
                      + From Trips
                    </button>
                    <button
                      type="button"
                      data-testid={`add-manual-poi-btn-${col.id}`}
                      onClick={() => setManualAddCol(col)}
                      className={styles.addPoiBtn}
                    >
                      + Add Manually
                    </button>
                  </div>

                  {/* Collection Items List (matching Trip Details CollectionsTab) */}
                  {uniqueItems.length === 0 ? (
                    <div className={styles.emptyItemsHint}>
                      No places in this collection yet. Add from your trips or create one manually.
                    </div>
                  ) : (
                    <div className={styles.itemsList}>
                      {uniqueItems.map((item: CollectionItem) => {
                        const poiName = item.poi?.name || item.poi_id;
                        const poiCategory = item.poi?.category || 'place';
                        const poiPhoto = item.poi?.thumbnail_url || item.poi?.photo_url;
                        const durationMins = item.poi?.duration_mins || 60;
                        const costEur = item.poi?.cost_eur ?? 0;
                        const visitStatus: CollectionItemVisitStatus =
                          item.visit_status === 'visited' ? 'visited' : 'want_to_go';
                        const isVisited = visitStatus === 'visited';
                        const cityCountryLabel = formatCityCountry(item.poi);

                        const handleToggleVisitStatus = async () => {
                          const nextStatus: CollectionItemVisitStatus = isVisited
                            ? 'want_to_go'
                            : 'visited';
                          try {
                            await updateItemVisitStatus(col.id, item.poi_id, nextStatus);
                          } catch {
                            notify.error('Error', 'Failed to update place status.');
                          }
                        };

                        return (
                          <div
                            key={item.id}
                            data-testid={`dashboard-collection-item-${item.poi_id}`}
                            className={styles.poiRow}
                          >
                            <div className={styles.poiRowInfo}>
                              <CollectionPoiAvatar
                                key={poiPhoto || poiCategory}
                                photoUrl={poiPhoto}
                                name={poiName}
                                category={poiCategory}
                              />

                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div className={styles.poiRowName}>{poiName}</div>
                                {cityCountryLabel && (
                                  <div
                                    title={cityCountryLabel}
                                    className={styles.poiRowLocation}
                                  >
                                    {cityCountryLabel}
                                  </div>
                                )}
                                <div className={styles.poiRowMeta}>
                                  {poiCategory} · {durationMins}m ·{' '}
                                  {costEur === 0 ? 'Free' : `€${costEur}`}
                                </div>
                              </div>
                            </div>

                            <div className={styles.poiRowActions}>
                              {/* Visited / Want to go toggle */}
                              <button
                                type="button"
                                data-testid={`collection-item-status-${item.poi_id}`}
                                title={
                                  isVisited
                                    ? 'Visited — click to mark as Want to go'
                                    : 'Want to go — click to mark as Visited'
                                }
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
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.6"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : (
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                  </svg>
                                )}
                                <span>{isVisited ? 'Visited' : 'Want to go'}</span>
                              </button>

                              {/* Remove from Collection */}
                              <button
                                type="button"
                                title="Remove from collection"
                                data-testid={`remove-collection-item-${item.poi_id}`}
                                onClick={() => handleRemovePoi(col.id, item.poi_id, poiName)}
                                className={styles.removePoiBtn}
                              >
                                <svg
                                  width="13"
                                  height="13"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className={styles.cardFooter}>
                  <span className={styles.footerCount}>
                    {uniqueItems.length} {uniqueItems.length === 1 ? 'place' : 'places'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {pendingDeleteCol &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-delete-collection-modal-title"
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
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3
                    id="dashboard-delete-collection-modal-title"
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

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  marginTop: '4px',
                }}
              >
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

      {/* Add Places from Trips Modal */}
      <AddPoiFromTripsModal
        isOpen={Boolean(activeTripsPickerCol)}
        onClose={() => setTripsPickerCol(null)}
        collection={activeTripsPickerCol}
        trips={trips}
        onAddPoi={handleAddPoiFromTrip}
      />

      {/* Add POI Manually Modal (reusing Trip Details AddPoiModal with City & Country) */}
      <AddPoiModal
        isOpen={Boolean(manualAddCol)}
        onClose={() => setManualAddCol(null)}
        city={manualAddCol?.trip_destination || ''}
        allowCityCountryEdit={true}
        onPoiCreated={async (createdPoi) => {
          if (!manualAddCol) return;
          try {
            await addItemToCollection(manualAddCol.id, createdPoi.id, {
              id: createdPoi.id,
              name: createdPoi.name,
              category: createdPoi.category,
              cost_eur: createdPoi.cost_eur,
              duration_mins: createdPoi.duration_mins,
              lat: createdPoi.lat,
              lng: createdPoi.lng,
              photo_url: createdPoi.photo_url || null,
              thumbnail_url: createdPoi.photo_url || null,
              rating: createdPoi.rating ?? null,
              city: createdPoi.city || null,
              country: createdPoi.country || null,
            });
          } catch {
            notify.error('Action Failed', `Created "${createdPoi.name}", but failed to add it to "${manualAddCol.name}".`);
          }
        }}
      />
    </section>
  );
}
