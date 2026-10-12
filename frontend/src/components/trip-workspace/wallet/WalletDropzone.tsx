"use client";

import React, { useRef, useState } from 'react';

interface WalletDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  onRawTextPasted?: (text: string) => void;
  isScanning?: boolean;
}

export function WalletDropzone({
  onFilesSelected,
  onRawTextPasted,
  isScanning = false,
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
      e.target.value = '';
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
          isDragOver ? '#38BDF8' : isScanning ? '#818CF8' : 'rgba(255, 255, 255, 0.18)'
        }`,
        background: isDragOver
          ? 'rgba(56, 189, 248, 0.1)'
          : isScanning
          ? 'rgba(99, 102, 241, 0.08)'
          : 'rgba(30, 41, 59, 0.45)',
        backdropFilter: 'blur(12px)',
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
          <span
            style={{
              fontSize: '24px',
              animation: 'spin 1.5s linear infinite',
              display: 'inline-block',
            }}
          >
            ⚙️
          </span>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#818CF8',
              letterSpacing: '1px',
            }}
          >
            PARSING CREDENTIALS… DECODING BARCODES
          </span>
          <span style={{ fontSize: '10px', color: '#94A3B8' }}>
            Extracting BCBP payloads & booking records deterministically
          </span>
        </div>
      ) : (
        <>
          <div style={{ fontSize: '24px' }}>📄</div>
          <div>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: isDragOver ? '#38BDF8' : '#FFFFFF',
                letterSpacing: '0.5px',
              }}
            >
              DROP TICKETS, BOARDING PASSES OR HOTEL CONFIRMATIONS HERE
            </span>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>
              Supports PDF, Apple Wallet (.pkpass), PNG/JPEG barcodes, or paste text clipboard
            </div>
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '4px',
              padding: '3px 10px',
              fontSize: '10px',
              color: '#CBD5E1',
              marginTop: '4px',
            }}
          >
            <span>[ CLICK TO BROWSE ]</span>
            <span>·</span>
            <span>[ CTRL+V TO PASTE ]</span>
          </div>
        </>
      )}
    </div>
  );
}
