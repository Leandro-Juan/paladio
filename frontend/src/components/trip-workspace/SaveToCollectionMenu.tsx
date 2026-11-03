"use client";

import React, { useState, useEffect, useRef } from 'react';
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
  { hex: '#0F4C5C', label: 'Pacific Teal' },
  { hex: '#E36414', label: 'Warm Amber' },
  { hex: '#2A9D8F', label: 'Sage Teal' },
  { hex: '#6366F1', label: 'Indigo' },
  { hex: '#E11D48', label: 'Crimson Rose' },
  { hex: '#F59E0B', label: 'Gold' },
];

export function SaveToCollectionMenu({
  isOpen,
  onClose,
  poi,
  tripId,
  align = 'right',
  anchorRect,
}: SaveToCollectionMenuProps) {
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
        notify.success('Saved to Collection', `"${poi.name}" saved to "${colName}"`);
      } else {
        notify.info('Removed from Collection', `"${poi.name}" removed from "${colName}"`);
      }
    } catch {
      notify.error('Action Failed', 'Could not update collection.');
    } finally {
      setTogglingColId(null);
    }
  };

  const handleCreateAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollectionName.trim() || isCreating) return;

    setIsCreating(true);
    try {
      const created = await createCollection(newCollectionName.trim(), undefined, selectedColor);
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
        notify.success('Collection Created', `Created "${created.name}" and saved "${poi.name}"`);
        setNewCollectionName('');
        setShowCreateInput(false);
      }
    } catch {
      notify.error('Creation Failed', 'Could not create new collection.');
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
            Collections
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
          aria-label="Close"
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
            Loading collections...
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
            No collections yet. Create your first one below!
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
                      {col.items_count} {col.items_count === 1 ? 'place' : 'places'}
                    </div>
                  </div>
                </div>

                {/* Right: + Sign that rotates to X when saved */}
                <button
                  type="button"
                  data-testid={`menu-toggle-btn-${col.id}`}
                  onClick={() => handleToggle(col.id, col.name)}
                  disabled={isToggling}
                  title={isSavedInCol ? `Remove from ${col.name}` : `Add to ${col.name}`}
                  aria-label={isSavedInCol ? `Remove from ${col.name}` : `Add to ${col.name}`}
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
            <span>+ Create New Collection</span>
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
                placeholder="Collection name..."
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
                {isCreating ? '...' : '+ Add'}
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
              <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Color:</span>
              <div style={{ display: 'flex', gap: '5px' }}>
                {PALADIO_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    title={c.label}
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
