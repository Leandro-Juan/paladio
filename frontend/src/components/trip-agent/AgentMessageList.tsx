"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { translate } from '@/stores/localeStore';
import { AgentChatMessage, ToolCallItem } from './types/agent';
import { ProposalCard } from './ProposalCard';
import { AgentPoiCards, AgentPoiItem } from './AgentPoiCards';
import { AgentErrorCard } from './AgentErrorCard';
import { parseAgentError } from './errorParser';
import styles from './AgentDock.module.css';

interface AgentMessageListProps {
  messages: AgentChatMessage[];
  onApproveProposal: (proposalId: string) => void;
  onRejectProposal: (proposalId: string) => void;
  onAddPoi?: (poi: AgentPoiItem) => void;
  onInspectPoi?: (poiId: string, fallbackData?: Record<string, unknown>) => void;
  onSwitchModel?: () => void;
  onRetryTurn?: (userPrompt: string) => void;
}

/**
 * Derives a clean, dynamic tactical action description while the agent is thinking
 */
function getToolActionDescription(
  tool: string,
  args: Record<string, unknown> | undefined,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const query = (args?.query || args?.q) as string | undefined;
  const category = args?.category as string | undefined;
  const day = args?.day as number | string | undefined;
  const city = args?.city as string | undefined;
  const name = (args?.poi_name || args?.name) as string | undefined;

  switch (tool) {
    case 'search_pois':
      if (query && category) return t('trip_agent.tool_search_pois_query_cat', { query, category });
      if (query) return t('trip_agent.tool_search_pois_query', { query });
      if (category) return t('trip_agent.tool_search_pois_cat', { category });
      return t('trip_agent.tool_search_pois');
    case 'search_places':
      if (query && city) return t('trip_agent.tool_search_places_query_city', { query, city });
      if (query) return t('trip_agent.tool_search_places_query', { query });
      return t('trip_agent.tool_search_places');
    case 'find_nearby':
      if (query) return t('trip_agent.tool_find_nearby_query', { query });
      return t('trip_agent.tool_find_nearby');
    case 'suggest_additions':
      if (day) return t('trip_agent.tool_suggest_additions_day', { day });
      return t('trip_agent.tool_suggest_additions');
    case 'get_poi_details':
      if (name) return t('trip_agent.tool_get_poi_details_name', { name });
      return t('trip_agent.tool_get_poi_details');
    case 'optimize_day':
      if (day) return t('trip_agent.tool_optimize_day_num', { day });
      return t('trip_agent.tool_optimize_day');
    case 'optimize_all_days':
      return t('trip_agent.tool_optimize_all_days');
    case 'reorder_stops':
      return t('trip_agent.tool_reorder_stops');
    case 'add_stop':
    case 'add_poi':
      return t('trip_agent.tool_add_stop');
    case 'remove_stop':
      return t('trip_agent.tool_remove_stop');
    case 'list_expenses':
      return t('trip_agent.tool_list_expenses');
    case 'add_expense':
      return t('trip_agent.tool_add_expense');
    case 'convert_currency':
      return t('trip_agent.tool_convert_currency');
    case 'check_schedule_conflicts':
      return t('trip_agent.tool_check_conflicts');
    default:
      return t('trip_agent.tool_running_generic', { tool: tool.replace(/_/g, ' ') });
  }
}

/**
 * Extracts and aggregates all POIs/places returned by any tool calls in a message
 */
function extractPoisFromMessage(msg: AgentChatMessage): { pois: AgentPoiItem[]; tool?: string; city?: string } {
  if (!msg.toolCalls || msg.toolCalls.length === 0) return { pois: [] };
  const collected: AgentPoiItem[] = [];
  const seen = new Set<string>();
  let primaryTool: string | undefined;
  let city: string | undefined;

  for (const tc of msg.toolCalls) {
    const rawList = tc.data?.pois || tc.data?.places || tc.data?.nearby || tc.data?.suggestions || tc.data?.results || tc.data?.items;
    if (!rawList || !Array.isArray(rawList)) continue;

    if (!primaryTool && rawList.length > 0) {
      primaryTool = tc.tool;
    }
    if (!city && tc.data?.city) {
      city = tc.data.city;
    }

    for (const item of rawList) {
      const lat = typeof item.lat === 'number' ? item.lat : (item.coordinates?.lat ?? item.latitude);
      const lng = typeof item.lng === 'number' ? item.lng : (item.coordinates?.lng ?? item.longitude);
      const id = String(item.poi_id || item.id || item.osm_id || item.name || '').trim();
      const normKey = (item.name || id).trim().toLowerCase();
      if (!normKey || seen.has(normKey)) continue;
      seen.add(normKey);

      collected.push({
        poi_id: id || normKey,
        id: id || normKey,
        name: item.name || translate('trip_agent.unnamed_place'),
        category: item.category || (item.type ? String(item.type) : 'attraction'),
        coordinates: (typeof lat === 'number' && typeof lng === 'number') ? { lat, lng } : undefined,
        lat,
        lng,
        price: item.price ?? item.cost_eur ?? 0,
        cost_eur: item.cost_eur ?? item.price ?? 0,
        duration_mins: item.duration_mins || 60,
        score: item.score,
        rating: item.rating ?? item.stars ?? null,
        photo_url: item.photo_url || item.image || item.photos?.[0]?.url || null,
        description: item.description || item.display_name || item.address || null,
        neighborhood: item.neighborhood || item.city || city || null,
        opening_hours: item.opening_hours || null,
      });
    }
  }
  return { pois: collected, tool: primaryTool, city };
}

