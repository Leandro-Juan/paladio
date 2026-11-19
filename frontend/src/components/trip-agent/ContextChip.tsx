"use client";

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { WorkspaceContextData } from './types/agent';
import styles from './AgentDock.module.css';

interface ContextChipProps {
  context?: WorkspaceContextData;
  onClear?: () => void;
}

export function ContextChip({ context, onClear }: ContextChipProps) {
  const { t } = useTranslation();

  if (!context) return null;

  const parts: string[] = [];
  if (context.selected_day !== undefined && context.selected_day !== 'all') {
    parts.push(t('trips.day_label', { number: context.selected_day }));
  }
  if (context.selected_stop_id) {
    parts.push(t('trip_agent.context_stop', { id: context.selected_stop_id.slice(0, 8) }));
  }
  if (context.active_tab && context.active_tab !== 'plan') {
    parts.push(t('trip_agent.context_tab', { tab: context.active_tab }));
  }

  if (parts.length === 0) return null;

  return (
    <div className={styles.contextBanner}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span><strong>{t('trip_agent.context_label')}</strong> {parts.join(' · ')}</span>
      </div>
      {onClear && (
        <button
          onClick={onClear}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px',
            color: 'inherit',
            opacity: 0.7,
            display: 'flex',
            alignItems: 'center'
          }}
          title={t('trip_agent.clear_context')}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
