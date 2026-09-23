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
  children?: React.ReactNode;
}

export function Modal({ isOpen, title, message, confirmText = "OK", cancelText = "CANCEL", onConfirm, onCancel, isDanger = false, children }: ModalProps) {
  if (!isOpen) return null;

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
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '2rem',
        maxWidth: '400px',
        width: '90%',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
      }}>
        <h2 className="font-display" style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', color: isDanger ? 'var(--color-accent-secondary, #DC2626)' : 'var(--color-text-primary)' }}>
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
          <button 
            onClick={onConfirm}
            style={{
              padding: '0.5rem 1rem',
              background: isDanger ? 'var(--color-accent-secondary, #DC2626)' : 'var(--color-accent-primary, #1E3A8A)',
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
        </div>
      </div>
    </div>
  );
}