/**
 * Collapsible modern disclosure for executed tool calls (inspired by modern LLM interfaces)
 */
function ToolExecutionDisclosure({ toolCalls }: { toolCalls: ToolCallItem[] }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  if (!toolCalls || toolCalls.length === 0) return null;

  const count = toolCalls.length;
  const runningCount = toolCalls.filter((tc) => tc.status === 'running').length;

  return (
    <div className={styles.toolDisclosureContainer}>
      <button
        type="button"
        className={styles.toolDisclosureToggle}
        onClick={() => setIsOpen((prev) => !prev)}
        title={t('trip_agent.toggle_tool_details')}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <span>
          {runningCount > 0
            ? t('trip_agent.working_actions', { count: runningCount })
            : count === 1
            ? t('trip_agent.thought_process_one')
            : t('trip_agent.thought_process_many', { count })}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.18s ease' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className={styles.toolDisclosurePanel}>
          {toolCalls.map((tc) => (
            <div key={tc.call_id} className={styles.toolDisclosureItem}>
              <span className={styles.toolItemName}>
                <span>{tc.tool}</span>
                {tc.args && Object.keys(tc.args).length > 0 && (
                  <span style={{ opacity: 0.65 }}>({Object.keys(tc.args).slice(0, 2).join(', ')})</span>
                )}
                {tc.summary && <span style={{ opacity: 0.8 }}>— {tc.summary}</span>}
              </span>
              <span className={`${styles.toolItemStatus} ${tc.status === 'done' ? styles.toolSuccess : tc.status === 'error' ? styles.toolError : styles.toolRunning}`}>
                {tc.status === 'done' && '✓'}
                {tc.status === 'error' && '✕'}
                {tc.status === 'running' && '...'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Lightweight safe markdown renderer for chat bubbles with interactive POI focus links.
 * Handles bold, italics, bold-italics, labels, bullets, numbered lists, and auto-discovers POIs.
 */
export function renderMarkdownContent(
  text: string,
  pois?: AgentPoiItem[],
  onInspectPoi?: (poiId: string, fallbackData?: Record<string, unknown>) => void
) {
  if (!text) return null;

  // Build a lookup map of known POIs by lowercase name
  const poiLookup = new Map<string, AgentPoiItem>();
  if (pois && pois.length > 0) {
    for (const p of pois) {
      if (p.name) {
        poiLookup.set(p.name.trim().toLowerCase(), p);
      }
    }
  }

  const findMatchingPoi = (str: string): AgentPoiItem | undefined => {
    if (!str || poiLookup.size === 0) return undefined;
    const clean = str.trim().toLowerCase();
    if (poiLookup.has(clean)) return poiLookup.get(clean);
    if (clean.length >= 4) {
      for (const [name, poi] of poiLookup.entries()) {
        if (clean.includes(name) || name.includes(clean)) {
          return poi;
        }
      }
    }
    return undefined;
  };

  const renderPoiChip = (name: string, poi: AgentPoiItem, key: string | number) => {
    if (!onInspectPoi) {
      return (
        <strong key={key} className={styles.mdBold}>
          {name}
        </strong>
      );
    }
    return (
      <button
        key={key}
        type="button"
        className={styles.inlinePoiChip}
        onClick={() =>
          onInspectPoi(poi.poi_id || poi.name, {
            id: poi.poi_id || poi.name,
            name: poi.name,
            category: poi.category,
            lat: poi.lat ?? poi.coordinates?.lat,
            lng: poi.lng ?? poi.coordinates?.lng,
            price: poi.price ?? poi.cost_eur,
            rating: poi.rating,
            description: poi.description,
            photo_url: poi.photo_url,
          })
        }
        title={translate('trip_agent.focus_poi_on_map', { name: poi.name })}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
        </svg>
        <strong>{name}</strong>
      </button>
    );
  };

  // Helper to parse inline tokens within a string (bold, italic, code, POI matches)
  const parseInlineTokens = (rawText: string, linePrefix: string | number): React.ReactNode[] => {
    if (!rawText) return [];

    // Clean stray trailing asterisk after colons (e.g. "Location:*" -> "Location:")
    let sanitized = rawText.replace(/(\b[A-Za-z0-9_'\s]{1,30}:)\*/g, '$1');
    // Clean any stray literal bullet in inline text
    sanitized = sanitized.replace(/^•\s*/, '');

    // Tokenizer regex matching code, bold-italic, bold, italic
    const TOKEN_REGEX = /(`[^`]+`|\*\*\*[^*]+\*\*\*|___[^_]+___|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;
    const parts = sanitized.split(TOKEN_REGEX);

    return parts.map((part, pIdx) => {
      const tokenKey = `${linePrefix}_t_${pIdx}`;
      if (!part) return null;

      // Inline code `...`
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return (
          <code key={tokenKey} className={styles.inlineCode}>
            {part.slice(1, -1)}
          </code>
        );
      }

      // Bold-Italic ***...*** or ___...___
      if (
        (part.startsWith('***') && part.endsWith('***') && part.length >= 6) ||
        (part.startsWith('___') && part.endsWith('___') && part.length >= 6)
      ) {
        const inner = part.slice(3, -3);
        const matchedPoi = findMatchingPoi(inner);
        if (matchedPoi) return renderPoiChip(inner, matchedPoi, tokenKey);
        return (
          <strong key={tokenKey} className={styles.mdBold}>
            <em className={styles.mdItalic}>{inner}</em>
          </strong>
        );
      }

      // Bold **...** or __...__
      if (
        (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
        (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
      ) {
        const inner = part.slice(2, -2);
        const matchedPoi = findMatchingPoi(inner);
        if (matchedPoi) return renderPoiChip(inner, matchedPoi, tokenKey);

        if (inner.endsWith(':')) {
          return (
            <strong key={tokenKey} className={styles.mdLabel}>
              {inner}
            </strong>
          );
        }
        return (
          <strong key={tokenKey} className={styles.mdBold}>
            {inner}
          </strong>
        );
      }

      // Italic *...* or _..._
      if (
        (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
        (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
      ) {
        const inner = part.slice(1, -1);
        // If italic ends with a colon, it was intended as an attribute label (e.g. *Location:* or *Why it's great:*)
        if (inner.endsWith(':')) {
          return (
            <strong key={tokenKey} className={styles.mdLabel}>
              {inner}
            </strong>
          );
        }
        const matchedPoi = findMatchingPoi(inner);
        if (matchedPoi) return renderPoiChip(inner, matchedPoi, tokenKey);
        return (
          <em key={tokenKey} className={styles.mdItalic}>
            {inner}
          </em>
        );
      }

      // Plain text chunk: check for leading section labels
      const labelMatch = part.match(/^([A-Za-z0-9_'\s]{2,25}:)(\s+|$)/);
      if (labelMatch) {
        const labelText = labelMatch[1];
        const remainder = part.slice(labelText.length);
        return (
          <React.Fragment key={tokenKey}>
            <strong className={styles.mdLabel}>{labelText}</strong>
            {remainder}
          </React.Fragment>
        );
      }

      // Check if any POI name is in this plain text segment
      if (poiLookup.size > 0 && part.trim().length > 3) {
        for (const [name, poi] of poiLookup.entries()) {
          const lowerPart = part.toLowerCase();
          const startIdx = lowerPart.indexOf(name);
          if (startIdx !== -1 && name.length >= 4) {
            const before = part.slice(0, startIdx);
            const poiOriginalName = part.slice(startIdx, startIdx + name.length);
            const after = part.slice(startIdx + name.length);
            return (
              <React.Fragment key={tokenKey}>
                {before}
                {renderPoiChip(poiOriginalName, poi, `${tokenKey}_p`)}
                {after}
              </React.Fragment>
            );
          }
        }
      }

      return <React.Fragment key={tokenKey}>{part}</React.Fragment>;
    });
  };

  const lines = text.split('\n');
  return lines.map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return <div key={i} style={{ minHeight: '8px' }} />;
    }

    // Numbered list item: e.g. "1. Place Name" or "  2.  Tokyo Ramen"
    const numberMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numberMatch) {
      const num = numberMatch[2];
      const content = numberMatch[3];
      return (
        <div key={i} className={styles.numberedItem}>
          <span className={styles.listNum}>{num}.</span>
          <div style={{ flex: 1 }}>{parseInlineTokens(content, i)}</div>
        </div>
      );
    }

    // Bullet list item: e.g. "- Item", "* Item", "• Item", "+ Item"
    const bulletMatch = line.match(/^(\s*)[*\-•+◦]\s*(.*)$/);
    if (bulletMatch) {
      const content = bulletMatch[2];
      return (
        <div key={i} className={styles.bulletItem}>
          <span className={styles.bulletDisc} />
          <div style={{ flex: 1 }}>{parseInlineTokens(content, i)}</div>
        </div>
      );
    }

    // Plain line
    return (
      <div key={i} style={{ minHeight: '1.4em', margin: '2px 0' }}>
        {parseInlineTokens(line, i)}
      </div>
    );
  });
}

export function AgentMessageList({
  messages,
  onApproveProposal,
  onRejectProposal,
  onAddPoi,
  onInspectPoi,
  onSwitchModel,
  onRetryTurn,
}: AgentMessageListProps) {
  const { t, locale } = useTranslation();
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
          <div className={styles.emptyStateTitle}>{t('trip_agent.empty_title')}</div>
          <p className={styles.emptyStateSub}>
            {t('trip_agent.empty_desc')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.messageListContainer} ref={scrollRef}>
      {messages.map((msg, index) => {
        const isAssistant = msg.role === 'assistant';
        const timeStr = new Date(msg.timestamp).toLocaleTimeString(locale === 'en' ? undefined : locale, { hour: '2-digit', minute: '2-digit' });
        const discovered = isAssistant ? extractPoisFromMessage(msg) : { pois: [] };

        // Determine real-time thinking status text
        const runningTool = msg.toolCalls?.findLast((tc) => tc.status === 'running');
        const lastTool = msg.toolCalls?.at(-1);
        const activeTool = runningTool || (lastTool && !msg.content ? lastTool : undefined);
        const thinkingText = activeTool
          ? getToolActionDescription(activeTool.tool, activeTool.args, t)
          : t('trip_agent.thinking');

        // Check for structured error or legacy raw error text
        const isRawError =
          isAssistant &&
          (msg.content.startsWith('⚠️') ||
            msg.content.includes('status_code: 403') ||
            msg.content.includes('Access denied. Please check your network settings.'));
        const effectiveError = msg.error || (isRawError ? parseAgentError(msg.content) : undefined);
        const displayContent = isRawError ? '' : msg.content;

        // Find the last user message prompt preceding this message for 1-click retry
        const priorUserPrompt = messages
          .slice(0, index)
          .findLast((m) => m.role === 'user')?.content ||
          messages.findLast((m) => m.role === 'user')?.content;

        const handleRetry = onRetryTurn && priorUserPrompt
          ? () => onRetryTurn(priorUserPrompt)
          : undefined;

        return (
          <div
            key={msg.id}
            className={`${styles.messageBubble} ${isAssistant ? styles.assistantMessage : styles.userMessage}`}
          >
            {/* Thinking State: Dynamic text describing what the model is currently executing */}
            {isAssistant && msg.isStreaming && !msg.content && !effectiveError ? (
              <div className={styles.thinkingIndicator}>
                <div className={styles.thinkingDots}>
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                </div>
                <span className={styles.thinkingText}>{thinkingText}</span>
              </div>
            ) : (
              <>
                {/* Collapsed Tool Execution Disclosure once response has arrived/completed */}
                {isAssistant && msg.toolCalls && msg.toolCalls.length > 0 && (
                  <ToolExecutionDisclosure toolCalls={msg.toolCalls} />
                )}

                {/* Content with interactive POI highlighting */}
                {displayContent && (
                  <div style={{ wordBreak: 'break-word' }}>
                    {renderMarkdownContent(displayContent, discovered.pois, onInspectPoi)}
                    {msg.isStreaming && <span className={styles.cursor} />}
                  </div>
                )}

                {/* Structured Visual Error Card (strictly no emojis) */}
                {effectiveError && (
                  <AgentErrorCard
                    error={effectiveError}
                    onSwitchModel={onSwitchModel}
                    onRetry={handleRetry}
                  />
                )}

                {!msg.isStreaming &&
                  !displayContent &&
                  !effectiveError &&
                  (!msg.toolCalls || msg.toolCalls.length === 0) &&
                  !msg.proposal && (
                    <span style={{ fontStyle: 'italic', opacity: 0.6 }}>{t('trip_agent.no_response_generated')}</span>
                  )}

                {/* Discovered POIs Interactive Deck */}
                {discovered.pois.length > 0 && (
                  <AgentPoiCards
                    pois={discovered.pois}
                    city={discovered.city}
                    tool={discovered.tool}
                    onAddPoi={onAddPoi}
                    onInspectPoi={onInspectPoi}
                  />
                )}

                {/* Proposal Card */}
                {msg.proposal && (
                  <ProposalCard
                    proposal={msg.proposal}
                    onApprove={onApproveProposal}
                    onReject={onRejectProposal}
                  />
                )}
              </>
            )}

            {/* Timestamp */}
            <span className={styles.messageMeta}>{timeStr}</span>
          </div>
        );
      })}
    </div>
  );
}
