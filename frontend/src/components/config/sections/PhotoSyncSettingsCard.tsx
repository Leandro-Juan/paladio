"use client";

import React, { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
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
  const { t } = useTranslation();
  const [testingImmich, setTestingImmich] = useState(false);
  const [immichMessage, setImmichMessage] = useState<{ success: boolean; text: string } | null>(null);

  const [testingSynology, setTestingSynology] = useState(false);
  const [synologyMessage, setSynologyMessage] = useState<{ success: boolean; text: string } | null>(null);

  const [syncingAll, setSyncingAll] = useState(false);
  const [showImmichKey, setShowImmichKey] = useState(false);
  const [showSynoPass, setShowSynoPass] = useState(false);

  const [immichUrlDraft, setImmichUrlDraft] = useState(config.immich_url || '');
  const [immichKeyDraft, setImmichKeyDraft] = useState(config.immich_api_key || '');
  const [immichAlbumDraft, setImmichAlbumDraft] = useState(config.immich_album_name || 'Paladio Vault');
  const [savingImmich, setSavingImmich] = useState(false);

  const [synologyUrlDraft, setSynologyUrlDraft] = useState(config.synology_url || '');
  const [synologyDestDraft, setSynologyDestDraft] = useState(config.synology_destination_path || '/photo/Paladio');
  const [synologyUserDraft, setSynologyUserDraft] = useState(config.synology_username || '');
  const [synologyPassDraft, setSynologyPassDraft] = useState(config.synology_password || '');
  const [savingSynology, setSavingSynology] = useState(false);

  const [prevConfig, setPrevConfig] = useState(config);
  if (config !== prevConfig) {
    setPrevConfig(config);
    setImmichUrlDraft(config.immich_url || '');
    setImmichKeyDraft(config.immich_api_key || '');
    setImmichAlbumDraft(config.immich_album_name || 'Paladio Vault');
    setSynologyUrlDraft(config.synology_url || '');
    setSynologyDestDraft(config.synology_destination_path || '/photo/Paladio');
    setSynologyUserDraft(config.synology_username || '');
    setSynologyPassDraft(config.synology_password || '');
  }

  const handleSaveImmich = async () => {
    setSavingImmich(true);
    try {
      await onChange({
        immich_url: immichUrlDraft,
        immich_api_key: immichKeyDraft,
        immich_album_name: immichAlbumDraft,
      });
    } finally {
      setSavingImmich(false);
    }
  };

  const handleSaveSynology = async () => {
    setSavingSynology(true);
    try {
      await onChange({
        synology_url: synologyUrlDraft,
        synology_destination_path: synologyDestDraft,
        synology_username: synologyUserDraft,
        synology_password: synologyPassDraft,
      });
    } finally {
      setSavingSynology(false);
    }
  };

  const handleTestImmich = async () => {
    const targetUrl = immichUrlDraft || config.immich_url;
    if (!targetUrl) {
      notify.warning(t('config.missing_url_title'), t('config.immich_missing_url_msg'));
      return;
    }
    setTestingImmich(true);
    setImmichMessage(null);
    try {
      const res = await testPhotoSyncApi({
        provider: 'immich',
        url: targetUrl,
        api_key: immichKeyDraft || config.immich_api_key,
      });
      if (res.success) {
        setImmichMessage({ success: true, text: res.message || t('config.connected_successfully_msg') });
        notify.success(t('config.immich_connected_title'), res.message || t('config.immich_verified_msg'));
      } else {
        setImmichMessage({ success: false, text: res.error || t('config.connection_failed_msg') });
        notify.error(t('config.immich_error_title'), res.error || t('config.immich_auth_failed'));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('config.connection_error_msg');
      setImmichMessage({ success: false, text: msg });
      notify.error(t('config.immich_error_title'), msg);
    } finally {
      setTestingImmich(false);
    }
  };

  const handleTestSynology = async () => {
    const targetUrl = synologyUrlDraft || config.synology_url;
    if (!targetUrl) {
      notify.warning(t('config.missing_url_title'), t('config.synology_missing_url_msg'));
      return;
    }
    setTestingSynology(true);
    setSynologyMessage(null);
    try {
      const res = await testPhotoSyncApi({
        provider: 'synology',
        url: targetUrl,
        username: synologyUserDraft || config.synology_username,
        password: synologyPassDraft || config.synology_password,
        destination_path: synologyDestDraft || config.synology_destination_path,
      });
      if (res.success) {
        setSynologyMessage({ success: true, text: res.message || t('config.connected_successfully_msg') });
        notify.success(t('config.synology_connected_title'), res.message || t('config.synology_verified_msg'));
      } else {
        setSynologyMessage({ success: false, text: res.error || t('config.connection_failed_msg') });
        notify.error(t('config.synology_error_title'), res.error || t('config.synology_auth_failed'));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('config.connection_error_msg');
      setSynologyMessage({ success: false, text: msg });
      notify.error(t('config.synology_error_title'), msg);
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
          t('config.photo_sync_complete_title'),
          t('config.photo_sync_complete_msg', {
            total: res.total_scanned,
            immich: res.synced_immich,
            syno: res.synced_synology,
            failures: res.failures,
          })
        );
      } else {
        notify.error(t('config.sync_error_title'), res.error || t('config.photo_sync_run_failed'));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('config.photo_sync_failed');
      notify.error(t('config.sync_error_title'), msg);
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
          {t('config.photo_sync_admin_required')}
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
            {t('config.auto_photo_sync_title')}
          </span>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
            {t('config.auto_photo_sync_desc')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <TacticalToggle
            checked={config.sync_on_upload ?? true}
            onChange={(checked) => onChange({ sync_on_upload: checked })}
            tone="teal"
            ariaLabel={t('config.toggle_auto_photo_sync_aria')}
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
                {t('config.immich_title')}
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
                {config.immich_enabled ? t('config.badge_enabled') : t('config.badge_disabled')}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
              {t('config.immich_desc')}
            </p>
          </div>
          <TacticalToggle
            checked={Boolean(config.immich_enabled)}
            onChange={(checked) => onChange({ immich_enabled: checked })}
            tone="teal"
            ariaLabel={t('config.toggle_immich_aria')}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
              {t('config.immich_url_label')}
            </label>
            <input
              type="text"
              placeholder={t('config.immich_url_placeholder')}
              value={immichUrlDraft}
              onChange={(e) => setImmichUrlDraft(e.target.value)}
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
              {t('config.immich_album_label')}
            </label>
            <input
              type="text"
              placeholder="Paladio Vault"
              value={immichAlbumDraft}
              onChange={(e) => setImmichAlbumDraft(e.target.value)}
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
              {t('config.immich_api_key_label')}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type={showImmichKey ? 'text' : 'password'}
                placeholder={t('config.immich_api_key_placeholder')}
                value={immichKeyDraft}
                onChange={(e) => setImmichKeyDraft(e.target.value)}
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
                {showImmichKey ? t('config.hide_btn') : t('config.reveal_btn')}
              </button>
              <button
                type="button"
                onClick={handleSaveImmich}
                disabled={savingImmich}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--color-accent-teal, #0D9488)',
                  color: '#FFFFFF',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: savingImmich ? 'not-allowed' : 'pointer',
                  opacity: savingImmich ? 0.6 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                }}
              >
                {savingImmich && <Spinner size={12} color="#FFFFFF" />}
                <span>{t('config.save_key_upper')}</span>
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '12px', color: immichMessage ? (immichMessage.success ? 'var(--color-accent-teal)' : 'var(--color-danger, #E06C75)') : 'var(--color-text-muted)' }}>
            {immichMessage?.text || t('config.immich_test_hint')}
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
            {t('config.immich_test_btn')}
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
                {t('config.synology_title')}
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
                {config.synology_enabled ? t('config.badge_enabled') : t('config.badge_disabled')}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
              {t('config.synology_desc')}
            </p>
          </div>
          <TacticalToggle
            checked={Boolean(config.synology_enabled)}
            onChange={(checked) => onChange({ synology_enabled: checked })}
            tone="coral"
            ariaLabel={t('config.toggle_synology_aria')}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
              {t('config.synology_url_label')}
            </label>
            <input
              type="text"
              placeholder={t('config.synology_url_placeholder')}
              value={synologyUrlDraft}
              onChange={(e) => setSynologyUrlDraft(e.target.value)}
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
              {t('config.synology_dest_label')}
            </label>
            <input
              type="text"
              placeholder="/photo/Paladio"
              value={synologyDestDraft}
              onChange={(e) => setSynologyDestDraft(e.target.value)}
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
              {t('config.synology_user_label')}
            </label>
            <input
              type="text"
              placeholder="admin"
              value={synologyUserDraft}
              onChange={(e) => setSynologyUserDraft(e.target.value)}
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
              {t('config.synology_pass_label')}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type={showSynoPass ? 'text' : 'password'}
                placeholder={t('auth.password_placeholder')}
                value={synologyPassDraft}
                onChange={(e) => setSynologyPassDraft(e.target.value)}
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
                {showSynoPass ? t('config.hide_btn') : t('config.reveal_btn')}
              </button>
              <button
                type="button"
                onClick={handleSaveSynology}
                disabled={savingSynology}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--color-accent-teal, #0D9488)',
                  color: '#FFFFFF',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: savingSynology ? 'not-allowed' : 'pointer',
                  opacity: savingSynology ? 0.6 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                }}
              >
                {savingSynology && <Spinner size={12} color="#FFFFFF" />}
                <span>{t('config.save_credentials_upper')}</span>
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '12px', color: synologyMessage ? (synologyMessage.success ? 'var(--color-accent-teal)' : 'var(--color-danger, #E06C75)') : 'var(--color-text-muted)' }}>
            {synologyMessage?.text || t('config.synology_test_hint')}
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
            {t('config.synology_test_btn')}
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
            {t('config.sync_all_photos_title')}
          </span>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
            {t('config.sync_all_photos_desc')}
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
          {syncingAll ? t('config.synchronizing_btn') : t('config.sync_vault_photos_btn')}
        </button>
      </div>
    </div>
  );
}
