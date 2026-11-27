"use client";

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  NotificationsConfigData,
  fetchDomainSettingsApi,
  updateDomainSettingsApi,
  testNotificationRelayApi,
} from '@/utils/api';
import { SettingsCardFrame } from '../SettingsCardFrame';
import { TacticalToggle } from '../TacticalToggle';
import { Spinner } from '@/components/icons';
import { notify } from '@/utils/notify';
import { NotificationTypesCard } from './NotificationTypesCard';

interface NotificationsSettingsCardProps {
  isAdmin: boolean;
  initialSubTab?: string;
}

const DEFAULT_NOTIFICATIONS_CONFIG: NotificationsConfigData = {
  pushify: {
    enabled: false,
    endpoint_url: 'https://api.pushify.net/api/v1/send',
    api_key: '',
    channel: '',
  },
  pushover: {
    enabled: false,
    user_key: '',
    app_token: '',
    priority: 0,
  },
  ntfy: {
    enabled: false,
    server_url: 'https://ntfy.sh',
    topic: '',
    auth_token: '',
  },
  webhook: {
    enabled: false,
    url: '',
    secret_header: '',
  },
  notify_on_deal_alert: true,
  notify_on_trip_update: true,
  notify_on_ticket_parse: true,
  notify_on_photo_sync: false,
};

function mergeNotificationsConfig(
  incoming?: Partial<NotificationsConfigData> | null
): NotificationsConfigData {
  return {
    ...DEFAULT_NOTIFICATIONS_CONFIG,
    ...incoming,
    pushify: {
      ...DEFAULT_NOTIFICATIONS_CONFIG.pushify,
      ...(incoming?.pushify ?? {}),
    },
    pushover: {
      ...DEFAULT_NOTIFICATIONS_CONFIG.pushover,
      ...(incoming?.pushover ?? {}),
    },
    ntfy: {
      ...DEFAULT_NOTIFICATIONS_CONFIG.ntfy,
      ...(incoming?.ntfy ?? {}),
    },
    webhook: {
      ...DEFAULT_NOTIFICATIONS_CONFIG.webhook,
      ...(incoming?.webhook ?? {}),
    },
  };
}

