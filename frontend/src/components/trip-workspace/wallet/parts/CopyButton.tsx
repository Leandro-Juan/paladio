"use client";

import React, { useState } from 'react';

interface CopyButtonProps {
  value?: string;
  text?: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  style?: React.CSSProperties;
}

export function CopyButton({ value, text, label, style }: CopyButtonProps) {
  const valToCopy = text || value || '';
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(valToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied to clipboard' : `Copy ${label || value}`}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 6px',
        background: copied ? '#ECFDF5' : 'var(--color-surface-card, #F8FAFC)',
        border: `1px solid ${copied ? '#A7F3D0' : 'var(--color-border, #CBD5E1)'}`,
        borderRadius: '4px',
        color: copied ? '#059669' : 'var(--color-text-muted, #64748B)',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: '10px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        outline: 'none',
        ...style,
      }}
    >
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span aria-live="polite">COPIED</span>
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span>COPY</span>
        </>
      )}
    </button>
  );
}
