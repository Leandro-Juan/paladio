'use client';

import React, { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  CloseIcon,
  PhoneIcon,
  PinIcon,
  PlusIcon,
  StarIcon,
} from '@/components/icons';
import { PoiCategoryIcon } from '@/components/PoiCategoryBadge';
import { CustomHourPickerModal } from '@/components/trip-creation/CustomHourPickerModal';
import { PoiLocationPickerModal } from './PoiLocationPickerModal';
import { getApiBaseUrl } from '@/utils/api';
import { notify } from '@/utils/notify';
import { PoiApiItem } from './TripUnifiedSidebar';
import { PoiDetail } from '@/types/domain';

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

const WEEK_DAYS = [
  { key: 'mon', short: 'Mon', full: 'Monday' },
  { key: 'tue', short: 'Tue', full: 'Tuesday' },
  { key: 'wed', short: 'Wed', full: 'Wednesday' },
  { key: 'thu', short: 'Thu', full: 'Thursday' },
  { key: 'fri', short: 'Fri', full: 'Friday' },
  { key: 'sat', short: 'Sat', full: 'Saturday' },
  { key: 'sun', short: 'Sun', full: 'Sunday' },
];

interface DaySchedule {
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

interface PhotoDraft {
  id: string;
  url: string;
  caption?: string;
}

interface DuplicateCandidate {
  id: string;
  name: string;
  category: string;
  city: string;
  lat: number;
  lng: number;
  neighborhood?: string | null;
  rating?: number | null;
  distance_meters?: number | null;
  match_reason: string;
}

const DEFAULT_WEEKLY_SCHEDULE: DaySchedule[] = WEEK_DAYS.map(() => ({
  isOpen: true,
  openTime: '09:00',
  closeTime: '19:00',
}));

function compressImageFile(file: File, maxDim = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string') {
        reject(new Error('Invalid image data'));
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        if (scale >= 1 && dataUrl.length < 350_000) {
          resolve(dataUrl);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-card, #FFFFFF)',
  fontSize: '12.5px',
  color: 'var(--color-text-primary)',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

export function AddPoiModal({
  isOpen,
  onClose,
  city,
  defaultLat,
  defaultLng,
  onPoiCreated,
}: AddPoiModalProps) {
  const isMounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  // Core fields
  const [name, setName] = useState('');
  const [category, setCategory] = useState('attraction');
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  const [duration, setDuration] = useState(60);
  const [cost, setCost] = useState(0);
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [wheelchairAccessible, setWheelchairAccessible] = useState(false);
  const [reservationRequired, setReservationRequired] = useState(false);

  // Rating (interactive 5-star half-star selector)
  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  // Opening / Closing Hours
  const [hoursMode, setHoursMode] = useState<'uniform' | 'weekly'>('uniform');
  const [hoursEnabled, setHoursEnabled] = useState(false);
  const [uniformOpenTime, setUniformOpenTime] = useState('09:00');
  const [uniformCloseTime, setUniformCloseTime] = useState('19:00');
  const [weeklySchedule, setWeeklySchedule] = useState<DaySchedule[]>(() =>
    DEFAULT_WEEKLY_SCHEDULE.map((d) => ({ ...d }))
  );
  const [hourPickerTarget, setHourPickerTarget] = useState<{
    scope: 'uniform' | number;
    field: 'open' | 'close';
    label: string;
    value: string;
  } | null>(null);

  // Location & Map Picker
  const [lat, setLat] = useState<string>(
    typeof defaultLat === 'number' && !isNaN(defaultLat) ? String(defaultLat) : ''
  );
  const [lng, setLng] = useState<string>(
    typeof defaultLng === 'number' && !isNaN(defaultLng) ? String(defaultLng) : ''
  );
  const [prevDefaultLat, setPrevDefaultLat] = useState(defaultLat);
  const [prevDefaultLng, setPrevDefaultLng] = useState(defaultLng);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);

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

  // Photos
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Submission & Duplicate Warning
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateCandidate[] | null>(null);

  // Close category menu on outside click
  useEffect(() => {
    if (!isCategoryMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(e.target as Node)) {
        setIsCategoryMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isCategoryMenuOpen]);

  const resetForm = () => {
    setName('');
    setCategory('attraction');
    setIsCategoryMenuOpen(false);
    setDuration(60);
    setCost(0);
    setDescription('');
    setWebsite('');
    setPhone('');
    setEmail('');
    setAddress('');
    setWheelchairAccessible(false);
    setReservationRequired(false);
    setRating(null);
    setHoverRating(null);
    setHoursMode('uniform');
    setHoursEnabled(false);
    setUniformOpenTime('09:00');
    setUniformCloseTime('19:00');
    setWeeklySchedule(DEFAULT_WEEKLY_SCHEDULE.map((d) => ({ ...d })));
    setHourPickerTarget(null);
    setPhotos([]);
    setPhotoUrlInput('');
    setFormError(null);
    setDuplicateWarning(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen || !isMounted) return null;

  const selectedCategoryObj =
    CATEGORY_OPTIONS.find((opt) => opt.value === category) || CATEGORY_OPTIONS[0];
  const activeRating = hoverRating !== null ? hoverRating : rating ?? 0;

  const handlePhotoFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const nextPhotos: PhotoDraft[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 10 * 1024 * 1024) {
        setFormError('Each image must be under 10 MB.');
        continue;
      }
      try {
        const compressedUrl = await compressImageFile(file);
        nextPhotos.push({
          id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          url: compressedUrl,
          caption: file.name.replace(/\.[^.]+$/, ''),
        });
      } catch {
        setFormError('Could not process one of the selected images.');
      }
    }
    if (nextPhotos.length > 0) {
      setPhotos((prev) => [...prev, ...nextPhotos]);
    }
  };

  const handleAddPhotoUrl = () => {
    const trimmed = photoUrlInput.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      setFormError('Photo URL must start with http:// or https://');
      return;
    }
    setFormError(null);
    setPhotos((prev) => [
      ...prev,
      {
        id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        url: trimmed,
      },
    ]);
    setPhotoUrlInput('');
  };

  const submitCreatePoi = async () => {
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    setIsSubmitting(true);
    setFormError(null);

    try {
      const baseUrl = getApiBaseUrl();

      let weeklyHoursPayload:
        | { is_open: boolean; open_time?: string; close_time?: string }[]
        | undefined;
      let openingTimePayload: string | undefined;
      let closingTimePayload: string | undefined;

      if (hoursMode === 'weekly') {
        weeklyHoursPayload = weeklySchedule.map((day) => ({
          is_open: day.isOpen,
          open_time: day.isOpen ? day.openTime : undefined,
          close_time: day.isOpen ? day.closeTime : undefined,
        }));
      } else if (hoursEnabled) {
        openingTimePayload = uniformOpenTime;
        closingTimePayload = uniformCloseTime;
      }

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
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        neighborhood: address.trim() || undefined,
        wheelchair_accessible: wheelchairAccessible || undefined,
        reservation_required: reservationRequired || undefined,
        opening_time: openingTimePayload,
        closing_time: closingTimePayload,
        weekly_hours: weeklyHoursPayload,
        photos: photos.length > 0 ? photos.map((p) => ({ url: p.url, caption: p.caption })) : undefined,
        rating: rating !== null ? rating : undefined,
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
        rating: createdPoi.scoring?.rating ?? (rating !== null ? rating : undefined),
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Please enter a place name.');
      return;
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      setFormError('Please enter valid coordinates or pick a location on the map.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const baseUrl = getApiBaseUrl();
      const dupParams = new URLSearchParams({
        city: city || '',
        name: name.trim(),
        lat: String(parsedLat),
        lng: String(parsedLng),
      });
      const dupRes = await fetch(`${baseUrl}/pois/check-duplicate?${dupParams.toString()}`);
      if (dupRes.ok) {
        const dupData = await dupRes.json();
        if (dupData?.has_duplicates && Array.isArray(dupData.candidates) && dupData.candidates.length > 0) {
          setDuplicateWarning(dupData.candidates);
          setIsSubmitting(false);
          return;
        }
      }
    } catch {
      // If duplicate check fails due to network glitch, proceed to save
    }

    await submitCreatePoi();
  };

  const handleHourPickerChange = (newValue: string) => {
    if (!hourPickerTarget) return;
    if (hourPickerTarget.scope === 'uniform') {
      if (hourPickerTarget.field === 'open') {
        setUniformOpenTime(newValue);
        setHoursEnabled(true);
      } else {
        setUniformCloseTime(newValue);
        setHoursEnabled(true);
      }
    } else {
      const dayIdx = hourPickerTarget.scope;
      setWeeklySchedule((prev) =>
        prev.map((d, idx) => {
          if (idx !== dayIdx) return d;
          return hourPickerTarget.field === 'open'
            ? { ...d, openTime: newValue }
            : { ...d, closeTime: newValue };
        })
      );
    }
    setHourPickerTarget((prev) => (prev ? { ...prev, value: newValue } : null));
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
          maxWidth: '1040px',
          width: '100%',
          maxHeight: '92vh',
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
            padding: '18px 24px 14px 24px',
            borderBottom: '1px solid var(--color-border)',
            position: 'sticky',
            top: 0,
            background: 'var(--color-surface-raised, #FFFFFF)',
            zIndex: 20,
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
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted, #64748B)' }}>
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
        <form onSubmit={handleSubmit} style={{ padding: '18px 24px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {formError && (
            <div
              style={{
                padding: '9px 12px',
                borderRadius: '10px',
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

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '20px',
              alignItems: 'start',
            }}
          >
            {/* LEFT COLUMN: Identity, Description, Category/Cost, Rating, Contact */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Place Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={labelStyle}>Place Name *</label>
                <input
                  type="text"
                  required
                  data-testid="add-poi-name-input"
                  placeholder="e.g. Museo Sorolla"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ ...inputStyle, fontSize: '13.5px', fontWeight: 500 }}
                />
              </div>

              {/* Description (right below Place Name) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={labelStyle}>Overview / Description</label>
                <textarea
                  rows={3}
                  data-testid="add-poi-description-input"
                  placeholder="Notes, highlights, or tips about this spot..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {/* Custom Category Dropdown + Duration + Cost */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 0.8fr 0.85fr', gap: '10px' }}>
            {/* Custom Category Menu with Icon on Left */}
            <div ref={categoryMenuRef} style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
              <label style={labelStyle}>Category</label>
              <button
                type="button"
                data-testid="add-poi-category-select"
                aria-expanded={isCategoryMenuOpen}
                onClick={() => setIsCategoryMenuOpen((prev) => !prev)}
                style={{
                  ...inputStyle,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  borderColor: isCategoryMenuOpen ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-border)',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <PoiCategoryIcon category={selectedCategoryObj.value} size={15} color="var(--color-accent-primary, #0F4C5C)" />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedCategoryObj.label}
                  </span>
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    color: 'var(--color-text-muted)',
                    transform: isCategoryMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.16s ease',
                  }}
                >
                  <ChevronDownIcon size={13} />
                </span>
              </button>

              {isCategoryMenuOpen && (
                <div
                  role="listbox"
                  data-testid="add-poi-category-menu"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    background: 'var(--color-surface-raised, #FFFFFF)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '14px',
                    boxShadow: '0 14px 32px rgba(15, 76, 92, 0.18)',
                    padding: '6px',
                    zIndex: 60,
                    maxHeight: '240px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  {CATEGORY_OPTIONS.map((opt) => {
                    const isSelected = opt.value === category;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        data-testid={`add-poi-category-option-${opt.value}`}
                        onClick={() => {
                          setCategory(opt.value);
                          setIsCategoryMenuOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          padding: '8px 10px',
                          borderRadius: '9px',
                          border: 'none',
                          background: isSelected ? 'rgba(15, 76, 92, 0.08)' : 'transparent',
                          color: isSelected ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-text-primary)',
                          fontSize: '12.5px',
                          fontWeight: isSelected ? 700 : 500,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <PoiCategoryIcon
                            category={opt.value}
                            size={15}
                            color={isSelected ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-text-muted)'}
                          />
                          <span>{opt.label}</span>
                        </span>
                        {isSelected && <CheckIcon size={13} color="var(--color-accent-primary, #0F4C5C)" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={labelStyle}>Duration (mins)</label>
              <input
                type="number"
                min={5}
                step={5}
                data-testid="add-poi-duration-input"
                value={duration}
                onChange={(e) => setDuration(Math.max(5, Number(e.target.value) || 0))}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={labelStyle}>Cost (€ / person)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                data-testid="add-poi-cost-input"
                value={cost}
                onChange={(e) => setCost(Math.max(0, Number(e.target.value) || 0))}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Interactive 5-Star Rating (matching Search Star Filter) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={labelStyle}>Rating (0.5 – 5.0 Stars)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  data-testid="add-poi-rating-label"
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: rating !== null ? '#B45309' : 'var(--color-text-muted)',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  {rating !== null ? `★ ${rating.toFixed(1)}` : 'Not Rated'}
                </span>
                {rating !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setRating(null);
                      setHoverRating(null);
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--color-accent-primary, #0F4C5C)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div
              onMouseLeave={() => setHoverRating(null)}
              data-testid="add-poi-star-rating"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '9px 14px',
                background: 'var(--color-bg-main, #FAF8F5)',
                borderRadius: '12px',
                border: '1px solid var(--color-border)',
              }}
            >
              {[1, 2, 3, 4, 5].map((starIdx) => {
                const fullFilled = activeRating >= starIdx;
                const halfFilled = !fullFilled && activeRating >= starIdx - 0.5;

                return (
                  <div
                    key={starIdx}
                    style={{
                      position: 'relative',
                      width: '26px',
                      height: '26px',
                      userSelect: 'none',
                    }}
                  >
                    {!fullFilled && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          pointerEvents: 'none',
                        }}
                      >
                        <StarIcon size={22} fill="none" color="var(--color-border, #CBD5E1)" />
                      </div>
                    )}

                    {halfFilled && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '50%',
                          height: '100%',
                          overflow: 'hidden',
                          pointerEvents: 'none',
                        }}
                      >
                        <div style={{ width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <StarIcon size={22} fill="#F59E0B" color="#F59E0B" />
                        </div>
                      </div>
                    )}

                    {fullFilled && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          pointerEvents: 'none',
                        }}
                      >
                        <StarIcon size={22} fill="#F59E0B" color="#F59E0B" />
                      </div>
                    )}

                    {/* Left half (0.5) */}
                    <button
                      type="button"
                      aria-label={`Rate ${starIdx - 0.5} stars`}
                      data-testid={`add-poi-star-${starIdx}-half`}
                      onMouseEnter={() => setHoverRating(starIdx - 0.5)}
                      onClick={() => {
                        const val = starIdx - 0.5;
                        setRating(rating === val ? null : val);
                        setHoverRating(null);
                      }}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '50%',
                        height: '100%',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        zIndex: 10,
                      }}
                    />

                    {/* Right half (1.0) */}
                    <button
                      type="button"
                      aria-label={`Rate ${starIdx} stars`}
                      data-testid={`add-poi-star-${starIdx}-full`}
                      onMouseEnter={() => setHoverRating(starIdx)}
                      onClick={() => {
                        setRating(rating === starIdx ? null : starIdx);
                        setHoverRating(null);
                      }}
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: '50%',
                        height: '100%',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        zIndex: 10,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Contact & Additional Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={labelStyle}>Phone</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: '10px', display: 'inline-flex', color: 'var(--color-text-muted)' }}>
                  <PhoneIcon size={12} />
                </span>
                <input
                  type="tel"
                  data-testid="add-poi-phone-input"
                  placeholder="+34 91..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{ ...inputStyle, paddingLeft: '28px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={labelStyle}>Website</label>
              <input
                type="url"
                data-testid="add-poi-website-input"
                placeholder="https://..."
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                data-testid="add-poi-email-input"
                placeholder="info@place.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Relevant POI Attributes */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              data-testid="add-poi-wheelchair-toggle"
              onClick={() => setWheelchairAccessible((v) => !v)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '9999px',
                border: `1px solid ${wheelchairAccessible ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-border)'}`,
                background: wheelchairAccessible ? 'rgba(15, 76, 92, 0.08)' : 'var(--color-surface-card, #FFFFFF)',
                color: wheelchairAccessible ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-text-secondary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {wheelchairAccessible && <CheckIcon size={12} />}
              Wheelchair Accessible
            </button>

            <button
              type="button"
              data-testid="add-poi-reservation-toggle"
              onClick={() => setReservationRequired((v) => !v)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '9999px',
                border: `1px solid ${reservationRequired ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-border)'}`,
                background: reservationRequired ? 'rgba(15, 76, 92, 0.08)' : 'var(--color-surface-card, #FFFFFF)',
                color: reservationRequired ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-text-secondary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {reservationRequired && <CheckIcon size={12} />}
              Reservation Recommended
            </button>
          </div>
          </div>

          {/* RIGHT COLUMN: Location, Hours, Photos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Location & Street / Map Picker */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '14px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-main, #FAF8F5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <label style={labelStyle}>Location & Street Address</label>
              <button
                type="button"
                data-testid="open-poi-map-picker-btn"
                onClick={() => setIsMapPickerOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '9999px',
                  border: '1px solid var(--color-accent-primary, #0F4C5C)',
                  background: 'rgba(15, 76, 92, 0.08)',
                  color: 'var(--color-accent-primary, #0F4C5C)',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <PinIcon size={13} />
                Open Map & Search Street
              </button>
            </div>

            <input
              type="text"
              data-testid="add-poi-address-input"
              placeholder="Street, square, or neighborhood (auto-filled from map)..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={inputStyle}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ ...labelStyle, fontSize: '10px' }}>Latitude *</label>
                <input
                  type="number"
                  step="any"
                  required
                  data-testid="add-poi-lat-input"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono, monospace)', fontSize: '12px' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ ...labelStyle, fontSize: '10px' }}>Longitude *</label>
                <input
                  type="number"
                  step="any"
                  required
                  data-testid="add-poi-lng-input"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono, monospace)', fontSize: '12px' }}
                />
              </div>
            </div>
          </div>

          {/* Opening & Closing Hours (CustomHourPickerModal + Per-Day / Closed) */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '14px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-main, #FAF8F5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <label style={labelStyle}>Opening & Closing Hours</label>
              <div
                style={{
                  display: 'inline-flex',
                  padding: '2px',
                  borderRadius: '9999px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-card, #FFFFFF)',
                }}
              >
                <button
                  type="button"
                  data-testid="hours-mode-uniform-btn"
                  onClick={() => setHoursMode('uniform')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: hoursMode === 'uniform' ? 'var(--color-accent-primary, #0F4C5C)' : 'transparent',
                    color: hoursMode === 'uniform' ? '#FFFFFF' : 'var(--color-text-muted)',
                  }}
                >
                  Same Every Day
                </button>
                <button
                  type="button"
                  data-testid="hours-mode-weekly-btn"
                  onClick={() => setHoursMode('weekly')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: hoursMode === 'weekly' ? 'var(--color-accent-primary, #0F4C5C)' : 'transparent',
                    color: hoursMode === 'weekly' ? '#FFFFFF' : 'var(--color-text-muted)',
                  }}
                >
                  By Day of Week
                </button>
              </div>
            </div>

            {hoursMode === 'uniform' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  data-testid="add-poi-open-time-btn"
                  onClick={() =>
                    setHourPickerTarget({
                      scope: 'uniform',
                      field: 'open',
                      label: 'Opening Time',
                      value: uniformOpenTime,
                    })
                  }
                  style={{
                    ...inputStyle,
                    flex: 1,
                    minWidth: '130px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontWeight: 600,
                    opacity: hoursEnabled ? 1 : 0.7,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <ClockIcon size={13} color="var(--color-accent-primary, #0F4C5C)" />
                    <span>Open: {hoursEnabled ? uniformOpenTime : '--:--'}</span>
                  </span>
                  <ChevronDownIcon size={12} color="var(--color-text-muted)" />
                </button>

                <button
                  type="button"
                  data-testid="add-poi-close-time-btn"
                  onClick={() =>
                    setHourPickerTarget({
                      scope: 'uniform',
                      field: 'close',
                      label: 'Closing Time',
                      value: uniformCloseTime,
                    })
                  }
                  style={{
                    ...inputStyle,
                    flex: 1,
                    minWidth: '130px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontWeight: 600,
                    opacity: hoursEnabled ? 1 : 0.7,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <ClockIcon size={13} color="var(--color-accent-primary, #0F4C5C)" />
                    <span>Close: {hoursEnabled ? uniformCloseTime : '--:--'}</span>
                  </span>
                  <ChevronDownIcon size={12} color="var(--color-text-muted)" />
                </button>

                {hoursEnabled && (
                  <button
                    type="button"
                    onClick={() => setHoursEnabled(false)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--color-text-muted)',
                      cursor: 'pointer',
                      padding: '4px 6px',
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const mon = weeklySchedule[0];
                      setWeeklySchedule((prev) => prev.map(() => ({ ...mon })));
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--color-accent-primary, #0F4C5C)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Copy Mon to all days
                  </button>
                </div>

                {WEEK_DAYS.map((day, idx) => {
                  const sched = weeklySchedule[idx];
                  return (
                    <div
                      key={day.key}
                      data-testid={`weekly-hours-row-${day.key}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '48px 72px 1fr 1fr',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '5px 8px',
                        borderRadius: '10px',
                        background: 'var(--color-surface-card, #FFFFFF)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {day.short}
                      </span>

                      <button
                        type="button"
                        data-testid={`toggle-day-open-${day.key}`}
                        onClick={() =>
                          setWeeklySchedule((prev) =>
                            prev.map((d, i) => (i === idx ? { ...d, isOpen: !d.isOpen } : d))
                          )
                        }
                        style={{
                          padding: '4px 8px',
                          borderRadius: '9999px',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: sched.isOpen ? 'rgba(15, 76, 92, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          color: sched.isOpen ? 'var(--color-accent-primary, #0F4C5C)' : '#DC2626',
                        }}
                      >
                        {sched.isOpen ? 'Open' : 'Closed'}
                      </button>

                      {sched.isOpen ? (
                        <>
                          <button
                            type="button"
                            data-testid={`day-open-time-${day.key}`}
                            onClick={() =>
                              setHourPickerTarget({
                                scope: idx,
                                field: 'open',
                                label: `${day.full} Open`,
                                value: sched.openTime,
                              })
                            }
                            style={{
                              padding: '5px 8px',
                              borderRadius: '8px',
                              border: '1px solid var(--color-border)',
                              background: 'var(--color-bg-main, #FAF8F5)',
                              fontSize: '11.5px',
                              fontFamily: 'var(--font-mono, monospace)',
                              fontWeight: 600,
                              color: 'var(--color-text-primary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                            }}
                          >
                            <ClockIcon size={11} color="var(--color-text-muted)" />
                            {sched.openTime}
                          </button>

                          <button
                            type="button"
                            data-testid={`day-close-time-${day.key}`}
                            onClick={() =>
                              setHourPickerTarget({
                                scope: idx,
                                field: 'close',
                                label: `${day.full} Close`,
                                value: sched.closeTime,
                              })
                            }
                            style={{
                              padding: '5px 8px',
                              borderRadius: '8px',
                              border: '1px solid var(--color-border)',
                              background: 'var(--color-bg-main, #FAF8F5)',
                              fontSize: '11.5px',
                              fontFamily: 'var(--font-mono, monospace)',
                              fontWeight: 600,
                              color: 'var(--color-text-primary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                            }}
                          >
                            <ClockIcon size={11} color="var(--color-text-muted)" />
                            {sched.closeTime}
                          </button>
                        </>
                      ) : (
                        <div
                          style={{
                            gridColumn: 'span 2',
                            fontSize: '11.5px',
                            color: 'var(--color-text-muted)',
                            textAlign: 'center',
                            fontStyle: 'italic',
                          }}
                        >
                          Closed all day
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Photos Upload & URL */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '14px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-main, #FAF8F5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <label style={labelStyle}>Photos ({photos.length})</label>

            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                void handlePhotoFiles(e.target.files);
                e.target.value = '';
              }}
            />

            <div
              onClick={() => photoInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingPhoto(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDraggingPhoto(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingPhoto(false);
                void handlePhotoFiles(e.dataTransfer.files);
              }}
              role="button"
              tabIndex={0}
              data-testid="add-poi-photo-dropzone"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  photoInputRef.current?.click();
                }
              }}
              style={{
                padding: '14px',
                borderRadius: '12px',
                border: `1.5px dashed ${isDraggingPhoto ? 'var(--color-accent-primary, #0F4C5C)' : 'var(--color-border)'}`,
                background: isDraggingPhoto ? 'rgba(15, 76, 92, 0.06)' : 'var(--color-surface-card, #FFFFFF)',
                textAlign: 'center',
                fontSize: '12px',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              Drag & drop photos here, or <strong style={{ color: 'var(--color-accent-primary, #0F4C5C)' }}>browse files</strong>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="url"
                data-testid="add-poi-photo-url-input"
                placeholder="Or paste an image URL (https://...)"
                value={photoUrlInput}
                onChange={(e) => setPhotoUrlInput(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                data-testid="add-poi-photo-url-btn"
                onClick={handleAddPhotoUrl}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-card, #FFFFFF)',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Add URL
              </button>
            </div>

            {photos.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {photos.map((ph) => (
                  <div
                    key={ph.id}
                    style={{
                      position: 'relative',
                      width: '72px',
                      height: '72px',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <img
                      src={ph.url}
                      alt={ph.caption || 'Place photo'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() => setPhotos((prev) => prev.filter((item) => item.id !== ph.id))}
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        border: 'none',
                        background: 'rgba(15, 23, 42, 0.72)',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      <CloseIcon size={10} color="#FFFFFF" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              style={{
                padding: '9px 18px',
                borderRadius: '9999px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface-card, #FFFFFF)',
                color: 'var(--color-text-secondary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              data-testid="submit-add-poi-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 20px',
                borderRadius: '9999px',
                border: 'none',
                background: 'var(--color-accent-primary, #0F4C5C)',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isSubmitting ? 'wait' : 'pointer',
                opacity: isSubmitting ? 0.7 : 1,
                boxShadow: '0 4px 14px rgba(15, 76, 92, 0.25)',
              }}
            >
              <PlusIcon size={14} color="#FFFFFF" />
              <span>{isSubmitting ? 'Saving...' : 'Add Place'}</span>
            </button>
          </div>
        </form>

        {/* Duplicate / Similar POI Warning Overlay */}
        {duplicateWarning && duplicateWarning.length > 0 && (
          <div
            data-testid="duplicate-poi-warning-dialog"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100015,
              background: 'rgba(15, 23, 42, 0.55)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--color-surface-raised, #FFFFFF)',
                border: '1px solid var(--color-border)',
                borderRadius: '20px',
                maxWidth: '460px',
                width: '100%',
                padding: '22px',
                boxShadow: '0 24px 56px rgba(0, 0, 0, 0.28)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '12px',
                    background: 'rgba(245, 158, 11, 0.14)',
                    color: '#D97706',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <AlertTriangleIcon size={20} color="#D97706" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    Similar Place Already Exists
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
                    We found {duplicateWarning.length === 1 ? 'a similar place' : `${duplicateWarning.length} similar places`} in the database. Do you want to proceed anyway?
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '210px', overflowY: 'auto' }}>
                {duplicateWarning.map((cand) => (
                  <div
                    key={cand.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '12px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-main, #FAF8F5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <PoiCategoryIcon category={cand.category} size={16} color="var(--color-accent-primary, #0F4C5C)" />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cand.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                          {cand.match_reason}
                          {cand.neighborhood ? ` · ${cand.neighborhood}` : ''}
                          {typeof cand.rating === 'number' ? ` · ★ ${cand.rating.toFixed(1)}` : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                <button
                  type="button"
                  data-testid="duplicate-warning-cancel-btn"
                  onClick={() => setDuplicateWarning(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '9999px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-card, #FFFFFF)',
                    color: 'var(--color-text-secondary)',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Go Back & Edit
                </button>
                <button
                  type="button"
                  data-testid="duplicate-warning-proceed-btn"
                  disabled={isSubmitting}
                  onClick={() => {
                    setDuplicateWarning(null);
                    void submitCreatePoi();
                  }}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '9999px',
                    border: 'none',
                    background: '#D97706',
                    color: '#FFFFFF',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: isSubmitting ? 'wait' : 'pointer',
                  }}
                >
                  Proceed & Add Anyway
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Trip Creation Custom Hour Picker Modal */}
      <CustomHourPickerModal
        isOpen={Boolean(hourPickerTarget)}
        onClose={() => setHourPickerTarget(null)}
        value={hourPickerTarget?.value || '09:00'}
        onChange={handleHourPickerChange}
        anchorLabel={hourPickerTarget?.label || 'Select Time'}
        zIndex={100020}
      />

      {/* Interactive Map & Street Search Modal */}
      <PoiLocationPickerModal
        isOpen={isMapPickerOpen}
        onClose={() => setIsMapPickerOpen(false)}
        city={city}
        initialLat={lat ? parseFloat(lat) : undefined}
        initialLng={lng ? parseFloat(lng) : undefined}
        initialAddress={address}
        onConfirm={(loc) => {
          setLat(String(Number(loc.lat.toFixed(6))));
          setLng(String(Number(loc.lng.toFixed(6))));
          if (loc.address) setAddress(loc.address);
          if (!name.trim() && loc.suggestedName) {
            setName(loc.suggestedName);
          }
        }}
      />
    </div>,
    document.body
  );
}
