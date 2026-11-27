'use strict';
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAnimatedMount } from '@/hooks/useAnimatedMount';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  isDanger?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
}

interface SettingsContextMenuProps {
  items: ContextMenuItem[];
  triggerLabel?: string;
  ariaLabel?: string;
  align?: 'left' | 'right';
}

export function SettingsContextMenu({
  items,
  triggerLabel,
  ariaLabel,
  align = 'right',
}: SettingsContextMenuProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuMount = useAnimatedMount(isOpen, 130);
  const resolvedAriaLabel = ariaLabel ? t(ariaLabel) : t('config.options_menu');

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-label={resolvedAriaLabel}
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          width: triggerLabel ? 'auto' : '32px',
          height: '32px',
          padding: triggerLabel ? '0 12px' : '0',
          borderRadius: '9999px',
          border: '1px solid var(--color-border, #E2DDD5)',
          backgroundColor: isOpen ? 'var(--color-surface-hover, rgba(0, 0, 0, 0.04))' : 'var(--color-surface-card, #FFFFFF)',
          color: 'var(--color-text-muted, #718096)',
          cursor: 'pointer',
          transition: 'background-color var(--transition-fast, 150ms ease), border-color var(--transition-fast, 150ms ease), color var(--transition-fast, 150ms ease)',
        }}
      >
        {triggerLabel ? (
          <span style={{ fontSize: '12px', fontWeight: 600 }}>{t(triggerLabel)}</span>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        )}
      </button>

      {menuMount.shouldRender && (
        <div
          role="menu"
          className="paladio-popover"
          data-state={menuMount.dataState}
          data-origin={align === 'right' ? 'top-right' : 'top-left'}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            [align === 'right' ? 'right' : 'left']: 0,
            zIndex: 100,
            minWidth: '200px',
            borderRadius: '12px',
            backgroundColor: 'var(--color-surface-card, #FFFFFF)',
            border: '1px solid var(--color-border, #E2DDD5)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
            backdropFilter: 'blur(16px)',
            padding: '6px',
          }}
        >
          {items.map((item) => (
            <React.Fragment key={item.id}>
              {item.dividerBefore && (
                <div
                  style={{
                    height: '1px',
                    backgroundColor: 'var(--color-border, #E2DDD5)',
                    margin: '4px 6px',
                  }}
                />
              )}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  item.onClick();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: item.isDanger
                    ? 'var(--color-accent-danger, #B3261E)'
                    : 'var(--color-text-primary, #1A202C)',
                  fontSize: '13px',
                  fontFamily: 'var(--font-ui, sans-serif)',
                  fontWeight: 500,
                  textAlign: 'left',
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  opacity: item.disabled ? 0.4 : 1,
                  transition: 'background-color 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  if (!item.disabled) {
                    e.currentTarget.style.backgroundColor = item.isDanger
                      ? 'rgba(179, 38, 30, 0.08)'
                      : 'var(--color-surface-hover, rgba(0, 0, 0, 0.04))';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {item.icon && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      flexShrink: 0,
                    }}
                  >
                    {item.icon}
                  </span>
                )}
                <span>{t(item.label)}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
