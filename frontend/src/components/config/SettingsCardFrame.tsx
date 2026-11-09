'use strict';
import React from 'react';
import { SettingsContextMenu, ContextMenuItem } from './SettingsContextMenu';

export interface SubTabItem {
  id: string;
  label: string;
  count?: number;
}

export interface SettingsCardFrameProps {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: 'coral' | 'teal' | 'gold';
  actionButton?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  menuItems?: ContextMenuItem[];
  subTabs?: SubTabItem[];
  activeSubTab?: string;
  onSelectSubTab?: (id: string) => void;
  innerTitle?: string;
  innerBadge?: string;
  innerMenuItems?: ContextMenuItem[];
  children: React.ReactNode;
  className?: string;
}

export function SettingsCardFrame({
  title,
  subtitle,
  badge,
  badgeTone = 'teal',
  actionButton,
  menuItems,
  subTabs,
  activeSubTab,
  onSelectSubTab,
  innerTitle,
  innerBadge,
  innerMenuItems,
  children,
  className,
}: SettingsCardFrameProps) {
  const getBadgeStyle = () => {
    switch (badgeTone) {
      case 'coral':
        return {
          backgroundColor: 'rgba(200, 109, 81, 0.12)',
          color: 'var(--color-accent-coral, #C86D51)',
          borderColor: 'rgba(200, 109, 81, 0.25)',
        };
      case 'gold':
        return {
          backgroundColor: 'rgba(226, 179, 60, 0.12)',
          color: 'var(--color-accent-gold, #E2B33C)',
          borderColor: 'rgba(226, 179, 60, 0.25)',
        };
      case 'teal':
      default:
        return {
          backgroundColor: 'rgba(42, 140, 130, 0.12)',
          color: 'var(--color-accent-teal, #2A8C82)',
          borderColor: 'rgba(42, 140, 130, 0.25)',
        };
    }
  };

  return (
    <div
      className={className}
      style={{
        borderRadius: '18px',
        backgroundColor: 'var(--color-surface-card, #FFFFFF)',
        border: '1px solid var(--color-border, #E2DDD5)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        transition: 'border-color 0.18s ease',
      }}
    >
      {/* Outer Header: Title, Subtitle, Actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3
              style={{
                fontFamily: 'var(--font-display, "Jost", sans-serif)',
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--color-text-primary, #1A202C)',
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              {title}
            </h3>
            {badge && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  border: '1px solid',
                  ...getBadgeStyle(),
                }}
              >
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p
              style={{
                fontFamily: 'var(--font-ui, sans-serif)',
                fontSize: '13px',
                color: 'var(--color-text-muted, #718096)',
                margin: 0,
                lineHeight: 1.45,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>

        {/* Action button + context menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {actionButton && (
            <button
              type="button"
              onClick={actionButton.onClick}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '9999px',
                backgroundColor: 'var(--color-surface-hover, rgba(42, 140, 130, 0.08))',
                color: 'var(--color-accent-teal, #2A8C82)',
                border: '1px solid rgba(42, 140, 130, 0.25)',
                fontFamily: 'var(--font-ui, sans-serif)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {actionButton.icon || '+'}
              <span>{actionButton.label}</span>
            </button>
          )}
          {menuItems && menuItems.length > 0 && (
            <SettingsContextMenu items={menuItems} />
          )}
        </div>
      </div>

      {/* Segmented Sub-Tab Switcher (Pill style from reference mockup) */}
      {subTabs && subTabs.length > 0 && onSelectSubTab && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--color-bg-main, #F7F5F0)',
            padding: '3px',
            borderRadius: '9999px',
            border: '1px solid var(--color-border, #E2DDD5)',
            gap: '4px',
            width: 'fit-content',
            maxWidth: '100%',
            overflowX: 'auto',
          }}
        >
          {subTabs.map((tab) => {
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectSubTab(tab.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 16px',
                  borderRadius: '9999px',
                  border: 'none',
                  backgroundColor: isActive
                    ? 'var(--color-surface-card, #FFFFFF)'
                    : 'transparent',
                  color: isActive
                    ? 'var(--color-text-primary, #1A202C)'
                    : 'var(--color-text-muted, #718096)',
                  fontFamily: 'var(--font-ui, sans-serif)',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  boxShadow: isActive
                    ? '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)'
                    : 'none',
                  transition: 'all 0.16s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '1px 5px',
                      borderRadius: '9999px',
                      backgroundColor: isActive
                        ? 'rgba(42, 140, 130, 0.12)'
                        : 'rgba(0, 0, 0, 0.06)',
                      color: isActive
                        ? 'var(--color-accent-teal, #2A8C82)'
                        : 'var(--color-text-muted, #718096)',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Nested Tactical Panel (Concentric inner card matching the reference image) */}
      <div
        style={{
          borderRadius: '12px',
          backgroundColor: 'var(--color-bg-main, #F7F5F0)',
          border: '1px solid var(--color-border, #E2DDD5)',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {(innerTitle || innerMenuItems) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '12px',
              borderBottom: '1px solid var(--color-border, #E2DDD5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-ui, sans-serif)',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--color-text-primary, #1A202C)',
                }}
              >
                {innerTitle}
              </span>
              {innerBadge && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--color-accent-teal, #2A8C82)',
                    backgroundColor: 'rgba(42, 140, 130, 0.1)',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                  }}
                >
                  ★ {innerBadge}
                </span>
              )}
            </div>
            {innerMenuItems && innerMenuItems.length > 0 && (
              <SettingsContextMenu items={innerMenuItems} />
            )}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
