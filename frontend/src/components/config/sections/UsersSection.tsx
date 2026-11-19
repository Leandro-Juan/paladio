"use client";

import React from 'react';
import { User, UserRole } from '@/types/auth';
import { SHIPPED_LOCALES } from '@/utils/locales';
import { SUPPORTED_CURRENCY_LIST } from '@/utils/currencyResolver';
import { useTranslation } from '@/hooks/useTranslation';
import { SettingsHeader } from '../SettingsHeader';
import { DemoFeatureGate } from '@/components/common/DemoFeatureGate';

interface UsersSectionProps {
  onBackToOverview: () => void;
  subTab?: 'users' | 'profile';
  isAdmin: boolean;
  currentUser: User | null;
  users: User[];
  isFetching: boolean;
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  newUsername: string;
  setNewUsername: (val: string) => void;
  newEmail: string;
  setNewEmail: (val: string) => void;
  newPassword: string;
  setNewPassword: (val: string) => void;
  newRole: UserRole;
  setNewRole: (val: UserRole) => void;
  newPreferredLanguage: string;
  setNewPreferredLanguage: (val: string) => void;
  creating: boolean;
  handleCreateUser: (e: React.FormEvent) => Promise<void>;
  editCandidate: User | null;
  setEditCandidate: (u: User | null) => void;
  editUsername: string;
  setEditUsername: (val: string) => void;
  editEmail: string;
  setEditEmail: (val: string) => void;
  editPassword: string;
  setEditPassword: (val: string) => void;
  editRole: UserRole;
  setEditRole: (val: UserRole) => void;
  editAvatarUrl: string;
  setEditAvatarUrl: (val: string) => void;
  editDefaultCurrency: string;
  setEditDefaultCurrency: (val: string) => void;
  editPreferredLanguage: string;
  setEditPreferredLanguage: (val: string) => void;
  savingEdit: boolean;
  handleSaveEdit: (e: React.FormEvent) => Promise<void>;
  handleAvatarFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  openEditModal: (target: User) => void;
  handleToggleActive: (targetUser: User) => Promise<void>;
  deleteCandidate: User | null;
  setDeleteCandidate: (u: User | null) => void;
  deleting: boolean;
  handleDeleteUser: () => Promise<void>;
  getSafeAvatarUrl: (url: unknown) => string | null;
}

