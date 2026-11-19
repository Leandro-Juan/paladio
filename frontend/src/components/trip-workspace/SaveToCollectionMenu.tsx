"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useTripCollections, CollectionPoiSummary } from '@/hooks/useTripCollections';
import { notify } from '@/utils/notify';

interface SaveToCollectionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  poi: {
    id: string;
    name: string;
    category?: string;
    cost_eur?: number;
    duration_mins?: number;
    photo_url?: string | null;
    thumbnail_url?: string | null;
    formatted_address?: string | null;
    rating?: number | null;
  } | null;
  tripId?: string;
  align?: 'right' | 'left';
  anchorRect?: DOMRect | { top: number; left: number; right: number; bottom: number } | null;
}

const PALADIO_COLORS = [
  { hex: '#0F4C5C', labelKey: 'collections.color_pacific_teal' },
  { hex: '#E36414', labelKey: 'collections.color_warm_amber' },
  { hex: '#2A9D8F', labelKey: 'collections.color_sage_teal' },
  { hex: '#6366F1', labelKey: 'collections.color_indigo' },
  { hex: '#E11D48', labelKey: 'collections.color_crimson_rose' },
  { hex: '#F59E0B', labelKey: 'collections.color_gold' },
];

export function SaveToCollectionMenu({
  isOpen,
  onClose,
  poi,
  tripId,
  align = 'right',
  anchorRect,
}: SaveToCollectionMenuProps) {
  const { t } = useTranslation();
  const {
    collections,
    loading,
    createCollection,
    togglePoiInCollection,
  } = useTripCollections(tripId);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PALADIO_COLORS[0].hex);
  const [isCreating, setIsCreating] = useState(false);
  const [togglingColId, setTogglingColId] = useState<string | null>(null);
  const [showCreateInput, setShowCreateInput] = useState(false);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !poi || !tripId) return null;

  const handleToggle = async (collectionId: string, colName: string) => {
    setTogglingColId(collectionId);
    try {
      const summary: CollectionPoiSummary = {
        id: poi.id,
        name: poi.name,
        category: poi.category,
        cost_eur: poi.cost_eur,
        duration_mins: poi.duration_mins,
        photo_url: poi.photo_url,
        thumbnail_url: poi.thumbnail_url,
        formatted_address: poi.formatted_address,
        rating: poi.rating,
      };
      const isSaved = await togglePoiInCollection(collectionId, poi.id, summary);
      if (isSaved) {
        notify.success(t('collections.saved_toast_title'), t('collections.saved_toast_desc', { name: poi.name, collection: colName }));
      } else {
        notify.info(t('collections.removed_toast_title'), t('collections.removed_toast_desc', { name: poi.name, collection: colName }));
      }
    } catch {
      notify.error(t('collections.action_failed_title'), t('collections.could_not_update'));
    } finally {
      setTogglingColId(null);
    }
  };

  const handleCreateAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCollectionName.trim();
    if (!trimmed || isCreating) return;

    if (collections.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      notify.warning(t('collections.duplicate_name_title'), t('collections.duplicate_name_desc', { name: trimmed }));
      return;
    }

    setIsCreating(true);
    try {
      const created = await createCollection(trimmed, undefined, selectedColor);
      if (created) {
        const summary: CollectionPoiSummary = {
          id: poi.id,
          name: poi.name,
          category: poi.category,
          cost_eur: poi.cost_eur,
          duration_mins: poi.duration_mins,
          photo_url: poi.photo_url,
          thumbnail_url: poi.thumbnail_url,
          formatted_address: poi.formatted_address,
          rating: poi.rating,
        };
        await togglePoiInCollection(created.id, poi.id, summary);
        notify.success(t('collections.created_toast_title'), t('collections.created_saved_desc', { collection: created.name, name: poi.name }));
        setNewCollectionName('');
        setShowCreateInput(false);
      }
    } catch (err: any) {
      const msg = err?.data?.detail || err?.message || t('collections.could_not_create');
      notify.warning(t('collections.warning_title'), msg);
    } finally {
      setIsCreating(false);
    }
  };

  const isFixed = Boolean(anchorRect);
  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;

  const topPos = anchorRect
    ? Math.max(12, Math.min(anchorRect.bottom + 6, winHeight - 340))
    : 'calc(100% + 6px)';
  const rightPos = anchorRect && align === 'right'
    ? Math.max(12, winWidth - anchorRect.right)
    : undefined;
  const leftPos = anchorRect && align === 'left'
    ? Math.max(12, anchorRect.left)
    : undefined;

  return (
    <div
      ref={menuRef}
      data-testid="save-to-collection-menu"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: isFixed ? 'fixed' : 'absolute',
        top: topPos,
        ...(isFixed
          ? (align === 'right' ? { right: rightPos } : { left: leftPos })
          : { [align === 'right' ? 'right' : 'left']: 0 }),
        zIndex: 9999,
        width: '290px',
        background: 'var(--color-surface-card, #FFFFFF)',
        borderRadius: '16px',
        border: '1px solid var(--color-border)',
        boxShadow: '0 16px 36px -8px rgba(15, 76, 92, 0.24), 0 0 1px 1px rgba(0, 0, 0, 0.06)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        animation: 'paladioMenuDeploy 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        transformOrigin: align === 'right' ? 'top right' : 'top left',
      }}
    >
      <style>{`
        @keyframes paladioMenuDeploy {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--color-surface-raised, #FAFAFA)',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-accent-teal-mid, #0891B2)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 700,
            }}
          >
            {t('collections.title')}
          </div>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginTop: '1px',
            }}
          >
            {poi.name}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-muted)',
            padding: '4px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Collections List */}
      <div
        style={{
          padding: '10px 12px',
          maxHeight: '220px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {loading && collections.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--color-text-muted)', fontSize: '12px' }}>
            {t('collections.loading')}
          </div>
        ) : collections.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '16px 8px',
              color: 'var(--color-text-muted)',
              fontSize: '12px',
              background: 'var(--color-surface-sunken, #F3F4F6)',
              borderRadius: '10px',
            }}
          >
            {t('collections.empty_menu')}
          </div>
        ) : (
          collections.map((col) => {
            const isSavedInCol = col.items.some((it) => it.poi_id === poi.id);
            const isToggling = togglingColId === col.id;

            return (
              <div
                key={col.id}
                data-testid={`menu-collection-row-${col.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  border: isSavedInCol
                    ? `1px solid ${col.color || 'var(--color-accent-primary)'}`
                    : '1px solid var(--color-border)',
                  background: isSavedInCol
                    ? 'rgba(15, 76, 92, 0.05)'
                    : 'var(--color-surface-card)',
                  transition: 'all 0.15s ease',
                  gap: '8px',
                }}
              >
                {/* Left: Dot & Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      width: '9px',
                      height: '9px',
                      borderRadius: '50%',
                      background: col.color || 'var(--color-accent-primary)',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
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
                      {col.name}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                      {col.items_count === 1
                        ? t('collections.places_singular', { count: col.items_count })
                        : t('collections.places_plural', { count: col.items_count })}
                    </div>
                  </div>
                </div>

                {/* Right: + Sign that rotates to X when saved */}
                <button
                  type="button"
                  data-testid={`menu-toggle-btn-${col.id}`}
                  onClick={() => handleToggle(col.id, col.name)}
                  disabled={isToggling}
                  title={
                    isSavedInCol
                      ? t('collections.remove_from_collection', { name: col.name })
                      : t('collections.add_to_collection', { name: col.name })
                  }
                  aria-label={
                    isSavedInCol
                      ? t('collections.remove_from_collection', { name: col.name })
                      : t('collections.add_to_collection', { name: col.name })
                  }
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    border: isSavedInCol
                      ? '1px solid var(--color-danger, #EF4444)'
                      : '1px solid var(--color-border)',
                    background: isSavedInCol
                      ? 'rgba(239, 68, 68, 0.12)'
                      : 'var(--color-surface-raised, #F3F4F6)',
                    color: isSavedInCol ? 'var(--color-danger, #EF4444)' : 'var(--color-text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
                    transform: isSavedInCol ? 'rotate(45deg)' : 'rotate(0deg)',
                    flexShrink: 0,
                    padding: 0,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSavedInCol) {
                      e.currentTarget.style.color = 'var(--color-accent-primary)';
                      e.currentTarget.style.borderColor = 'var(--color-accent-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSavedInCol) {
                      e.currentTarget.style.color = 'var(--color-text-secondary)';
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                    }
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: Create New Collection Toggle & Form */}
      <div
        style={{
          borderTop: '1px solid var(--color-border)',
          padding: '10px 12px',
          background: 'var(--color-surface-raised, #FAFAFA)',
        }}
      >
        {!showCreateInput ? (
          <button
            type="button"
            data-testid="show-create-collection-btn"
            onClick={() => setShowCreateInput(true)}
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px dashed var(--color-border)',
              background: 'transparent',
              color: 'var(--color-accent-primary)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>{t('collections.create_new_btn')}</span>
          </button>
        ) : (
          <form
            onSubmit={handleCreateAndSave}
            style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                data-testid="menu-new-collection-name-input"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder={t('collections.name_placeholder')}
                maxLength={50}
                autoFocus
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-card, #FFFFFF)',
                  fontSize: '12px',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={!newCollectionName.trim() || isCreating}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'var(--color-accent-primary)',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: !newCollectionName.trim() || isCreating ? 'not-allowed' : 'pointer',
                  opacity: !newCollectionName.trim() || isCreating ? 0.6 : 1,
                }}
              >
                {isCreating ? '...' : t('collections.add_btn')}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateInput(false)}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: 'transparent',
                  color: 'var(--color-text-muted)',
                  border: '1px solid var(--color-border)',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {/* Color Swatches */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{t('collections.color_label')}</span>
              <div style={{ display: 'flex', gap: '5px' }}>
                {PALADIO_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    title={t(c.labelKey)}
                    onClick={() => setSelectedColor(c.hex)}
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: c.hex,
                      border: selectedColor === c.hex ? '2px solid #FFFFFF' : 'none',
                      outline: selectedColor === c.hex ? `2px solid ${c.hex}` : 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                ))}
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
