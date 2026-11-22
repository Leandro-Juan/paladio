"use client";

import React, { useRef, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { ChevronUpIcon, ChevronDownIcon, ClockIcon } from '@/components/icons';

interface CustomHourPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  value: string; // HH:mm format, e.g. "09:00"
  onChange: (newValue: string) => void;
  anchorLabel?: string;
  zIndex?: number;
}

export function CustomHourPickerModal({
  isOpen,
  onClose,
  value,
  onChange,
  anchorLabel,
  zIndex = 100,
}: CustomHourPickerModalProps) {
  const { t } = useTranslation();
  const resolvedAnchorLabel = anchorLabel ?? t('engine.select_time');
  const modalRef = useRef<HTMLDivElement>(null);

  // Parse and clamp hour (0..23) and minute (0..59)
  const clampHour = (h: number) => ((h % 24) + 24) % 24;
  const clampMinute = (m: number) => ((m % 60) + 60) % 60;

  const [selectedHour, setSelectedHour] = React.useState(() => {
    const parts = (value || '09:00').split(':');
    const parsed = parseInt(parts[0], 10);
    return Number.isNaN(parsed) ? 9 : clampHour(parsed);
  });

  const [selectedMinute, setSelectedMinute] = React.useState(() => {
    const parts = (value || '09:00').split(':');
    const parsed = parseInt(parts[1], 10);
    return Number.isNaN(parsed) ? 0 : clampMinute(parsed);
  });

  const [prevValue, setPrevValue] = React.useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    const parts = (value || '09:00').split(':');
    const parsedH = parseInt(parts[0], 10);
    const parsedM = parseInt(parts[1], 10);
    setSelectedHour(Number.isNaN(parsedH) ? 9 : clampHour(parsedH));
    setSelectedMinute(Number.isNaN(parsedM) ? 0 : clampMinute(parsedM));
  }

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleHourChange = (newH: number) => {
    const normalizedH = clampHour(newH);
    setSelectedHour(normalizedH);
    const hStr = String(normalizedH).padStart(2, '0');
    const mStr = String(selectedMinute).padStart(2, '0');
    onChange(`${hStr}:${mStr}`);
  };

  const handleMinuteChange = (newM: number) => {
    const normalizedM = clampMinute(newM);
    setSelectedMinute(normalizedM);
    const hStr = String(selectedHour).padStart(2, '0');
    const mStr = String(normalizedM).padStart(2, '0');
    onChange(`${hStr}:${mStr}`);
  };

  const handleMinuteStep = (delta: -5 | 5) => {
    if (selectedMinute % 5 === 0) {
      handleMinuteChange(selectedMinute + delta);
      return;
    }
    const snapped =
      delta < 0
        ? Math.floor(selectedMinute / 5) * 5
        : Math.ceil(selectedMinute / 5) * 5;
    handleMinuteChange(snapped);
  };

  // Visible window: -2, -1, current, +1, +2
  const hourOffsets = [-2, -1, 0, 1, 2];
  const minuteOffsets = [-2, -1, 0, 1, 2];

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: 'rgba(0, 0, 0, 0.25)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        ref={modalRef}
        style={{
          background: 'var(--color-surface-raised, #FFFFFF)',
          border: '1px solid var(--color-border, #E2D9CC)',
          borderRadius: '24px',
          padding: '1.5rem',
          boxShadow: '0 20px 48px rgba(0,0,0,0.18)',
          width: '240px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-secondary)' }}>
          <ClockIcon size={14} color="#0F4C5C" />
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {resolvedAnchorLabel}
          </span>
        </div>

        {/* Two-Column Cylinder Dial */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            background: 'var(--color-bg-main, #FAF8F5)',
            border: '1px solid var(--color-border, #E2D9CC)',
            borderRadius: '20px',
            padding: '12px 18px',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {/* Hours Column */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            <button
              type="button"
              onClick={() => handleHourChange(selectedHour - 1)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                padding: '4px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronUpIcon size={14} />
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', margin: '4px 0' }}>
              {hourOffsets.map((offset) => {
                const hVal = (selectedHour + offset + 24) % 24;
                const isSelected = offset === 0;
                return (
                  <button
                    key={`h-${offset}`}
                    type="button"
                    onClick={() => handleHourChange(hVal)}
                    style={{
                      background: isSelected ? '#2563EB' : 'transparent',
                      color: isSelected ? '#FFFFFF' : 'var(--color-text-muted)',
                      border: 'none',
                      borderRadius: isSelected ? '8px' : '4px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: isSelected ? '17px' : '12px',
                      fontWeight: isSelected ? 700 : 400,
                      width: '36px',
                      height: isSelected ? '34px' : '22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      opacity: Math.abs(offset) === 2 ? 0.35 : Math.abs(offset) === 1 ? 0.65 : 1,
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 2px 6px rgba(37, 99, 235, 0.3)' : 'none',
                    }}
                  >
                    {String(hVal).padStart(2, '0')}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => handleHourChange(selectedHour + 1)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                padding: '4px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronDownIcon size={14} />
            </button>
          </div>

          {/* Colon Separator */}
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '20px',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              alignSelf: 'center',
              userSelect: 'none',
            }}
          >
            :
          </div>

          {/* Minutes Column */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            <button
              type="button"
              onClick={() => handleMinuteStep(-5)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                padding: '4px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronUpIcon size={14} />
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', margin: '4px 0' }}>
              {minuteOffsets.map((offset) => {
                const baseGrid =
                  offset === 0 || selectedMinute % 5 === 0
                    ? selectedMinute
                    : offset < 0
                      ? Math.ceil(selectedMinute / 5) * 5
                      : Math.floor(selectedMinute / 5) * 5;
                const mVal = offset === 0 ? selectedMinute : clampMinute(baseGrid + offset * 5);
                const isSelected = offset === 0;
                return (
                  <button
                    key={`m-${offset}`}
                    type="button"
                    onClick={() => handleMinuteChange(mVal)}
                    style={{
                      background: isSelected ? '#2563EB' : 'transparent',
                      color: isSelected ? '#FFFFFF' : 'var(--color-text-muted)',
                      border: 'none',
                      borderRadius: isSelected ? '8px' : '4px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: isSelected ? '17px' : '12px',
                      fontWeight: isSelected ? 700 : 400,
                      width: '36px',
                      height: isSelected ? '34px' : '22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      opacity: Math.abs(offset) === 2 ? 0.35 : Math.abs(offset) === 1 ? 0.65 : 1,
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 2px 6px rgba(37, 99, 235, 0.3)' : 'none',
                    }}
                  >
                    {String(mVal).padStart(2, '0')}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => handleMinuteStep(5)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                padding: '4px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronDownIcon size={14} />
            </button>
          </div>
        </div>

        {/* Done / Confirm Button */}
        <button
          type="button"
          onClick={() => {
            onChange(
              `${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`
            );
            onClose();
          }}
          style={{
            width: '100%',
            padding: '8px 16px',
            borderRadius: '9999px',
            border: 'none',
            background: 'var(--color-accent-primary, #0F4C5C)',
            color: '#FFFFFF',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(15, 76, 92, 0.25)',
          }}
        >
          {t('engine.confirm_time')}
        </button>
      </div>
    </div>
  );
}
