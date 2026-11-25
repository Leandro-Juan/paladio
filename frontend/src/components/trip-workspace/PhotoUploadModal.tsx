"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useIsMounted } from '@/hooks/useIsMounted';
import { useTranslation } from '@/hooks/useTranslation';
import { useAnimatedMount } from '@/hooks/useAnimatedMount';
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
  const { t } = useTranslation();
  const isMounted = useIsMounted();
  const { shouldRender, dataState } = useAnimatedMount(isOpen, 150);
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

  // Close on Escape key & lock scroll on body and active tab panes
  useEffect(() => {
    if (!isOpen) return;

    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Lock any active scrollable tab pane in the workspace
    const tabPanes = document.querySelectorAll<HTMLElement>('.animate-tab-pane');
    const prevTabPanesOverflow: { el: HTMLElement; overflow: string }[] = [];
    tabPanes.forEach((el) => {
      prevTabPanesOverflow.push({ el, overflow: el.style.overflowY });
      el.style.overflowY = 'hidden';
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevBodyOverflow;
      prevTabPanesOverflow.forEach(({ el, overflow }) => {
        el.style.overflowY = overflow;
      });
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

  if (!shouldRender || !isMounted || typeof document === 'undefined') return null;

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

  return createPortal(
    <div
      className="paladio-modal-backdrop"
      data-state={dataState}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'var(--color-scrim, rgba(15, 76, 92, 0.45))',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        overscrollBehavior: 'contain',
      }}
      role="dialog"
      aria-modal="true"
      onWheel={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
        }
      }}
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
        className="paladio-modal-panel"
        data-state={dataState}
        style={{
          background: 'var(--color-surface-raised, #FFFFFF)',
          border: '1px solid var(--color-border, #E2D9CC)',
          borderRadius: '24px',
          maxWidth: '680px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          disabled={isUploading}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            zIndex: 10,
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
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          <CloseIcon size={18} />
        </button>

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
              {t('photos.dropzone_title')}
            </span>

            <span className="font-mono text-xs text-muted" style={{ fontSize: '11px', color: 'var(--color-text-muted, #566B76)' }}>
              {t('photos.dropzone_desc')}
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
              <span>{t('common.browse_files')}</span>
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
                  {t('photos.selected_files', { count: selectedFiles.length })}
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
                  {t('photos.clear_all')}
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
                            <VideoIcon size={10} color="var(--color-hero-bg, #0F4C5C)" /> {t('photos.video_badge')}
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
                  {t('common.cancel')}
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
                      <span>
                        {selectedFiles.length === 1
                          ? t('photos.uploading_item_singular', { count: selectedFiles.length })
                          : t('photos.uploading_item_plural', { count: selectedFiles.length })}
                      </span>
                    </>
                  ) : (
                    <>
                      <UploadIcon size={14} color="#FFFFFF" />
                      <span>
                        {selectedFiles.length === 1
                          ? t('photos.upload_item_singular', { count: selectedFiles.length })
                          : t('photos.upload_item_plural', { count: selectedFiles.length })}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