export function NotificationsSettingsCard({ isAdmin, initialSubTab }: NotificationsSettingsCardProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(isAdmin);
  const [prevInitialSubTab, setPrevInitialSubTab] = useState(initialSubTab);
  const [subTab, setSubTab] = useState<'pushify' | 'pushover' | 'webhooks'>(() => {
    if (initialSubTab === 'pushover' || initialSubTab === 'webhooks') {
      return initialSubTab;
    }
    return 'pushify';
  });

  if (initialSubTab !== prevInitialSubTab) {
    setPrevInitialSubTab(initialSubTab);
    if (
      initialSubTab === 'pushify' ||
      initialSubTab === 'pushover' ||
      initialSubTab === 'webhooks'
    ) {
      setSubTab(initialSubTab);
    }
  }

  const [config, setConfig] = useState<NotificationsConfigData>(DEFAULT_NOTIFICATIONS_CONFIG);

  const [pushifyDraft, setPushifyDraft] = useState(config.pushify);
  const [pushoverDraft, setPushoverDraft] = useState(config.pushover);
  const [ntfyDraft, setNtfyDraft] = useState(config.ntfy);
  const [webhookDraft, setWebhookDraft] = useState(config.webhook);
  const [savingRelay, setSavingRelay] = useState<Record<string, boolean>>({});

  const [testingRelay, setTestingRelay] = useState<Record<string, boolean>>({});
  const [testStatus, setTestStatus] = useState<Record<string, { success: boolean; text: string }>>({});
  const [showPushifyKey, setShowPushifyKey] = useState(false);
  const [showPushoverToken, setShowPushoverToken] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let mounted = true;
    fetchDomainSettingsApi<NotificationsConfigData>('notifications')
      .then((res) => {
        if (mounted && res.config) {
          const normalized = mergeNotificationsConfig(res.config);
          setConfig(normalized);
          setPushifyDraft(normalized.pushify);
          setPushoverDraft(normalized.pushover);
          setNtfyDraft(normalized.ntfy);
          setWebhookDraft(normalized.webhook);
        }
      })
      .catch((err) => {
        console.error('Failed to load notification settings:', err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [isAdmin]);

  const handleUpdate = async (patch: Partial<NotificationsConfigData>) => {
    const updated = mergeNotificationsConfig({ ...config, ...patch });
    setConfig(updated);
    if (patch.pushify) setPushifyDraft(updated.pushify);
    if (patch.pushover) setPushoverDraft(updated.pushover);
    if (patch.ntfy) setNtfyDraft(updated.ntfy);
    if (patch.webhook) setWebhookDraft(updated.webhook);
    try {
      await updateDomainSettingsApi<NotificationsConfigData>('notifications', patch);
      notify.success(t('config.relays_saved_title'), t('config.notif_config_updated_msg'));
    } catch {
      notify.error(t('config.update_failed_title'), t('config.notif_persist_failed'));
    }
  };

  const handleSaveProvider = async (provider: 'pushify' | 'pushover' | 'ntfy' | 'webhook') => {
    setSavingRelay((prev) => ({ ...prev, [provider]: true }));
    let patch: Partial<NotificationsConfigData> = {};
    if (provider === 'pushify') patch = { pushify: pushifyDraft };
    else if (provider === 'pushover') patch = { pushover: pushoverDraft };
    else if (provider === 'ntfy') patch = { ntfy: ntfyDraft };
    else if (provider === 'webhook') patch = { webhook: webhookDraft };

    try {
      await updateDomainSettingsApi<NotificationsConfigData>('notifications', patch);
      setConfig((prev) => ({ ...prev, ...patch }));
      notify.success(
        t('config.relays_saved_title'),
        t('config.provider_saved_msg', { provider: provider.toUpperCase() })
      );
    } catch {
      notify.error(t('config.update_failed_title'), t('config.provider_save_failed', { provider }));
    } finally {
      setSavingRelay((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const handleTest = async (provider: 'pushify' | 'pushover' | 'ntfy' | 'webhook', providerConfig: Record<string, unknown>) => {
    setTestingRelay((prev) => ({ ...prev, [provider]: true }));
    setTestStatus((prev) => {
      const next = { ...prev };
      delete next[provider];
      return next;
    });

    try {
      const res = await testNotificationRelayApi({ provider, config: providerConfig });
      if (res.success) {
        setTestStatus((prev) => ({
          ...prev,
          [provider]: { success: true, text: res.message || t('config.test_notif_delivered_msg') },
        }));
        notify.success(
          t('config.provider_delivered_title', { provider: provider.toUpperCase() }),
          res.message || t('config.test_alert_delivered')
        );
      } else {
        setTestStatus((prev) => ({
          ...prev,
          [provider]: { success: false, text: res.error || t('config.test_notif_dispatch_failed') },
        }));
        notify.error(
          t('config.provider_failed_title', { provider: provider.toUpperCase() }),
          res.error || t('config.test_notif_dispatch_failed')
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('config.dispatch_failure');
      setTestStatus((prev) => ({
        ...prev,
        [provider]: { success: false, text: msg },
      }));
      notify.error(t('config.provider_error_title', { provider: provider.toUpperCase() }), msg);
    } finally {
      setTestingRelay((prev) => ({ ...prev, [provider]: false }));
    }
  };

  if (!isAdmin) {
    return (
      <SettingsCardFrame
        title={t('config.relays_card_title')}
        subtitle={t('config.relays_non_admin_subtitle')}
        badge={t('config.admin_required_title')}
        badgeTone="coral"
      >
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
            {t('config.relays_non_admin_msg')}
          </span>
        </div>
      </SettingsCardFrame>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Dedicated Notification Types Card (Before Notification Relays) */}
      <NotificationTypesCard
        config={{
          notify_on_deal_alert: config.notify_on_deal_alert,
          notify_on_trip_update: config.notify_on_trip_update,
          notify_on_ticket_parse: config.notify_on_ticket_parse,
          notify_on_photo_sync: config.notify_on_photo_sync,
        }}
        onUpdate={handleUpdate}
        disabled={loading}
      />

      {/* 2. Notification Relays Card */}
      <SettingsCardFrame
        title={t('config.relays_card_title')}
        subtitle={t('config.relays_card_subtitle')}
        badge={t('config.admin_configured_badge')}
        badgeTone="teal"
        subTabs={[
          { id: 'pushify', label: t('config.subtab_pushify') },
          { id: 'pushover', label: t('config.subtab_pushover') },
          { id: 'webhooks', label: t('config.subtab_webhooks') },
        ]}
        activeSubTab={subTab}
        onSelectSubTab={(id) => setSubTab(id as 'pushify' | 'pushover' | 'webhooks')}
      >

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
          <Spinner size={18} />
          <span style={{ marginLeft: '8px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
            {t('config.loading_relays')}
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 1. Pushify Tab */}
          {subTab === 'pushify' && (
            <div key="pushify" className="animate-tab-pane" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {t('config.pushify_title')}
                  </span>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                    {t('config.pushify_desc')}
                  </p>
                </div>
                <TacticalToggle
                  checked={pushifyDraft.enabled}
                  onChange={(checked) => {
                    const updated = { ...pushifyDraft, enabled: checked };
                    setPushifyDraft(updated);
                    handleUpdate({ pushify: updated });
                  }}
                  tone="teal"
                  ariaLabel={t('config.toggle_pushify_aria')}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                    {t('config.pushify_endpoint_label')}
                  </label>
                  <input
                    type="text"
                    value={pushifyDraft.endpoint_url || 'https://api.pushify.net/api/v1/send'}
                    onChange={(e) =>
                      setPushifyDraft((prev) => ({ ...prev, endpoint_url: e.target.value }))
                    }
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg-main)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '13px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                    {t('config.pushify_channel_label')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('config.pushify_channel_placeholder')}
                    value={pushifyDraft.channel || ''}
                    onChange={(e) =>
                      setPushifyDraft((prev) => ({ ...prev, channel: e.target.value }))
                    }
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg-main)',
                      color: 'var(--color-text-primary)',
                      fontSize: '13px',
                    }}
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                    {t('config.pushify_api_key_label')}
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type={showPushifyKey ? 'text' : 'password'}
                      placeholder={t('config.pushify_api_key_placeholder')}
                      value={pushifyDraft.api_key || ''}
                      onChange={(e) =>
                        setPushifyDraft((prev) => ({ ...prev, api_key: e.target.value }))
                      }
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-bg-main)',
                        color: 'var(--color-text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPushifyKey(!showPushifyKey)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-surface-hover)',
                        color: 'var(--color-text-primary)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {showPushifyKey ? t('config.hide_btn') : t('config.reveal_btn')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveProvider('pushify')}
                      disabled={savingRelay['pushify']}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'var(--color-accent-teal, #0D9488)',
                        color: '#FFFFFF',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: savingRelay['pushify'] ? 'not-allowed' : 'pointer',
                        opacity: savingRelay['pushify'] ? 0.6 : 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {savingRelay['pushify'] && <Spinner size={12} color="#FFFFFF" />}
                      <span>{t('config.save_key_upper')}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
                <span
                  style={{
                    fontSize: '12px',
                    color: testStatus.pushify
                      ? testStatus.pushify.success
                        ? 'var(--color-accent-teal)'
                        : 'var(--color-danger, #E06C75)'
                      : 'var(--color-text-muted)',
                  }}
                >
                  {testStatus.pushify?.text || t('config.pushify_test_hint')}
                </span>
                <button
                  type="button"
                  onClick={() => handleTest('pushify', pushifyDraft as unknown as Record<string, unknown>)}
                  disabled={testingRelay.pushify || !pushifyDraft.api_key}

                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface-hover)',
                    color: 'var(--color-text-primary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: testingRelay.pushify || !pushifyDraft.api_key ? 'not-allowed' : 'pointer',
                    opacity: testingRelay.pushify || !pushifyDraft.api_key ? 0.6 : 1,
                  }}
                >
                  {testingRelay.pushify && <Spinner size={12} />}
                  {t('config.pushify_test_btn')}
                </button>
              </div>
            </div>
          )}

          {/* 2. Pushover & Ntfy Tab */}
          {subTab === 'pushover' && (
            <div key="pushover" className="animate-tab-pane" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Pushover */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {t('config.pushover_title')}
                    </span>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                      {t('config.pushover_desc')}
                    </p>
                  </div>
                  <TacticalToggle
                    checked={pushoverDraft.enabled}
                    onChange={(checked) => {
                      const updated = { ...pushoverDraft, enabled: checked };
                      setPushoverDraft(updated);
                      handleUpdate({ pushover: updated });
                    }}
                    tone="teal"
                    ariaLabel={t('config.toggle_pushover_aria')}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                      {t('config.pushover_user_key_label')}
                    </label>
                    <input
                      type="text"
                      placeholder={t('config.pushover_user_key_placeholder')}
                      value={pushoverDraft.user_key || ''}
                      onChange={(e) =>
                        setPushoverDraft((prev) => ({ ...prev, user_key: e.target.value }))
                      }
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-bg-main)',
                        color: 'var(--color-text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                      {t('config.pushover_app_token_label')}
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type={showPushoverToken ? 'text' : 'password'}
                        placeholder={t('config.pushover_app_token_placeholder')}
                        value={pushoverDraft.app_token || ''}
                        onChange={(e) =>
                          setPushoverDraft((prev) => ({ ...prev, app_token: e.target.value }))
                        }
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                          backgroundColor: 'var(--color-bg-main)',
                          color: 'var(--color-text-primary)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '13px',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPushoverToken(!showPushoverToken)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                          backgroundColor: 'var(--color-surface-hover)',
                          color: 'var(--color-text-primary)',
                          fontSize: '12px',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        {showPushoverToken ? t('config.hide_btn') : t('config.reveal_btn')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveProvider('pushover')}
                        disabled={savingRelay['pushover']}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '6px',
                          border: 'none',
                          background: 'var(--color-accent-teal, #0D9488)',
                          color: '#FFFFFF',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: savingRelay['pushover'] ? 'not-allowed' : 'pointer',
                          opacity: savingRelay['pushover'] ? 0.6 : 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {savingRelay['pushover'] && <Spinner size={12} color="#FFFFFF" />}
                        <span>{t('config.save_key_upper')}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
                  <span
                    style={{
                      fontSize: '12px',
                      color: testStatus.pushover
                        ? testStatus.pushover.success
                          ? 'var(--color-accent-teal)'
                          : 'var(--color-danger, #E06C75)'
                        : 'var(--color-text-muted)',
                    }}
                  >
                    {testStatus.pushover?.text || t('config.pushover_test_hint')}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleTest('pushover', pushoverDraft as unknown as Record<string, unknown>)}
                    disabled={testingRelay.pushover || !pushoverDraft.user_key || !pushoverDraft.app_token}

                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface-hover)',
                      color: 'var(--color-text-primary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: testingRelay.pushover || !pushoverDraft.user_key ? 'not-allowed' : 'pointer',
                      opacity: testingRelay.pushover || !pushoverDraft.user_key ? 0.6 : 1,
                    }}
                  >
                    {testingRelay.pushover && <Spinner size={12} />}
                    {t('config.pushover_test_btn')}
                  </button>
                </div>
              </div>

              {/* Ntfy */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {t('config.ntfy_title')}
                    </span>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                      {t('config.ntfy_desc')}
                    </p>
                  </div>
                  <TacticalToggle
                    checked={ntfyDraft.enabled}
                    onChange={(checked) => {
                      const updated = { ...ntfyDraft, enabled: checked };
                      setNtfyDraft(updated);
                      handleUpdate({ ntfy: updated });
                    }}
                    tone="gold"
                    ariaLabel={t('config.toggle_ntfy_aria')}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                      {t('config.ntfy_server_url_label')}
                    </label>
                    <input
                      type="text"
                      placeholder="https://ntfy.sh"
                      value={ntfyDraft.server_url || 'https://ntfy.sh'}
                      onChange={(e) =>
                        setNtfyDraft((prev) => ({ ...prev, server_url: e.target.value }))
                      }
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-bg-main)',
                        color: 'var(--color-text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                      {t('config.ntfy_topic_label')}
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="paladio-trip-updates"
                        value={ntfyDraft.topic || ''}
                        onChange={(e) =>
                          setNtfyDraft((prev) => ({ ...prev, topic: e.target.value }))
                        }
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                          backgroundColor: 'var(--color-bg-main)',
                          color: 'var(--color-text-primary)',
                          fontSize: '13px',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveProvider('ntfy')}
                        disabled={savingRelay['ntfy']}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '6px',
                          border: 'none',
                          background: 'var(--color-accent-teal, #0D9488)',
                          color: '#FFFFFF',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: savingRelay['ntfy'] ? 'not-allowed' : 'pointer',
                          opacity: savingRelay['ntfy'] ? 0.6 : 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {savingRelay['ntfy'] && <Spinner size={12} color="#FFFFFF" />}
                        <span>{t('config.save_config_upper')}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
                  <span
                    style={{
                      fontSize: '12px',
                      color: testStatus.ntfy
                        ? testStatus.ntfy.success
                          ? 'var(--color-accent-teal)'
                          : 'var(--color-danger, #E06C75)'
                        : 'var(--color-text-muted)',
                    }}
                  >
                    {testStatus.ntfy?.text || t('config.ntfy_test_hint')}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleTest('ntfy', ntfyDraft as unknown as Record<string, unknown>)}
                    disabled={testingRelay.ntfy || !ntfyDraft.topic}

                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface-hover)',
                      color: 'var(--color-text-primary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: testingRelay.ntfy || !ntfyDraft.topic ? 'not-allowed' : 'pointer',
                      opacity: testingRelay.ntfy || !ntfyDraft.topic ? 0.6 : 1,
                    }}
                  >
                    {testingRelay.ntfy && <Spinner size={12} />}
                    {t('config.ntfy_test_btn')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. Custom Webhooks Tab */}
          {subTab === 'webhooks' && (
            <div key="webhooks" className="animate-tab-pane" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {t('config.webhook_title')}
                  </span>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                    {t('config.webhook_desc')}
                  </p>
                </div>
                <TacticalToggle
                  checked={webhookDraft.enabled}
                  onChange={(checked) => {
                    const updated = { ...webhookDraft, enabled: checked };
                    setWebhookDraft(updated);
                    handleUpdate({ webhook: updated });
                  }}
                  tone="coral"
                  ariaLabel={t('config.toggle_webhook_aria')}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                    {t('config.webhook_url_label')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('config.webhook_url_placeholder')}
                    value={webhookDraft.url || ''}
                    onChange={(e) =>
                      setWebhookDraft((prev) => ({ ...prev, url: e.target.value }))
                    }
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg-main)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '13px',
                    }}
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                    {t('config.webhook_secret_label')}
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder={t('config.webhook_secret_placeholder')}
                      value={webhookDraft.secret_header || ''}
                      onChange={(e) =>
                        setWebhookDraft((prev) => ({ ...prev, secret_header: e.target.value }))
                      }
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-bg-main)',
                        color: 'var(--color-text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveProvider('webhook')}
                      disabled={savingRelay['webhook']}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'var(--color-accent-teal, #0D9488)',
                        color: '#FFFFFF',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: savingRelay['webhook'] ? 'not-allowed' : 'pointer',
                        opacity: savingRelay['webhook'] ? 0.6 : 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {savingRelay['webhook'] && <Spinner size={12} color="#FFFFFF" />}
                      <span>{t('config.save_secret_upper')}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
                <span
                  style={{
                    fontSize: '12px',
                    color: testStatus.webhook
                      ? testStatus.webhook.success
                        ? 'var(--color-accent-teal)'
                        : 'var(--color-danger, #E06C75)'
                      : 'var(--color-text-muted)',
                  }}
                >
                  {testStatus.webhook?.text || t('config.webhook_test_hint')}
                </span>
                <button
                  type="button"
                  onClick={() => handleTest('webhook', webhookDraft as unknown as Record<string, unknown>)}
                  disabled={testingRelay.webhook || !webhookDraft.url}

                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface-hover)',
                    color: 'var(--color-text-primary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: testingRelay.webhook || !webhookDraft.url ? 'not-allowed' : 'pointer',
                    opacity: testingRelay.webhook || !webhookDraft.url ? 0.6 : 1,
                  }}
                >
                  {testingRelay.webhook && <Spinner size={12} />}
                  {t('config.webhook_test_btn')}
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </SettingsCardFrame>
  </div>
);
}

