"use client";

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import styles from './AgentDock.module.css';

interface AgentComposerProps {
  onSendMessage: (message: string) => void;
  onCancel: () => void;
  isWorking: boolean;
  disabled?: boolean;
}

const QUICK_PROMPTS = [
  { labelKey: 'trip_agent.quick_optimize_day', prompt: 'Optimize the current day route for minimum walking time and open hours.' },
  { labelKey: 'trip_agent.quick_fit_budget', prompt: 'Review our stops and recommend cheaper alternatives to fit our budget.' },
  { labelKey: 'trip_agent.quick_fix_issues', prompt: 'Check our itinerary for opening hour conflicts and pacing issues, then propose fixes.' },
  { labelKey: 'trip_agent.quick_rainy_day', prompt: 'Suggest indoor cultural stops for a rainy day.' },
  { labelKey: 'trip_agent.quick_add_dinner', prompt: 'Find an authentic local dinner spot near our last stop and add it to our schedule.' },
];

export function AgentComposer({ onSendMessage, onCancel, isWorking, disabled }: AgentComposerProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isWorking || disabled) return;

    // Handle slash commands
    let finalMessage = trimmed;
    if (trimmed === '/optimize') {
      finalMessage = 'Optimize the route for the currently selected day.';
    } else if (trimmed === '/budget') {
      finalMessage = 'Analyze our budget and recommend stops to reduce overall cost.';
    } else if (trimmed === '/issues') {
      finalMessage = 'Validate the itinerary and report any timing or scheduling conflicts.';
    } else if (trimmed === '/undo') {
      finalMessage = 'Undo the last change made to the itinerary.';
    }

    onSendMessage(finalMessage);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.dockComposer}>
      <div className={styles.quickChipsRow}>
        {QUICK_PROMPTS.map((qp, idx) => (
          <button
            key={idx}
            type="button"
            className={styles.quickChip}
            onClick={() => onSendMessage(qp.prompt)}
            disabled={isWorking || disabled}
          >
            {t(qp.labelKey)}
          </button>
        ))}
      </div>

      <div className={styles.composerInputWrap}>
        <textarea
          ref={textareaRef}
          className={styles.composerTextarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isWorking ? t('trip_agent.agent_working') : t('trip_agent.ask_placeholder')}
          rows={1}
          disabled={disabled}
        />

        {isWorking ? (
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onCancel}
            title={t('trip_agent.cancel_generation')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={!text.trim() || disabled}
            title={t('trip_agent.send_message')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
