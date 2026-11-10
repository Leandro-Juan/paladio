"use client";

import React, { useState, useEffect } from 'react';
import { PoiCategoryIcon } from '@/components/PoiCategoryBadge';
import { isHotelPoi, isAirportPoi } from '@/utils/poiCategory';
import { GripVerticalIcon, LockIcon, UnlockIcon, ChevronUpIcon, ChevronDownIcon } from '@/components/icons';
import { usePoiPhotos } from '@/hooks/usePoiPhotos';

export interface MinimalistPoiCardProps {
  id?: string;
  name: string;
  category?: string;
  startTime?: string;
  endTime?: string;
  durationMins?: number;
  openHours?: string | null;
  costEur?: number;
  photoUrl?: string;
  city?: string;

  // Click & Drag interactions
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
  isBeingDragged?: boolean;
  isRemoving?: boolean;

  // Edit mode controls (only visible if isEditMode === true)
  isEditMode?: boolean;
  stopNum?: string;
  anchorInfo?: { isFixed: boolean; isAnchor: boolean; label?: string | null };
  onToggleLock?: (e: React.MouseEvent) => void;
  onMoveUp?: (e: React.MouseEvent) => void;
  onMoveDown?: (e: React.MouseEvent) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;

  // Extra metadata/actions
  extraBadge?: React.ReactNode;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function MinimalistPoiCard({
  id,
  name,
  category,
  startTime,
  endTime,
  durationMins,
  openHours,
  costEur,
  photoUrl,
  city = '',
  onClick,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  isBeingDragged = false,
  isRemoving = false,
  isEditMode = false,
  stopNum,
  anchorInfo,
  onToggleLock,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  extraBadge,
  title,
  className,
  style,
}: MinimalistPoiCardProps) {
  const { getPhoto, requestPhoto } = usePoiPhotos();
  const [imgFailed, setImgFailed] = useState(false);

  // Determine photo URL
  const resolvedPhoto = photoUrl || getPhoto(id) || getPhoto(name);

  // Request photo if not present
  useEffect(() => {
    if (!resolvedPhoto && (id || name)) {
      requestPhoto({ id, name, city, photo_url: photoUrl });
    }
  }, [id, name, city, photoUrl, resolvedPhoto, requestPhoto]);

  // Format time strictly as start - end
  let timeDisplay = '';
  if (startTime && endTime && startTime !== '--:--' && endTime !== '--:--') {
    timeDisplay = `${startTime} - ${endTime}`;
  } else if (startTime && startTime !== '--:--') {
    timeDisplay = startTime;
  } else if (openHours) {
    timeDisplay = openHours;
  } else if (durationMins && durationMins > 0) {
    timeDisplay = `~${durationMins}m`;
  } else {
    timeDisplay = 'Flexible';
  }

  return (
    <div
      data-testid={`poi-stop-card-${id || name}`}
      className={className}
      draggable={draggable && !isRemoving}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={isRemoving ? undefined : onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isRemoving ? '0px 10px 0px 16px' : '8px 10px 8px 16px',
        background: isBeingDragged ? 'rgba(15, 76, 92, 0.05)' : 'var(--color-bg-card, #FFFFFF)',
        border: isBeingDragged
          ? '1.5px dashed var(--color-accent-teal-soft)'
          : isRemoving
          ? '1px solid transparent'
          : '1px solid var(--color-border)',
        borderRadius: '9999px', // Pill / capsule shape from sketch!
        boxShadow: isBeingDragged || isRemoving ? 'none' : 'var(--shadow-sm)',
        cursor: draggable ? 'grab' : 'pointer',
        opacity: isRemoving ? 0 : isBeingDragged ? 0.45 : 1,
        transform: isRemoving
          ? 'scale(0.85) translateX(-32px)'
          : isBeingDragged
          ? 'scale(0.98)'
          : 'none',
        maxHeight: isRemoving ? '0px' : '90px',
        overflow: isRemoving ? 'hidden' : 'visible',
        transition: isRemoving
          ? 'all 0.28s cubic-bezier(0.2, 0, 0, 1)'
          : 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        position: 'relative',
        userSelect: 'none',
        pointerEvents: isRemoving ? 'none' : undefined,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!isBeingDragged) {
          e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = 'var(--shadow-md)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isBeingDragged) {
          e.currentTarget.style.borderColor = 'var(--color-border)';
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
        }
      }}
    >
      {/* Left Column: Icon (top left), Name, Time (bottom left) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          flex: 1,
          minWidth: 0,
          paddingRight: '12px',
        }}
      >
        {/* Top-Left: Category Icon ONLY (no name) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Grip handle ONLY in edit mode */}
          {isEditMode && draggable && (
            <span
              style={{
                color: 'var(--color-text-muted)',
                cursor: 'grab',
                display: 'flex',
                alignItems: 'center',
              }}
              aria-label="Drag to reorder"
            >
              <GripVerticalIcon size={12} color="var(--color-text-muted)" />
            </span>
          )}

