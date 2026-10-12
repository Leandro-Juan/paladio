"use client";

import React, { useEffect, useState, useRef } from 'react';

interface CodeRendererProps {
  value?: string | null;
  format?: 'qr' | 'aztec' | 'pdf417' | 'code128' | 'datamatrix' | null;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function CodeRenderer({ value, format = 'qr', size = 110, style }: CodeRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!value || !canvasRef.current) return;

    let isMounted = true;

    // Dynamically load QRCode so bundle size is not bloated
    import('qrcode')
      .then((QRCode) => {
        if (!isMounted || !canvasRef.current) return;
        QRCode.toCanvas(canvasRef.current, value, {
          width: size,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        }).catch((err) => {
          console.warn('QR Code generation failed, falling back to text:', err);
          if (isMounted) setError(true);
        });
      })
      .catch(() => {
        if (isMounted) setError(true);
      });

    return () => {
      isMounted = false;
    };
  }, [value, size]);

  if (!value) return null;

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '6px',
        background: '#FFFFFF',
        borderRadius: '6px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{ display: error ? 'none' : 'block', maxWidth: '100%', height: 'auto' }}
        aria-label={`Barcode: ${value}`}
      />
      {error && (
        <div
          style={{
            width: size,
            height: size,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#F1F5F9',
            color: '#0F172A',
            fontSize: '10px',
            fontFamily: 'monospace',
            textAlign: 'center',
            padding: '4px',
            wordBreak: 'break-all',
          }}
        >
          {value.substring(0, 32)}
        </div>
      )}
      <span
        style={{
          fontSize: '9px',
          fontFamily: 'monospace',
          color: '#475569',
          marginTop: '2px',
          fontWeight: 700,
          letterSpacing: '0.5px',
        }}
      >
        {format ? format.toUpperCase() : 'CODE'}
      </span>
    </div>
  );
}
