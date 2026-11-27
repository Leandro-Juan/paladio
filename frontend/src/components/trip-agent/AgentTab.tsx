"use client";

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { WorkspaceContextData } from './types/agent';
import { useTripAgent } from './useTripAgent';
import { ContextChip } from './ContextChip';
import { ChangeToast } from './ChangeToast';
import { AgentComposer } from './AgentComposer';
import { AgentMessageList } from './AgentMessageList';
import { AgentPoiItem } from './AgentPoiCards';
import { ModelSelectorPopover } from './ModelSelectorPopover';
import { fetchLlmConfigApi, updateLlmConfigApi, LLMConfigResponse } from '@/utils/api';
import { notify } from '@/utils/notify';
import { DemoFeatureGate } from '@/components/common/DemoFeatureGate';
import styles from './AgentTab.module.css';

export interface AgentTabProps {
  tripId: string;
  uiContext?: WorkspaceContextData;
  onTripUpdated?: () => void;
  onInspectPoi?: (poiId: string, fallbackData?: Record<string, unknown>) => void;
}

export function AgentTab({ tripId, uiContext, onTripUpdated, onInspectPoi }: AgentTabProps) {
  const { t } = useTranslation();
  const [clearedContext, setClearedContext] = useState<WorkspaceContextData | null>(null);
  const activeContext = clearedContext === uiContext ? undefined : uiContext;
  const [llmInfo, setLlmInfo] = useState<{ provider: string; model: string } | null>(null);
  const [llmConfig, setLlmConfig] = useState<LLMConfigResponse | null>(null);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Load active engine and model
  useEffect(() => {
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
        // Fallback
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
    tripId,
    uiContext: activeContext,
    onTripUpdated,
  });

  const handleAddPoiFromChat = (poi: AgentPoiItem) => {
    const dayStr = activeContext?.selected_day && activeContext.selected_day !== 'all' ? ` to Day ${activeContext.selected_day}` : '';
    sendMessage(`Add ${poi.name}${dayStr} to the itinerary`);
  };

  return (
    <DemoFeatureGate
      message={t('demo.locked_trip_agent')}
      borderRadius="12px"
      style={{ height: '100%' }}
    >
      <div className={styles.agentTabContainer}>
      {/* Top Status & Controls Bar */}
      <div className={styles.agentTabBar}>
        <div className={styles.agentTitleGroup}>
          <div className={styles.agentIconBadge}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="12 8 8 16 12 14 16 16 12 8" />
            </svg>
          </div>

          <div className={styles.agentHeading}>
            <span className={styles.agentName}>{t('trip_agent.paladio_agent')}</span>
            <span className={styles.connectionStatus}>
              {isConnected ? (
                <span className={styles.statusOnline}>
                  <span className={styles.statusDot} />
                  {t('trip_agent.connected')}
                </span>
              ) : (
                <span className={styles.statusConnecting}>
                  <span className={styles.statusDotOrange} />
                  {t('trip_agent.connecting')}
                </span>
              )}
            </span>
          </div>
        </div>

        <div className={styles.agentActionsGroup}>
          {/* Engine Selector Pill */}
          <button
            type="button"
            onClick={() => setIsSwitcherOpen(true)}
            className={styles.enginePillBtn}
            title={t('trip_agent.switch_model_family')}
            data-testid="agent-model-selector-btn"
          >
            <span className={styles.engineModelText}>
              {llmInfo?.model.split(':')[0] || 'qwen2.5'}
            </span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Clear Session History */}
          <button
            type="button"
            className={styles.iconActionBtn}
            onClick={clearHistory}
            title={t('trip_agent.clear_chat_history')}
            aria-label={t('trip_agent.clear_chat_history')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Modern Model Selector Popover */}
      <ModelSelectorPopover
        isOpen={isSwitcherOpen}
        onClose={() => setIsSwitcherOpen(false)}
        llmConfig={llmConfig}
        currentProvider={llmConfig?.provider || ''}
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

      {/* Messages Stream */}
      <div className={styles.messageListWrap}>
        <AgentMessageList
          messages={messages}
          onApproveProposal={approveProposal}
          onRejectProposal={rejectProposal}
          onAddPoi={handleAddPoiFromChat}
          onInspectPoi={onInspectPoi}
          onSwitchModel={() => setIsSwitcherOpen(true)}
          onRetryTurn={(prompt) => sendMessage(prompt)}
        />
      </div>

      {/* Fixed Composer at Bottom */}
      <div className={styles.composerWrap}>
        <AgentComposer
          onSendMessage={sendMessage}
          onCancel={cancelTurn}
          isWorking={isWorking}
          disabled={!isConnected}
        />
      </div>
    </div>
    </DemoFeatureGate>
  );
}