export function UsersSection({
  onBackToOverview,
  subTab = 'users',
  isAdmin,
  currentUser,
  users,
  isFetching,
  isModalOpen,
  setIsModalOpen,
  newUsername,
  setNewUsername,
  newEmail,
  setNewEmail,
  newPassword,
  setNewPassword,
  newRole,
  setNewRole,
  newPreferredLanguage,
  setNewPreferredLanguage,
  creating,
  handleCreateUser,
  editCandidate,
  setEditCandidate,
  editUsername,
  setEditUsername,
  editEmail,
  setEditEmail,
  editPassword,
  setEditPassword,
  editRole,
  setEditRole,
  editAvatarUrl,
  setEditAvatarUrl,
  editDefaultCurrency,
  setEditDefaultCurrency,
  editPreferredLanguage,
  setEditPreferredLanguage,
  savingEdit,
  handleSaveEdit,
  handleAvatarFileChange,
  openEditModal,
  handleToggleActive,
  deleteCandidate,
  setDeleteCandidate,
  deleting,
  handleDeleteUser,
  getSafeAvatarUrl,
}: UsersSectionProps) {
  const { t, locale } = useTranslation();
  const safePreviewAvatarUrl = getSafeAvatarUrl(editAvatarUrl);
  const getLanguageLabel = (loc: { code: string; name: string }) => {
    const key = `languages.${loc.code}`;
    const translated = t(key);
    return translated === key ? loc.name : translated;
  };
  const getRoleBadge = (role?: string) => {
    const normalized = (role || 'user').toLowerCase();
    if (normalized === 'admin') return t('config.role_badge_admin');
    if (normalized === 'user') return t('config.role_badge_user');
    return normalized.toUpperCase();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <SettingsHeader
        title={subTab === 'profile' ? t('config.personal_account_profile') : t('config.authorized_users_access_control')}
        onBackToOverview={onBackToOverview}
      />

      {/* User Management Section */}
      <DemoFeatureGate message={t('demo.locked_users')} borderRadius="10px">
      <div className="bg-surface border-subtle" style={{ borderRadius: '10px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h3 className="font-display" style={{ fontSize: '1.2rem', margin: 0 }}>
              {subTab === 'profile' ? t('config.profile_details') : t('config.authorized_users')}
            </h3>
            <p className="font-mono text-muted" style={{ fontSize: '11px', marginTop: '4px' }}>
              {isAdmin && subTab !== 'profile'
                ? t('config.all_accounts_provisioned_desc')
                : t('config.current_account_profile_desc')}
            </p>
          </div>
          {isAdmin && subTab !== 'profile' && (
            <span className="font-mono text-muted" style={{ fontSize: '12px' }}>
              {t('config.total_users_label', { count: users.length })}
            </span>
          )}
        </div>

        {isFetching ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <p className="font-mono text-muted">{t('config.loading_user_directory')}</p>
          </div>
        ) : isAdmin && subTab !== 'profile' ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                  <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600 }}>{t('config.col_username')}</th>
                  <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600 }}>{t('config.col_email')}</th>
                  <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600 }}>{t('config.col_role')}</th>
                  <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600 }}>{t('config.col_status')}</th>
                  <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600 }}>{t('config.col_created')}</th>
                  <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>{t('config.col_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  const avatar = (u.preferences?.avatar_url || u.preferences?.pfp) as string | undefined;
                  const initial = (u.username || 'U').charAt(0).toUpperCase();

                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: '1px solid var(--color-border-subtle)',
                        backgroundColor: isSelf ? 'var(--color-accent-teal-soft)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '12px', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: 'var(--color-surface-page)',
                              color: 'var(--color-text-primary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '13px',
                              fontWeight: 700,
                              flexShrink: 0,
                              overflow: 'hidden',
                              border: '1px solid var(--color-border-subtle)',
                            }}
                          >
                            {getSafeAvatarUrl(avatar) ? (
                              <img
                                src={getSafeAvatarUrl(avatar)!}
                                alt={u.username}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              initial
                            )}
                          </div>
                          <div>
                            <span>{u.username}</span>
                            {isSelf && (
                              <span
                                className="font-mono"
                                style={{
                                  marginLeft: '6px',
                                  fontSize: '9px',
                                  padding: '2px 5px',
                                  borderRadius: '3px',
                                  background: 'var(--color-accent-teal)',
                                  color: 'var(--color-btn-primary-text)',
                                }}
                              >
                                {t('config.badge_you')}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px', color: 'var(--color-text-muted)' }}>
                        {u.email || t('config.none')}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span
                          className="font-mono"
                          style={{
                            fontSize: '10px',
                            padding: '3px 7px',
                            borderRadius: '4px',
                            background: u.role === 'admin' ? 'var(--color-accent-gold-soft)' : 'var(--color-surface-page)',
                            color: u.role === 'admin' ? 'var(--color-accent-gold)' : 'var(--color-text-muted)',
                            border: `1px solid ${u.role === 'admin' ? 'var(--color-accent-gold)' : 'var(--color-border-subtle)'}`,
                            fontWeight: 600,
                          }}
                        >
                          {getRoleBadge(u.role)}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span
                          className="font-mono"
                          style={{
                            fontSize: '10px',
                            padding: '3px 7px',
                            borderRadius: '4px',
                            background: u.is_active ? 'var(--color-success-soft)' : 'var(--color-danger-soft)',
                            color: u.is_active ? 'var(--color-success)' : 'var(--color-danger)',
                            fontWeight: 600,
                          }}
                        >
                          {u.is_active ? t('config.status_active') : t('config.status_suspended')}
                        </span>
                      </td>
                      <td className="font-mono text-muted" style={{ padding: '12px', fontSize: '11px' }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString(locale === 'en' ? undefined : locale) : t('config.not_available')}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => openEditModal(u)}
                            className="font-mono"
                            style={{
                              padding: '5px 10px',
                              fontSize: '11px',
                              borderRadius: '4px',
                              border: '1px solid var(--color-border-subtle)',
                              background: 'var(--color-surface-card)',
                              color: 'var(--color-text-primary)',
                              cursor: 'pointer',
                            }}
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            onClick={() => handleToggleActive(u)}
                            disabled={isSelf}
                            className="font-mono"
                            style={{
                              padding: '5px 10px',
                              fontSize: '11px',
                              borderRadius: '4px',
                              border: '1px solid var(--color-border-subtle)',
                              background: 'var(--color-surface-card)',
                              color: isSelf ? 'var(--color-text-muted)' : u.is_active ? 'var(--color-danger)' : 'var(--color-success)',
                              cursor: isSelf ? 'not-allowed' : 'pointer',
                              opacity: isSelf ? 0.6 : 1,
                            }}
                          >
                            {u.is_active ? t('config.deactivate_btn') : t('config.activate_btn')}
                          </button>
                          <button
                            onClick={() => setDeleteCandidate(u)}
                            disabled={isSelf}
                            className="font-mono"
                            style={{
                              padding: '5px 10px',
                              fontSize: '11px',
                              borderRadius: '4px',
                              border: '1px solid var(--color-danger)',
                              background: 'var(--color-surface-card)',
                              color: isSelf ? 'var(--color-text-muted)' : 'var(--color-danger)',
                              cursor: isSelf ? 'not-allowed' : 'pointer',
                              opacity: isSelf ? 0.6 : 1,
                            }}
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '1.5rem', background: 'var(--color-surface-card)', borderRadius: '10px', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                <div
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    background: 'var(--color-surface-page)',
                    color: 'var(--color-text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    fontWeight: 700,
                    overflow: 'hidden',
                    flexShrink: 0,
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  {(() => {
                    const safeCurrentAvatar = getSafeAvatarUrl(currentUser?.preferences?.avatar_url || currentUser?.preferences?.pfp);
                    return safeCurrentAvatar ? (
                      <img
                        src={safeCurrentAvatar}
                        alt={currentUser?.username}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      (currentUser?.username || 'U').charAt(0).toUpperCase()
                    );
                  })()}
                </div>
                <div>
                  <h4 className="font-display" style={{ margin: 0, fontSize: '1.1rem' }}>
                    {currentUser?.username}
                  </h4>
                  <p className="font-mono text-muted" style={{ margin: '4px 0 0', fontSize: '12px' }}>
                    {currentUser?.email || t('config.no_email_associated')}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div>
                  <span className="font-mono text-muted" style={{ fontSize: '11px' }}>{t('config.col_role')}</span>
                  <div style={{ marginTop: '2px' }}>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: '10px',
                        padding: '3px 7px',
                        borderRadius: '4px',
                        background: 'var(--color-surface-page)',
                        color: 'var(--color-text-muted)',
                        border: '1px solid var(--color-border-subtle)',
                        fontWeight: 600,
                      }}
                    >
                      {getRoleBadge(currentUser?.role)}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="font-mono text-muted" style={{ fontSize: '11px' }}>{t('config.col_status')}</span>
                  <div style={{ marginTop: '2px' }}>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: '10px',
                        padding: '3px 7px',
                        borderRadius: '4px',
                        background: currentUser?.is_active ? 'var(--color-success-soft)' : 'var(--color-danger-soft)',
                        color: currentUser?.is_active ? 'var(--color-success)' : 'var(--color-danger)',
                        fontWeight: 600,
                      }}
                    >
                      {currentUser?.is_active ? t('config.status_active') : t('config.status_suspended')}
                    </span>
                  </div>
                </div>
                {currentUser && (
                  <button
                    onClick={() => openEditModal(currentUser)}
                    className="font-mono"
                    style={{
                      padding: '8px 14px',
                      fontSize: '12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border-subtle)',
                      background: 'var(--color-surface-page)',
                      color: 'var(--color-text-primary)',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {t('config.edit_profile_btn')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      </DemoFeatureGate>

      {/* Provision User Modal */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--color-scrim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            style={{
              background: 'var(--color-surface-card)',
              borderRadius: '16px',
              padding: '2rem',
              width: '100%',
              maxWidth: '440px',
              boxShadow: 'var(--shadow-modal)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <h3 className="font-display" style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>
              {t('config.provision_new_user_title')}
            </h3>

            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>
                  {t('config.col_username')}
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder={t('config.example_username_placeholder')}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-input)',
                    background: 'var(--color-surface-card)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>
                  {t('config.email_optional_label')}
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder={t('config.example_email_optional_placeholder')}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-input)',
                    background: 'var(--color-surface-card)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>
                  {t('config.initial_password_label')}
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('config.minimum_6_chars_placeholder')}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-input)',
                    background: 'var(--color-surface-card)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>
                  {t('config.col_role')}
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-input)',
                    fontSize: '13px',
                    background: 'var(--color-surface-card)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <option value="user">{t('config.role_standard_user')}</option>
                  <option value="admin">{t('config.role_administrator')}</option>
                </select>
              </div>

              <div>
                <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>
                  {t('config.preferred_language_label')}
                </label>
                <select
                  value={newPreferredLanguage}
                  onChange={(e) => setNewPreferredLanguage(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-input)',
                    fontSize: '13px',
                    background: 'var(--color-surface-card)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {SHIPPED_LOCALES.map((loc) => (
                    <option key={loc.code} value={loc.code}>
                      {getLanguageLabel(loc)} ({loc.nativeName})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-subtle)',
                    background: 'transparent',
                    color: 'var(--color-text-muted)',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="font-display"
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--color-accent-primary)',
                    color: 'var(--color-btn-primary-text)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: creating ? 'not-allowed' : 'pointer',
                  }}
                >
                  {creating ? t('config.creating_btn') : t('config.create_account_btn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Profile Modal */}
      {editCandidate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--color-scrim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            data-testid="edit-user-modal"
            style={{
              background: 'var(--color-surface-card)',
              borderRadius: '16px',
              padding: '2rem',
              width: '100%',
              maxWidth: '480px',
              maxHeight: '90vh',
              boxShadow: 'var(--shadow-modal)',
              border: '1px solid var(--color-border-subtle)',
              overflowY: 'auto',
            }}
          >
            <h3 className="font-display" style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>
              {editCandidate.id === currentUser?.id ? t('config.edit_your_profile_title') : t('config.edit_user_title', { username: editCandidate.username })}
            </h3>

            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              {/* Avatar Preview & Upload */}
              <div>
                <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '8px' }}>
                  {t('config.profile_picture_pfp_label')}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      background: 'var(--color-surface-page)',
                      color: 'var(--color-text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                      fontWeight: 700,
                      overflow: 'hidden',
                      flexShrink: 0,
                      border: '2px solid var(--color-border-subtle)',
                    }}
                  >
                    {safePreviewAvatarUrl ? (
                      <img
                        src={encodeURI(safePreviewAvatarUrl)}
                        alt={editUsername || t('config.avatar_alt')}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      (editUsername || 'U').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <label
                        className="font-mono"
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--color-border-subtle)',
                          background: 'var(--color-surface-card)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {t('config.upload_image_btn')}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarFileChange}
                          style={{ display: 'none' }}
                        />
                      </label>
                      {editAvatarUrl && (
                        <button
                          type="button"
                          onClick={() => setEditAvatarUrl('')}
                          className="font-mono"
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-danger)',
                            background: 'var(--color-surface-card)',
                            color: 'var(--color-danger)',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          {t('config.remove_btn')}
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={editAvatarUrl.startsWith('data:image') ? '' : editAvatarUrl}
                      onChange={(e) => setEditAvatarUrl(e.target.value)}
                      placeholder={editAvatarUrl.startsWith('data:image') ? t('config.uploaded_image_attached') : t('config.paste_image_url_placeholder')}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border-input)',
                        fontSize: '11px',
                        background: 'var(--color-surface-card)',
                        color: 'var(--color-text-primary)',
                      }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>
                  {t('config.col_username')}
                </label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder={t('config.example_username_placeholder')}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-input)',
                    background: 'var(--color-surface-card)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>
                  {t('config.col_email')}
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder={t('config.example_email_placeholder')}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-input)',
                    background: 'var(--color-surface-card)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>
                  {t('config.new_password_label')}
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder={t('config.leave_blank_keep_current_placeholder')}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-input)',
                    background: 'var(--color-surface-card)',
                    color: 'var(--color-text-primary)',
                    fontSize: '13px',
                  }}
                />
              </div>

              {isAdmin && editCandidate.id !== currentUser?.id && (
                <div>
                  <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>
                    {t('config.col_role')}
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border-input)',
                      fontSize: '13px',
                      background: 'var(--color-surface-card)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    <option value="user">{t('config.role_standard_user')}</option>
                    <option value="admin">{t('config.role_administrator')}</option>
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>
                    {t('config.default_currency_upper')}
                  </label>
                  <select
                    value={editDefaultCurrency}
                    onChange={(e) => setEditDefaultCurrency(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border-input)',
                      fontSize: '13px',
                      background: 'var(--color-surface-card)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {SUPPORTED_CURRENCY_LIST.map((cur) => (
                      <option key={cur.code} value={cur.code}>
                        {cur.code} ({cur.symbol})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-mono text-muted" style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>
                    {t('config.language_upper')}
                  </label>
                  <select
                    value={editPreferredLanguage}
                    onChange={(e) => setEditPreferredLanguage(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border-input)',
                      fontSize: '13px',
                      background: 'var(--color-surface-card)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {SHIPPED_LOCALES.map((loc) => (
                      <option key={loc.code} value={loc.code}>
                        {getLanguageLabel(loc)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setEditCandidate(null)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-subtle)',
                    background: 'transparent',
                    color: 'var(--color-text-muted)',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="font-display"
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--color-accent-teal)',
                    color: 'var(--color-btn-primary-text)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: savingEdit ? 'not-allowed' : 'pointer',
                  }}
                >
                  {savingEdit ? t('config.saving_btn') : t('config.save_changes_btn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm User Deletion Modal */}
      {deleteCandidate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--color-scrim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            style={{
              background: 'var(--color-surface-card)',
              borderRadius: '16px',
              padding: '2rem',
              width: '100%',
              maxWidth: '400px',
              boxShadow: 'var(--shadow-modal)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <h3 className="font-display" style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-danger)' }}>
              {t('config.confirm_user_deletion_title')}
            </h3>
            <p style={{ fontSize: '13px', margin: '1rem 0', color: 'var(--color-text-primary)' }}>
              {t('config.confirm_user_deletion_body', {
                username: '__PALADIO_USER__',
                email: deleteCandidate.email || '',
              })
                .split('__PALADIO_USER__')
                .map((part, idx, arr) => (
                  <React.Fragment key={idx}>
                    {part}
                    {idx < arr.length - 1 && <strong>{deleteCandidate.username}</strong>}
                  </React.Fragment>
                ))}
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                disabled={deleting}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border-subtle)',
                  background: 'transparent',
                  color: 'var(--color-text-muted)',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deleting}
                className="font-display"
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--color-danger)',
                  color: 'var(--color-btn-primary-text)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                }}
              >
                {deleting ? t('config.deleting_btn') : t('config.permanently_delete_btn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
