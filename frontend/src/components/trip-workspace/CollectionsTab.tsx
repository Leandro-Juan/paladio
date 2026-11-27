"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { CustomSelect } from './wallet/parts/CustomSelect';
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
import { getApiBaseUrl, getAuthToken } from '@/utils/api';
import { Collapsible } from '@/components/common/Collapsible';
import { useTranslation } from '@/hooks/useTranslation';
import { classifyPoiCategory, getPoiCategoryLabel } from '@/utils/poiCategory';

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

const englishRegionDisplayNames =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

function resolveCountryName(
  countryCode?: string | null,
  country?: string | null,
  displayLocale: string = 'en'
): string | null {
  const trimmedCountry = country?.trim();
  if (trimmedCountry && trimmedCountry.length > 2) {
    return trimmedCountry;
  }
  const code = (countryCode || (trimmedCountry && trimmedCountry.length === 2 ? trimmedCountry : '')).trim().toUpperCase();
  if (code && code.length === 2 && typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
    try {
      const formatter =
        displayLocale === 'en'
          ? englishRegionDisplayNames
          : new Intl.DisplayNames([displayLocale], { type: 'region' });
      const resolved = formatter?.of(code);
      if (resolved && resolved.toUpperCase() !== code) return resolved;
    } catch {
      // Ignore invalid region codes
    }
  }
  return trimmedCountry || (code || null);
}

