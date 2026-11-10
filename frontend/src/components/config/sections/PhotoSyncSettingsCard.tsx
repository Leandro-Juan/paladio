"use client";

import React, { useState } from 'react';
import { VaultConfigData, testPhotoSyncApi, syncAllVaultPhotosApi } from '@/utils/api';
import { TacticalToggle } from '../TacticalToggle';
import { Spinner } from '@/components/icons';
import { notify } from '@/utils/notify';

interface PhotoSyncSettingsCardProps {
  config: VaultConfigData;
  onChange: (patch: Partial<VaultConfigData>) => Promise<void>;
  isAdmin: boolean;
}

export function PhotoSyncSettingsCard({ config, onChange, isAdmin }: PhotoSyncSettingsCardProps) {
  const [testingImmich, setTestingImmich] = useState(false);
  const [immichMessage, setImmichMessage] = useState<{ success: boolean; text: string } | null>(null);

  const [testingSynology, setTestingSynology] = useState(false);
  const [synologyMessage, setSynologyMessage] = useState<{ success: boolean; text: string } | null>(null);

  const [syncingAll, setSyncingAll] = useState(false);
  const [showImmichKey, setShowImmichKey] = useState(false);
  const [showSynoPass, setShowSynoPass] = useState(false);

  const handleTestImmich = async () => {
    if (!config.immich_url) {
      notify.warning('Missing URL', 'Please specify the Immich instance URL first');
      return;
    }
    setTestingImmich(true);
    setImmichMessage(null);
    try {
      const res = await testPhotoSyncApi({
        provider: 'immich',
        url: config.immich_url,
        api_key: config.immich_api_key,
      });
      if (res.success) {
        setImmichMessage({ success: true, text: res.message || 'Connected successfully' });
        notify.success('Immich Connected', res.message || 'Immich verification successful');
      } else {
        setImmichMessage({ success: false, text: res.error || 'Connection failed' });
        notify.error('Immich Error', res.error || 'Failed to authenticate with Immich');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Connection error';
      setImmichMessage({ success: false, text: msg });
      notify.error('Immich Error', msg);
    } finally {
      setTestingImmich(false);
    }
  };

  const handleTestSynology = async () => {
    if (!config.synology_url) {
      notify.warning('Missing URL', 'Please specify the Synology endpoint URL first');
      return;
    }
    setTestingSynology(true);
    setSynologyMessage(null);
    try {
      const res = await testPhotoSyncApi({
        provider: 'synology',
        url: config.synology_url,
        username: config.synology_username,
        password: config.synology_password,
        destination_path: config.synology_destination_path,
      });
      if (res.success) {
        setSynologyMessage({ success: true, text: res.message || 'Connected successfully' });
        notify.success('Synology Connected', res.message || 'Synology verification successful');
      } else {
        setSynologyMessage({ success: false, text: res.error || 'Connection failed' });
        notify.error('Synology Error', res.error || 'Failed to authenticate with Synology');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Connection error';
      setSynologyMessage({ success: false, text: msg });
      notify.error('Synology Error', msg);
    } finally {
      setTestingSynology(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const res = await syncAllVaultPhotosApi();
      if (res.success) {
        notify.success(
          'Photo Sync Complete',
          `Scanned ${res.total_scanned} photo(s). Synced: Immich (${res.synced_immich}), Synology (${res.synced_synology}). Failures: ${res.failures}.`
        );
      } else {
        notify.error('Sync Error', res.error || 'Failed to run full vault sync');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Photo sync failed';
      notify.error('Sync Error', msg);
    } finally {
      setSyncingAll(false);
    }
  };


  if (!isAdmin) {
    return (
      <div
        style={{
          padding: '24px',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface-card)',
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
          Photo sync configurations require administrator privileges.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Global Sync Control Banner */}
      <div
        style={{
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface-card)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <div>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Automatic Photo Synchronization
          </span>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
            When enabled, all photos and videos uploaded to itinerary vaults are automatically synced in the background.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <TacticalToggle
            checked={config.sync_on_upload ?? true}
            onChange={(checked) => onChange({ sync_on_upload: checked })}
            tone="teal"
            ariaLabel="Toggle automatic photo sync on upload"
          />
        </div>
      </div>

      {/* 2. Immich Integration Card */}
      <div
        style={{
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface-card)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                Immich Photo Sync
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: config.immich_enabled ? 'rgba(74, 158, 143, 0.15)' : 'var(--color-bg-subtle)',
                  color: config.immich_enabled ? 'var(--color-accent-teal, #4A9E8F)' : 'var(--color-text-muted)',
                }}
              >
                {config.immich_enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
              Self-hosted high-performance backup to your personal Immich asset vault and albums.
            </p>
          </div>
          <TacticalToggle
            checked={Boolean(config.immich_enabled)}
            onChange={(checked) => onChange({ immich_enabled: checked })}
            tone="teal"
            ariaLabel="Toggle Immich synchronization"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
              Immich Instance URL
            </label>
            <input
              type="text"
              placeholder="https://immich.home.arpa or http://192.168.1.50:2283"
              value={config.immich_url || ''}
              onChange={(e) => onChange({ immich_url: e.target.value })}
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
              Target Album Name
            </label>
            <input
              type="text"
              placeholder="Paladio Vault"
              value={config.immich_album_name || 'Paladio Vault'}
              onChange={(e) => onChange({ immich_album_name: e.target.value })}
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
              Immich API Key
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type={showImmichKey ? 'text' : 'password'}
                placeholder="Paste Immich API key generated from Account Settings"
                value={config.immich_api_key || ''}
                onChange={(e) => onChange({ immich_api_key: e.target.value })}
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
                onClick={() => setShowImmichKey(!showImmichKey)}
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
                {showImmichKey ? 'Hide' : 'Reveal'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '12px', color: immichMessage ? (immichMessage.success ? 'var(--color-accent-teal)' : 'var(--color-danger, #E06C75)') : 'var(--color-text-muted)' }}>
            {immichMessage?.text || 'Verify your Immich server connection before triggering sync'}
          </div>
          <button
            type="button"
            onClick={handleTestImmich}
            disabled={testingImmich || !config.immich_url}
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
              cursor: testingImmich || !config.immich_url ? 'not-allowed' : 'pointer',
              opacity: testingImmich || !config.immich_url ? 0.6 : 1,
            }}
          >
            {testingImmich && <Spinner size={12} />}
            Test Immich Connection
          </button>
        </div>
      </div>

      {/* 3. Synology Integration Card */}
      <div
        style={{
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface-card)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                Synology Photos & WebDAV Sync
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: config.synology_enabled ? 'rgba(217, 131, 107, 0.15)' : 'var(--color-bg-subtle)',
                  color: config.synology_enabled ? 'var(--color-accent-coral, #D9836B)' : 'var(--color-text-muted)',
                }}
              >
                {config.synology_enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
              Archive full-resolution vacation photos directly to your Synology NAS volume via WebDAV or DSM Photos.
            </p>
          </div>
          <TacticalToggle
            checked={Boolean(config.synology_enabled)}
            onChange={(checked) => onChange({ synology_enabled: checked })}
            tone="coral"
            ariaLabel="Toggle Synology synchronization"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
              Synology NAS / WebDAV URL
            </label>
            <input
              type="text"
              placeholder="https://nas.local:5006 or https://nas.quickconnect.to"
              value={config.synology_url || ''}
              onChange={(e) => onChange({ synology_url: e.target.value })}
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
              Destination Path
            </label>
            <input
              type="text"
              placeholder="/photo/Paladio"
              value={config.synology_destination_path || '/photo/Paladio'}
              onChange={(e) => onChange({ synology_destination_path: e.target.value })}
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
              DSM Username
            </label>
            <input
              type="text"
              placeholder="admin"
              value={config.synology_username || ''}
              onChange={(e) => onChange({ synology_username: e.target.value })}
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

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
              DSM Password or App Credential
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type={showSynoPass ? 'text' : 'password'}
                placeholder="Password"
                value={config.synology_password || ''}
                onChange={(e) => onChange({ synology_password: e.target.value })}
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
                onClick={() => setShowSynoPass(!showSynoPass)}
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
                {showSynoPass ? 'Hide' : 'Reveal'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '12px', color: synologyMessage ? (synologyMessage.success ? 'var(--color-accent-teal)' : 'var(--color-danger, #E06C75)') : 'var(--color-text-muted)' }}>
            {synologyMessage?.text || 'Verify NAS reachability and folder authorization'}
          </div>
          <button
            type="button"
            onClick={handleTestSynology}
            disabled={testingSynology || !config.synology_url}
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
              cursor: testingSynology || !config.synology_url ? 'not-allowed' : 'pointer',
              opacity: testingSynology || !config.synology_url ? 0.6 : 1,
            }}
          >
            {testingSynology && <Spinner size={12} />}
            Test Synology Connection
          </button>
        </div>
      </div>

      {/* 4. On-Demand Full Sync Action */}
      <div
        style={{
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface-card)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <div>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Sync All Vault Photos Now
          </span>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
            Scans all recorded trip itineraries in the database and uploads any missing photos to active external providers.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSyncAll}
          disabled={syncingAll || (!config.immich_enabled && !config.synology_enabled)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'var(--color-accent-primary)',
            color: 'var(--color-text-on-accent, #FFFFFF)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: syncingAll || (!config.immich_enabled && !config.synology_enabled) ? 'not-allowed' : 'pointer',
            opacity: syncingAll || (!config.immich_enabled && !config.synology_enabled) ? 0.6 : 1,
          }}
        >
          {syncingAll && <Spinner size={14} color="#FFFFFF" />}
          {syncingAll ? 'Synchronizing...' : 'Sync Vault Photos Now'}
        </button>
      </div>
    </div>
  );
}
