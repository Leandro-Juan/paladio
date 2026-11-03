"use client";

import React, { useState, useRef, useMemo, useCallback, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { TripPhotoItem } from '@/types/domain';
import { resolveApiMediaUrl } from '@/utils/api';
import { useTrips } from '@/hooks/useTrips';
import { notify } from '@/utils/notify';
import {
  UploadIcon,
  TrashIcon,
  CloseIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExpandIcon,
  Spinner,
  PlusIcon,
  PlayIcon,
} from '@/components/icons';
import { CameraTacticalIllustration } from '@/components/illustrations';
import { PhotoUploadModal } from './PhotoUploadModal';

interface TripPhotosViewProps {
  tripId?: string;
  photos?: Array<string | TripPhotoItem>;
  onPhotosChange?: (updatedPhotos: Array<string | TripPhotoItem>) => void;
  readOnly?: boolean;
}

interface NormalizedPhoto {
  id: string;
  url: string;
  resolvedUrl: string;
  filename?: string;
  width?: number;
  height?: number;
  aspectRatio?: number;
  sizeBytes?: number;
  createdAt?: string;
  mediaType: 'image' | 'video';
  original: string | TripPhotoItem;
}

const isVideoUrl = (url: string, filename?: string, mimeType?: string, mediaType?: string): boolean => {
  if (mediaType === 'video') return true;
  if (mimeType?.startsWith('video/')) return true;
  if (/\.(mp4|webm|mov|m4v|ogv)$/i.test(url)) return true;
  if (filename && /\.(mp4|webm|mov|m4v|ogv)$/i.test(filename)) return true;
  return false;
};

export function TripPhotosView({
  tripId,
  photos = [],
  onPhotosChange,
  readOnly = false,
}: TripPhotosViewProps) {
  const { uploadTripPhotos, deleteTripPhoto } = useTrips();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Measured dimensions for images or videos that do not have backend metadata
  const [measuredDims, setMeasuredDims] = useState<
    Record<string, { width: number; height: number; aspectRatio: number }>
  >({});

  // Normalize photos/videos array
  const normalizedPhotos = useMemo<NormalizedPhoto[]>(() => {
    return photos.map((p, idx) => {
      if (typeof p === 'string') {
        const id = p.split('/').pop() || `media-${idx}`;
        const resolved = resolveApiMediaUrl(p);
        const measured = measuredDims[p];
        const isVid = isVideoUrl(p);
        return {
          id,
          url: p,
          resolvedUrl: resolved,
          filename: isVid ? `Video ${idx + 1}` : `Photo ${idx + 1}`,
          width: measured?.width || (isVid ? 1920 : undefined),
          height: measured?.height || (isVid ? 1080 : undefined),
          aspectRatio: measured?.aspectRatio || (isVid ? 1.778 : undefined),
          mediaType: isVid ? 'video' : 'image',
          original: p,
        };
      }
      const resolved = resolveApiMediaUrl(p.url);
      const measured = measuredDims[p.url];
      const isVid = isVideoUrl(p.url, p.filename, p.mime_type, p.media_type);
      return {
        id: p.id || `media-${idx}`,
        url: p.url,
        resolvedUrl: resolved,
        filename: p.filename || (isVid ? `Video ${idx + 1}` : `Photo ${idx + 1}`),
        width: p.width || measured?.width || (isVid ? 1920 : undefined),
        height: p.height || measured?.height || (isVid ? 1080 : undefined),
        aspectRatio: p.aspect_ratio || measured?.aspectRatio || (isVid ? 1.778 : undefined),
        sizeBytes: p.size_bytes,
        createdAt: p.created_at,
        mediaType: isVid ? 'video' : 'image',
        original: p,
      };
    });
  }, [photos, measuredDims]);

  // Handle image load to measure dimensions dynamically if missing
  const handleImageLoad = useCallback(
    (url: string, e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (nw && nh) {
        const ar = Number((nw / nh).toFixed(3));
        setMeasuredDims((prev) => {
          if (prev[url]?.width === nw && prev[url]?.height === nh) return prev;
          return {
            ...prev,
            [url]: { width: nw, height: nh, aspectRatio: ar },
          };
        });
      }
    },
    []
  );

  // Handle video metadata load to measure native video dimensions
  const handleVideoMetadataLoad = useCallback(
    (url: string, e: React.SyntheticEvent<HTMLVideoElement>) => {
      const vid = e.currentTarget;
      const nw = vid.videoWidth;
      const nh = vid.videoHeight;
      if (nw && nh) {
        const ar = Number((nw / nh).toFixed(3));
        setMeasuredDims((prev) => {
          if (prev[url]?.width === nw && prev[url]?.height === nh) return prev;
          return {
            ...prev,
            [url]: { width: nw, height: nh, aspectRatio: ar },
          };
        });
      }
    },
    []
  );

  // Date/Time formatter helper
  const formatPhotoDateTime = useCallback((createdAt?: string) => {
    if (!createdAt) {
      return new Date().toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }) + ' • ' + new Date().toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
    try {
      const d = new Date(createdAt);
      if (isNaN(d.getTime())) return '';
      return (
        d.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }) +
        ' • ' +
        d.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      );
    } catch {
      return '';
    }
  }, []);

  // Upload handler
  const handleUploadFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    if (!tripId) {
      notify.error('Upload Error', 'Trip must be saved before uploading media.');
      return;
    }

    const mediaFiles = Array.from(files).filter(
      (f) =>
        f.type.startsWith('image/') ||
        f.type.startsWith('video/') ||
        /\.(jpe?g|png|webp|gif|avif|heic|mp4|webm|mov|m4v|ogv)$/i.test(f.name)
    );

    if (mediaFiles.length === 0) {
      notify.error('Invalid Files', 'Please select valid image or video files.');
      return;
    }

    setIsUploading(true);
    setUploadCount(mediaFiles.length);

    try {
      const uploadedItems = await uploadTripPhotos(tripId, mediaFiles);
      const updatedPhotos = [...photos, ...uploadedItems];
      if (onPhotosChange) {
        onPhotosChange(updatedPhotos);
      }
      notify.success(
        'Media Uploaded',
        `Successfully uploaded ${uploadedItems.length} media item${uploadedItems.length > 1 ? 's' : ''} to vault.`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown upload error';
      notify.error('Upload Failed', message);
    } finally {
      setIsUploading(false);
      setUploadCount(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!readOnly) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (readOnly) return;
    if (e.dataTransfer?.files) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  // Delete photo handler (used when hovering over the mosaic card)
  const handleDeletePhoto = async (photo: NormalizedPhoto, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!tripId || readOnly) return;

    setIsDeletingId(photo.id);
    try {
      await deleteTripPhoto(tripId, photo.id);
      const updated = photos.filter((p) => {
        if (typeof p === 'string') {
          return !p.includes(photo.id);
        }
        return p.id !== photo.id;
      });
      if (onPhotosChange) {
        onPhotosChange(updated);
      }
      notify.info('Photo Deleted', 'The photo has been removed from your vault.');
      if (lightboxIndex !== null) {
        if (updated.length === 0) {
          setLightboxIndex(null);
        } else if (lightboxIndex >= updated.length) {
          setLightboxIndex(updated.length - 1);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete photo';
      notify.error('Delete Failed', message);
    } finally {
      setIsDeletingId(null);
    }
  };

  // Lightbox keyboard navigation and background scroll lock
  useEffect(() => {
    if (lightboxIndex === null) return;

    // Lock scrolling completely while expanded
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : normalizedPhotos.length - 1));
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev !== null && prev < normalizedPhotos.length - 1 ? prev + 1 : 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [lightboxIndex, normalizedPhotos.length]);

  // Compute tile layout spans based on aspect ratio and dimensions
  const getTileSpan = (photo: NormalizedPhoto, idx: number) => {
    const ar = photo.aspectRatio || 1.33;
    const w = photo.width || 800;

    // Ultra-wide panoramic
    if (ar >= 1.85) {
      return { colSpan: 2, rowSpan: 1 };
    }
    // Large landscape (feature/hero tile every few photos or when high-res)
    if (ar >= 1.35) {
      if (w >= 1200 || idx % 5 === 0) {
        return { colSpan: 2, rowSpan: 2 };
      }
      return { colSpan: 2, rowSpan: 1 };
    }
    // Portrait (tall phone photos)
    if (ar <= 0.8) {
      if (ar <= 0.55) {
        return { colSpan: 1, rowSpan: 3 };
      }
      return { colSpan: 1, rowSpan: 2 };
    }
    // Square or moderate landscape/portrait
    return { colSpan: 1, rowSpan: 1 };
  };

  // Stats for the header subtitle
  const stats = useMemo(() => {
    let photosCount = 0;
    let videosCount = 0;
    let landscape = 0;
    let portrait = 0;
    let square = 0;
    normalizedPhotos.forEach((p) => {
      if (p.mediaType === 'video') videosCount++;
      else photosCount++;
      const ar = p.aspectRatio || 1;
      if (ar > 1.15) landscape++;
      else if (ar < 0.85) portrait++;
      else square++;
    });
    return { photosCount, videosCount, landscape, portrait, square };
  }, [normalizedPhotos]);

  const activePhoto = lightboxIndex !== null ? normalizedPhotos[lightboxIndex] : null;

  return (
    <div
      style={{
        padding: '2rem',
        maxWidth: '1440px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.75rem',
        minHeight: '100%',
        position: 'relative',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/mp4,video/webm,video/quicktime,video/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) handleUploadFiles(e.target.files);
        }}
      />

      {/* Drag & Drop Visual Overlay */}
      {isDragging && !readOnly && (
        <div
          style={{
            position: 'absolute',
            inset: '1rem',
            background: 'rgba(245, 239, 235, 0.95)',
            backdropFilter: 'blur(8px)',
            border: '2px dashed var(--color-hero-bg, #0F4C5C)',
            borderRadius: '16px',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            color: 'var(--color-hero-bg, #0F4C5C)',
            pointerEvents: 'none',
          }}
        >
          <CameraTacticalIllustration width={130} height={85} />
          <h3 className="font-display" style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600 }}>
            DROP PHOTOS & VIDEOS TO ADD TO MOSAIC
          </h3>
          <p className="font-mono text-sm" style={{ margin: 0, opacity: 0.8 }}>
            {"// SUPPORTS MULTIPLE IMAGES & VIDEOS (JPEG, PNG, WEBP, MP4, WEBM, MOV)"}
          </p>
        </div>
      )}

      {/* Header & Action Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '1rem',
          paddingBottom: '1.25rem',
          borderBottom: '1px solid var(--color-border-subtle, rgba(0,0,0,0.08))',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h2
              className="font-display"
              style={{ margin: 0, fontSize: '1.45rem', color: 'var(--color-text-primary, #181614)', fontWeight: 600 }}
            >
              MEDIA VAULT & MOSAIC
            </h2>
            {normalizedPhotos.length > 0 && (
              <span
                className="font-mono"
                style={{
                  fontSize: '0.75rem',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '999px',
                  background: 'var(--color-bg-secondary, #EFE8E1)',
                  color: 'var(--color-text-muted, #6F6963)',
                  border: '1px solid var(--color-border-subtle, rgba(0,0,0,0.1))',
                  fontWeight: 600,
                }}
              >
                {normalizedPhotos.length} {normalizedPhotos.length === 1 ? 'ITEM' : 'ITEMS'}
              </span>
            )}
          </div>
          <p className="font-mono text-muted text-xs mt-1" style={{ letterSpacing: '0.04em' }}>
            {normalizedPhotos.length > 0
              ? `// ${stats.photosCount} PHOTOS • ${stats.videosCount > 0 ? `${stats.videosCount} VIDEOS • ` : ''}${stats.landscape} LANDSCAPE • ${stats.portrait} PORTRAIT`
              : '// DESTINATION PHOTOGRAPHY, VIDEOS & MOSAIC MEDIA'}
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {!readOnly && (
            <button
              onClick={() => setIsUploadModalOpen(true)}
              disabled={isUploading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 1.15rem',
                borderRadius: '8px',
                background: isUploading ? 'var(--color-surface-sunken, #CAD2D3)' : 'var(--color-hero-bg, #0F4C5C)',
                color: '#FFFFFF',
                border: '1px solid rgba(15, 76, 92, 0.2)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: isUploading ? 'not-allowed' : 'pointer',
                boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(15, 76, 92, 0.08))',
                transition: 'all 0.18s ease',
              }}
            >
              {isUploading ? (
                <>
                  <Spinner size={15} color="#FFFFFF" />
                  <span>UPLOADING ({uploadCount})...</span>
                </>
              ) : (
                <>
                  <UploadIcon size={15} color="#FFFFFF" />
                  <span>UPLOAD PHOTOS</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area: Empty State vs Mosaic Grid */}
      {normalizedPhotos.length === 0 ? (
        <div
          onClick={() => !readOnly && setIsUploadModalOpen(true)}
          style={{
            padding: '4rem 2rem',
            borderRadius: '20px',
            border: '2px dashed var(--color-border, #E2D9CC)',
            background: 'var(--color-surface-card, #FAF6F0)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.25rem',
            cursor: readOnly ? 'default' : 'pointer',
            transition: 'border-color 0.2s ease, background 0.2s ease',
          }}
          onMouseEnter={(e) => {
            if (!readOnly) {
              e.currentTarget.style.borderColor = 'var(--color-hero-bg, #0F4C5C)';
              e.currentTarget.style.background = 'rgba(15, 76, 92, 0.03)';
            }
          }}
          onMouseLeave={(e) => {
            if (!readOnly) {
              e.currentTarget.style.borderColor = 'var(--color-border, #E2D9CC)';
              e.currentTarget.style.background = 'var(--color-surface-card, #FAF6F0)';
            }
          }}
        >
          <CameraTacticalIllustration width={130} height={85} />

          <div style={{ textAlign: 'center' }}>
            <h3
              className="font-display"
              style={{ margin: '0 0 0.4rem 0', fontSize: '1.25rem', color: 'var(--color-text-primary, #1A2B32)', fontWeight: 700 }}
            >
              No Captured Memories in Mosaic
            </h3>
            <p className="font-mono text-muted text-xs" style={{ margin: 0, maxWidth: '440px', lineHeight: 1.5, color: 'var(--color-text-muted, #566B76)' }}>
              Click to open the upload window or drag & drop photos here. Images automatically arrange into an interlocking mosaic based on their size and orientation.
            </p>
          </div>

          {!readOnly && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsUploadModalOpen(true);
              }}
              style={{
                marginTop: '4px',
                background: 'var(--color-surface-raised, #FFFFFF)',
                border: '1px solid var(--color-border, #E2D9CC)',
                borderRadius: '9999px',
                padding: '8px 22px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-text-primary, #1A2B32)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 0.15s ease',
              }}
            >
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: 'var(--color-hero-bg, #0F4C5C)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <PlusIcon size={12} color="#FFFFFF" />
              </div>
              <span>Select Files to Upload</span>
            </button>
          )}
        </div>
      ) : (
        /* Dynamic Mosaic Grid */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gridAutoRows: '150px',
            gridAutoFlow: 'dense',
            gap: '1rem',
          }}
        >
          {normalizedPhotos.map((photo, idx) => {
            const span = getTileSpan(photo, idx);

            return (
              <div
                key={photo.id || idx}
                onClick={() => setLightboxIndex(idx)}
                style={{
                  gridColumn: `span ${span.colSpan}`,
                  gridRow: `span ${span.rowSpan}`,
                  position: 'relative',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  background: 'var(--color-bg-secondary, #EAE3DC)',
                  border: '1px solid var(--color-border-subtle, rgba(0,0,0,0.08))',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                  cursor: 'pointer',
                  transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                }}
                className="group photo-mosaic-card"
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = '0 10px 25px rgba(0,0,0,0.12)';
                  const vid = e.currentTarget.querySelector('video');
                  if (vid) vid.play().catch(() => {});
                  const img = e.currentTarget.querySelector('img');
                  if (img) img.style.transform = 'scale(1.05)';
                  const overlay = e.currentTarget.querySelector('.tactical-overlay') as HTMLElement;
                  if (overlay) overlay.style.opacity = '1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.05)';
                  const vid = e.currentTarget.querySelector('video');
                  if (vid) {
                    vid.pause();
                    vid.currentTime = 0;
                  }
                  const img = e.currentTarget.querySelector('img');
                  if (img) img.style.transform = 'scale(1)';
                  const overlay = e.currentTarget.querySelector('.tactical-overlay') as HTMLElement;
                  if (overlay) overlay.style.opacity = '0';
                }}
              >
                {/* Media Item (Video or Photo) */}
                {photo.mediaType === 'video' ? (
                  <video
                    src={photo.resolvedUrl}
                    preload="metadata"
                    muted
                    playsInline
                    loop
                    onLoadedMetadata={(e) => handleVideoMetadataLoad(photo.url, e)}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                      transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  />
                ) : (
                  <img
                    src={photo.resolvedUrl}
                    alt={photo.filename || `Photo ${idx + 1}`}
                    loading="lazy"
                    onLoad={(e) => handleImageLoad(photo.url, e)}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                      transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  />
                )}

                {/* Video Badge (Always subtle in corner) */}
                {photo.mediaType === 'video' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '10px',
                      left: '10px',
                      zIndex: 3,
                      background: 'rgba(15, 23, 28, 0.72)',
                      backdropFilter: 'blur(6px)',
                      borderRadius: '9999px',
                      padding: '3px 8px 3px 6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#FFFFFF',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      pointerEvents: 'none',
                    }}
                  >
                    <PlayIcon size={10} color="#FFFFFF" fill="#FFFFFF" />
                    <span>VIDEO</span>
                  </div>
                )}

                {/* Tactical Hover Overlay */}
                <div
                  className="tactical-overlay"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'linear-gradient(to top, rgba(16, 14, 12, 0.85) 0%, rgba(16, 14, 12, 0.1) 45%, rgba(16, 14, 12, 0.4) 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '0.875rem',
                    opacity: 0,
                    transition: 'opacity 0.2s ease',
                    zIndex: 2,
                  }}
                >
                  {/* Top Bar: Action Icons (Expand & Delete) */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button
                        title="View Full Resolution"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxIndex(idx);
                        }}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.2)',
                          backdropFilter: 'blur(4px)',
                          border: 'none',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <ExpandIcon size={13} color="#FFFFFF" />
                      </button>

                      {!readOnly && (
                        <button
                          title="Delete Photo"
                          disabled={isDeletingId === photo.id}
                          onClick={(e) => handleDeletePhoto(photo, e)}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            background: 'rgba(215, 68, 62, 0.85)',
                            backdropFilter: 'blur(4px)',
                            border: 'none',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: isDeletingId === photo.id ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {isDeletingId === photo.id ? (
                            <Spinner size={12} color="#FFFFFF" />
                          ) : (
                            <TrashIcon size={13} color="#FFFFFF" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Bottom Bar: ONLY Date and Time */}
                  <div>
                    <p
                      className="font-mono"
                      style={{
                        margin: 0,
                        fontSize: '0.72rem',
                        color: 'rgba(255, 255, 255, 0.95)',
                        fontWeight: 500,
                        letterSpacing: '0.04em',
                        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                      }}
                    >
                      {formatPhotoDateTime(photo.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full-Bleed Lightbox Modal (Screen locked, portal mounted, no scroll, no delete button) */}
      {mounted && activePhoto && lightboxIndex !== null && typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99999,
              background: 'rgba(15, 13, 11, 0.96)',
              backdropFilter: 'blur(20px)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              touchAction: 'none',
            }}
            onClick={() => setLightboxIndex(null)}
            onWheel={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onTouchMove={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {/* Lightbox Top Control Bar */}
            <div
              style={{
                padding: '1rem 1.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#FFFFFF',
                zIndex: 10,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span
                  className="font-mono"
                  style={{
                    fontSize: '0.8rem',
                    letterSpacing: '0.08em',
                    background: 'rgba(255, 255, 255, 0.15)',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '4px',
                    fontWeight: 600,
                  }}
                >
                  {String(lightboxIndex + 1).padStart(2, '0')} / {String(normalizedPhotos.length).padStart(2, '0')}
                </span>
                <p className="font-mono text-xs" style={{ margin: 0, color: 'rgba(255, 255, 255, 0.8)' }}>
                  {formatPhotoDateTime(activePhoto.createdAt)}
                </p>
              </div>

              {/* Top-Right: Close Button Only (Delete button removed when expanded) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  onClick={() => setLightboxIndex(null)}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.12)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  title="Close (Esc)"
                >
                  <CloseIcon size={18} color="#FFFFFF" />
                </button>
              </div>
            </div>

            {/* Lightbox Center Image Stage with Navigation Controls */}
            <div
              style={{
                flex: 1,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1.5rem',
                overflow: 'hidden',
              }}
            >
              {/* Previous Button */}
              {normalizedPhotos.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : normalizedPhotos.length - 1));
                  }}
                  style={{
                    position: 'absolute',
                    left: '1.5rem',
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 20,
                    transition: 'background 0.2s ease',
                  }}
                  title="Previous (Arrow Left)"
                >
                  <ChevronLeftIcon size={20} color="#FFFFFF" />
                </button>
              )}

              {/* Displayed Media (Video Player or Photo) */}
              {activePhoto.mediaType === 'video' ? (
                <video
                  key={activePhoto.id}
                  src={activePhoto.resolvedUrl}
                  controls
                  autoPlay
                  playsInline
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    maxWidth: '92vw',
                    maxHeight: '82vh',
                    borderRadius: '12px',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
                    outline: 'none',
                    background: '#000000',
                  }}
                />
              ) : (
                <img
                  src={activePhoto.resolvedUrl}
                  alt={activePhoto.filename}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    maxWidth: '92vw',
                    maxHeight: '82vh',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                    userSelect: 'none',
                  }}
                />
              )}

              {/* Next Button */}
              {normalizedPhotos.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxIndex((prev) => (prev !== null && prev < normalizedPhotos.length - 1 ? prev + 1 : 0));
                  }}
                  style={{
                    position: 'absolute',
                    right: '1.5rem',
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 20,
                    transition: 'background 0.2s ease',
                  }}
                  title="Next (Arrow Right)"
                >
                  <ChevronRightIcon size={20} color="#FFFFFF" />
                </button>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Custom Photo Upload Window */}
      <PhotoUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={handleUploadFiles}
        isUploading={isUploading}
      />
    </div>
  );
}
