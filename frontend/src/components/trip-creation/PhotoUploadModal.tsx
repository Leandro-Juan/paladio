"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAnimatedMount } from '@/hooks/useAnimatedMount';
import { CloseIcon, PlusIcon } from '@/components/icons';

interface PhotoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoSelect: (photoDataUrl: string) => void;
}

export function PhotoUploadModal({
  isOpen,
  onClose,
  onPhotoSelect,
}: PhotoUploadModalProps) {
  const { t } = useTranslation();
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setErrorMessage(null);
      setIsDragOver(false);
    }
  }

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const { shouldRender, dataState } = useAnimatedMount(isOpen, 150);

  if (!shouldRender) return null;

  const downscaleDataUrlIfNeeded = (dataUrl: string, mimeType: string, callback: (out: string) => void) => {
    if (mimeType === 'image/gif' || mimeType === 'image/svg+xml') {
      callback(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const maxDim = 1600;
      if (img.width <= maxDim && img.height <= maxDim && dataUrl.length <= 500_000) {
        callback(dataUrl);
        return;
      }
      const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
      const targetW = Math.max(1, Math.round(img.width * scale));
      const targetH = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        callback(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);
      try {
        callback(canvas.toDataURL('image/jpeg', 0.85));
      } catch {
        callback(dataUrl);
      }
    };
    img.onerror = () => callback(dataUrl);
    img.src = dataUrl;
  };

  const handleFileProcess = (file: File) => {
    setErrorMessage(null);
    if (!file.type.startsWith('image/')) {
      setErrorMessage(t('engine.photo_invalid_type'));
      return;
    }
    // Limit to 10MB
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage(t('engine.photo_too_large'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        downscaleDataUrlIfNeeded(reader.result, file.type, onPhotoSelect);
      }
    };
    reader.onerror = () => {
      setErrorMessage(t('engine.photo_read_failed'));
    };
    reader.readAsDataURL(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  return (
    <div
      className="paladio-modal-backdrop"
      data-state={dataState}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(8, 28, 36, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        className="paladio-modal-panel"
        data-state={dataState}
        style={{
          background: 'var(--color-surface-raised, #FFFFFF)',
          border: '1px solid var(--color-border, #E2D9CC)',
          borderRadius: '24px',
          padding: '1.75rem',
          maxWidth: '500px',
          width: '100%',
          boxShadow: '0 24px 50px rgba(0, 0, 0, 0.22)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: 700,
                color: 'var(--color-text-primary, #1A1D24)',
                letterSpacing: '-0.02em',
              }}
            >
              {t('workspace.upload_photo')}
            </h3>
            <p
              style={{
                margin: '3px 0 0 0',
                fontSize: '13px',
                color: 'var(--color-text-muted, #71717A)',
              }}
            >
              {t('engine.photo_upload_desc')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title={t('common.close')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-secondary, #64748B)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleInputChange}
        />

        {/* Rectangular Dropzone Box with Discontinuous (Dashed) Line */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          style={{
            border: isDragOver
              ? '2px dashed #0F4C5C'
              : '2px dashed var(--color-border, #CBD5E1)',
            borderRadius: '18px',
            backgroundColor: isDragOver
              ? 'rgba(15, 76, 92, 0.06)'
              : 'var(--color-bg-main, #FAF8F5)',
            padding: '2.5rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            outline: 'none',
          }}
        >
          {/* Plus Sign in the Middle */}
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: isDragOver ? '#0F4C5C' : 'var(--color-surface, #FFFFFF)',
              border: isDragOver ? '1px solid #0F4C5C' : '1px solid var(--color-border, #E2D9CC)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
          >
            <PlusIcon
              size={24}
              color={isDragOver ? '#FFFFFF' : 'var(--color-text-primary, #1A1D24)'}
            />
          </div>

          {/* Text: Drop or Browse */}
          <div style={{ textAlign: 'center' }}>
            <p
              style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--color-text-primary, #1A1D24)',
              }}
            >
              {(() => {
                const marker = '__BROWSE__';
                const text = t('engine.drop_photo_or_browse', { browse: marker });
                const parts = text.split(marker);
                if (parts.length !== 2) return text;
                return (
                  <>
                    {parts[0]}
                    <span
                      style={{
                        color: '#0F4C5C',
                        textDecoration: 'underline',
                        fontWeight: 700,
                      }}
                    >
                      {t('engine.browse_link')}
                    </span>
                    {parts[1]}
                  </>
                );
              })()}
            </p>
            <p
              style={{
                margin: '4px 0 0 0',
                fontSize: '12px',
                color: 'var(--color-text-muted, #71717A)',
              }}
            >
              {t('engine.photo_supported_formats')}
            </p>
          </div>
        </div>

        {/* Error message if any */}
        {errorMessage && (
          <div
            style={{
              fontSize: '12px',
              color: '#DC2626',
              background: '#FEE2E2',
              padding: '8px 12px',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}