function formatCityCountry(poi?: CollectionPoiSummary | null, displayLocale: string = 'en'): string | null {
  if (!poi) return null;
  const city = poi.city?.trim() || null;
  const country = resolveCountryName(poi.country_code, poi.country, displayLocale);
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
    resolveCountryName(poi.country_code, poi.country, 'en') ||
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
          draggable={false}
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
  { hex: '#0F4C5C', labelKey: 'collections.color_pacific_teal' },
  { hex: '#E36414', labelKey: 'collections.color_warm_amber' },
  { hex: '#2A9D8F', labelKey: 'collections.color_sage_teal' },
  { hex: '#6366F1', labelKey: 'collections.color_indigo' },
  { hex: '#E11D48', labelKey: 'collections.color_crimson_rose' },
  { hex: '#F59E0B', labelKey: 'collections.color_gold' },
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
  const { t, locale } = useTranslation();
  const {
    collections,
    loading,
    error,
    refreshCollections,
    createCollection,
    updateCollection,
    deleteCollection,
    removeItemFromCollection,
    updateItemVisitStatus,
    togglePoiInCollection,
  } = useTripCollections(tripId);

  // Import Places Modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTargetColId, setImportTargetColId] = useState<string>('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importUrls, setImportUrls] = useState('');
  const [isImportingPlaces, setIsImportingPlaces] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImportPlaces = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetColId = importTargetColId || collections[0]?.id;
    if (!targetColId) {
      notify.error(t('collections.no_collection_title'), t('collections.no_collection_desc'));
      return;
    }
    if (!importFile && !importUrls.trim()) {
      notify.error(t('collections.no_input_title'), t('collections.no_input_desc'));
      return;
    }
    setIsImportingPlaces(true);
    try {
      const formData = new FormData();
      if (importFile) formData.append('file', importFile);
      if (importUrls.trim()) formData.append('urls', importUrls.trim());
      if (destinationCity) formData.append('city', destinationCity);

      const token = getAuthToken();
      const res = await fetch(`${getApiBaseUrl()}/trips/${tripId}/collections/${targetColId}/import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || t('collections.import_failed_status', { status: res.status }));
      }
      const result = (await res.json()) as {
        imported_count: number;
        created_pois_count: number;
        matched_existing_count: number;
      };
      await refreshCollections();
      notify.success(
        t('collections.places_imported_title'),
        t('collections.places_imported_desc', {
          count: result.imported_count,
          indexed: result.created_pois_count,
          matched: result.matched_existing_count,
        })
      );
      setShowImportModal(false);
      setImportFile(null);
      setImportUrls('');
    } catch (err) {
      notify.error(
        t('collections.import_failed_title'),
        err instanceof Error ? err.message : t('collections.import_failed_desc')
      );
    } finally {
      setIsImportingPlaces(false);
    }
  };

  // New Collection Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColDesc, setNewColDesc] = useState('');
  const [newColColor, setNewColColor] = useState(PALADIO_COLORS[0].hex);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDuplicateCreateName = useMemo(() => {
    const trimmed = newColName.trim().toLowerCase();
    if (!trimmed) return false;
    return collections.some((c) => c.name.trim().toLowerCase() === trimmed);
  }, [newColName, collections]);

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
      notify.info(
        t('collections.already_saved_title'),
        t('collections.already_saved_desc', {
          name: rawPoi.name || t('collections.place_fallback'),
          collection: col.name,
        })
      );
      return;
    }

    const summary: CollectionPoiSummary = {
      id: poiId,
      name: rawPoi.name || t('collections.place_number_fallback', { id: poiId }),
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
      notify.success(
        t('collections.added_to_collection_title'),
        t('collections.added_to_collection_desc', { name: summary.name, collection: col.name })
      );
      setToggledColIds((prev) => ({ ...prev, [col.id]: true }));
    } catch {
      notify.error(
        t('collections.action_failed_title'),
        t('collections.add_place_failed_desc', { collection: col.name })
      );
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
    const trimmedName = newColName.trim();
    if (!trimmedName || isSubmitting) return;

    if (collections.some((c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase())) {
      notify.warning(t('collections.duplicate_name_title'), t('collections.duplicate_name_desc', { name: trimmedName }));
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createCollection(trimmedName, newColDesc.trim() || undefined, newColColor);
      if (created) {
        notify.success(t('collections.created_toast_title'), t('collections.created_collection_desc', { name: created.name }));
        setNewColName('');
        setNewColDesc('');
        setShowCreateForm(false);
        setToggledColIds((prev) => ({ ...prev, [created.id]: true }));
      }
    } catch (err: any) {
      const msg = err?.data?.detail || err?.message || t('collections.create_failed_desc');
      notify.warning(t('collections.warning_title'), msg);
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
      notify.info(t('collections.deleted_toast_title'), t('collections.deleted_toast_desc', { name: pendingDeleteCol.name }));
      setPendingDeleteCol(null);
    } catch {
      notify.error(t('collections.error_title'), t('collections.delete_failed_desc'));
    } finally {
      setIsDeletingCol(false);
    }
  };

  const handleSaveEdit = async (colId: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;

    if (collections.some((c) => c.id !== colId && c.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      notify.warning(t('collections.duplicate_name_title'), t('collections.duplicate_name_desc', { name: trimmed }));
      return;
    }

    try {
      await updateCollection(colId, { name: trimmed, color: editColor });
      notify.success(t('collections.updated_toast_title'), t('collections.updated_toast_desc'));
      setEditingColId(null);
    } catch (err: any) {
      const msg = err?.data?.detail || err?.message || t('collections.update_failed_desc');
      notify.warning(t('collections.warning_title'), msg);
    }
  };

  const handleRemovePoi = async (collectionId: string, poiId: string, poiName: string) => {
    try {
      await removeItemFromCollection(collectionId, poiId);
      notify.info(t('collections.place_removed_title'), t('collections.place_removed_desc', { name: poiName }));
    } catch {
      notify.error(t('collections.error_title'), t('collections.remove_failed_desc'));
    }
  };

  if (loading && collections.length === 0) {
    return (
      <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
        {t('collections.loading')}
      </div>
    );
  }

  return (
    <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {t('collections.header_count', { count: collections.length })}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
            {t('collections.subtitle')}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {collections.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setImportTargetColId(collections[0]?.id || '');
                setShowImportModal(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: 'var(--radius-full, 9999px)',
                background: 'var(--color-surface-card)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span>{t('collections.import_btn')}</span>
            </button>
          )}
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
            <span>{showCreateForm ? t('common.cancel') : t('collections.new_collection_btn')}</span>
          </button>
        </div>
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
          className="paladio-popover"
          data-origin="top"
          style={{
            padding: '14px',
            borderRadius: '14px',
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-accent-primary)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent-primary)' }}>
            {t('collections.new_collection_upper')}
          </div>

          <input
            type="text"
            data-testid="input-new-collection-name"
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            placeholder={t('collections.tab_name_placeholder')}
            maxLength={60}
            required
            autoFocus
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: isDuplicateCreateName
                ? '1px solid var(--color-accent-warning, #E2B33C)'
                : '1px solid var(--color-border)',
              background: 'var(--color-surface-raised, #FAFAFA)',
              fontSize: '13px',
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />

          {isDuplicateCreateName && (
            <div
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11.5px',
                color: 'var(--color-accent-warning, #E2B33C)',
                fontWeight: 600,
                fontFamily: 'var(--font-code, monospace)',
                padding: '2px 4px',
              }}
            >
              <span>{t('collections.duplicate_name_alert', { name: newColName.trim() })}</span>
            </div>
          )}

          <input
            type="text"
            value={newColDesc}
            onChange={(e) => setNewColDesc(e.target.value)}
            placeholder={t('collections.description_optional_placeholder')}
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
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{t('collections.color_label')}</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {PALADIO_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={t(c.labelKey)}
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
              {t('common.cancel')}
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
              {isSubmitting ? t('collections.creating') : t('collections.create_collection_btn')}
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
            {t('collections.empty_title')}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', maxWidth: '280px', lineHeight: 1.4 }}>
            {t('collections.empty_desc')}
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
            {t('collections.create_first_btn')}
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
                    {t('collections.drop_here_hint', { name: col.name })}
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
                    transition: 'background-color var(--transition-fast), border-color var(--transition-fast)',
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
                          {t('common.save')}
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
                        title={t('collections.edit_name_title')}
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
                        title={t('collections.delete_collection_title')}
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
                          transition: 'transform var(--transition-snappy)',
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
                <Collapsible isOpen={isExpanded}>
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
                        {t('collections.empty_items_title')}
                        <br />
                        {t('collections.empty_items_hint')}
                      </div>
                    ) : (
                      uniqueItems.map((item: CollectionItem) => {
                        const poiName = item.poi?.name || item.poi_id;
                        const poiCategory = item.poi?.category || 'place';
                        const classifiedCategory = classifyPoiCategory(item.poi?.category, poiName);
                        const poiCategoryDisplay = item.poi?.category
                          ? locale !== 'en' && classifiedCategory.type !== 'general'
                            ? getPoiCategoryLabel(classifiedCategory, t)
                            : item.poi.category
                          : t('collections.default_place');
                        const poiPhoto = item.poi?.thumbnail_url || item.poi?.photo_url;
                        const durationMins = item.poi?.duration_mins || 60;
                        const costEur = item.poi?.cost_eur ?? 0;
                        const visitStatus: CollectionItemVisitStatus =
                          item.visit_status === 'visited' ? 'visited' : 'want_to_go';
                        const isVisited = visitStatus === 'visited';
                        const cityCountryLabel = formatCityCountry(item.poi, locale);
                        const sameCountry = isSameTripCountry(item.poi, destinationCity);

                        const handleToggleVisitStatus = async (e: React.MouseEvent) => {
                          e.stopPropagation();
                          const nextStatus: CollectionItemVisitStatus = isVisited ? 'want_to_go' : 'visited';
                          try {
                            await updateItemVisitStatus(col.id, item.poi_id, nextStatus);
                          } catch {
                            notify.error(t('collections.error_title'), t('collections.update_status_failed'));
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

                              // Defer switching to Route tab by one animation frame so the browser finishes
                              // initializing the native HTML5 drag session before this container moves offscreen.
                              window.requestAnimationFrame(() => {
                                if ((window as unknown as { __paladioActivePoi?: unknown }).__paladioActivePoi) {
                                  window.dispatchEvent(new CustomEvent('paladio:switch-to-route'));
                                }
                              });
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
                                  {poiCategoryDisplay} · {t('collections.duration_short', { mins: durationMins })} · {costEur === 0 ? t('workspace.free') : `${currencySymbol}${costEur}`}
                                </div>
                              </div>
                            </div>

                            {/* Item Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                              {/* Visited / Want to go toggle */}
                              <button
                                type="button"
                                data-testid={`collection-item-status-${item.poi_id}`}
                                title={isVisited ? t('collections.status_visited_title') : t('collections.status_want_to_go_title')}
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
                                <span>{isVisited ? t('collections.status_visited') : t('collections.status_want_to_go')}</span>
                              </button>

                              {/* Remove from Collection */}
                              <button
                                type="button"
                                title={t('collections.remove_item_title')}
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
                </Collapsible>
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
            className="paladio-modal-backdrop"
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
              className="paladio-modal-panel"
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
                    {t('collections.delete_modal_title')}
                  </h3>
                  <p
                    style={{
                      margin: '5px 0 0 0',
                      fontSize: '12.5px',
                      lineHeight: 1.45,
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {t('collections.delete_modal_prefix')}{' '}
                    <strong style={{ color: 'var(--color-text-primary)' }}>
                      &ldquo;{pendingDeleteCol.name}&rdquo;
                    </strong>
                    {t('collections.delete_modal_suffix')}
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
                  {t('common.cancel')}
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
                  {isDeletingCol ? t('collections.deleting') : t('common.delete')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      {/* Import Places Modal */}
      {showImportModal && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="paladio-modal-backdrop"
          onClick={() => !isImportingPlaces && setShowImportModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <form
            onSubmit={handleImportPlaces}
            className="paladio-modal-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '440px',
              background: 'var(--color-surface-card)',
              borderRadius: '18px',
              border: '1px solid var(--color-border)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {t('collections.import_modal_title')}
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {t('collections.import_modal_desc')}
            </p>
            <CustomSelect
              value={importTargetColId || collections[0]?.id || ''}
              onChange={(val) => setImportTargetColId(val)}
              label={t('collections.target_collection_label')}
              options={collections.map((c) => ({
                value: c.id,
                label: `${c.name} (${c.items_count})`,
                badge: (
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: c.color || '#0F4C5C',
                      flexShrink: 0,
                    }}
                  />
                ),
              }))}
              buttonStyle={{
                borderRadius: '10px',
                padding: '9px 12px',
                fontSize: '12.5px',
                fontFamily: 'inherit',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-raised, #FAFAFA)',
              }}
              menuStyle={{
                width: '100%',
                maxWidth: '100%',
                maxHeight: '220px',
                overflowY: 'auto',
              }}
            />

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '12px',
                border: '1px dashed var(--color-border)',
                background: 'var(--color-surface-sunken, rgba(0, 0, 0, 0.02))',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  color: importFile ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {importFile ? importFile.name : t('collections.select_file_hint')}
              </div>
              <input
                ref={importFileInputRef}
                type="file"
                accept=".gpx,.kml,.kmz,.json,.geojson,.csv"
                style={{ display: 'none' }}
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                onClick={() => importFileInputRef.current?.click()}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-card)',
                  color: 'var(--color-text-primary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {importFile ? t('collections.change_file_btn') : t('collections.choose_file_btn')}
              </button>
            </div>
            <textarea
              rows={3}
              value={importUrls}
              onChange={(e) => setImportUrls(e.target.value)}
              placeholder={t('collections.paste_urls_placeholder')}
              style={{
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-raised, #FAFAFA)',
                color: 'var(--color-text-primary)',
                fontSize: '12px',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                disabled={isImportingPlaces}
                onClick={() => setShowImportModal(false)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-text-primary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={isImportingPlaces}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--color-accent-primary)',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: isImportingPlaces ? 'wait' : 'pointer',
                }}
              >
                {isImportingPlaces ? t('collections.importing') : t('collections.import_places_btn')}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </div>
  );
}
