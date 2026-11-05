"use client";

import React, { useEffect } from 'react';
import styles from './AgentDock.module.css';

interface ChangeToastProps {
  change: { revision: number; summary: string; undoToken?: string } | null;
  onUndo: (revision?: number) => void;
  onDismiss: () => void;
}

export function ChangeToast({ change, onUndo, onDismiss }: ChangeToastProps) {
  useEffect(() => {
    if (!change) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 10000);
    return () => clearTimeout(timer);
  }, [change, onDismiss]);

  if (!change) return null;

  return (
    <div className={styles.toastContainer}>
      <div className={styles.changeToast}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {change.summary} (Rev {change.revision})
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
          <button
            className={styles.undoToastBtn}
            onClick={() => onUndo(change.revision)}
          >
            Undo
          </button>
          <button
            onClick={onDismiss}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
