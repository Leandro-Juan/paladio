"use client";

import React, { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { AgentErrorInfo } from './types/agent';
import styles from './AgentErrorCard.module.css';

interface AgentErrorCardProps {
  error: AgentErrorInfo;
  onSwitchModel?: () => void;
  onRetry?: () => void;
}

export function AgentErrorCard({ error, onSwitchModel, onRetry }: AgentErrorCardProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const textToCopy = JSON.stringify(
      {
        title: error.title,
        category: error.category,
        statusCode: error.statusCode,
        code: error.code,
        modelName: error.modelName,
        rawMessage: error.rawMessage,
      },
      null,
      2
    );

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  // Render category-specific crisp vector icon (strictly no emojis)
  const renderCategoryIcon = () => {
    switch (error.category) {
      case 'access_denied':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        );
      case 'auth_failure':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        );
      case 'rate_limit':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        );
      case 'context_overflow':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        );
      case 'connection_error':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        );
      default:
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        );
    }
  };

  return (
    <div className={styles.errorCard} role="alert" data-testid="agent-error-card">
      <div className={styles.headerRow}>
        <div className={styles.iconContainer} aria-hidden="true">
          {renderCategoryIcon()}
        </div>

        <div className={styles.titleArea}>
          <h4 className={styles.title}>{t(error.title)}</h4>

          <div className={styles.badgeStrip}>
            {error.statusCode && (
              <span className={`${styles.badge} ${styles.statusBadge}`}>
                {t('trip_agent.http_status', { code: error.statusCode })}
              </span>
            )}
            {error.modelName && (
              <span className={`${styles.badge} ${styles.modelBadge}`} title={error.modelName}>
                {error.modelName}
              </span>
            )}
            {error.code && (
              <span className={`${styles.badge} ${styles.codeBadge}`}>
                {error.code}
              </span>
            )}
          </div>
        </div>
      </div>

      <p className={styles.description}>{t(error.description)}</p>

      {error.suggestedFix && (
        <div className={styles.suggestedFixBox}>
          <svg
            className={styles.fixIcon}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>{t(error.suggestedFix)}</span>
        </div>
      )}

      {/* Actionable buttons */}
      <div className={styles.actionsRow}>
        {error.canSwitchModel && onSwitchModel && (
          <button
            type="button"
            className={styles.switchBtn}
            onClick={onSwitchModel}
            data-testid="error-switch-model-btn"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <rect x="9" y="9" width="6" height="6" />
              <line x1="9" y1="1" x2="9" y2="4" />
              <line x1="15" y1="1" x2="15" y2="4" />
              <line x1="9" y1="20" x2="9" y2="23" />
              <line x1="15" y1="20" x2="15" y2="23" />
              <line x1="20" y1="9" x2="23" y2="9" />
              <line x1="20" y1="14" x2="23" y2="14" />
              <line x1="1" y1="9" x2="4" y2="9" />
              <line x1="1" y1="14" x2="4" y2="14" />
            </svg>
            {t('trip_agent.switch_engine')}
          </button>
        )}

        {error.canRetry && onRetry && (
          <button
            type="button"
            className={styles.retryBtn}
            onClick={onRetry}
            data-testid="error-retry-btn"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            {t('common.retry')}
          </button>
        )}
      </div>

      {/* Collapsible raw diagnostics */}
      {error.rawMessage && (
        <details className={styles.detailsWrapper}>
          <summary className={styles.summary}>{t('trip_agent.technical_diagnostics')}</summary>
          <div className={styles.diagnosticBlock}>
            <button
              type="button"
              className={styles.copyBtn}
              onClick={handleCopy}
              title={t('trip_agent.copy_diagnostics_title')}
            >
              {copied ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1F7A4D" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{t('trip_agent.copied')}</span>
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>{t('common.copy')}</span>
                </>
              )}
            </button>
            <code>{error.rawMessage}</code>
          </div>
        </details>
      )}
    </div>
  );
}
