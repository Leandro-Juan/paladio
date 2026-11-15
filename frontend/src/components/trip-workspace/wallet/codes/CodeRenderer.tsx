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
    setError(false);

    const fmt = (format || 'qr').toLowerCase();
    const bcidMap: Record<string, string> = {
      qr: 'qrcode',
      aztec: 'azteccode',
      pdf417: 'pdf417',
      datamatrix: 'datamatrix',
      code128: 'code128',
    };
    const bcid = bcidMap[fmt] || 'qrcode';

    import('bwip-js/browser')
      .then((bwipMod) => {
        if (!isMounted || !canvasRef.current) return;
        const bwipjs = bwipMod.default ?? bwipMod;
        const isWide = bcid === 'pdf417' || bcid === 'code128';
        bwipjs.toCanvas(canvasRef.current, {
          bcid,
          text: value,
          scale: isWide ? 2 : Math.max(2, Math.round(size / 45)),
          ...(bcid === 'code128' ? { height: 12, includetext: false } : {}),
          ...(bcid === 'pdf417' ? { columns: 4 } : {}),
          paddingwidth: 4,
          paddingheight: 4,
          backgroundcolor: 'FFFFFF',
          barcolor: '000000',
        });
      })
      .catch((err) => {
        console.warn(`Barcode generation (${bcid}) failed, falling back to text:`, err);
        if (isMounted) setError(true);
      });

    return () => {
      isMounted = false;
    };
  }, [value, format, size]);

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
            fontFamily: 'var(--font-mono)',
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
          fontFamily: 'var(--font-mono)',
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
