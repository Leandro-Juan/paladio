"use client";

import React, { useRef, useEffect } from 'react';
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
  anchorLabel = 'Select Time',
  zIndex = 100,
}: CustomHourPickerModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Parse hour and minute
  const [selectedHour, setSelectedHour] = React.useState(() => {
    const parts = (value || '09:00').split(':');
    const parsed = parseInt(parts[0], 10);
    return Number.isNaN(parsed) ? 9 : parsed;
  });

  const [selectedMinute, setSelectedMinute] = React.useState(() => {
    const parts = (value || '09:00').split(':');
    const parsed = parseInt(parts[1], 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  });

  const [prevValue, setPrevValue] = React.useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    const parts = (value || '09:00').split(':');
    const parsedH = parseInt(parts[0], 10);
    const parsedM = parseInt(parts[1], 10);
    setSelectedHour(Number.isNaN(parsedH) ? 9 : parsedH);
    setSelectedMinute(Number.isNaN(parsedM) ? 0 : parsedM);
  }

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

  if (!isOpen) return null;

  const handleHourChange = (newH: number) => {
    const normalizedH = (newH + 24) % 24;
    setSelectedHour(normalizedH);
    const hStr = String(normalizedH).padStart(2, '0');
    const mStr = String(selectedMinute).padStart(2, '0');
    onChange(`${hStr}:${mStr}`);
  };

  const handleMinuteChange = (newM: number) => {
    const normalizedM = (newM + 60) % 60;
    setSelectedMinute(normalizedM);
    const hStr = String(selectedHour).padStart(2, '0');
    const mStr = String(normalizedM).padStart(2, '0');
    onChange(`${hStr}:${mStr}`);
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
            {anchorLabel}
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
              onClick={() => handleMinuteChange(selectedMinute - 5)}
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
                const mVal = (selectedMinute + offset * 5 + 60) % 60;
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
              onClick={() => handleMinuteChange(selectedMinute + 5)}
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
          onClick={onClose}
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
          Confirm Time
        </button>
      </div>
    </div>
  );
}
