"use client";

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { SystemUpdateStatus } from '@/utils/api';
import { Spinner, RefreshIcon, LightningIcon } from '@/components/icons';
import { SettingsHeader } from '../SettingsHeader';
import { DemoFeatureGate } from '@/components/common/DemoFeatureGate';

interface SystemSectionProps {
  onBackToOverview: () => void;
  subTab?: 'updates' | 'telemetry';
  updaterStatus: SystemUpdateStatus | null;
  updaterChecking: boolean;
  updaterDownloading: boolean;
  updaterToggling: boolean;
  updaterError: string | null;
  updaterSuccess: string | null;
  showReleaseNotes: boolean;
  setShowReleaseNotes: (val: boolean) => void;
  installPromptDismissed: boolean;
  setInstallPromptDismissed: (val: boolean) => void;
  handleCheckForUpdates: () => Promise<void>;
  handleDownloadUpdate: () => Promise<void>;
  handleToggleAutoUpdate: () => Promise<void>;
}

function parseInlineMarkdown(text: string): React.ReactNode[] {
  const LINK_OR_TOKEN_REGEX = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;
  const parts = text.split(LINK_OR_TOKEN_REGEX);
  return parts.map((part, idx) => {
    if (!part) return null;
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--color-gold, #E2B33C)', textDecoration: 'underline' }}
        >
          {linkMatch[1]}
        </a>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          style={{
            background: 'var(--color-surface-hover, rgba(255,255,255,0.06))',
            padding: '2px 5px',
            borderRadius: '4px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (
      (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
    ) {
      return (
        <strong key={idx} style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (
      (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
    ) {
      return (
        <em key={idx} style={{ fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>
          {part.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function renderReleaseNotes(
  markdown: string | null | undefined,
  t: (key: string, params?: Record<string, string | number>) => string
): React.ReactNode {
  if (!markdown) {
    return (
      <p className="text-muted font-mono" style={{ margin: 0, fontSize: '11px' }}>
        {t('config.no_release_notes')}
      </p>
    );
  }

  const lines = markdown.split('\n');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', lineHeight: 1.6 }}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} style={{ height: '4px' }} />;
        }
        if (line.startsWith('# ')) {
          return (
            <h4
              key={idx}
              className="font-display"
              style={{ fontSize: '15px', margin: '8px 0 2px 0', color: 'var(--color-text-primary)', fontWeight: 700 }}
            >
              {parseInlineMarkdown(line.slice(2))}
            </h4>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h5
              key={idx}
              className="font-display"
              style={{ fontSize: '13.5px', margin: '6px 0 2px 0', color: 'var(--color-gold, #E2B33C)', fontWeight: 600 }}
            >
              {parseInlineMarkdown(line.slice(3))}
            </h5>
          );
        }
        if (line.startsWith('### ') || line.startsWith('#### ')) {
          const depth = line.startsWith('#### ') ? 5 : 4;
          return (
            <h6
              key={idx}
              className="font-display"
              style={{ fontSize: '12.5px', margin: '4px 0 2px 0', color: 'var(--color-text-primary)', fontWeight: 600 }}
            >
              {parseInlineMarkdown(line.slice(depth))}
            </h6>
          );
        }
        if (line.startsWith('> ')) {
          return (
            <blockquote
              key={idx}
              style={{
                margin: '2px 0',
                paddingLeft: '10px',
                borderLeft: '2px solid var(--color-gold, #E2B33C)',
                color: 'var(--color-text-muted)',
                fontStyle: 'italic',
                fontSize: '11px',
              }}
            >
              {parseInlineMarkdown(line.slice(2))}
            </blockquote>
          );
        }
        const bulletMatch = line.match(/^(\s*)[*\-•+]\s+(.*)$/);
        if (bulletMatch) {
          const indent = bulletMatch[1].length > 0 ? '16px' : '6px';
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '8px',
                marginLeft: indent,
                color: 'var(--color-text-primary)',
              }}
            >
              <span style={{ color: 'var(--color-gold, #E2B33C)', fontSize: '10px', lineHeight: 1 }}>•</span>
              <div style={{ flex: 1 }}>{parseInlineMarkdown(bulletMatch[2])}</div>
            </div>
          );
        }
        const numMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
        if (numMatch) {
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '6px',
                marginLeft: '6px',
                color: 'var(--color-text-primary)',
              }}
            >
              <span className="font-mono text-muted" style={{ fontSize: '11px', minWidth: '16px' }}>
                {numMatch[2]}.
              </span>
              <div style={{ flex: 1 }}>{parseInlineMarkdown(numMatch[3])}</div>
            </div>
          );
        }
        return (
          <p key={idx} style={{ margin: 0, color: 'var(--color-text-primary)' }}>
            {parseInlineMarkdown(line)}
          </p>
        );
      })}
    </div>
  );
}

export function SystemSection({
  onBackToOverview,
  subTab = 'updates',
  updaterStatus,
  updaterChecking,
  updaterDownloading,
  updaterToggling,
  updaterError,
  updaterSuccess,
  showReleaseNotes,
  setShowReleaseNotes,
  installPromptDismissed,
  setInstallPromptDismissed,
  handleCheckForUpdates,
  handleDownloadUpdate,
  handleToggleAutoUpdate,
}: SystemSectionProps) {
  const { t, locale } = useTranslation();

  const downloadStatusUpper = (updaterStatus?.download_status || 'idle').toUpperCase();
  const downloadStatusMap: Record<string, string> = {
    IDLE: t('config.status_idle_upper'),
    DOWNLOADING: t('config.status_downloading_upper'),
    DOWNLOADED: t('config.status_downloaded_upper'),
    FAILED: t('config.status_failed_upper'),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <SettingsHeader
        title={subTab === 'telemetry' ? t('config.telemetry_header_title') : t('config.updates_header_title')}
        onBackToOverview={onBackToOverview}
      />

      {/* System Updates & Auto-Updater Section */}
      <DemoFeatureGate message={t('demo.locked_system')} borderRadius="10px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <section
        id="system-updates"
        className="bg-surface border-subtle"
        style={{
          borderRadius: '10px',
          padding: '1.5rem',
          border: subTab === 'updates' ? '1px solid var(--color-border)' : '1px solid var(--color-border-subtle)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h3 className="font-display" style={{ fontSize: '1.2rem', margin: 0 }}>
              {t('config.system_updates_title')}
            </h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {updaterStatus?.update_available && (
              <button
                type="button"
                onClick={handleDownloadUpdate}
                disabled={updaterDownloading || updaterStatus?.download_status === 'downloading'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-gold, #E2B33C)',
                  background: 'var(--color-gold-soft, rgba(226, 179, 60, 0.15))',
                  color: 'var(--color-gold, #E2B33C)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  cursor: updaterDownloading ? 'not-allowed' : 'pointer',
                }}
              >
                {updaterDownloading || updaterStatus?.download_status === 'downloading' ? (
                  <>
                    <Spinner size={12} />
                    <span>{t('config.downloading_upper')}</span>
                  </>
                ) : (
                  <>
                    <LightningIcon size={12} />
                    <span>{t('config.download_latest_upper', { version: updaterStatus?.latest_version ?? '' })}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Feedback Messages */}
        {updaterError && (
          <div
            style={{
              background: 'var(--color-danger-soft, rgba(239, 68, 68, 0.15))',
              border: '1px solid var(--color-danger, #EF4444)',
              color: 'var(--color-danger, #EF4444)',
              padding: '10px 14px',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {updaterError}
          </div>
        )}

        {updaterSuccess && (
          <div
            style={{
              background: 'var(--color-success-soft, rgba(34, 197, 94, 0.15))',
              border: '1px solid var(--color-success, #22C55E)',
              color: 'var(--color-success, #22C55E)',
              padding: '10px 14px',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {updaterSuccess}
          </div>
        )}

        {/* Interactive Update Notification & Installation Prompt */}
        {updaterStatus?.update_available && !installPromptDismissed && (
          <div
            style={{
              background: 'var(--color-surface-card)',
              border: '2px solid var(--color-gold, #E2B33C)',
              borderRadius: '10px',
              padding: '1.5rem',
              marginBottom: '1.5rem',
              boxShadow: '0 0 24px rgba(226, 179, 60, 0.15)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: '10px',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: 'var(--color-gold-soft, rgba(226, 179, 60, 0.15))',
                      color: 'var(--color-gold, #E2B33C)',
                      fontWeight: 700,
                    }}
                  >
                    {t('config.new_update_available_upper')}
                  </span>
                  <h4 className="font-display" style={{ fontSize: '1.25rem', margin: 0 }}>
                    {updaterStatus.release_title || t('config.paladio_version_title', { version: updaterStatus.latest_version })}
                  </h4>
                </div>
                <p className="font-mono text-muted" style={{ fontSize: '11px', marginTop: '6px', marginBottom: 0 }}>
                  {t('config.installed_vs_latest_version', {
                    current: updaterStatus.current_version,
                    latest: updaterStatus.latest_version,
                  })}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setInstallPromptDismissed(true)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-subtle)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-secondary)',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                  }}
                >
                  {t('config.remind_me_later_upper')}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadUpdate}
                  disabled={updaterDownloading || updaterStatus.download_status === 'downloading'}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--color-gold, #E2B33C)',
                    color: '#1a1815',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    cursor: updaterDownloading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {updaterDownloading || updaterStatus.download_status === 'downloading' ? (
                    <>
                      <Spinner size={12} color="#1a1815" />
                      <span>{t('config.downloading_installing_upper')}</span>
                    </>
                  ) : (
                    <>
                      <LightningIcon size={12} />
                      <span>{t('config.install_update_now_upper', { version: updaterStatus.latest_version })}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Features and Patch Notes */}
            <div style={{ marginTop: '0.75rem' }}>
              <p className="font-mono text-muted" style={{ fontSize: '10px', marginBottom: '6px', fontWeight: 600 }}>
                {t('config.new_features_patch_notes_upper')}
              </p>
              <div
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: '6px',
                  padding: '0.85rem 1rem',
                  maxHeight: '220px',
                  overflowY: 'auto',
                }}
              >
                {renderReleaseNotes(updaterStatus.release_notes, t)}
              </div>
              <p className="font-mono text-muted" style={{ fontSize: '11px', marginTop: '8px', marginBottom: 0 }}>
                {t('config.install_update_prompt_hint')}
              </p>
            </div>
          </div>
        )}

        {/* Status and Configuration Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          {/* Version Info Card */}
          <div
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: '8px',
              padding: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span className="font-mono text-muted" style={{ fontSize: '11px' }}>{t('config.installed_version_upper')}</span>
              <span
                className="font-mono"
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                v{updaterStatus?.current_version || '3.0.0'} {/* x-release-please-version */}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-mono text-muted" style={{ fontSize: '11px' }}>{t('config.remote_release_upper')}</span>
              <span
                className="font-mono"
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontWeight: 600,
                  background: updaterStatus?.update_available ? 'var(--color-gold-soft, rgba(226, 179, 60, 0.15))' : 'var(--color-success-soft)',
                  color: updaterStatus?.update_available ? 'var(--color-gold, #E2B33C)' : 'var(--color-success)',
                }}
              >
                v{updaterStatus?.latest_version || updaterStatus?.current_version || '3.0.0'} {/* x-release-please-version */}
              </span>
            </div>
            <p className="font-mono text-muted" style={{ fontSize: '10px', marginTop: '12px', marginBottom: 0 }}>
              {t('config.github_repo_label', { repo: updaterStatus?.github_repo || 'Leandro-Juan/paladio' })}
            </p>
          </div>

          {/* Auto-Update State & Toggle Button Card */}
          <div
            style={{
              background: 'var(--color-surface-card)',
              border: updaterStatus?.auto_update_enabled ? '1px solid var(--color-success)' : '1px solid var(--color-border-subtle)',
              borderRadius: '8px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className="font-mono text-muted" style={{ fontSize: '11px' }}>{t('config.automatic_updates_upper')}</span>
                <span
                  data-testid="auto-update-status-badge"
                  className="font-mono"
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: updaterStatus?.auto_update_enabled ? 'var(--color-success-soft)' : 'var(--color-surface)',
                    color: updaterStatus?.auto_update_enabled ? 'var(--color-success)' : 'var(--color-text-muted)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  {updaterStatus?.auto_update_enabled ? t('config.badge_active_upper') : t('config.badge_disabled_upper')}
                </span>
              </div>
              <p className="font-mono text-muted" style={{ fontSize: '10px', margin: 0 }}>
                {updaterStatus?.auto_update_enabled
                  ? t('config.auto_update_active_desc')
                  : t('config.auto_update_disabled_desc')}
              </p>
            </div>

            <div style={{ marginTop: '12px' }}>
              <button
                type="button"
                onClick={handleToggleAutoUpdate}
                disabled={updaterToggling}
                style={{
                  width: '100%',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  cursor: updaterToggling ? 'not-allowed' : 'pointer',
                  border: updaterStatus?.auto_update_enabled
                    ? '1px solid var(--color-border-subtle)'
                    : '1px solid var(--color-success)',
                  background: updaterStatus?.auto_update_enabled
                    ? 'var(--color-surface)'
                    : 'var(--color-success-soft)',
                  color: updaterStatus?.auto_update_enabled
                    ? 'var(--color-text-muted)'
                    : 'var(--color-success)',
                }}
              >
                {updaterToggling ? (
                  <Spinner size={10} />
                ) : updaterStatus?.auto_update_enabled ? (
                  t('config.disable_auto_updates_upper')
                ) : (
                  t('config.enable_auto_updates_upper')
                )}
              </button>
            </div>
          </div>

          {/* Download Telemetry Card */}
          <div
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: '8px',
              padding: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span className="font-mono text-muted" style={{ fontSize: '11px' }}>{t('config.download_status_upper')}</span>
              <span
                className="font-mono"
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background:
                    updaterStatus?.download_status === 'downloaded'
                      ? 'var(--color-success-soft)'
                      : updaterStatus?.download_status === 'downloading'
                      ? 'var(--color-gold-soft, rgba(226, 179, 60, 0.15))'
                      : 'var(--color-surface)',
                  color:
                    updaterStatus?.download_status === 'downloaded'
                      ? 'var(--color-success)'
                      : updaterStatus?.download_status === 'downloading'
                      ? 'var(--color-gold, #E2B33C)'
                      : 'var(--color-text-muted)',
                }}
              >
                {downloadStatusMap[downloadStatusUpper] || downloadStatusUpper}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-mono text-muted" style={{ fontSize: '11px' }}>{t('config.last_checked_upper')}</span>
              <span className="font-mono text-muted" style={{ fontSize: '11px' }}>
                {updaterStatus?.last_checked_at
                  ? new Date(updaterStatus.last_checked_at).toLocaleDateString(locale === 'en' ? undefined : locale)
                  : t('config.status_pending')}
              </span>
            </div>
            {updaterStatus?.file_sha256 && (
              <p className="font-mono text-muted" style={{ fontSize: '10px', marginTop: '12px', marginBottom: 0 }}>
                SHA256: {updaterStatus.file_sha256.slice(0, 10)}...
              </p>
            )}
          </div>
        </div>

        {/* Release Notes Collapsible / Drawer Button */}
        {updaterStatus?.release_notes && (
          <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: '1rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setShowReleaseNotes(!showReleaseNotes)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: 'var(--color-accent-teal)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{showReleaseNotes ? t('config.hide_release_notes_upper') : t('config.view_release_notes_upper')}</span>
            </button>

            {showReleaseNotes && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '1rem',
                  borderRadius: '8px',
                  background: 'var(--color-surface-card)',
                  border: '1px solid var(--color-border-subtle)',
                  maxHeight: '300px',
                  overflowY: 'auto',
                }}
              >
                {renderReleaseNotes(updaterStatus.release_notes, t)}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Docker Instance Health Panel */}
      <section
        id="system-telemetry"
        className="bg-surface border-subtle"
        style={{
          borderRadius: '10px',
          padding: '1.5rem',
          border: subTab === 'telemetry' ? '1px solid var(--color-border)' : '1px solid var(--color-border-subtle)',
        }}
      >
        <h3 className="font-display" style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
          {t('config.telemetry_header_title')}
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {[
            { name: t('config.node_fastapi_name'), port: '8000', status: t('config.status_online_upper'), target: t('config.node_fastapi_target') },
            { name: t('config.node_timescaledb_name'), port: '5432', status: t('config.status_online_upper'), target: t('config.node_timescaledb_target') },
            { name: t('config.node_redis_name'), port: '6379', status: t('config.status_online_upper'), target: t('config.node_redis_target') },
            { name: t('config.node_ollama_name'), port: '11434', status: t('config.status_online_upper'), target: t('config.node_ollama_target') },
            { name: t('config.node_valhalla_name'), port: '8002', status: t('config.status_online_upper'), target: t('config.node_valhalla_target') },
          ].map((node) => (
            <div
              key={node.port}
              style={{
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '8px',
                padding: '1rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-display" style={{ fontWeight: 600, fontSize: '13px' }}>{node.name}</span>
                <span
                  className="font-mono"
                  style={{
                    fontSize: '9px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'var(--color-success-soft)',
                    color: 'var(--color-success)',
                    fontWeight: 600,
                  }}
                >
                  {node.status}
                </span>
              </div>
              <p className="font-mono text-muted" style={{ fontSize: '10px', marginTop: '6px' }}>
                {t('config.docker_port_line', { port: node.port, target: node.target })}
              </p>
            </div>
          ))}
        </div>
      </section>
      </div>
      </DemoFeatureGate>
    </div>
  );
}
