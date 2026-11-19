"use client";

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { SettingsCardFrame } from '../SettingsCardFrame';
import { TacticalToggle } from '../TacticalToggle';

export interface NotificationTypesConfig {
  notify_on_deal_alert: boolean;
  notify_on_trip_update: boolean;
  notify_on_ticket_parse: boolean;
  notify_on_photo_sync: boolean;
}

interface NotificationTypesCardProps {
  config: NotificationTypesConfig;
  onUpdate: (patch: Partial<NotificationTypesConfig>) => Promise<void> | void;
  disabled?: boolean;
}

interface NotificationTypeItem {
  key: keyof NotificationTypesConfig;
  title: string;
  description: string;
  tone: 'teal' | 'gold' | 'coral';
  ariaLabel: string;
}

const NOTIFICATION_TYPES: NotificationTypeItem[] = [
  {
    key: 'notify_on_deal_alert',
    title: 'Flight & Hotel Price Drop Alerts',
    description: 'Trigger push alerts when the Deal Engine detects fares or hotel prices dropping below threshold',
    tone: 'teal',
    ariaLabel: 'Toggle deal alert notifications',
  },
  {
    key: 'notify_on_trip_update',
    title: 'Itinerary & Route Schedule Updates',
    description: 'Send push notification when swarm agents or collaborators modify planned days or routes',
    tone: 'teal',
    ariaLabel: 'Toggle trip update notifications',
  },
  {
    key: 'notify_on_ticket_parse',
    title: 'Ticket Ingestion & Extraction Complete',
    description: 'Notify when uploaded flight or train ticket PDFs have finished OCR parsing',
    tone: 'gold',
    ariaLabel: 'Toggle ticket parse notifications',
  },
  {
    key: 'notify_on_photo_sync',
    title: 'Vault Photo Sync Completion',
    description: 'Send a push notification when uploaded itinerary media finishes uploading to Immich or Synology',
    tone: 'coral',
    ariaLabel: 'Toggle photo sync notifications',
  },
];

export function NotificationTypesCard({
  config,
  onUpdate,
  disabled = false,
}: NotificationTypesCardProps) {
  const { t } = useTranslation();

  const allSelected =
    config.notify_on_deal_alert &&
    config.notify_on_trip_update &&
    config.notify_on_ticket_parse &&
    config.notify_on_photo_sync;

  const noneSelected =
    !config.notify_on_deal_alert &&
    !config.notify_on_trip_update &&
    !config.notify_on_ticket_parse &&
    !config.notify_on_photo_sync;

  const handleSelectAll = () => {
    if (disabled || allSelected) return;
    onUpdate({
      notify_on_deal_alert: true,
      notify_on_trip_update: true,
      notify_on_ticket_parse: true,
      notify_on_photo_sync: true,
    });
  };

  const handleSelectNone = () => {
    if (disabled || noneSelected) return;
    onUpdate({
      notify_on_deal_alert: false,
      notify_on_trip_update: false,
      notify_on_ticket_parse: false,
      notify_on_photo_sync: false,
    });
  };

  return (
    <SettingsCardFrame
      title={t('config.subtab_notif_types')}
      subtitle={t('config.notif_types_subtitle')}
      badge={t('config.notif_types_badge')}
      badgeTone="teal"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Pill Control Bar: Quick Selection (All / None) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '12px',
            borderBottom: '1px solid var(--color-border)',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span
              style={{
                fontFamily: 'var(--font-display, "Jost", sans-serif)',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
              }}
            >
              {t('config.event_triggers_title')}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-ui, sans-serif)',
                fontSize: '11px',
                color: 'var(--color-text-muted)',
              }}
            >
              {t('config.event_triggers_desc')}
            </span>
          </div>

          <div
            role="group"
            aria-label={t('config.notif_selection_aria')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              backgroundColor: 'var(--color-bg-main, #F7F5F0)',
              padding: '3px',
              borderRadius: '9999px',
              border: '1px solid var(--color-border, #E2DDD5)',
              gap: '2px',
            }}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={handleSelectAll}
              aria-pressed={allSelected}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 14px',
                borderRadius: '9999px',
                border: 'none',
                backgroundColor: allSelected
                  ? 'var(--color-surface-card, #FFFFFF)'
                  : 'transparent',
                color: allSelected
                  ? 'var(--color-accent-teal, #2A8C82)'
                  : 'var(--color-text-muted, #718096)',
                fontFamily: 'var(--font-ui, sans-serif)',
                fontSize: '12px',
                fontWeight: allSelected ? 700 : 500,
                cursor: disabled ? 'not-allowed' : 'pointer',
                boxShadow: allSelected
                  ? '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)'
                  : 'none',
                transition: 'all 0.16s ease',
              }}
            >
              {t('config.pill_all')}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={handleSelectNone}
              aria-pressed={noneSelected}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 14px',
                borderRadius: '9999px',
                border: 'none',
                backgroundColor: noneSelected
                  ? 'var(--color-surface-card, #FFFFFF)'
                  : 'transparent',
                color: noneSelected
                  ? 'var(--color-accent-coral, #C86D51)'
                  : 'var(--color-text-muted, #718096)',
                fontFamily: 'var(--font-ui, sans-serif)',
                fontSize: '12px',
                fontWeight: noneSelected ? 700 : 500,
                cursor: disabled ? 'not-allowed' : 'pointer',
                boxShadow: noneSelected
                  ? '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)'
                  : 'none',
                transition: 'all 0.16s ease',
              }}
            >
              {t('config.pill_none')}
            </button>
          </div>
        </div>

        {/* Notification Type Toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {NOTIFICATION_TYPES.map((item, index) => {
            const isLast = index === NOTIFICATION_TYPES.length - 1;
            return (
              <div
                key={item.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: isLast ? 0 : '12px',
                  borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
                  gap: '16px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-display, "Jost", sans-serif)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {t(item.title)}
                  </span>
                  <p
                    style={{
                      fontFamily: 'var(--font-ui, sans-serif)',
                      fontSize: '12px',
                      color: 'var(--color-text-muted)',
                      margin: 0,
                      lineHeight: 1.4,
                    }}
                  >
                    {t(item.description)}
                  </p>
                </div>
                <TacticalToggle
                  checked={config[item.key]}
                  onChange={(checked) => onUpdate({ [item.key]: checked })}
                  disabled={disabled}
                  tone={item.tone}
                  ariaLabel={t(item.ariaLabel)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </SettingsCardFrame>
  );
}
