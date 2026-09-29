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
  let confirmBg = 'var(--color-accent-primary, #1E3A8A)';

  if (isDangerMode) {
    headerColor = 'var(--color-accent-secondary, #DC2626)';
    confirmBg = 'var(--color-accent-secondary, #DC2626)';
  } else if (isWarningMode) {
    headerColor = 'var(--color-accent-warning, #D97706)';
    confirmBg = 'var(--color-accent-warning, #D97706)';
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        background: 'var(--color-bg-main)',
        border: isDangerMode 
          ? '1px solid var(--color-accent-secondary, #DC2626)' 
          : isWarningMode
          ? '1px solid var(--color-accent-warning, #D97706)'
          : '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '2rem',
        maxWidth: '480px',
        width: '90%',
        boxShadow: isDangerMode 
          ? '0 12px 36px rgba(220, 38, 38, 0.25)' 
          : isWarningMode
          ? '0 12px 36px rgba(217, 119, 6, 0.2)'
          : '0 10px 25px rgba(0,0,0,0.1)'
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
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          {Boolean(cancelText) && (
            <button 
              onClick={onCancel}
              style={{
                padding: '0.5rem 1rem',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                borderRadius: '4px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer'
              }}
            >
              {cancelText}
            </button>
          )}
          {Boolean(confirmText) && (
            <button 
              onClick={onConfirm}
              style={{
                padding: '0.5rem 1rem',
                background: confirmBg,
                border: 'none',
                color: '#FFF',
                borderRadius: '4px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                fontWeight: 600
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
