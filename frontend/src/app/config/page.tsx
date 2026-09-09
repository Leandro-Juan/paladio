"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { User, UserRole } from '@/types/auth';
import { createUserApi, deleteUserApi, listUsersApi, updateUserApi } from '@/utils/api';

export default function ConfigPage() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [users, setUsers] = useState<User[]>([]);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [hasFetched, setHasFetched] = useState<boolean>(false);
  const loading = isFetching || (!hasFetched && isAdmin);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('user');
  const [creating, setCreating] = useState(false);

  // Confirm delete state
  const [deleteCandidate, setDeleteCandidate] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    setIsFetching(true);
    try {
      const data = await listUsersApi();
      setUsers(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch users';
      setActionError(msg);
    } finally {
      setIsFetching(false);
      setHasFetched(true);
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
      } finally {
        if (!ignore) {
          setHasFetched(true);
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
    if (!newUsername.trim() || !newEmail.trim() || !newPassword) {
      setActionError('All user fields are required.');
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
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      });
      setActionSuccess(`User ${newUsername.trim()} provisioned successfully.`);
      setIsModalOpen(false);
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('user');
      await fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to provision user';
      setActionError(msg);
    } finally {
      setCreating(false);
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

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h2 className="font-display">Instance Configuration</h2>
          <p className="font-mono text-muted text-sm mt-2">{'// DOCKER ENVIRONMENT & USER GOVERNANCE'}</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setActionError(null);
              setActionSuccess(null);
              setIsModalOpen(true);
            }}
            className="font-display"
            style={{
              padding: '10px 18px',
              background: 'var(--color-accent-primary)',
              color: '#FFF',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>+</span> PROVISION NEW USER
          </button>
        )}
      </div>

      {actionError && (
        <div
          style={{
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#DC2626',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            fontSize: '13px',
          }}
        >
          {actionError}
        </div>
      )}

      {actionSuccess && (
        <div
          style={{
            background: '#F0FDF4',
            border: '1px solid #BBF7D0',
            color: '#16A34A',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            fontSize: '13px',
          }}
        >
          {actionSuccess}
        </div>
      )}

      {/* User Management Section */}
      <div className="bg-surface border-subtle" style={{ borderRadius: '10px', padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h3 className="font-display" style={{ fontSize: '1.2rem', margin: 0 }}>
              Authorized Users
            </h3>
            <p className="font-mono text-muted" style={{ fontSize: '11px', marginTop: '4px' }}>
              {isAdmin
                ? 'All accounts provisioned on this self-hosted Paladio instance.'
                : 'Your current account profile on this instance.'}
            </p>
          </div>
          {isAdmin && (
            <span className="font-mono text-muted" style={{ fontSize: '12px' }}>
              TOTAL: {users.length}
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <p className="font-mono text-muted">LOADING USER DIRECTORY...</p>
          </div>
        ) : isAdmin ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                  <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600 }}>USERNAME</th>
                  <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600 }}>EMAIL</th>
                  <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600 }}>ROLE</th>
                  <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600 }}>STATUS</th>
                  <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600 }}>CREATED</th>
                  <th className="font-mono" style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        backgroundColor: isSelf ? 'rgba(30, 58, 138, 0.02)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '12px', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{u.username}</span>
                          {isSelf && (
                            <span
                              className="font-mono"
                              style={{
                                fontSize: '9px',
                                background: '#E0E7FF',
                                color: '#1E3A8A',
                                padding: '2px 6px',
                                borderRadius: '4px',
                              }}
                            >
                              YOU
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-muted" style={{ padding: '12px' }}>{u.email}</td>
                      <td style={{ padding: '12px' }}>
                        <span
                          className="font-mono"
                          style={{
                            fontSize: '10px',
                            padding: '3px 7px',
                            borderRadius: '4px',
                            background: u.role === 'admin' ? '#1E3A8A' : '#E2E8F0',
                            color: u.role === 'admin' ? '#FFFFFF' : '#334155',
                            fontWeight: 600,
                          }}
                        >
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span
                          className="font-mono"
                          style={{
                            fontSize: '10px',
                            padding: '3px 7px',
                            borderRadius: '4px',
                            background: u.is_active ? '#DCFCE7' : '#FEE2E2',
                            color: u.is_active ? '#15803D' : '#B91C1C',
                            fontWeight: 600,
                          }}
                        >
                          {u.is_active ? 'ACTIVE' : 'SUSPENDED'}
                        </span>
                      </td>
                      <td className="font-mono text-muted" style={{ padding: '12px', fontSize: '11px' }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleToggleActive(u)}
                            disabled={isSelf}
                            className="font-mono"
                            style={{
                              padding: '5px 10px',
                              fontSize: '11px',
                              borderRadius: '4px',
                              border: '1px solid var(--color-border)',
                              background: '#FFF',
                              color: isSelf ? '#94A3B8' : u.is_active ? '#B91C1C' : '#15803D',
                              cursor: isSelf ? 'not-allowed' : 'pointer',
                              opacity: isSelf ? 0.6 : 1,
                            }}
                          >
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => setDeleteCandidate(u)}
                            disabled={isSelf}
                            className="font-mono"
                            style={{
                              padding: '5px 10px',
                              fontSize: '11px',
                              borderRadius: '4px',
                              border: '1px solid #FECACA',
                              background: '#FFF',
                              color: isSelf ? '#94A3B8' : '#DC2626',
                              cursor: isSelf ? 'not-allowed' : 'pointer',
                              opacity: isSelf ? 0.6 : 1,
                            }}
                          >
                            Delete
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
          <div style={{ padding: '1rem', background: '#FFF', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <div>
                <span className="font-mono text-muted" style={{ fontSize: '11px' }}>USERNAME</span>
                <p style={{ fontWeight: 600, marginTop: '2px' }}>{currentUser?.username}</p>
              </div>
              <div>
                <span className="font-mono text-muted" style={{ fontSize: '11px' }}>EMAIL</span>
                <p style={{ fontWeight: 600, marginTop: '2px' }}>{currentUser?.email}</p>
              </div>
              <div>
                <span className="font-mono text-muted" style={{ fontSize: '11px' }}>ROLE</span>
                <p style={{ fontWeight: 600, marginTop: '2px' }}>{currentUser?.role.toUpperCase()}</p>
              </div>
              <div>
                <span className="font-mono text-muted" style={{ fontSize: '11px' }}>STATUS</span>
                <p style={{ fontWeight: 600, marginTop: '2px', color: currentUser?.is_active ? '#15803D' : '#B91C1C' }}>
                  {currentUser?.is_active ? 'ACTIVE' : 'SUSPENDED'}
                </p>
              </div>
            </div>
            <p className="font-mono text-muted" style={{ fontSize: '11px', marginTop: '1.5rem' }}>
              {'// NOTE: System user administration is restricted to Master Administrators.'}
            </p>
          </div>
        )}
      </div>

      {/* Docker Instance Health Panel */}
      <div className="bg-surface border-subtle" style={{ borderRadius: '10px', padding: '1.5rem' }}>
        <h3 className="font-display" style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
          Sovereign Docker Telemetry
        </h3>
        <p className="font-mono text-muted" style={{ fontSize: '11px', marginBottom: '1.5rem' }}>
          {'// LOCAL CONTAINER CLUSTER STATUS'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {[
            { name: 'FastAPI Gateway', port: '8000', status: 'ONLINE', target: 'Semantic Gateway / Swarm Router' },
            { name: 'TimescaleDB / Vector', port: '5432', status: 'ONLINE', target: 'PostgreSQL 16 Storage (pgdata)' },
            { name: 'Redis Cache / Broker', port: '6379', status: 'ONLINE', target: 'Celery Broker & Cache (redisdata)' },
            { name: 'Local Ollama LLM', port: '11434', status: 'ONLINE', target: 'Qwen 2.5 7B & nomic-embed-text' },
            { name: 'Valhalla Routing', port: '8002', status: 'ONLINE', target: 'Deterministic Transit Node' },
          ].map((node) => (
            <div
              key={node.name}
              style={{
                background: '#FFF',
                border: '1px solid var(--color-border)',
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
                    background: '#DCFCE7',
                    color: '#15803D',
                    fontWeight: 600,
                  }}
                >
                  {node.status}
                </span>
              </div>
              <p className="font-mono text-muted" style={{ fontSize: '10px', marginTop: '6px' }}>
                PORT {node.port} {'//'} {node.target}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Provision User Modal */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              padding: '2rem',
              width: '100%',
              maxWidth: '440px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
              border: '1px solid var(--color-border)',
            }}
          >
            <h3 className="font-display" style={{ margin: 0, fontSize: '1.25rem' }}>
              Provision New User
            </h3>
            <p className="font-mono text-muted" style={{ fontSize: '11px', marginTop: '4px', marginBottom: '1.5rem' }}>
              {'// CREATE CREDENTIALS FOR SELF-HOSTED ACCESS'}
            </p>

            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="font-mono" style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>
                  USERNAME
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g. navigator"
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label className="font-mono" style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>
                  EMAIL
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="navigator@paladio.internal"
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label className="font-mono" style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>
                  INITIAL PASSWORD
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label className="font-mono" style={{ display: 'block', fontSize: '11px', marginBottom: '4px' }}>
                  ROLE
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    fontSize: '13px',
                    background: '#FFF',
                  }}
                >
                  <option value="user">Standard User</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    background: 'transparent',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
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
                    color: '#FFF',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: creating ? 'not-allowed' : 'pointer',
                    opacity: creating ? 0.7 : 1,
                  }}
                >
                  {creating ? 'PROVISIONING...' : 'CREATE ACCOUNT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      {deleteCandidate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              padding: '2rem',
              width: '100%',
              maxWidth: '400px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
              border: '1px solid var(--color-border)',
            }}
          >
            <h3 className="font-display" style={{ margin: 0, fontSize: '1.2rem', color: '#DC2626' }}>
              Confirm User Deletion
            </h3>
            <p style={{ fontSize: '13px', margin: '1rem 0', color: 'var(--color-text-primary)' }}>
              Are you sure you want to permanently delete user <strong>{deleteCandidate.username}</strong> ({deleteCandidate.email})?
              This action is irreversible and cascades to all linked trips.
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                disabled={deleting}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
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
                  background: '#DC2626',
                  color: '#FFF',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                }}
              >
                {deleting ? 'DELETING...' : 'PERMANENTLY DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
