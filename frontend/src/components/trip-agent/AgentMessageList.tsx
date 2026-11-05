"use client";

import React, { useEffect, useRef } from 'react';
import { AgentChatMessage, ToolCallItem } from './types/agent';
import { ProposalCard } from './ProposalCard';
import styles from './AgentDock.module.css';

interface AgentMessageListProps {
  messages: AgentChatMessage[];
  onApproveProposal: (proposalId: string) => void;
  onRejectProposal: (proposalId: string) => void;
}

/**
 * Lightweight safe markdown renderer for chat bubbles
 */
function renderMarkdownContent(text: string) {
  if (!text) return null;

  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Basic bold parsing: **bold**
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const lineElements = parts.map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={pIdx}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });

    if (line.startsWith('- ') || line.startsWith('* ')) {
      return (
        <li key={i} style={{ marginLeft: '16px', listStyleType: 'disc' }}>
          {lineElements}
        </li>
      );
    }
    return (
      <div key={i} style={{ minHeight: line.trim() ? undefined : '8px' }}>
        {lineElements}
      </div>
    );
  });
}

export function AgentMessageList({
  messages,
  onApproveProposal,
  onRejectProposal,
}: AgentMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className={styles.messageListContainer} ref={scrollRef}>
        <div className={styles.emptyState}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0F4C5C" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <polygon points="12 8 8 16 12 14 16 16 12 8" />
          </svg>
          <div className={styles.emptyStateTitle}>Tactical Trip Agent</div>
          <p className={styles.emptyStateSub}>
            Sovereign local assistant connected to itinerary tools. Ask to optimize routes, reorder stops, budget checks, or use slash commands.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.messageListContainer} ref={scrollRef}>
      {messages.map((msg) => {
        const isAssistant = msg.role === 'assistant';
        const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return (
          <div
            key={msg.id}
            className={`${styles.messageBubble} ${isAssistant ? styles.assistantMessage : styles.userMessage}`}
          >
            {/* Tool Calls */}
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className={styles.toolChipsContainer}>
                {msg.toolCalls.map((tc: ToolCallItem) => (
                  <div
                    key={tc.call_id}
                    className={`${styles.toolChip} ${tc.status === 'running' ? styles.toolChipRunning : ''}`}
                  >
                    <span>
                      {tc.tool}
                      {tc.args && Object.keys(tc.args).length > 0
                        ? ` (${Object.keys(tc.args).slice(0, 2).join(', ')})`
                        : ''}
                    </span>
                    <span>
                      {tc.status === 'running' && '...'}
                      {tc.status === 'done' && '✓'}
                      {tc.status === 'error' && '✕'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Content & Thinking State */}
            <div style={{ wordBreak: 'break-word' }}>
              {isAssistant && msg.isStreaming && !msg.content ? (
                <div className={styles.thinkingIndicator}>
                  <div className={styles.thinkingDots}>
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                  </div>
                  <span className={styles.thinkingText}>Thinking...</span>
                </div>
              ) : (
                <>
                  {renderMarkdownContent(msg.content)}
                  {msg.isStreaming && <span className={styles.cursor} />}
                  {!msg.isStreaming && !msg.content && (!msg.toolCalls || msg.toolCalls.length === 0) && !msg.proposal && (
                    <span style={{ fontStyle: 'italic', opacity: 0.6 }}>No response generated.</span>
                  )}
                </>
              )}
            </div>

            {/* Proposal Card */}
            {msg.proposal && (
              <ProposalCard
                proposal={msg.proposal}
                onApprove={onApproveProposal}
                onReject={onRejectProposal}
              />
            )}

            {/* Timestamp */}
            <span className={styles.messageMeta}>{timeStr}</span>
          </div>
        );
      })}
    </div>
  );
}
