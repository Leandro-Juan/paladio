"use client";

import React, { useState, useRef } from 'react';
import { Spinner, DocumentIcon } from '@/components/icons';

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
      role="button"
      aria-label="Upload ticket documents or boarding passes"
      style={{
        border: `2px dashed ${
          isDragOver ? 'var(--color-accent-primary)' : isScanning ? 'var(--color-accent-primary)' : 'var(--color-border-subtle)'
        }`,
        background: isDragOver
          ? 'rgba(15, 76, 92, 0.08)'
          : isScanning
          ? 'rgba(15, 76, 92, 0.04)'
          : 'var(--color-surface-card)',
        borderRadius: '12px',
        padding: '1.75rem 1.5rem',
        textAlign: 'center',
        cursor: isScanning ? 'wait' : 'pointer',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.65rem',
        fontFamily: 'var(--font-mono, monospace)',
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
          <Spinner size={26} color="var(--color-accent-primary)" />
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--color-accent-primary)',
              letterSpacing: '1px',
            }}
          >
            PARSING CREDENTIALS… DECODING BARCODES
          </span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
            Extracting BCBP payloads & booking records deterministically
          </span>
        </div>
      ) : (
        <>
          <div
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <DocumentIcon size={22} color="var(--color-accent-primary)" />
          </div>
          <div>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: isDragOver ? 'var(--color-accent-primary)' : 'var(--color-text-main)',
                letterSpacing: '0.5px',
              }}
            >
              DROP TICKETS, BOARDING PASSES OR HOTEL CONFIRMATIONS HERE
            </span>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              Supports PDF, Apple Wallet (.pkpass), PNG/JPEG barcodes, or paste text clipboard
            </div>
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-subtle)',
              color: 'var(--color-text-main)',
              padding: '4px 12px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              marginTop: '4px',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <span>or click to browse files</span>
          </div>
        </>
      )}
    </div>
  );
}
