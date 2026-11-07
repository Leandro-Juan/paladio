'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, PlusIcon } from '@/components/icons';
import { getApiBaseUrl } from '@/utils/api';
import { notify } from '@/utils/notify';
import { PoiApiItem } from './TripUnifiedSidebar';

export interface AddPoiModalProps {
  isOpen: boolean;
  onClose: () => void;
  city: string;
  defaultLat?: number;
  defaultLng?: number;
  onPoiCreated: (poi: PoiApiItem) => void;
}

const emptySubscribe = () => () => {};

const CATEGORY_OPTIONS = [
  { value: 'attraction', label: 'Attraction' },
  { value: 'monument', label: 'Monument' },
  { value: 'museum', label: 'Museum' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'cafe', label: 'Café' },
  { value: 'park', label: 'Park & Nature' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'viewpoint', label: 'Viewpoint' },
  { value: 'hotel', label: 'Hotel & Lodging' },
  { value: 'transit', label: 'Transit Station' },
];

export function AddPoiModal({
  isOpen,
  onClose,
  city,
  defaultLat,
  defaultLng,
  onPoiCreated,
}: AddPoiModalProps) {
  const isMounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('attraction');
  const [duration, setDuration] = useState(60);
  const [cost, setCost] = useState(0);
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [openTime, setOpenTime] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [rating, setRating] = useState<number | ''>('');
  const [lat, setLat] = useState<string>(
    typeof defaultLat === 'number' && !isNaN(defaultLat) ? String(defaultLat) : ''
  );
  const [lng, setLng] = useState<string>(
    typeof defaultLng === 'number' && !isNaN(defaultLng) ? String(defaultLng) : ''
  );
  const [prevDefaultLat, setPrevDefaultLat] = useState(defaultLat);
  const [prevDefaultLng, setPrevDefaultLng] = useState(defaultLng);

  if (defaultLat !== prevDefaultLat) {
    setPrevDefaultLat(defaultLat);
    if (typeof defaultLat === 'number' && !isNaN(defaultLat)) {
      setLat(String(defaultLat));
    }
  }

  if (defaultLng !== prevDefaultLng) {
    setPrevDefaultLng(defaultLng);
    if (typeof defaultLng === 'number' && !isNaN(defaultLng)) {
      setLng(String(defaultLng));
    }
  }

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setCategory('attraction');
    setDuration(60);
    setCost(0);
    setDescription('');
    setWebsite('');
    setOpenTime('');
    setCloseTime('');
    setRating('');
    setFormError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen || !isMounted) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Please enter a place name.');
      return;
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      setFormError('Please enter valid latitude and longitude coordinates.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const baseUrl = getApiBaseUrl();
      const payload = {
        name: name.trim(),
        city: city || 'Destination',
        category: category.trim().toLowerCase(),
        lat: parsedLat,
        lng: parsedLng,
        duration_mins: Number(duration) || 60,
        cost_eur: Number(cost) || 0,
        description: description.trim() || undefined,
        website: website.trim() || undefined,
        opening_time: openTime.trim() || undefined,
        closing_time: closeTime.trim() || undefined,
        rating: typeof rating === 'number' && !isNaN(rating) ? rating : undefined,
      };

      const res = await fetch(`${baseUrl}/pois`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Failed to save POI (status ${res.status})`);
      }

      const createdPoi: PoiDetail = await res.json();

      const apiItem: PoiApiItem = {
        id: createdPoi.id,
        name: createdPoi.name,
        category: createdPoi.category,
        lat: createdPoi.lat,
        lng: createdPoi.lng,
        duration_mins: createdPoi.duration_mins,
        cost_eur: createdPoi.cost_eur,
        similarity: 1.0,
        rating: createdPoi.scoring?.rating ?? (typeof rating === 'number' ? rating : undefined),
        scoring: createdPoi.scoring
          ? {
              rating: createdPoi.scoring.rating ?? undefined,
              reviews: createdPoi.scoring.reviews ?? undefined,
            }
          : undefined,
        match_type: 'custom',
      };

      onPoiCreated(apiItem);

      window.dispatchEvent(new CustomEvent('paladio:poi-created', { detail: createdPoi }));
      notify.success('Place Added', `"${createdPoi.name}" has been added.`);
      handleClose();
    } catch (err) {
      console.error('Failed to create POI:', err);
      setFormError(err instanceof Error ? err.message : 'Could not create place. Please check details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-poi-modal-title"
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
        pointerEvents: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          handleClose();
        }
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        data-testid="add-poi-modal"
        style={{
          background: 'var(--color-surface-raised, #FFFFFF)',
          border: '1px solid var(--color-border, #E2D9CC)',
          borderRadius: '24px',
          maxWidth: '520px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px 16px 24px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div>
            <h2
              id="add-poi-modal-title"
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--color-text-primary, #0F172A)',
                fontFamily: 'var(--font-display, inherit)',
              }}
            >
              Add New Place
            </h2>
            <p
              style={{
                margin: '2px 0 0 0',
                fontSize: '12px',
                color: 'var(--color-text-muted, #64748B)',
              }}
            >
              Create a custom point of interest in {city || 'your trip destination'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            title="Close"
            aria-label="Close"
            data-testid="close-add-poi-modal-btn"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {formError && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#DC2626',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              {formError}
            </div>
          )}

          {/* Place Name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
              Place Name *
            </label>
            <input
              type="text"
              required
              data-testid="add-poi-name-input"
              placeholder="e.g. Tsukiji Outer Market"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-card, #FFFFFF)',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                outline: 'none',
              }}
            />
          </div>

          {/* Category & Duration */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Category
              </label>
              <select
                data-testid="add-poi-category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-card, #FFFFFF)',
                  fontSize: '12px',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Duration (mins)
              </label>
              <input
                type="number"
                min={5}
                step={5}
                data-testid="add-poi-duration-input"
                value={duration}
                onChange={(e) => setDuration(Math.max(5, Number(e.target.value) || 0))}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-card, #FFFFFF)',
                  fontSize: '12px',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Cost & Website */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Cost (€ / person)
              </label>
              <input
                type="number"
                min={0}
                step={0.5}
                data-testid="add-poi-cost-input"
                value={cost}
                onChange={(e) => setCost(Math.max(0, Number(e.target.value) || 0))}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-card, #FFFFFF)',
                  fontSize: '12px',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Website
              </label>
              <input
                type="url"
                data-testid="add-poi-website-input"
                placeholder="https://..."
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-card, #FFFFFF)',
                  fontSize: '12px',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Coordinates (Lat, Lng) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Latitude *
              </label>
              <input
                type="number"
                step="any"
                required
                data-testid="add-poi-lat-input"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-card, #FFFFFF)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-code, monospace)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Longitude *
              </label>
              <input
                type="number"
                step="any"
                required
                data-testid="add-poi-lng-input"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-card, #FFFFFF)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-code, monospace)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Opening & Closing Windows */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Opening Time
              </label>
              <input
                type="time"
                data-testid="add-poi-open-time-input"
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-card, #FFFFFF)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Closing Time
              </label>
              <input
                type="time"
                data-testid="add-poi-close-time-input"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-card, #FFFFFF)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Rating */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Rating (1.0 – 5.0)
              </label>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent-primary, #0F4C5C)', fontFamily: 'var(--font-mono, monospace)' }}>
                {typeof rating === 'number' ? `★ ${rating.toFixed(1)}` : 'Not Rated'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="range"
                min={1.0}
                max={5.0}
                step={0.1}
                data-testid="add-poi-rating-range"
                value={typeof rating === 'number' ? rating : 4.5}
                onChange={(e) => setRating(parseFloat(e.target.value))}
                style={{
                  flex: 1,
                  accentColor: 'var(--color-accent-primary, #0F4C5C)',
                  cursor: 'pointer',
                }}
              />
              <input
                type="number"
                min={1.0}
                max={5.0}
                step={0.1}
                placeholder="4.5"
                data-testid="add-poi-rating-input"
                value={rating}
                onChange={(e) => {
                  const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                  if (val === '') {
                    setRating('');
                  } else if (!isNaN(val)) {
                    setRating(Math.max(1.0, Math.min(5.0, val)));
                  }
                }}
                style={{
                  width: '64px',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-card, #FFFFFF)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
              Overview / Description
            </label>
            <textarea
              rows={3}
              data-testid="add-poi-description-input"
              placeholder="Notes or tips about this spot..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-card, #FFFFFF)',
                fontSize: '12px',
                color: 'var(--color-text-primary)',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>

          {/* Footer Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              paddingTop: '8px',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleClose}
              data-testid="cancel-add-poi-btn"
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-card, #FFFFFF)',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              data-testid="submit-add-poi-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 20px',
                borderRadius: '10px',
                border: 'none',
                background: 'var(--color-accent-primary, #0F4C5C)',
                fontSize: '13px',
                fontWeight: 600,
                color: '#FFFFFF',
                cursor: isSubmitting || !name.trim() ? 'not-allowed' : 'pointer',
                opacity: isSubmitting || !name.trim() ? 0.6 : 1,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <PlusIcon size={14} color="#FFFFFF" />
              <span>{isSubmitting ? 'Adding...' : 'Add Place'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