          {/* Stop number badge ONLY in edit mode */}
          {isEditMode && stopNum && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9.5px',
                fontWeight: 700,
                background: 'var(--color-accent-primary)',
                color: '#FFFFFF',
                padding: '1px 5px',
                borderRadius: '3px',
              }}
            >
              {stopNum}
            </span>
          )}

          {/* Category Icon ONLY */}
          <PoiCategoryIcon category={category} name={name} size={14} />

          {/* Lock/Unlock interactive button ONLY in edit mode */}
          {isEditMode && onToggleLock && anchorInfo && (
            <button
              type="button"
              onClick={onToggleLock}
              style={{
                background: 'none',
                border: 'none',
                padding: '1px 2px',
                cursor: 'pointer',
                color: anchorInfo.isFixed ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: 'var(--radius-sm)',
              }}
              aria-label={anchorInfo.isFixed ? 'Locked waypoint (click to unlock)' : 'Unlocked waypoint (click to lock)'}
            >
              {anchorInfo.isFixed ? (
                <LockIcon size={11} color="var(--color-accent-primary)" />
              ) : (
                <UnlockIcon size={11} color="var(--color-text-muted)" />
              )}
            </button>
          )}

          {/* Up/Down reorder controls ONLY in edit mode */}
          {isEditMode && (onMoveUp || onMoveDown) && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginLeft: 'auto' }}>
              {onMoveUp && (
                <button
                  type="button"
                  onClick={onMoveUp}
                  disabled={!canMoveUp}
                  style={{
                    background: 'none',
                    border: '1px solid var(--color-border)',
                    borderRadius: '3px',
                    padding: '1px',
                    cursor: canMoveUp ? 'pointer' : 'not-allowed',
                    opacity: canMoveUp ? 0.8 : 0.3,
                    display: 'flex',
                    alignItems: 'center',
                    color: 'var(--color-text-muted)',
                  }}
                  aria-label="Move stop up"
                >
                  <ChevronUpIcon size={10} color="currentColor" />
                </button>
              )}
              {onMoveDown && (
                <button
                  type="button"
                  onClick={onMoveDown}
                  disabled={!canMoveDown}
                  style={{
                    background: 'none',
                    border: '1px solid var(--color-border)',
                    borderRadius: '3px',
                    padding: '1px',
                    cursor: canMoveDown ? 'pointer' : 'not-allowed',
                    opacity: canMoveDown ? 0.8 : 0.3,
                    display: 'flex',
                    alignItems: 'center',
                    color: 'var(--color-text-muted)',
                  }}
                  aria-label="Move stop down"
                >
                  <ChevronDownIcon size={10} color="currentColor" />
                </button>
              )}
            </div>
          )}

          {/* Extra badge if provided */}
          {extraBadge}
        </div>

        {/* Name */}
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.3,
          }}
        >
          {name}
        </span>

        {/* Bottom Left: Time in start - end format */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-muted)',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span>{timeDisplay}</span>
          {typeof costEur === 'number' && costEur > 0 && (
            <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
              • {costEur.toFixed(1)}€
            </span>
          )}
          {typeof costEur === 'number' && costEur === 0 && !isHotelPoi({ category, name, id }) && !isAirportPoi({ category, name, id }) && (
            <span style={{ color: '#10b981', fontWeight: 600 }}>
              • Free
            </span>
          )}
        </div>
      </div>

      {/* Right: Photo in a Circle */}
      <div
        style={{
          width: '48px',
          height: '48px',
          minWidth: '48px',
          borderRadius: '50%',
          overflow: 'hidden',
          position: 'relative',
          background: 'var(--color-bg-secondary, #F4EFE6)',
          border: '1.5px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)',
          flexShrink: 0,
        }}
      >
        {resolvedPhoto && !imgFailed ? (
          <img
            src={resolvedPhoto}
            alt={name}
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '50%',
              display: 'block',
            }}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <PoiCategoryIcon category={category} name={name} size={20} color="var(--color-text-muted)" />
        )}
      </div>
    </div>
  );
}
