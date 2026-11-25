"use client";

import React, { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/hooks/useTranslation';
import { useAnimatedMount, useEscapeAndFocusReturn } from '@/hooks/useAnimatedMount';

const emptySubscribe = () => () => {};

interface ModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDanger?: boolean;
  variant?: 'danger' | 'warning' | 'default';
  children?: React.ReactNode;
}

export function Modal({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  isDanger = false,
  variant = 'default',
  children
}: ModalProps) {
  const { t } = useTranslation();
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const { shouldRender, dataState } = useAnimatedMount(isOpen, 150);
  useEscapeAndFocusReturn(isOpen, onCancel);

  if (!shouldRender) return null;

  const resolvedConfirmText = confirmText === undefined ? t('common.ok') : (confirmText ? t(confirmText) : '');
  const resolvedCancelText = cancelText === undefined ? t('common.cancel_upper') : (cancelText ? t(cancelText) : '');

  const isWarningMode = variant === 'warning';
  const isDangerMode = variant === 'danger' || isDanger;

  let headerColor = 'var(--color-text-primary)';
  let confirmBg = 'var(--color-accent-primary)';

  if (isDangerMode) {
    headerColor = 'var(--color-danger)';
    confirmBg = 'var(--color-danger)';
  } else if (isWarningMode) {
    headerColor = 'var(--color-accent-warning)';
    confirmBg = 'var(--color-accent-warning)';
  }

  const modalElement = (
    <div
      className="paladio-modal-backdrop"
      data-state={dataState}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(8, 28, 36, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="paladio-modal-panel"
        data-state={dataState}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-surface-card)',
          border: isDangerMode 
            ? '1px solid var(--color-danger)' 
            : isWarningMode
            ? '1px solid var(--color-accent-warning)'
            : '1px solid var(--color-border)',
          borderRadius: '12px',
          padding: '2rem',
          maxWidth: '480px',
          width: '90%',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        <h2 className="font-display" style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', color: headerColor }}>
          {t(title)}
        </h2>
        <p className="font-mono text-muted text-sm" style={{ marginBottom: children ? '1rem' : '2rem', lineHeight: 1.5 }}>
          {t(message)}
        </p>
        
        {children && (
          <div style={{ marginBottom: '2rem' }}>
            {children}
          </div>
        )}
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          {Boolean(resolvedCancelText) && (
            <button 
              onClick={onCancel}
              style={{
                padding: '0.5rem 1.15rem',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                borderRadius: '8px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast)'
              }}
            >
              {resolvedCancelText}
            </button>
          )}
          {Boolean(resolvedConfirmText) && (
            <button 
              onClick={onConfirm}
              style={{
                padding: '0.5rem 1.25rem',
                background: confirmBg,
                border: 'none',
                color: '#FFF',
                borderRadius: '8px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                fontWeight: 600,
                boxShadow: 'var(--shadow-sm)',
                transition: 'opacity var(--transition-fast), box-shadow var(--transition-fast)'
              }}
            >
              {resolvedConfirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return isClient && typeof document !== 'undefined'
    ? createPortal(modalElement, document.body)
    : modalElement;
}
