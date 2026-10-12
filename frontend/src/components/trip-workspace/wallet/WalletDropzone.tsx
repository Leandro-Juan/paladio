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
          isDragOver ? 'var(--color-accent-primary, #1E3A8A)' : isScanning ? '#3B82F6' : 'var(--color-border, #CBD5E1)'
        }`,
        background: isDragOver
          ? '#EFF6FF'
          : isScanning
          ? '#F0F9FF'
          : 'var(--color-surface-card, #F8FAFC)',
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
          <Spinner size={26} color="var(--color-accent-primary, #1E3A8A)" />
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--color-accent-primary, #1E3A8A)',
              letterSpacing: '1px',
            }}
          >
            PARSING CREDENTIALS… DECODING BARCODES
          </span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)' }}>
            Extracting BCBP payloads & booking records deterministically
          </span>
        </div>
      ) : (
        <>
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--color-border, #CBD5E1)',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(15, 23, 42, 0.05)',
            }}
          >
            <DocumentIcon size={22} color="var(--color-accent-primary, #1E3A8A)" />
          </div>
          <div>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: isDragOver ? 'var(--color-accent-primary, #1E3A8A)' : 'var(--color-text-primary, #0F172A)',
                letterSpacing: '0.5px',
              }}
            >
              DROP TICKETS, BOARDING PASSES OR HOTEL CONFIRMATIONS HERE
            </span>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)', marginTop: '4px' }}>
              Supports PDF, Apple Wallet (.pkpass), PNG/JPEG barcodes, or paste text clipboard
            </div>
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#FFFFFF',
              border: '1px solid var(--color-border, #CBD5E1)',
              color: 'var(--color-text-primary, #0F172A)',
              padding: '4px 12px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              marginTop: '4px',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
            }}
          >
            <span>or click to browse files</span>
          </div>
        </>
      )}
    </div>
  );
}
