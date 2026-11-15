"use client";

import React, { useState, useEffect } from 'react';
import { User, UserRole } from '@/types/auth';
import {
  SystemUpdateStatus,
  fetchDomainSettingsApi,
  updateDomainSettingsApi,
  createVaultSnapshotApi,
  purgeSystemCacheApi,
  VaultConfigData,
} from '@/utils/api';
import { SettingsHeader } from '../SettingsHeader';
import { SettingsCardFrame } from '../SettingsCardFrame';
import { TacticalToggle } from '../TacticalToggle';
import { UsersSection } from './UsersSection';
import { SystemSection } from './SystemSection';
import { PhotoSyncSettingsCard } from './PhotoSyncSettingsCard';
import { NotificationsSettingsCard } from './NotificationsSettingsCard';
import { notify } from '@/utils/notify';

interface InfrastructureSectionProps {
  onBackToOverview: () => void;
  subTab?: 'users' | 'updates' | 'telemetry' | 'vault' | 'notifications';
  initialSubTab?: string;
  isAdmin: boolean;

  currentUser: User | null;
  users: User[];
  isFetchingUsers: boolean;
  isModalOpen: boolean;
  setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  newUsername: string;
  setNewUsername: React.Dispatch<React.SetStateAction<string>>;
  newEmail: string;
  setNewEmail: React.Dispatch<React.SetStateAction<string>>;
  newPassword: string;
  setNewPassword: React.Dispatch<React.SetStateAction<string>>;
  newRole: UserRole;
  setNewRole: React.Dispatch<React.SetStateAction<UserRole>>;
  newPreferredLanguage: string;
  setNewPreferredLanguage: React.Dispatch<React.SetStateAction<string>>;
  creating: boolean;
  handleCreateUser: (e: React.FormEvent) => Promise<void>;
  editCandidate: User | null;
  setEditCandidate: React.Dispatch<React.SetStateAction<User | null>>;
  editUsername: string;
  setEditUsername: React.Dispatch<React.SetStateAction<string>>;
  editEmail: string;
  setEditEmail: React.Dispatch<React.SetStateAction<string>>;
  editPassword: string;
  setEditPassword: React.Dispatch<React.SetStateAction<string>>;
  editRole: UserRole;
  setEditRole: React.Dispatch<React.SetStateAction<UserRole>>;
  editAvatarUrl: string;
  setEditAvatarUrl: React.Dispatch<React.SetStateAction<string>>;
  editDefaultCurrency: string;
  setEditDefaultCurrency: React.Dispatch<React.SetStateAction<string>>;
  editPreferredLanguage: string;
  setEditPreferredLanguage: React.Dispatch<React.SetStateAction<string>>;
  savingEdit: boolean;
  handleSaveEdit: (e: React.FormEvent) => Promise<void>;
  handleAvatarFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  openEditModal: (user: User) => void;
  handleToggleActive: (user: User) => Promise<void>;
  deleteCandidate: User | null;
  setDeleteCandidate: React.Dispatch<React.SetStateAction<User | null>>;
  deleting: boolean;
  handleDeleteUser: () => Promise<void>;
  getSafeAvatarUrl: (url: unknown) => string | null;

  // SystemSection props
  updaterStatus: SystemUpdateStatus | null;
  updaterChecking: boolean;
  updaterDownloading: boolean;
  updaterToggling: boolean;
  updaterError: string | null;
  updaterSuccess: string | null;
  showReleaseNotes: boolean;
  setShowReleaseNotes: React.Dispatch<React.SetStateAction<boolean>>;
  installPromptDismissed: boolean;
  setInstallPromptDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  handleCheckForUpdates: () => Promise<void>;
  handleDownloadUpdate: () => Promise<void>;
  handleToggleAutoUpdate: () => Promise<void>;
}

