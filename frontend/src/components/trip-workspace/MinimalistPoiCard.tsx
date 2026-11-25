"use client";

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { PoiCategoryIcon } from '@/components/PoiCategoryBadge';
import { isHotelPoi, isAirportPoi } from '@/utils/poiCategory';
import { GripVerticalIcon, LockIcon, UnlockIcon, ChevronUpIcon, ChevronDownIcon, ClockIcon } from '@/components/icons';
import { usePoiPhotos } from '@/hooks/usePoiPhotos';
import { CustomHourPickerModal } from '@/components/trip-creation/CustomHourPickerModal';

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
  onRemove?: (e: React.MouseEvent) => void;
  onUpdateTimes?: (newStart: string, newEnd: string) => void;
  timeConflict?: string | null;
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
  onRemove,
  onUpdateTimes,
  timeConflict = null,
  canMoveUp = false,
  canMoveDown = false,
  extraBadge,
  title,
  className,
  style,
}: MinimalistPoiCardProps) {
  const { t } = useTranslation();
  const { getPhoto, requestPhoto } = usePoiPhotos();
  const [imgFailed, setImgFailed] = useState(false);
  const [activeHourPicker, setActiveHourPicker] = useState<'entry' | 'exit' | null>(null);

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
    timeDisplay = t('workspace.approx_duration_short', { mins: durationMins });
  } else {
    timeDisplay = t('workspace.flexible_time');
  }

  const isLocked = Boolean(anchorInfo?.isFixed);
  const showLockedHighlight = Boolean(isEditMode && isLocked);
  const showConflictHighlight = Boolean(timeConflict);
  const normalizeTimeInput = (val?: string) => {
    if (!val || val === '--:--') return '';
    const m = /^(\d{1,2}):(\d{2})/.exec(val.trim());
    if (!m) return '';
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  };
  const entryVal = normalizeTimeInput(startTime);
  const exitVal = normalizeTimeInput(endTime);
  const restBorderColor = showConflictHighlight
    ? '#DC2626'
    : showLockedHighlight
    ? '#2563EB'
    : 'var(--color-border)';
  const restBorderWidth = showLockedHighlight || showConflictHighlight ? '2px' : '1px';

  return (
    <div
      data-testid={`poi-stop-card-${id || name}`}
      data-locked={isLocked ? 'true' : 'false'}
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
        background: isBeingDragged ? 'rgba(15, 76, 92, 0.05)' : 'var(--color-surface-card, #FFFFFF)',
        border: isBeingDragged
          ? '1.5px dashed var(--color-accent-teal-soft)'
          : isRemoving
          ? '1px solid transparent'
          : `${restBorderWidth} solid ${restBorderColor}`,
        borderRadius: isEditMode ? '22px' : '9999px',
        boxShadow:
          isBeingDragged || isRemoving
            ? 'none'
            : showConflictHighlight
            ? '0 0 0 2px rgba(220, 38, 38, 0.16), var(--shadow-sm)'
            : showLockedHighlight
            ? '0 0 0 2px rgba(37, 99, 235, 0.14), var(--shadow-sm)'
            : 'var(--shadow-sm)',
        cursor: draggable ? 'grab' : 'pointer',
        opacity: isRemoving ? 0 : isBeingDragged ? 0.45 : 1,
        transform: isRemoving
          ? 'scale(0.85) translateX(-32px)'
          : isBeingDragged
          ? 'scale(0.98)'
          : 'none',
        maxHeight: isRemoving ? '0px' : isEditMode ? '160px' : '90px',
        overflow: isRemoving ? 'hidden' : 'visible',
        transition: isRemoving
          ? 'opacity var(--transition-snappy), transform var(--transition-snappy), max-height var(--duration-gentle) var(--ease-exit)'
          : 'opacity var(--transition-fast), transform var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast), background-color var(--transition-fast)',
        position: 'relative',
        userSelect: 'none',
        pointerEvents: isRemoving ? 'none' : undefined,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!isBeingDragged) {
          e.currentTarget.style.borderColor = showConflictHighlight
            ? '#DC2626'
            : showLockedHighlight
            ? '#1D4ED8'
            : 'var(--color-accent-primary)';
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = 'var(--shadow-md)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isBeingDragged) {
          e.currentTarget.style.borderColor = restBorderColor;
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = showConflictHighlight
            ? '0 0 0 2px rgba(220, 38, 38, 0.16), var(--shadow-sm)'
            : showLockedHighlight
            ? '0 0 0 2px rgba(37, 99, 235, 0.14), var(--shadow-sm)'
            : 'var(--shadow-sm)';
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
              aria-label={t('workspace.drag_to_reorder')}
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
              aria-label={anchorInfo.isFixed ? t('workspace.locked_waypoint_aria') : t('workspace.unlocked_waypoint_aria')}
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
                  aria-label={t('workspace.move_stop_up')}
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
                  aria-label={t('workspace.move_stop_down')}
                >
                  <ChevronDownIcon size={10} color="currentColor" />
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  data-testid={`remove-stop-btn-${id || stopNum || name}`}
                  onClick={onRemove}
                  style={{
                    background: 'rgba(220, 38, 38, 0.08)',
                    border: '1px solid rgba(220, 38, 38, 0.35)',
                    borderRadius: '3px',
                    padding: '0px 5px',
                    height: '16px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#DC2626',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                  aria-label={t('workspace.remove_stop_from_day', { name })}
                  title={t('workspace.remove_stop_from_day', { name })}
                >
                  -
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

        {/* Bottom Left: Time in start - end format (editable in Edit Mode) */}
        {isEditMode && onUpdateTimes ? (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              marginTop: '2px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-muted)',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                data-testid={`poi-entry-time-${id || stopNum || name}`}
                aria-label={t('workspace.entry_time_for', { name })}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveHourPicker('entry');
                }}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10.5px',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  border: `1px solid ${timeConflict ? '#DC2626' : 'var(--color-border)'}`,
                  background: 'var(--color-surface-subtle, rgba(0,0,0,0.03))',
                  color: 'var(--color-text-primary)',
                  height: '20px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontWeight: 600,
                }}
              >
                <ClockIcon size={10} color="var(--color-accent-teal, #0F4C5C)" />
                <span>{entryVal || '--:--'}</span>
              </button>
              <span style={{ color: 'var(--color-text-muted)', userSelect: 'none' }}>–</span>
              <button
                type="button"
                data-testid={`poi-exit-time-${id || stopNum || name}`}
                aria-label={t('workspace.exit_time_for', { name })}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveHourPicker('exit');
                }}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10.5px',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  border: `1px solid ${timeConflict ? '#DC2626' : 'var(--color-border)'}`,
                  background: 'var(--color-surface-subtle, rgba(0,0,0,0.03))',
                  color: 'var(--color-text-primary)',
                  height: '20px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontWeight: 600,
                }}
              >
                <ClockIcon size={10} color="var(--color-accent-teal, #0F4C5C)" />
                <span>{exitVal || '--:--'}</span>
              </button>
              {typeof costEur === 'number' && costEur > 0 && (
                <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                  • {costEur.toFixed(1)}€
                </span>
              )}
            </div>
            {timeConflict && (
              <div
                data-testid={`poi-time-conflict-${id || stopNum || name}`}
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  color: '#DC2626',
                  lineHeight: 1.2,
                }}
              >
                ⚠ {timeConflict}
              </div>
            )}
          </div>
        ) : (
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
                • {t('workspace.free')}
              </span>
            )}
          </div>
        )}
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
            draggable={false}
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

      {activeHourPicker !== null && (
        <CustomHourPickerModal
          isOpen={activeHourPicker !== null}
          onClose={() => setActiveHourPicker(null)}
          value={activeHourPicker === 'entry' ? (entryVal || '09:00') : (exitVal || '10:00')}
          onChange={(newVal) => {
            if (activeHourPicker === 'entry') {
              onUpdateTimes?.(newVal, exitVal || newVal);
            } else {
              onUpdateTimes?.(entryVal || newVal, newVal);
            }
          }}
          anchorLabel={
            activeHourPicker === 'entry'
              ? t('workspace.entry_time_label', { name })
              : t('workspace.exit_time_label', { name })
          }
          zIndex={1000}
        />
      )}
    </div>
  );
}
