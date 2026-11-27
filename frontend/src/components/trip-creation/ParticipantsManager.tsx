"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAnimatedMount } from '@/hooks/useAnimatedMount';
import { UserIcon, PlusIcon, CloseIcon, CheckIcon, Spinner } from '@/components/icons';
import { useTrips, CollaboratorOption } from '@/hooks/useTrips';

export interface SelectedParticipant {
  id: string;
  name: string;
  email?: string;
  user_id?: string;
  is_guest?: boolean;
  is_organizer?: boolean;
}

interface ParticipantsManagerProps {
  participants: SelectedParticipant[];
  onChange: (participants: SelectedParticipant[]) => void;
  disabled?: boolean;
  currentUserId?: string;
  hideHeader?: boolean;
}

export function ParticipantsManager({
  participants,
  onChange,
  disabled = false,
  currentUserId,
  hideHeader = false,
}: ParticipantsManagerProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [availableUsers, setAvailableUsers] = useState<CollaboratorOption[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  const { getCollaboratorOptions } = useTrips();
  const modalRef = useRef<HTMLDivElement>(null);
  const modalMount = useAnimatedMount(isOpen, 150);

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    setIsLoadingUsers(true);
    getCollaboratorOptions()
      .then((users) => {
        setAvailableUsers(users || []);
        setIsLoadingUsers(false);
      })
      .catch(() => {
        setIsLoadingUsers(false);
      });
  };

  // Click outside and Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const isOrganizerParticipant = (p: SelectedParticipant) =>
    Boolean(p.is_organizer || p.id === 'creator' || (currentUserId && p.user_id === currentUserId));

  // Toggle registered user selection via checkbox
  const handleToggleUser = (user: CollaboratorOption) => {
    const isSelf = Boolean(currentUserId && user.id === currentUserId);
    const isSelected = participants.some((p) => p.user_id === user.id || p.id === user.id);
    if (isSelected) {
      // Never remove the organizer/creator or the last remaining participant
      if (isSelf || participants.length <= 1) return;
      onChange(
        participants.filter((p) => (p.user_id !== user.id && p.id !== user.id) || isOrganizerParticipant(p))
      );
    } else {
      const baseParticipants = isSelf
        ? participants.filter((p) => p.id !== 'creator')
        : participants;
      const newParticipant: SelectedParticipant = {
        id: user.id,
        name: user.username,
        email: user.email,
        user_id: user.id,
        is_guest: false,
        is_organizer: isSelf,
      };
      onChange([...baseParticipants, newParticipant]);
    }
  };

  // Add custom guest traveler by name
  const handleAddGuest = (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const trimmed = guestName.trim();
    if (!trimmed) return;

    const isDuplicate = participants.some(
      (p) => p.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) return;

    const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newGuest: SelectedParticipant = {
      id: guestId,
      name: trimmed,
      email: guestEmail.trim() || undefined,
      is_guest: true,
      is_organizer: false,
    };

    onChange([...participants, newGuest]);
    setGuestName('');
    setGuestEmail('');
  };

  // Remove participant by ID
  const handleRemoveParticipant = (id: string) => {
    if (disabled) return;
    // Keep at least one participant and never remove the organizer/creator
    if (participants.length <= 1) return;
    const target = participants.find((p) => p.id === id);
    if (target && isOrganizerParticipant(target)) return;
    onChange(participants.filter((p) => p.id !== id));
  };

  // Filter available users by search query
  const filteredUsers = availableUsers.filter((u) => {
    if (!userSearchQuery.trim()) return true;
    const q = userSearchQuery.toLowerCase();
    return (
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q))
    );
  });

  return (
    <div>
      {!hideHeader && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-text-muted)',
            }}
          >
            {t('engine.travelers_participants_count', { count: participants.length })}
          </label>
          <span className="font-mono text-xs text-muted">
            {participants.length === 1
              ? t('engine.guest_singular')
              : t('engine.guests_plural', { count: participants.length })}
          </span>
        </div>
      )}

      {/* Chips bar showing current participants + Plus button */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px',
          background: 'var(--color-bg-main, #FAF8F5)',
          border: '1px solid var(--color-border)',
          borderRadius: '16px',
          padding: '6px 10px',
          minHeight: '44px',
        }}
      >
        {participants.map((p) => {
          const isCreator = isOrganizerParticipant(p);
          const displayName = p.id === 'creator' && p.name === 'You' ? t('engine.you_badge') : p.name;
          const initial = (displayName || 'T').charAt(0).toUpperCase();
          return (
            <div
              key={p.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--color-surface-raised, #FFFFFF)',
                border: '1px solid var(--color-border)',
                borderRadius: '9999px',
                padding: '3px 10px 3px 4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                fontSize: '12px',
                fontFamily: 'var(--font-sans)',
                color: 'var(--color-text-primary, #1A1A1A)',
                fontWeight: 500,
              }}
            >
              {/* Avatar Initial Circle */}
              <div
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: isCreator ? 'var(--color-accent-primary, #0F4C5C)' : '#2563EB',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  flexShrink: 0,
                }}
              >
                {initial}
              </div>

              <span>{displayName}</span>

              {p.is_guest && (
                <span
                  style={{
                    fontSize: '9.5px',
                    fontFamily: 'var(--font-mono)',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'rgba(0,0,0,0.05)',
                    color: 'var(--color-text-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  {t('engine.guest_badge')}
                </span>
              )}

              {isCreator && (
                <span
                  style={{
                    fontSize: '9.5px',
                    fontFamily: 'var(--font-mono)',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'rgba(15, 76, 92, 0.1)',
                    color: 'var(--color-accent-primary, #0F4C5C)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  {t('engine.host_badge')}
                </span>
              )}

              {/* Remove button (if more than 1 participant and not organizer) */}
              {!disabled && participants.length > 1 && !isCreator && (
                <button
                  type="button"
                  onClick={() => handleRemoveParticipant(p.id)}
                  title={t('engine.remove_participant_title', { name: displayName })}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: '2px',
                    marginLeft: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-muted)',
                    borderRadius: '50%',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                >
                  <CloseIcon size={11} />
                </button>
              )}
            </div>
          );
        })}

        {/* Plus Button to open modal */}
        <button
          type="button"
          disabled={disabled}
          onClick={handleOpen}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            background: 'var(--color-surface-raised, #FFFFFF)',
            border: '1.5px dashed var(--color-border)',
            borderRadius: '9999px',
            padding: '4px 12px',
            fontSize: '12px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            color: '#2563EB',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.borderColor = '#2563EB';
              e.currentTarget.style.background = 'rgba(37, 99, 235, 0.04)';
            }
          }}
          onMouseLeave={(e) => {
            if (!disabled) {
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.background = 'var(--color-surface-raised, #FFFFFF)';
            }
          }}
        >
          <PlusIcon size={12} color="#2563EB" />
          <span>{t('engine.add_participant')}</span>
        </button>
      </div>

      {/* ================= MODAL POPOVER FOR ADDING PARTICIPANTS ================= */}
      {modalMount.shouldRender && (
        <div
          className="paladio-modal-backdrop"
          data-state={modalMount.dataState}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            className="paladio-modal-panel"
            data-state={modalMount.dataState}
            style={{
              width: '100%',
              maxWidth: '520px',
              background: 'var(--color-surface-raised, #FFFFFF)',
              border: '1px solid var(--color-border)',
              borderRadius: '24px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h3
                  className="font-display"
                  style={{
                    margin: 0,
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--color-text-primary, #1A1A1A)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {t('engine.participants_modal_title')}
                </h3>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: '12.5px',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.4,
                  }}
                >
                  {t('engine.participants_modal_desc')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  border: 'none',
                  background: 'rgba(0,0,0,0.05)',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <CloseIcon size={14} />
              </button>
            </div>

            {/* Section 1: Add Guest Traveler by Name */}
            <div
              style={{
                background: 'var(--color-bg-main, #FAF8F5)',
                border: '1px solid var(--color-border)',
                borderRadius: '16px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <UserIcon size={13} color="var(--color-text-muted)" />
                <span
                  className="font-mono text-xs text-muted"
                  style={{ fontWeight: 700, letterSpacing: '0.05em' }}
                >
                  {t('engine.add_guest_section_title')}
                </span>
              </div>
              <div
                role="group"
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center',
                }}
              >
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleAddGuest(e);
                    }
                  }}
                  placeholder={t('engine.guest_name_placeholder')}
                  style={{
                    flex: 1,
                    background: 'var(--color-surface-raised, #FFFFFF)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '9999px',
                    padding: '8px 14px',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '13px',
                    color: 'var(--color-text-primary, #1A1A1A)',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={(e) => handleAddGuest(e)}
                  disabled={
                    !guestName.trim() ||
                    participants.some((p) => p.name.trim().toLowerCase() === guestName.trim().toLowerCase())
                  }
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    background:
                      guestName.trim() &&
                      !participants.some((p) => p.name.trim().toLowerCase() === guestName.trim().toLowerCase())
                        ? '#2563EB'
                        : 'var(--color-border)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '9999px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: 'var(--font-sans)',
                    cursor:
                      guestName.trim() &&
                      !participants.some((p) => p.name.trim().toLowerCase() === guestName.trim().toLowerCase())
                        ? 'pointer'
                        : 'not-allowed',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <PlusIcon size={12} color="#FFFFFF" />
                  <span>{t('engine.add_guest_btn')}</span>
                </button>
              </div>
            </div>

            {/* Section 2: Registered App Users List with Checkboxes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  className="font-mono text-xs text-muted"
                  style={{ fontWeight: 700, letterSpacing: '0.05em' }}
                >
                  {t('engine.registered_users_count', { count: availableUsers.length })}
                </span>
                <span className="font-mono text-xs text-muted">{t('engine.select_via_checkbox')}</span>
              </div>

              {/* User search filter if multiple users */}
              {availableUsers.length > 3 && (
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder={t('engine.filter_users_placeholder')}
                  style={{
                    width: '100%',
                    background: 'var(--color-bg-main, #FAF8F5)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '9999px',
                    padding: '6px 14px',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '12.5px',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                  }}
                />
              )}

              {/* Users List */}
              <div
                style={{
                  maxHeight: '220px',
                  overflowY: 'auto',
                  border: '1px solid var(--color-border)',
                  borderRadius: '16px',
                  background: 'var(--color-bg-main, #FAF8F5)',
                  padding: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                }}
              >
                {isLoadingUsers ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    <Spinner size={16} />
                    <span style={{ marginLeft: '8px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                      {t('engine.loading_registered_users')}
                    </span>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '12.5px' }}>
                    {t('engine.no_matching_users')}
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const isSelected = participants.some(
                      (p) => p.user_id === user.id || p.id === user.id
                    );
                    const isSelf = user.id === currentUserId;

                    return (
                      <div
                        key={user.id}
                        onClick={() => handleToggleUser(user)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: '12px',
                          background: isSelected
                            ? 'var(--color-surface-raised, #FFFFFF)'
                            : 'transparent',
                          border: isSelected
                            ? '1px solid rgba(37, 99, 235, 0.25)'
                            : '1px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 0.1s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {/* Stylized Checkbox */}
                          <div
                            style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '4px',
                              border: isSelected
                                ? '1.5px solid #2563EB'
                                : '1.5px solid var(--color-border)',
                              background: isSelected ? '#2563EB' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s ease',
                              flexShrink: 0,
                            }}
                          >
                            {isSelected && <CheckIcon size={12} color="#FFFFFF" />}
                          </div>

                          {/* Avatar Circle */}
                          <div
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: '50%',
                              background: isSelf
                                ? 'var(--color-accent-primary, #0F4C5C)'
                                : '#3B82F6',
                              color: '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              flexShrink: 0,
                            }}
                          >
                            {(user.username || 'U').charAt(0).toUpperCase()}
                          </div>

                          {/* User info */}
                          <div>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: 'var(--color-text-primary, #1A1A1A)',
                              }}
                            >
                              <span>{user.username}</span>
                              {isSelf && (
                                <span
                                  style={{
                                    fontSize: '9.5px',
                                    fontFamily: 'var(--font-mono)',
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    background: 'rgba(15, 76, 92, 0.1)',
                                    color: 'var(--color-accent-primary, #0F4C5C)',
                                    fontWeight: 700,
                                  }}
                                >
                                  {t('engine.you_badge')}
                                </span>
                              )}
                            </div>
                            {user.email && (
                              <div
                                className="font-mono text-xs text-muted"
                                style={{ fontSize: '11px', marginTop: '1px' }}
                              >
                                {user.email}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Status chip */}
                        <span
                          className="font-mono text-xs"
                          style={{
                            color: isSelected ? '#2563EB' : 'var(--color-text-muted)',
                            fontWeight: isSelected ? 600 : 400,
                          }}
                        >
                          {isSelected ? t('dashboard.added') : t('engine.select_label')}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Section 3: Active Participants Summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  className="font-mono text-xs text-muted"
                  style={{ fontWeight: 700, letterSpacing: '0.05em' }}
                >
                  {t('engine.active_trip_travelers_count', { count: participants.length })}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {participants.map((p) => {
                  const isCreator = isOrganizerParticipant(p);
                  const displayName = p.id === 'creator' && p.name === 'You' ? t('engine.you_badge') : p.name;
                  return (
                  <div
                    key={p.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'var(--color-bg-main, #FAF8F5)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '9999px',
                      padding: '3px 8px 3px 6px',
                      fontSize: '11.5px',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    <span>{displayName}</span>
                    {participants.length > 1 && !isCreator && (
                      <button
                        type="button"
                        onClick={() => handleRemoveParticipant(p.id)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          color: 'var(--color-text-muted)',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                      >
                        <CloseIcon size={10} />
                      </button>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  padding: '9px 20px',
                  borderRadius: '9999px',
                  border: 'none',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                }}
              >
                {t('common.done')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
