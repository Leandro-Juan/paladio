"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeftIcon } from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { User, UserRole } from '@/types/auth';
import {
  createUserApi,
  deleteUserApi,
  listUsersApi,
  updateUserApi,
  updateProfileApi,
  fetchGtfsRegistryApi,
  deleteGtfsApi,
  GtfsRegistryResponse,
  CityGtfsItem,
  fetchUpdateStatusApi,
  updateAutoUpdateConfigApi,
  triggerUpdateCheckApi,
  triggerUpdateDownloadApi,
  SystemUpdateStatus,
  updatePreferencesApi,
} from '@/utils/api';
import { useThemeStore } from '@/stores/themeStore';
import { useTypographyStore } from '@/stores/typographyStore';
import { useTranslation } from '@/hooks/useTranslation';
import { CurrencyInfo } from '@/utils/currencyResolver';
import { notify } from '@/utils/notify';
import { PaladioLoader } from '@/components/common/PaladioLoader';
import { SettingsTabId } from '@/components/config/settingsData';
import { SettingsSidebar } from '@/components/config/SettingsSidebar';
import { SettingsOverview } from '@/components/config/SettingsOverview';
import { PersonalAccountSection } from '@/components/config/sections/PersonalAccountSection';
import { ExperienceSection } from '@/components/config/sections/ExperienceSection';
import { EngineSection } from '@/components/config/sections/EngineSection';
import { IntelligenceSection } from '@/components/config/sections/IntelligenceSection';
import { InfrastructureSection } from '@/components/config/sections/InfrastructureSection';
import styles from './config.module.css';

/**
 * Validates and sanitizes avatar URLs to prevent XSS / script injection.
 * Accepts only http(s) protocols, valid base64 image data URLs, or safe relative paths.
 */
function getSafeAvatarUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed, 'https://paladio.internal');
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return encodeURI(parsed.href);
    }
  } catch {
    return null;
  }
  return null;
}

function ConfigPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: currentUser, refreshUser } = useAuth();
  const { setLocale, locale } = useTranslation();
  const { theme } = useThemeStore();
  const { typography } = useTypographyStore();

  const isAdmin = currentUser?.role === 'admin';

  // Active Tab from URL query param
  const activeTabParam = searchParams?.get('tab') as SettingsTabId | null;
  const activeTab: SettingsTabId = activeTabParam || 'overview';

  const [searchQuery, setSearchQuery] = useState('');

  // Notifications and Feedback
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Users Management State
  const [users, setUsers] = useState<User[]>([]);
  const [isFetchingUsers, setIsFetchingUsers] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('user');
  const [newPreferredLanguage, setNewPreferredLanguage] = useState('en');
  const [creating, setCreating] = useState(false);

  const [editCandidate, setEditCandidate] = useState<User | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('user');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editDefaultCurrency, setEditDefaultCurrency] = useState('EUR');
  const [editPreferredLanguage, setEditPreferredLanguage] = useState('en');
  const [savingEdit, setSavingEdit] = useState(false);

  const [savingCurrency, setSavingCurrency] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  // GTFS Telemetry & Public Transit State
  const [gtfsTelemetry, setGtfsTelemetry] = useState<GtfsRegistryResponse | null>(null);
  const [gtfsMessage, setGtfsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteGtfsCandidate, setDeleteGtfsCandidate] = useState<CityGtfsItem | null>(null);
  const [deletingGtfs, setDeletingGtfs] = useState(false);
  const [syncTripsModalOpen, setSyncTripsModalOpen] = useState(false);

  // System Updater State
  const [updaterStatus, setUpdaterStatus] = useState<SystemUpdateStatus | null>(null);
  const [updaterChecking, setUpdaterChecking] = useState<boolean>(false);
  const [updaterDownloading, setUpdaterDownloading] = useState<boolean>(false);
  const [updaterToggling, setUpdaterToggling] = useState<boolean>(false);
  const [updaterError, setUpdaterError] = useState<string | null>(null);
  const [updaterSuccess, setUpdaterSuccess] = useState<string | null>(null);
  const [showReleaseNotes, setShowReleaseNotes] = useState<boolean>(false);
  const [installPromptDismissed, setInstallPromptDismissed] = useState<boolean>(false);
  const notifiedVersionRef = React.useRef<string | null>(null);

  // Tab Selection Handler
  const handleSelectTab = (tab: SettingsTabId, subTab?: string) => {
    setActionError(null);
    setActionSuccess(null);
    if (tab === 'overview') {
      router.push('/config', { scroll: false });
    } else {
      const url = subTab ? `/config?tab=${tab}&subtab=${subTab}` : `/config?tab=${tab}`;
      router.push(url, { scroll: false });
    }
  };

  // -------------------------------------------------------------------------
  // Fetch Updater Telemetry
  // -------------------------------------------------------------------------
  const fetchUpdaterData = useCallback(async () => {
    try {
      const data = await fetchUpdateStatusApi();
      setUpdaterStatus(data);
      if (data.update_available && notifiedVersionRef.current !== data.latest_version) {
        notifiedVersionRef.current = data.latest_version;
        notify.info(
          `New Update Available: v${data.latest_version}`,
          data.release_title || `Paladio v${data.latest_version} has new features and patch notes available to install.`,
          {
            actionLabel: 'Review & Install',
            actionLink: '/config?tab=updates',
          }
        );
      }
    } catch (err: unknown) {
      console.warn('Failed to fetch updater status:', err);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function loadUpdater() {
      if (!ignore) {
        await fetchUpdaterData();
      }
    }
    loadUpdater();
    return () => {
      ignore = true;
    };
  }, [fetchUpdaterData]);

  const handleToggleAutoUpdate = async () => {
    if (!updaterStatus) return;
    setUpdaterToggling(true);
    setUpdaterError(null);
    setUpdaterSuccess(null);
    try {
      const nextState = !updaterStatus.auto_update_enabled;
      const res = await updateAutoUpdateConfigApi({ auto_update_enabled: nextState });
      setUpdaterStatus(res.config);
      setUpdaterSuccess(
        nextState
          ? 'Automatic updates enabled. Paladio will automatically download and install updates.'
          : 'Automatic updates disabled. You will be notified with patch notes and asked before an update is installed.'
      );
    } catch (err: unknown) {
      setUpdaterError(err instanceof Error ? err.message : 'Failed to update auto-update preferences');
    } finally {
      setUpdaterToggling(false);
    }
  };

  const handleCheckForUpdates = async () => {
    setUpdaterChecking(true);
    setUpdaterError(null);
    setUpdaterSuccess(null);
    try {
      const res = await triggerUpdateCheckApi(false);
      setUpdaterStatus(res.telemetry);
      if (res.telemetry.update_available) {
        setInstallPromptDismissed(false);
        setUpdaterSuccess(`New update found: v${res.telemetry.latest_version}`);
        notify.info(
          `New Update Available: v${res.telemetry.latest_version}`,
          res.telemetry.release_title || `Paladio v${res.telemetry.latest_version} is available. Review features and install.`,
          {
            actionLabel: 'Review & Install',
            actionLink: '/config?tab=updates',
          }
        );
      } else {
        setUpdaterSuccess('Paladio is up to date.');
      }
    } catch (err: unknown) {
      setUpdaterError(err instanceof Error ? err.message : 'Failed to check GitHub repository');
    } finally {
      setUpdaterChecking(false);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!updaterStatus) return;
    setUpdaterDownloading(true);
    setUpdaterError(null);
    setUpdaterSuccess(null);
    try {
      const res = await triggerUpdateDownloadApi(
        updaterStatus.latest_version,
        updaterStatus.download_url || undefined
      );
      setUpdaterStatus(res.download);
      setUpdaterSuccess(`Successfully downloaded Paladio v${res.download.latest_version} archive!`);
    } catch (err: unknown) {
      setUpdaterError(err instanceof Error ? err.message : 'Failed to download update archive');
    } finally {
      setUpdaterDownloading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Fetch GTFS Registry Telemetry
  // -------------------------------------------------------------------------
  const fetchGtfsData = useCallback(async (_silent?: boolean) => {
    try {
      const data = await fetchGtfsRegistryApi();
      setGtfsTelemetry(data);
    } catch (err: unknown) {
      console.warn('Failed to fetch GTFS registry:', err);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const data = await fetchGtfsRegistryApi();
        if (!ignore) {
          setGtfsTelemetry(data);
        }
      } catch (err: unknown) {
        console.warn('Failed to fetch GTFS registry:', err);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const intervalMs = gtfsTelemetry?.has_active_process ? 3000 : 12000;
    const interval = setInterval(() => {
      fetchGtfsData();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [fetchGtfsData, gtfsTelemetry?.has_active_process]);

  useEffect(() => {
    const onTransitQueued = (e: Event) => {
      const customEvent = e as CustomEvent<{ city?: string; city_name?: string }>;
      const cName = customEvent.detail?.city_name || customEvent.detail?.city || 'City';
      setGtfsMessage({
        type: 'success',
        text: `GTFS compilation for ${cName} has been queued behind an active compilation.`,
      });
      fetchGtfsData(false);
    };

    const onTransitUpdate = () => {
      fetchGtfsData(false);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('paladio:transit_queued', onTransitQueued);
      window.addEventListener('paladio:transit_compile_started', onTransitUpdate);
      window.addEventListener('paladio:transit_download_started', onTransitUpdate);
      window.addEventListener('paladio:transit_tiles_ready', onTransitUpdate);
      window.addEventListener('paladio:transit_compile_failed', onTransitUpdate);
      window.addEventListener('paladio:transit_deleted', onTransitUpdate);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('paladio:transit_queued', onTransitQueued);
        window.removeEventListener('paladio:transit_compile_started', onTransitUpdate);
        window.removeEventListener('paladio:transit_download_started', onTransitUpdate);
        window.removeEventListener('paladio:transit_tiles_ready', onTransitUpdate);
        window.removeEventListener('paladio:transit_compile_failed', onTransitUpdate);
        window.removeEventListener('paladio:transit_deleted', onTransitUpdate);
      }
    };
  }, [fetchGtfsData]);

  const handleDeleteGtfs = async () => {
    if (!deleteGtfsCandidate) return;
    setDeletingGtfs(true);
    setGtfsMessage(null);
    try {
      const res = await deleteGtfsApi(deleteGtfsCandidate.city);
      setGtfsMessage({
        type: 'success',
        text: res.message || `GTFS transit data and tasks for ${deleteGtfsCandidate.display_name} cleaned up successfully.`,
      });
      setDeleteGtfsCandidate(null);
      await fetchGtfsData(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete GTFS transit data';
      setGtfsMessage({ type: 'error', text: msg });
    } finally {
      setDeletingGtfs(false);
    }
  };

  // -------------------------------------------------------------------------
  // Fetch Users
  // -------------------------------------------------------------------------
  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    setIsFetchingUsers(true);
    try {
      const data = await listUsersApi();
      setUsers(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch users';
      setActionError(msg);
    } finally {
      setIsFetchingUsers(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    let ignore = false;
    async function load() {
      try {
        const data = await listUsersApi();
        if (!ignore) {
          setUsers(data);
        }
      } catch (err: unknown) {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : 'Failed to fetch users';
          setActionError(msg);
        }
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [isAdmin]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) {
      setActionError('Username and password are required.');
      return;
    }
    if (newPassword.length < 6) {
      setActionError('Password must be at least 6 characters.');
      return;
    }

    setCreating(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      await createUserApi({
        username: newUsername.trim(),
        email: newEmail.trim() || undefined,
        password: newPassword,
        role: newRole,
        preferred_language: newPreferredLanguage,
      });
      setActionSuccess(`User ${newUsername.trim()} provisioned successfully.`);
      setIsModalOpen(false);
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('user');
      setNewPreferredLanguage('en');
      await fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to provision user';
      setActionError(msg);
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (target: User) => {
    setActionError(null);
    setActionSuccess(null);
    setEditCandidate(target);
    setEditUsername(target.username || '');
    setEditEmail(target.email || '');
    setEditPassword('');
    setEditRole(target.role || 'user');
    setEditDefaultCurrency((target.preferences?.default_currency as string) || 'EUR');
    setEditPreferredLanguage((target.preferences?.preferred_language as string) || 'en');
    const existingAvatar = (target.preferences?.avatar_url || target.preferences?.pfp) as string | undefined;
    setEditAvatarUrl(existingAvatar || '');
  };

  const handleUpdateDefaultCurrency = async (currency: CurrencyInfo) => {
    setSavingCurrency(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const currentPrefs = (currentUser?.preferences || {}) as Record<string, unknown>;
      await updateProfileApi({
        preferences: {
          ...currentPrefs,
          default_currency: currency.code,
        },
      });
      await refreshUser();
      setActionSuccess(`Default currency updated to ${currency.code} (${currency.symbol}) successfully.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update default currency';
      setActionError(msg);
    } finally {
      setSavingCurrency(false);
    }
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      setActionError('Please select a valid image file (PNG, JPG, SVG, WebP).');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setActionError('Image size must be less than 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setEditAvatarUrl(dataUrl);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCandidate) return;
    if (!editUsername.trim()) {
      setActionError('Username cannot be empty.');
      return;
    }
    if (editPassword && editPassword.length < 6) {
      setActionError('Password must be at least 6 characters.');
      return;
    }

    const validatedAvatar = editAvatarUrl ? getSafeAvatarUrl(editAvatarUrl) : null;
    if (editAvatarUrl && !validatedAvatar) {
      setActionError('Please provide a valid image URL (http/https) or upload an image file.');
      return;
    }

    setSavingEdit(true);
    setActionError(null);
    setActionSuccess(null);

    const isSelf = editCandidate.id === currentUser?.id;
    const trimmedEmail = editEmail.trim() || null;

    const currentCandidatePrefs = { ...((editCandidate.preferences || {}) as Record<string, unknown>) };
    if (!editAvatarUrl) {
      delete currentCandidatePrefs.avatar_url;
      delete currentCandidatePrefs.pfp;
    } else if (validatedAvatar) {
      currentCandidatePrefs.avatar_url = validatedAvatar;
      delete currentCandidatePrefs.pfp;
    }
    const updatedPreferences = {
      ...currentCandidatePrefs,
      default_currency: editDefaultCurrency,
      preferred_language: editPreferredLanguage,
    };

    const targetAvatar = editAvatarUrl ? validatedAvatar : null;

    try {
      if (isSelf) {
        await updateProfileApi({
          username: editUsername.trim(),
          email: trimmedEmail,
          password: editPassword || undefined,
          avatar_url: targetAvatar,
          preferences: updatedPreferences,
        });
        await setLocale(editPreferredLanguage);
        await refreshUser();
      } else {
        await updateUserApi(editCandidate.id, {
          username: editUsername.trim(),
          email: trimmedEmail,
          password: editPassword || undefined,
          role: editRole,
          avatar_url: targetAvatar,
          preferences: updatedPreferences,
        });
      }
      if (isAdmin) {
        await fetchUsers();
      }
      setActionSuccess(`User ${editUsername.trim()} profile updated successfully.`);
      setEditCandidate(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update user profile';
      setActionError(msg);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleActive = async (targetUser: User) => {
    if (targetUser.id === currentUser?.id) {
      setActionError('Cannot deactivate your own administrator account.');
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    try {
      await updateUserApi(targetUser.id, { is_active: !targetUser.is_active });
      setActionSuccess(`User ${targetUser.username} ${targetUser.is_active ? 'deactivated' : 'activated'}.`);
      await fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update user status';
      setActionError(msg);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteCandidate) return;
    if (deleteCandidate.id === currentUser?.id) {
      setActionError('Cannot delete your own administrator account.');
      setDeleteCandidate(null);
      return;
    }

    setDeleting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      await deleteUserApi(deleteCandidate.id);
      setActionSuccess(`User ${deleteCandidate.username} permanently deleted.`);
      setDeleteCandidate(null);
      await fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete user';
      setActionError(msg);
    } finally {
      setDeleting(false);
    }
  };

  const telemetrySummary = useMemo(() => {
    return {
      themeName:
        theme === 'light'
          ? 'Pacific Jazz Light'
          : theme === 'dark'
          ? 'Pacific Jazz Dark'
          : 'Silent Waters',
      typographyName: typography === 'inter' ? 'Inter Modern' : 'Classic Editorial',
      localeCode: locale,
      currencyCode: (currentUser?.preferences?.default_currency as string) || 'EUR',
      gtfsCompiledCount: gtfsTelemetry?.compiled_cities || 0,
      userCount: users.length,
      containerOnlineCount: 5,
      updateAvailable: Boolean(updaterStatus?.update_available),
    };
  }, [theme, typography, locale, currentUser, gtfsTelemetry, users, updaterStatus]);

  const handleRestoreDefaults = async () => {
    setActionError(null);
    setActionSuccess(null);
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('paladio_unit_distance');
        localStorage.removeItem('paladio_unit_temperature');
        localStorage.removeItem('paladio_unit_clock');
        localStorage.removeItem('paladio_unit_date');
        localStorage.removeItem('paladio_home_city');
        localStorage.removeItem('paladio_home_country');
        localStorage.removeItem('paladio_home_country_name');
        window.dispatchEvent(new Event('paladio_home_location_changed'));
        window.dispatchEvent(new Event('paladio_units_changed'));
      }

      useThemeStore.getState().setTheme('light');
      useTypographyStore.getState().setTypography('inter');
      setLocale('en');

      if (currentUser) {
        await updatePreferencesApi({
          default_currency: 'EUR',
          home_city: 'Madrid',
          home_country: 'ES',
          home_country_name: 'Spain',
          distance_unit: 'km',
          temperature_unit: 'C',
          clock_format: '24h',
          date_format: 'YYYY-MM-DD',
          theme: 'light',
          typography: 'inter',
          language: 'en',
        });
        await refreshUser();
      }

      setActionSuccess('All settings have been successfully restored to factory defaults.');
      notify.success('Settings Restored', 'All settings have been restored to factory defaults.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to restore default settings';
      setActionError(msg);
      notify.error('Reset Failed', msg);
    }
  };

  return (
    <div className={styles.settingsShell}>
      <header className={styles.settingsHeader}>
        <div className={styles.headerBrandArea}>
          <Link href="/dashboard" className={styles.headerBrandLogo} title="Paladio Dashboard">
            <div className="logo-mark" aria-hidden="true" style={{ width: '28px', height: '28px' }}>
              <div className="logo-icon-sun" style={{ width: '26px', height: '26px' }} />
            </div>
            <span style={{ fontWeight: 800, fontSize: '16px', letterSpacing: '0.5px' }}>PALADIO</span>
          </Link>
          <span className={styles.headerBadge}>SETTINGS</span>
        </div>
        <div className={styles.headerActions}>
          <Link href="/dashboard" className={styles.backBtn} aria-label="Back to App">
            <ChevronLeftIcon size={14} aria-hidden="true" />
            <span>Back to App</span>
          </Link>
        </div>
      </header>

      <div className={styles.settingsBody}>
      {/* Left Settings Sidebar */}
      <SettingsSidebar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        isAdmin={isAdmin}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Main Content Pane */}
      <main className={styles.settingsCanvas} aria-label="Settings Content">
        {/* Global Action Messages */}
        {actionError && (
          <div
            style={{
              background: 'var(--color-danger-soft)',
              border: '1px solid var(--color-danger)',
              color: 'var(--color-danger)',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '13px',
            }}
          >
            {actionError}
          </div>
        )}

        {actionSuccess && (
          <div
            style={{
              background: 'var(--color-success-soft)',
              border: '1px solid var(--color-success)',
              color: 'var(--color-success)',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '13px',
            }}
          >
            {actionSuccess}
          </div>
        )}

        {/* View Switcher */}
        {activeTab === 'overview' && (
          <SettingsOverview
            onSelectTab={handleSelectTab}
            isAdmin={isAdmin}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onRestoreDefaults={handleRestoreDefaults}
            telemetrySummary={telemetrySummary}
          />
        )}

        {(activeTab === 'profile' || activeTab === 'language' || activeTab === 'currency' || activeTab === 'units') && (
          <PersonalAccountSection
            onBackToOverview={() => handleSelectTab('overview')}
            currentUser={currentUser}
            refreshUser={refreshUser}
            getSafeAvatarUrl={getSafeAvatarUrl}
          />
        )}

        {(activeTab === 'appearance' || activeTab === 'typography' || activeTab === 'navigation' || activeTab === 'maps') && (
          <ExperienceSection
            onBackToOverview={() => handleSelectTab('overview')}
            subTab={activeTab}
          />
        )}

        {(activeTab === 'solver' || activeTab === 'transit' || activeTab === 'deals') && (
          <EngineSection
            onBackToOverview={() => handleSelectTab('overview')}
            subTab={activeTab}
            gtfsTelemetry={gtfsTelemetry}
            gtfsMessage={gtfsMessage}
            setGtfsMessage={setGtfsMessage}
            fetchGtfsData={fetchGtfsData}
            deleteGtfsCandidate={deleteGtfsCandidate}
            setDeleteGtfsCandidate={setDeleteGtfsCandidate}
            deletingGtfs={deletingGtfs}
            handleDeleteGtfs={handleDeleteGtfs}
            syncTripsModalOpen={syncTripsModalOpen}
            setSyncTripsModalOpen={setSyncTripsModalOpen}
          />
        )}

        {(activeTab === 'llm' || activeTab === 'swarm' || activeTab === 'memory') && (
          <IntelligenceSection
            onBackToOverview={() => handleSelectTab('overview')}
            subTab={activeTab}
          />
        )}

        {(activeTab === 'users' || activeTab === 'updates' || activeTab === 'telemetry' || activeTab === 'vault' || activeTab === 'notifications') && (
          <InfrastructureSection
            onBackToOverview={() => handleSelectTab('overview')}
            subTab={activeTab}
            initialSubTab={searchParams?.get('subtab') || undefined}

            isAdmin={isAdmin}
            currentUser={currentUser}
            users={users}
            isFetchingUsers={isFetchingUsers}
            isModalOpen={isModalOpen}
            setIsModalOpen={setIsModalOpen}
            newUsername={newUsername}
            setNewUsername={setNewUsername}
            newEmail={newEmail}
            setNewEmail={setNewEmail}
            newPassword={newPassword}
            setNewPassword={setNewPassword}
            newRole={newRole}
            setNewRole={setNewRole}
            newPreferredLanguage={newPreferredLanguage}
            setNewPreferredLanguage={setNewPreferredLanguage}
            creating={creating}
            handleCreateUser={handleCreateUser}
            editCandidate={editCandidate}
            setEditCandidate={setEditCandidate}
            editUsername={editUsername}
            setEditUsername={setEditUsername}
            editEmail={editEmail}
            setEditEmail={setEditEmail}
            editPassword={editPassword}
            setEditPassword={setEditPassword}
            editRole={editRole}
            setEditRole={setEditRole}
            editAvatarUrl={editAvatarUrl}
            setEditAvatarUrl={setEditAvatarUrl}
            editDefaultCurrency={editDefaultCurrency}
            setEditDefaultCurrency={setEditDefaultCurrency}
            editPreferredLanguage={editPreferredLanguage}
            setEditPreferredLanguage={setEditPreferredLanguage}
            savingEdit={savingEdit}
            handleSaveEdit={handleSaveEdit}
            handleAvatarFileChange={handleAvatarFileChange}
            openEditModal={openEditModal}
            handleToggleActive={handleToggleActive}
            deleteCandidate={deleteCandidate}
            setDeleteCandidate={setDeleteCandidate}
            deleting={deleting}
            handleDeleteUser={handleDeleteUser}
            getSafeAvatarUrl={getSafeAvatarUrl}
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
      </main>
      </div>
    </div>
  );
}

export default function ConfigPage() {
  return (
    <Suspense fallback={<PaladioLoader variant="fullscreen" />}>
      <ConfigPageContent />
    </Suspense>
  );
}

function ConfigPageContent() {
  return <ConfigPageInner />;
}
