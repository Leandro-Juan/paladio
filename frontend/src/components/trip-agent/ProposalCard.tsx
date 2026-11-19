"use client";

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { ProposalItem } from './types/agent';
import styles from './AgentDock.module.css';

interface ProposalCardProps {
  proposal: ProposalItem;
  onApprove: (proposalId: string) => void;
  onReject: (proposalId: string) => void;
}

export function ProposalCard({ proposal, onApprove, onReject }: ProposalCardProps) {
  const { t } = useTranslation();
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    const ttl = proposal.expires_in_seconds || 300;
    const elapsed = Math.floor((Date.now() - proposal.created_at) / 1000);
    return Math.max(0, ttl - elapsed);
  });

  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsRemaining]);

  const isExpired = secondsRemaining <= 0;
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  const diffString = proposal.diff
    ? JSON.stringify(proposal.diff, null, 2)
    : null;

  return (
    <div className={styles.proposalCard}>
      <div className={styles.proposalHeader}>
        <span className={styles.proposalTag}>{t('trip_agent.confirmation_required')}</span>
        <span className={styles.proposalTtl}>
          {isExpired ? t('trip_agent.expired') : t('trip_agent.expires_in', { time: timeFormatted })}
        </span>
      </div>

      <p className={styles.proposalSummary}>{proposal.summary}</p>

      {diffString && (
        <pre className={styles.proposalDiff}>{diffString}</pre>
      )}

      <div className={styles.proposalActions}>
        <button
          className={styles.rejectBtn}
          onClick={() => onReject(proposal.proposal_id)}
          disabled={isExpired}
        >
          {t('trip_agent.reject')}
        </button>
        <button
          className={styles.approveBtn}
          onClick={() => onApprove(proposal.proposal_id)}
          disabled={isExpired}
        >
          {t('trip_agent.approve_change')}
        </button>
      </div>
    </div>
  );
}
