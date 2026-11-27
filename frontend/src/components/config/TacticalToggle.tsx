'use strict';
import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';

interface TacticalToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  tone?: 'coral' | 'teal' | 'gold';
  ariaLabel?: string;
}

export function TacticalToggle({
  checked,
  onChange,
  disabled = false,
  label,
  tone = 'teal',
  ariaLabel,
}: TacticalToggleProps) {
  const { t } = useTranslation();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  const getToneBackground = () => {
    if (!checked) return 'var(--color-border, #E2DDD5)';
    switch (tone) {
      case 'coral':
        return 'var(--color-accent-coral, #C86D51)';
      case 'gold':
        return 'var(--color-accent-gold, #E2B33C)';
      case 'teal':
      default:
        return 'var(--color-accent-teal, #2A8C82)';
    }
  };

  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        userSelect: 'none',
      }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel ? t(ariaLabel) : label ? t(label) : t('config.toggle_setting')}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        onKeyDown={handleKeyDown}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          width: '42px',
          height: '24px',
          borderRadius: '9999px',
          backgroundColor: getToneBackground(),
          border: '1.5px solid rgba(0, 0, 0, 0.08)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: '2px',
          transition: 'background-color var(--transition-snappy), border-color var(--transition-fast)',
        }}
      >
        <span
          className="paladio-toggle-thumb"
          style={{
            display: 'block',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            backgroundColor: '#FFFFFF',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
            transform: checked ? 'translateX(18px)' : 'translateX(0px)',
          }}
        />
      </button>
      {label && (
        <span
          style={{
            fontFamily: 'var(--font-ui, sans-serif)',
            fontSize: '13px',
            fontWeight: 500,
            color: checked ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          }}
        >
          {t(label)}
        </span>
      )}
    </label>
  );
}
