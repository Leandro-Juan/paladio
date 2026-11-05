"use client";

import React, { useState, useEffect } from 'react';
import { ProposalItem } from './types/agent';
import styles from './AgentDock.module.css';

interface ProposalCardProps {
  proposal: ProposalItem;
  onApprove: (proposalId: string) => void;
  onReject: (proposalId: string) => void;
}

export function ProposalCard({ proposal, onApprove, onReject }: ProposalCardProps) {
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
        <span className={styles.proposalTag}>Confirmation Required</span>
        <span className={styles.proposalTtl}>
          {isExpired ? 'Expired' : `Expires in ${timeFormatted}`}
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
          Reject
        </button>
        <button
          className={styles.approveBtn}
          onClick={() => onApprove(proposal.proposal_id)}
          disabled={isExpired}
        >
          Approve Change
        </button>
      </div>
    </div>
  );
}
