"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CameraTacticalIllustration } from '@/components/illustrations';
import { CloseIcon, PlusIcon, Spinner, UploadIcon, VideoIcon } from '@/components/icons';

interface PhotoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (files: File[]) => Promise<void>;
  isUploading?: boolean;
}

export function PhotoUploadModal({
  isOpen,
  onClose,
  onUpload,
  isUploading = false,
}: PhotoUploadModalProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    if (isUploading) return;
    setSelectedFiles([]);
    setDragOver(false);
    onClose();
  }, [isUploading, onClose]);

  // Close on Escape key & lock body scroll
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, handleClose]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const handleFilesAdded = (files: FileList | File[]) => {
    const valid = Array.from(files).filter(
      (f) =>
        f.type.startsWith('image/') ||
        f.type.startsWith('video/') ||
        /\.(jpe?g|png|webp|gif|avif|heic|mp4|webm|mov|m4v|ogv)$/i.test(f.name)
    );
    if (valid.length > 0) {
      setSelectedFiles((prev) => [...prev, ...valid]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirmUpload = async () => {
    if (selectedFiles.length === 0 || isUploading) return;
    await onUpload(selectedFiles);
    handleClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--color-scrim, rgba(15, 76, 92, 0.45))',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/mp4,video/webm,video/quicktime,video/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) handleFilesAdded(e.target.files);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />

      <div
        ref={modalRef}
        style={{
          background: 'var(--color-surface-raised, #FFFFFF)',
          border: '1px solid var(--color-border, #E2D9CC)',
          borderRadius: '24px',
          maxWidth: '680px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* ================= HEADER ================= */}
        <div
          style={{
            padding: '1.5rem 1.75rem',
            borderBottom: '1px solid var(--color-border, #E2D9CC)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '6px',
                  background: 'var(--color-hero-bg, #0F4C5C)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <PlusIcon size={14} color="#FFFFFF" />
              </div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: 700,
                  color: 'var(--color-text-primary, #1A2B32)',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '-0.01em',
                }}
              >
                Upload Destination Media
              </h2>
              <span
                className="font-mono"
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  background: 'rgba(15, 76, 92, 0.08)',
                  color: 'var(--color-hero-bg, #0F4C5C)',
                  letterSpacing: '0.04em',
                }}
              >
                MEDIA VAULT // DYNAMIC MOSAIC
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                color: 'var(--color-text-muted, #566B76)',
                lineHeight: 1.4,
              }}
            >
              Upload authentic photos and videos of sights, waypoints, and memories. They will automatically pack into a harmonious mosaic based on their size.
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isUploading}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: isUploading ? 'not-allowed' : 'pointer',
              padding: '6px',
              borderRadius: '8px',
              color: 'var(--color-text-muted, #566B76)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s ease',
            }}
            title="Close"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* ================= BODY ================= */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Dropzone Card */}
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer?.files) {
                handleFilesAdded(e.dataTransfer.files);
              }
            }}
            onClick={() => {
              if (!isUploading) fileInputRef.current?.click();
            }}
            role="button"
            tabIndex={0}
            style={{
              border: `2px dashed ${
                dragOver ? 'var(--color-accent-teal, #0F4C5C)' : 'var(--color-border, #E2D9CC)'
              }`,
              background: dragOver ? 'rgba(15, 76, 92, 0.05)' : 'var(--color-surface-card, #FAF6F0)',
              borderRadius: '20px',
              padding: '2rem 1.5rem',
              textAlign: 'center',
              cursor: isUploading ? 'wait' : 'pointer',
              transition: 'all 0.18s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            {/* Custom Japanese Minimalist Tactical Camera Illustration */}
            <CameraTacticalIllustration width={130} height={85} />

            <span
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--color-text-primary, #1A2B32)',
                marginTop: '4px',
              }}
            >
              Drag & Drop Photos & Videos Here
            </span>

            <span className="font-mono text-xs text-muted" style={{ fontSize: '11px', color: 'var(--color-text-muted, #566B76)' }}>
              Supports JPG, PNG, WebP, MP4, WebM, MOV • Auto-aligned in mosaic
            </span>

            {/* Tactical Plus Sign Browse Button */}
            <button
              type="button"
              disabled={isUploading}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              style={{
                marginTop: '8px',
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
                boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(15, 76, 92, 0.05))',
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
              <span>Browse Files</span>
            </button>
          </div>

          {/* Staged Files Preview List */}
          {selectedFiles.length > 0 && (
            <div
              style={{
                border: '1px solid var(--color-border, #E2D9CC)',
                borderRadius: '16px',
                background: 'var(--color-surface-card, #FAF6F0)',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-mono text-xs" style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  SELECTED FILES ({selectedFiles.length})
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedFiles([])}
                  disabled={isUploading}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '11px',
                    color: 'var(--color-accent-secondary, #D42A2F)',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Clear All
                </button>
              </div>

              <div
                style={{
                  maxHeight: '180px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                {selectedFiles.map((file, idx) => {
                  const isVid = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name);
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        background: 'var(--color-surface-raised, #FFFFFF)',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border, #E2D9CC)',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        {isVid && (
                          <span
                            className="font-mono"
                            style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: 'rgba(15, 76, 92, 0.12)',
                              color: 'var(--color-hero-bg, #0F4C5C)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                          >
                            <VideoIcon size={10} color="var(--color-hero-bg, #0F4C5C)" /> VIDEO
                          </span>
                        )}
                        <span
                          style={{
                            fontWeight: 500,
                            color: 'var(--color-text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: isVid ? '320px' : '380px',
                          }}
                        >
                          {file.name}
                        </span>
                        <span className="font-mono text-muted text-xs" style={{ fontSize: '10px' }}>
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>

                      {!isUploading && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFile(idx);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--color-text-muted)',
                            padding: '2px',
                          }}
                        >
                          <CloseIcon size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Upload Confirm Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={handleClose}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--color-border, #E2D9CC)',
                    borderRadius: '8px',
                    padding: '8px 18px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-text-muted, #566B76)',
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={isUploading}
                  onClick={handleConfirmUpload}
                  style={{
                    background: isUploading ? 'var(--color-surface-sunken, #CAD2D3)' : 'var(--color-hero-bg, #0F4C5C)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 22px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'background 0.15s ease',
                  }}
                >
                  {isUploading ? (
                    <>
                      <Spinner size={14} color="#FFFFFF" />
                      <span>Uploading {selectedFiles.length} Media Item{selectedFiles.length > 1 ? 's' : ''}...</span>
                    </>
                  ) : (
                    <>
                      <UploadIcon size={14} color="#FFFFFF" />
                      <span>Upload {selectedFiles.length} Media Item{selectedFiles.length > 1 ? 's' : ''}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
