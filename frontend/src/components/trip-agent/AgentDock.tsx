"use client";

import React, { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { WorkspaceContextData } from './types/agent';
import { useTripAgent } from './useTripAgent';
import { ContextChip } from './ContextChip';
import { ChangeToast } from './ChangeToast';
import { AgentComposer } from './AgentComposer';
import { AgentMessageList } from './AgentMessageList';
import { ModelSelectorPopover } from './ModelSelectorPopover';
import { fetchLlmConfigApi, updateLlmConfigApi, LLMConfigResponse } from '@/utils/api';
import { notify } from '@/utils/notify';
import styles from './AgentDock.module.css';

interface AgentDockProps {
  tripId?: string;
  uiContext?: WorkspaceContextData;
  onTripUpdated?: () => void;
}

export function AgentDock({ tripId, uiContext, onTripUpdated }: AgentDockProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [clearedContext, setClearedContext] = useState<WorkspaceContextData | null>(null);
  const activeContext = clearedContext === uiContext ? undefined : uiContext;
  const [llmInfo, setLlmInfo] = useState<{ provider: string; model: string } | null>(null);
  const [llmConfig, setLlmConfig] = useState<LLMConfigResponse | null>(null);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Load active engine and model for visual confirmation
  React.useEffect(() => {
    let active = true;
    fetchLlmConfigApi()
      .then((cfg) => {
        if (active && cfg) {
          setLlmConfig(cfg);
          const provName = cfg.supported_providers?.[cfg.provider]?.name || cfg.provider;
          setLlmInfo({ provider: provName, model: cfg.model });
        }
      })
      .catch(() => {
        // Fallback default
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSwitchEngine = async (provider: string, model: string) => {
    setSwitching(true);
    try {
      const res = await updateLlmConfigApi({ provider, model });
      if (res.status === 'success') {
        setLlmConfig((prev) => ({
          ...prev,
          ...res.config,
          supported_providers: res.config.supported_providers || prev?.supported_providers || {},
          configured_providers: res.config.configured_providers || prev?.configured_providers || {},
        }));
        const provName = res.config.supported_providers?.[res.config.provider]?.name || res.config.provider;
        setLlmInfo({ provider: provName, model: res.config.model });
        setIsSwitcherOpen(false);
        notify.success(t('trip_agent.engine_switched_title'), t('trip_agent.engine_switched_msg', { model, provider: provName }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('trip_agent.switch_failed_msg');
      notify.error(t('trip_agent.switch_failed_title'), msg);
    } finally {
      setSwitching(false);
    }
  };

  const {
    messages,
    isWorking,
    isConnected,
    lastChange,
    sendMessage,
    approveProposal,
    rejectProposal,
    cancelTurn,
    undoLastChange,
    clearHistory,
  } = useTripAgent({
    tripId: tripId || '',
    uiContext: activeContext,
    onTripUpdated,
  });

  const handleAddPoiFromChat = (poi: any) => {
    const dayStr = activeContext?.selected_day && activeContext.selected_day !== 'all' ? ` to Day ${activeContext.selected_day}` : '';
    sendMessage(`Add ${poi.name}${dayStr} to the itinerary`);
  };

  if (!tripId) return null;

  return (
    <>
      {/* Floating Pill Trigger */}
      {!isOpen && (
        <button
          className={styles.floatingTrigger}
          onClick={() => setIsOpen(true)}
          aria-label={t('trip_agent.open_agent_aria')}
          title={llmInfo ? t('trip_agent.active_engine_title', { provider: llmInfo.provider, model: llmInfo.model }) : t('trip_agent.trip_agent')}
        >
          <div className={styles.triggerIconWrap}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polygon points="12 8 8 16 12 14 16 16 12 8" />
            </svg>
            {isWorking && <span className={styles.pulseDot} />}
          </div>
          <span>{t('trip_agent.agent_badge')}</span>
          {llmInfo && (
            <span
              style={{
                fontSize: '10px',
                padding: '2px 7px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.18)',
                fontWeight: 600,
                letterSpacing: '0.02em',
                textTransform: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#7CC4D1' }} />
              {llmInfo.model.replace(':latest', '')}
            </span>
          )}
        </button>
      )}

      {/* Docked Chat Panel */}
      {isOpen && (
        <div className={styles.dockPanel} role="region" aria-label={t('trip_agent.panel_aria')}>
          {/* Header */}
          <div className={styles.dockHeader}>
            <div className={styles.headerLeft}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polygon points="12 8 8 16 12 14 16 16 12 8" />
              </svg>
              <div className={styles.titleArea}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <h3 className={styles.dockTitle}>{t('trip_agent.paladio_agent')}</h3>
                  <button
                    type="button"
                    onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
                    className={styles.engineSwitchBtn}
                    title={t('trip_agent.change_model_title')}
                  >
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                    <span>{llmInfo?.model.split(':')[0] || 'qwen2.5'}</span>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>
                <span className={styles.dockSubtitle}>
                  {isConnected ? (
                    llmInfo ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <span>{llmInfo.provider}</span>
                        <span style={{ opacity: 0.5 }}>/</span>
                        <strong style={{ color: '#E2E8F0', fontWeight: 600 }}>{llmInfo.model}</strong>
                      </span>
                    ) : (
                      t('trip_agent.local_sovereign_engine')
                    )
                  ) : (
                    t('trip_agent.connecting')
                  )}
                </span>
              </div>
            </div>

            <div className={styles.headerActions}>
              <button
                className={styles.iconBtn}
                onClick={clearHistory}
                title={t('trip_agent.clear_session_history')}
                aria-label={t('trip_agent.clear_session_history')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
              <button
                className={styles.iconBtn}
                onClick={() => setIsOpen(false)}
                title={t('trip_agent.close_agent')}
                aria-label={t('trip_agent.close_agent')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Modern Model Selector Popover */}
          <ModelSelectorPopover
            isOpen={isSwitcherOpen}
            onClose={() => setIsSwitcherOpen(false)}
            llmConfig={llmConfig}
            currentProvider={llmConfig?.provider || 'google_genai'}
            currentModel={llmConfig?.model || ''}
            onSelectModel={handleSwitchEngine}
            isSwitching={switching}
          />

          {/* Active Context Banner */}
          <ContextChip
            context={activeContext}
            onClear={() => setClearedContext(uiContext ?? null)}
          />

          {/* Applied Change Toast with Undo */}
          <ChangeToast
            change={lastChange}
            onUndo={undoLastChange}
            onDismiss={() => {}}
          />

          {/* Messages */}
          <AgentMessageList
            messages={messages}
            onApproveProposal={approveProposal}
            onRejectProposal={rejectProposal}
            onAddPoi={handleAddPoiFromChat}
            onSwitchModel={() => setIsSwitcherOpen(true)}
            onRetryTurn={(prompt) => sendMessage(prompt)}
          />

          {/* Composer */}
          <AgentComposer
            onSendMessage={sendMessage}
            onCancel={cancelTurn}
            isWorking={isWorking}
            disabled={!isConnected}
          />
        </div>
      )}
    </>
  );
}
