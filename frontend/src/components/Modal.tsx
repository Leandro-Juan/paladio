import React from 'react';

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
  confirmText = "OK",
  cancelText = "CANCEL",
  onConfirm,
  onCancel,
  isDanger = false,
  variant = 'default',
  children
}: ModalProps) {
  if (!isOpen) return null;

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

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(8, 28, 36, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
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
      }}>
        <h2 className="font-display" style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', color: headerColor }}>
          {title}
        </h2>
        <p className="font-mono text-muted text-sm" style={{ marginBottom: children ? '1rem' : '2rem', lineHeight: 1.5 }}>
          {message}
        </p>
        
        {children && (
          <div style={{ marginBottom: '2rem' }}>
            {children}
          </div>
        )}
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          {Boolean(cancelText) && (
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
                transition: 'all 0.15s ease'
              }}
            >
              {cancelText}
            </button>
          )}
          {Boolean(confirmText) && (
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
                transition: 'all 0.15s ease'
              }}
            >
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