export function InfrastructureSection(props: InfrastructureSectionProps) {
  const {
    onBackToOverview,
    subTab = 'updates',
    isAdmin,
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
    initialSubTab,
  } = props;

  // Vault config state
  const [prevInitialSubTab, setPrevInitialSubTab] = useState(initialSubTab);
  const [vaultSubTab, setVaultSubTab] = useState<'storage' | 'photo_sync'>(() => {
    return initialSubTab === 'photo_sync' ? 'photo_sync' : 'storage';
  });

  if (initialSubTab !== prevInitialSubTab) {
    setPrevInitialSubTab(initialSubTab);
    if (initialSubTab === 'photo_sync' || initialSubTab === 'storage') {
      setVaultSubTab(initialSubTab);
    }
  }
  const [vaultConfig, setVaultConfig] = useState<VaultConfigData>({
    auto_snapshot_enabled: true,
    snapshot_retention_days: 30,
    export_anonymized_trips: false,
    immich_enabled: false,
    immich_url: '',
    immich_api_key: '',
    immich_album_name: 'Paladio Vault',
    synology_enabled: false,
    synology_url: '',
    synology_username: '',
    synology_password: '',
    synology_destination_path: '/photo/Paladio',
    sync_on_upload: true,
  });


  useEffect(() => {
    let mounted = true;
    fetchDomainSettingsApi<VaultConfigData>('vault')
      .then((res) => {
        if (mounted && res.config) {
          setVaultConfig(res.config);
        }
      })
      .catch(() => {
        // Fallback
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleUpdateVault = async (patch: Partial<VaultConfigData>) => {
    const updated = { ...vaultConfig, ...patch };
    setVaultConfig(updated);
    try {
      await updateDomainSettingsApi<VaultConfigData>('vault', patch);
      notify.success('Vault Updated', 'Data vault & backup configuration updated');
    } catch {
      notify.error('Vault Error', 'Failed to update vault configuration');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* 1. Authorized Users (Admin Only) */}
      {subTab === 'users' && (
        <UsersSection
          onBackToOverview={onBackToOverview}
          subTab="users"
          isAdmin={isAdmin}
          currentUser={props.currentUser}
          users={props.users}
          isFetching={props.isFetchingUsers}
          isModalOpen={props.isModalOpen}
          setIsModalOpen={props.setIsModalOpen}
          newUsername={props.newUsername}
          setNewUsername={props.setNewUsername}
          newEmail={props.newEmail}
          setNewEmail={props.setNewEmail}
          newPassword={props.newPassword}
          setNewPassword={props.setNewPassword}
          newRole={props.newRole}
          setNewRole={props.setNewRole}
          newPreferredLanguage={props.newPreferredLanguage}
          setNewPreferredLanguage={props.setNewPreferredLanguage}
          creating={props.creating}
          handleCreateUser={props.handleCreateUser}
          editCandidate={props.editCandidate}
          setEditCandidate={props.setEditCandidate}
          editUsername={props.editUsername}
          setEditUsername={props.setEditUsername}
          editEmail={props.editEmail}
          setEditEmail={props.setEditEmail}
          editPassword={props.editPassword}
          setEditPassword={props.setEditPassword}
          editRole={props.editRole}
          setEditRole={props.setEditRole}
          editAvatarUrl={props.editAvatarUrl}
          setEditAvatarUrl={props.setEditAvatarUrl}
          editDefaultCurrency={props.editDefaultCurrency}
          setEditDefaultCurrency={props.setEditDefaultCurrency}
          editPreferredLanguage={props.editPreferredLanguage}
          setEditPreferredLanguage={props.setEditPreferredLanguage}
          savingEdit={props.savingEdit}
          handleSaveEdit={props.handleSaveEdit}
          handleAvatarFileChange={props.handleAvatarFileChange}
          openEditModal={props.openEditModal}
          handleToggleActive={props.handleToggleActive}
          deleteCandidate={props.deleteCandidate}
          setDeleteCandidate={props.setDeleteCandidate}
          deleting={props.deleting}
          handleDeleteUser={props.handleDeleteUser}
          getSafeAvatarUrl={props.getSafeAvatarUrl}
        />
      )}

      {/* 2. System Updates & Container Telemetry */}
      {(subTab === 'updates' || subTab === 'telemetry') && (
        <SystemSection
          onBackToOverview={onBackToOverview}
          subTab={subTab}
          updaterStatus={updaterStatus}
          updaterChecking={updaterChecking}
          updaterDownloading={updaterDownloading}
          updaterToggling={updaterToggling}
          updaterError={updaterError}
          updaterSuccess={updaterSuccess}
          showReleaseNotes={showReleaseNotes}
          setShowReleaseNotes={setShowReleaseNotes}
          installPromptDismissed={installPromptDismissed}
          setInstallPromptDismissed={setInstallPromptDismissed}
          handleCheckForUpdates={handleCheckForUpdates}
          handleDownloadUpdate={handleDownloadUpdate}
          handleToggleAutoUpdate={handleToggleAutoUpdate}
        />
      )}

      {/* 3. Data Vault & Backups */}
      {subTab === 'vault' && (
        <>
          <SettingsHeader
            title="Data Vault & Instance Backups"
            subtitle="Manage encrypted instance snapshots, export JSON/PDF trip archives, and Immich / Synology photo sync"
            onBackToOverview={onBackToOverview}
          />
          <SettingsCardFrame
            title="Sovereign Data Vault & Media Sync"
            subtitle="Manage encrypted instance snapshots, export JSON/PDF trip archives, and sync itinerary photos to Immich and Synology"
            badge={vaultConfig.auto_snapshot_enabled ? 'AUTO SNAPSHOTS ON' : 'MANUAL'}
            badgeTone="gold"
            subTabs={[
              { id: 'storage', label: 'Storage & Snapshots' },
              { id: 'photo_sync', label: 'Photo Sync (Immich & Synology)' },
            ]}
            activeSubTab={vaultSubTab}
            onSelectSubTab={(id) => setVaultSubTab(id as 'storage' | 'photo_sync')}

            innerTitle={vaultSubTab === 'storage' ? 'Instance Backup Registry' : 'Photo Sync Integrations'}
            innerBadge={vaultSubTab === 'storage' ? `Retention: ${vaultConfig.snapshot_retention_days} days` : (vaultConfig.immich_enabled || vaultConfig.synology_enabled ? 'Active' : 'Standby')}
            menuItems={[
              {
                id: 'create_snapshot',
                label: 'Create Instant Snapshot',
                onClick: async () => {
                  try {
                    const res = await createVaultSnapshotApi();
                    notify.success(
                      'Snapshot Created',
                      `Snapshot recorded at ${new Date(res.snapshot_at).toLocaleTimeString()}.`
                    );
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : 'Failed to create snapshot';
                    notify.error('Snapshot Error', msg);
                  }
                },
              },
              {
                id: 'purge_cache',
                label: 'Purge Valhalla & Tile Cache',
                onClick: async () => {
                  try {
                    const res = await purgeSystemCacheApi();
                    notify.info(
                      'Cache Purged',
                      `Cleared ${res.keys_cleared} cached routing/tile keys.`
                    );
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : 'Failed to purge cache';
                    notify.error('Cache Purge Error', msg);
                  }
                },
              },
            ]}
          >
            {vaultSubTab === 'storage' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      Daily Automated Database Snapshots
                    </span>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                      Archives trips, POI embeddings, and GTFS schedules to sovereign disk storage
                    </p>
                  </div>
                  <TacticalToggle
                    checked={vaultConfig.auto_snapshot_enabled}
                    onChange={(checked) => handleUpdateVault({ auto_snapshot_enabled: checked })}
                    tone="gold"
                    ariaLabel="Toggle automated snapshots"
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      Snapshot Retention Policy: {vaultConfig.snapshot_retention_days} Days
                    </span>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                      Older automated snapshots are pruned automatically to conserve volume disk space
                    </p>
                  </div>
                  <select
                    value={vaultConfig.snapshot_retention_days}
                    onChange={(e) => handleUpdateVault({ snapshot_retention_days: parseInt(e.target.value, 10) })}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface-card)',
                      color: 'var(--color-text-primary)',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                  >
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days (Recommended)</option>
                    <option value={90}>90 days</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      Anonymize Exported Trip Bundles
                    </span>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                      Strip traveler names and email credentials when exporting trips for public showcase
                    </p>
                  </div>
                  <TacticalToggle
                    checked={vaultConfig.export_anonymized_trips}
                    onChange={(checked) => handleUpdateVault({ export_anonymized_trips: checked })}
                    tone="teal"
                    ariaLabel="Toggle anonymized trip exports"
                  />
                </div>
              </div>
            ) : (
              <PhotoSyncSettingsCard
                config={vaultConfig}
                onChange={handleUpdateVault}
                isAdmin={isAdmin}
              />
            )}
          </SettingsCardFrame>
        </>
      )}

      {/* 4. Notifications (Admin Only) */}
      {subTab === 'notifications' && (
        <>
          <SettingsHeader
            title="Notifications"
            subtitle="Configure notification event triggers and push delivery relays"
            onBackToOverview={onBackToOverview}
          />
          <NotificationsSettingsCard isAdmin={isAdmin} initialSubTab={initialSubTab} />
        </>
      )}
    </div>
  );
}

