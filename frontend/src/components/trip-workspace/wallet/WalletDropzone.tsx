"use client";

import React, { useState, useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Spinner, PlusIcon } from '@/components/icons';
import { BoardingPassTacticalIllustration } from '@/components/illustrations';

interface WalletDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  onRawTextPasted?: (text: string) => void;
  isScanning: boolean;
}

export function WalletDropzone({
  onFilesSelected,
  onRawTextPasted,
  isScanning,
}: WalletDropzoneProps) {
  const { t } = useTranslation();
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      onFilesSelected(files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      onFilesSelected(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      const files = Array.from(e.clipboardData.files);
      onFilesSelected(files);
      return;
    }

    const text = e.clipboardData.getData('text');
    if (text && text.trim().length > 10 && onRawTextPasted) {
      onRawTextPasted(text);
    }
  };

  return (
    <div
      tabIndex={0}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onPaste={handlePaste}
      onClick={() => {
        if (!isScanning) fileInputRef.current?.click();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!isScanning) fileInputRef.current?.click();
        }
      }}
      role="button"
      aria-label={t('wallet.dropzone_title')}
      style={{
        border: `2px dashed ${
          isDragOver
            ? 'var(--color-accent-teal, #0F4C5C)'
            : isScanning
            ? 'var(--color-accent-primary, #0F4C5C)'
            : 'var(--color-border, #E2D9CC)'
        }`,
        background: isDragOver
          ? 'rgba(15, 76, 92, 0.05)'
          : isScanning
          ? 'rgba(15, 76, 92, 0.04)'
          : 'var(--color-surface-card, #FAF6F0)',
        borderRadius: '20px',
        padding: '2rem 1.5rem',
        textAlign: 'center',
        cursor: isScanning ? 'wait' : 'pointer',
        transition: 'all 0.18s ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        outline: 'none',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.pkpass"
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />

      {isScanning ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <Spinner size={26} color="var(--color-accent-primary, #0F4C5C)" />
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--color-accent-primary, #0F4C5C)',
              letterSpacing: '1px',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {t('wallet.parsing_credentials')}
          </span>
          <span
            className="font-mono text-xs text-muted"
            style={{ fontSize: '11px', color: 'var(--color-text-muted, #566B76)' }}
          >
            {t('wallet.parsing_subtitle')}
          </span>
        </div>
      ) : (
        <>
          <div style={{ pointerEvents: 'none' }}>
            <BoardingPassTacticalIllustration width={130} height={85} />
          </div>

          <span
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--color-text-primary, #1A2B32)',
              marginTop: '4px',
            }}
          >
            {t('wallet.dropzone_desc')}
          </span>

          <span
            className="font-mono text-xs text-muted"
            style={{ fontSize: '11px', color: 'var(--color-text-muted, #566B76)' }}
          >
            {t('wallet.supported_formats')}
          </span>

          <button
            type="button"
            disabled={isScanning}
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
              cursor: isScanning ? 'wait' : 'pointer',
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
            <span>{t('wallet.browse_files')}</span>
          </button>
        </>
      )}
    </div>
  );
}
