"use client";

import React, { useState, useEffect } from 'react';
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

export function NotificationsSettingsCard({ isAdmin, initialSubTab }: NotificationsSettingsCardProps) {
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

  const [config, setConfig] = useState<NotificationsConfigData>({
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
  });

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
          setConfig(res.config);
          setPushifyDraft(res.config.pushify);
          setPushoverDraft(res.config.pushover);
          setNtfyDraft(res.config.ntfy);
          setWebhookDraft(res.config.webhook);
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
    const updated = { ...config, ...patch };
    setConfig(updated);
    if (patch.pushify) setPushifyDraft(patch.pushify);
    if (patch.pushover) setPushoverDraft(patch.pushover);
    if (patch.ntfy) setNtfyDraft(patch.ntfy);
    if (patch.webhook) setWebhookDraft(patch.webhook);
    try {
      await updateDomainSettingsApi<NotificationsConfigData>('notifications', patch);
      notify.success('Relays Saved', 'Notification configuration updated');
    } catch {
      notify.error('Update Failed', 'Failed to persist notification settings');
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
      notify.success('Relays Saved', `${provider.toUpperCase()} configuration saved successfully`);
    } catch {
      notify.error('Update Failed', `Failed to save ${provider} settings`);
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
          [provider]: { success: true, text: res.message || 'Test notification delivered successfully' },
        }));
        notify.success(`${provider.toUpperCase()} Delivered`, res.message || 'Test alert delivered');
      } else {
        setTestStatus((prev) => ({
          ...prev,
          [provider]: { success: false, text: res.error || 'Failed to dispatch test notification' },
        }));
        notify.error(`${provider.toUpperCase()} Failed`, res.error || 'Failed to dispatch test notification');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Dispatch failure';
      setTestStatus((prev) => ({
        ...prev,
        [provider]: { success: false, text: msg },
      }));
      notify.error(`${provider.toUpperCase()} Error`, msg);
    } finally {
      setTestingRelay((prev) => ({ ...prev, [provider]: false }));
    }
  };

  if (!isAdmin) {
    return (
      <SettingsCardFrame
        title="Notification Relays & External Alerts"
        subtitle="Forward itinerary changes, flight deal alerts, and ticket processing updates"
        badge="Admin Required"
        badgeTone="coral"
      >
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
            Notification relay endpoints and secrets can only be configured by administrators.
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
        title="Notification Relays & External Alerts"
        subtitle="Dispatch real-time travel alerts, price drops, and trip updates to Pushify, Pushover, Ntfy, or Webhooks"
        badge="Admin Configured"
        badgeTone="teal"
        subTabs={[
          { id: 'pushify', label: 'Pushify' },
          { id: 'pushover', label: 'Pushover & Ntfy' },
          { id: 'webhooks', label: 'Custom Webhooks' },
        ]}
        activeSubTab={subTab}
        onSelectSubTab={(id) => setSubTab(id as 'pushify' | 'pushover' | 'webhooks')}
      >

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
          <Spinner size={18} />
          <span style={{ marginLeft: '8px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Loading notification relay configurations...
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 1. Pushify Tab */}
          {subTab === 'pushify' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Pushify Push Notifications
                  </span>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                    Deliver push notifications straight to mobile devices via Pushify API.
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
                  ariaLabel="Toggle Pushify relay"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                    Pushify Endpoint URL
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
                    Channel / Topic (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. travel-alerts"
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
                    Pushify API Key / Token
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type={showPushifyKey ? 'text' : 'password'}
                      placeholder="Enter Pushify secret API token"
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
                      {showPushifyKey ? 'Hide' : 'Reveal'}
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
                      <span>SAVE KEY</span>
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
                  {testStatus.pushify?.text || 'Test your Pushify push notification credentials'}
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
                  Send Pushify Test Alert
                </button>
              </div>
            </div>
          )}

          {/* 2. Pushover & Ntfy Tab */}
          {subTab === 'pushover' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Pushover */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      Pushover Delivery
                    </span>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                      Deliver push notifications via Pushover client on iOS, Android, and Desktop.
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
                    ariaLabel="Toggle Pushover relay"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                      Pushover User Key
                    </label>
                    <input
                      type="text"
                      placeholder="Your 30-character User Key"
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
                      Pushover App Token
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type={showPushoverToken ? 'text' : 'password'}
                        placeholder="Application API Token"
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
                        {showPushoverToken ? 'Hide' : 'Reveal'}
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
                        <span>SAVE KEY</span>
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
                    {testStatus.pushover?.text || 'Test your Pushover credentials'}
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
                    Send Pushover Test Alert
                  </button>
                </div>
              </div>

              {/* Ntfy */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      Ntfy Open-Source Push
                    </span>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                      Publish notifications to public ntfy.sh topics or your self-hosted Ntfy server.
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
                    ariaLabel="Toggle Ntfy relay"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                      Ntfy Server URL
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
                      Topic Name
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
                        <span>SAVE CONFIG</span>
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
                    {testStatus.ntfy?.text || 'Test your Ntfy server and topic'}
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
                    Send Ntfy Test Ping
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. Custom Webhooks Tab */}
          {subTab === 'webhooks' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Custom HTTP Webhook Delivery
                  </span>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                    Post real-time event payloads directly to Discord, Slack, Home Assistant, or custom HTTP listener.
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
                  ariaLabel="Toggle custom webhook relay"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                    HTTP POST Webhook URL
                  </label>
                  <input
                    type="text"
                    placeholder="https://discord.com/api/webhooks/... or https://hooks.slack.com/services/..."
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
                    X-Webhook-Secret Header (Optional)
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Optional secret token sent in X-Webhook-Secret header"
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
                      <span>SAVE SECRET</span>
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
                  {testStatus.webhook?.text || 'Test sending an HTTP POST webhook event'}
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
                  Send Test Webhook
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

