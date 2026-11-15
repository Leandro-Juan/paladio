"use client";

import React, { useState, useEffect } from 'react';
import { LlmConfigCard } from '../LlmConfigCard';
import { SettingsHeader } from '../SettingsHeader';
import { SettingsCardFrame } from '../SettingsCardFrame';
import { TacticalToggle } from '../TacticalToggle';
import {
  fetchDomainSettingsApi,
  updateDomainSettingsApi,
  fetchTasteProfileApi,
  resetTasteProfileApi,
  SwarmConfigData,
  TasteAffinityItem,
} from '@/utils/api';
import { notify } from '@/utils/notify';

interface IntelligenceSectionProps {
  onBackToOverview: () => void;
  subTab?: 'llm' | 'swarm' | 'memory';
  isAdmin?: boolean;
}

export function IntelligenceSection({
  onBackToOverview,
  subTab = 'llm',
  isAdmin = true,
}: IntelligenceSectionProps) {
  // Swarm config state
  const [swarmConfig, setSwarmConfig] = useState<SwarmConfigData>({
    critic_strictness: 0.75,
    thinking_token_budget: 2048,
    auto_ticket_ingestion: true,
    require_human_approval_on_repair: false,
  });

  // Taste profile state
  const [tasteActive, setTasteActive] = useState(false);
  const [tasteDimensions, setTasteDimensions] = useState(0);
  const [tasteAffinities, setTasteAffinities] = useState<TasteAffinityItem[]>([]);
  const [tasteLoaded, setTasteLoaded] = useState(false);
  const tasteLoading = subTab === 'memory' && !tasteLoaded;

  useEffect(() => {
    let mounted = true;
    fetchDomainSettingsApi<SwarmConfigData>('swarm')
      .then((res) => {
        if (mounted && res.config) {
          setSwarmConfig(res.config);
        }
      })
      .catch(() => {
        // Fallback to defaults
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (subTab !== 'memory') return;
    let mounted = true;
    fetchTasteProfileApi()
      .then((res) => {
        if (!mounted) return;
        setTasteActive(Boolean(res.active));
        setTasteDimensions(res.dimensions || 0);
        setTasteAffinities(res.affinities || []);
      })
      .catch(() => {
        if (mounted) {
          setTasteActive(false);
          setTasteAffinities([]);
        }
      })
      .finally(() => {
        if (mounted) setTasteLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, [subTab]);

  const handleUpdateSwarm = async (patch: Partial<SwarmConfigData>) => {
    if (!isAdmin) {
      notify.error('Admin Required', 'Administrator privileges are required to update swarm settings.');
      return;
    }
    const previous = swarmConfig;
    const updated = { ...swarmConfig, ...patch };
    setSwarmConfig(updated);
    try {
      const res = await updateDomainSettingsApi<SwarmConfigData>('swarm', patch);
      if (res.config) {
        setSwarmConfig(res.config);
      }
      notify.success('Swarm Updated', 'Swarm intelligence configuration updated');
    } catch {
      setSwarmConfig(previous);
      notify.error('Swarm Error', 'Failed to update swarm settings');
    }
  };

  const handleResetTaste = async () => {
    try {
      const res = await resetTasteProfileApi();
      setTasteActive(Boolean(res.active));
      setTasteDimensions(res.dimensions || 0);
      setTasteAffinities(res.affinities || []);
      notify.info('Taste Memory Reset', 'Taste profile vector reset to neutral prior.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset taste profile';
      notify.error('Reset Failed', msg);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <SettingsHeader
        title={
          subTab === 'swarm'
            ? 'LangGraph Swarm Agents & Critic'
            : subTab === 'memory'
            ? 'Continuous ML Taste Learning'
            : 'AI & Multi-Provider LLM Engine'
        }
        onBackToOverview={onBackToOverview}
      />

      {/* 1. Multi-Provider LLM Configuration */}
      {subTab === 'llm' && <LlmConfigCard />}

      {/* 2. Swarm Agents & Critic */}
      {subTab === 'swarm' && (
        <SettingsCardFrame
          title="LangGraph Multi-Agent Swarm & Critic"
          subtitle="Configure agent reasoning thresholds, reflection passes, and human-in-the-loop checkpoints"
          badge={`Strictness: ${Math.round(swarmConfig.critic_strictness * 100)}%`}
          badgeTone="teal"
          innerTitle="Active Critic Evaluation Gate"
          innerBadge={`${swarmConfig.thinking_token_budget} tokens`}
          menuItems={[
            {
              id: 'reset_swarm',
              label: 'Reset to Balanced Strictness (75%)',
              onClick: () =>
                handleUpdateSwarm({
                  critic_strictness: 0.75,
                  thinking_token_budget: 2048,
                  auto_ticket_ingestion: true,
                  require_human_approval_on_repair: false,
                }),
            },
          ]}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {!isAdmin && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-bg-main)',
                  fontSize: '12px',
                  color: 'var(--color-text-muted)',
                }}
              >
                Read-only preview: administrator privileges are required to modify swarm thresholds.
              </div>
            )}

            {/* Critic Strictness Slider */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Critic Evaluation Strictness: {Math.round(swarmConfig.critic_strictness * 100)}%
                </span>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                  Confidence threshold before an itinerary route is approved by the Critic Agent
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="range"
                  min="0.5"
                  max="0.95"
                  step="0.05"
                  disabled={!isAdmin}
                  value={swarmConfig.critic_strictness}
                  onChange={(e) => handleUpdateSwarm({ critic_strictness: parseFloat(e.target.value) })}
                  aria-label="Critic evaluation strictness"
                  style={{ width: '160px', accentColor: 'var(--color-accent-teal, #2A8C82)' }}
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, minWidth: '40px', textAlign: 'right' }}>
                  {Math.round(swarmConfig.critic_strictness * 100)}%
                </span>
              </div>
            </div>

            {/* Extended Thinking Token Budget */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Extended Thinking Token Budget: {swarmConfig.thinking_token_budget} Tokens
                </span>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                  Reasoning allocation for deep constraint analysis and multi-day itinerary synthesis
                </p>
              </div>
              <select
                disabled={!isAdmin}
                value={swarmConfig.thinking_token_budget}
                onChange={(e) => handleUpdateSwarm({ thinking_token_budget: parseInt(e.target.value, 10) })}
                aria-label="Extended thinking token budget"
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface-card)',
                  color: 'var(--color-text-primary)',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                <option value={1024}>1,024 tokens (Fast)</option>
                <option value={2048}>2,048 tokens (Balanced)</option>
                <option value={4096}>4,096 tokens (Deep Reasoning)</option>
                <option value={8192}>8,192 tokens (Exhaustive)</option>
              </select>
            </div>

            {/* Auto Ticket Ingestion */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Automatic Ticket Parser Ingestion
                </span>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                  Automatically trigger ticket parser agent when flight passes or rail tickets are uploaded
                </p>
              </div>
              <TacticalToggle
                checked={swarmConfig.auto_ticket_ingestion}
                onChange={(checked) => handleUpdateSwarm({ auto_ticket_ingestion: checked })}
                disabled={!isAdmin}
                tone="teal"
                ariaLabel="Toggle automatic ticket ingestion"
              />
            </div>

            {/* Human-in-the-loop Repair Approval */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Require Human Approval on Swarm Repair
                </span>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                  Pause swarm execution and request explicit approval before applying Critic repair edits
                </p>
              </div>
              <TacticalToggle
                checked={swarmConfig.require_human_approval_on_repair}
                onChange={(checked) => handleUpdateSwarm({ require_human_approval_on_repair: checked })}
                disabled={!isAdmin}
                tone="coral"
                ariaLabel="Toggle human approval on swarm repair"
              />
            </div>
          </div>
        </SettingsCardFrame>
      )}

      {/* 3. ML Taste Learning & RAG */}
      {subTab === 'memory' && (
        <SettingsCardFrame
          title="Continuous ML Taste Learning & RAG"
          subtitle="16-D POI feature tensor weight learning, affinity drift rates, and sovereign vector memory"
          badge={tasteActive ? 'VECTOR ACTIVE' : 'NEUTRAL PRIOR'}
          badgeTone="gold"
          innerTitle="Active Semantic Profile Vector"
          innerBadge={tasteDimensions > 0 ? `Normalized ${tasteDimensions}-D` : 'Uninitialized'}
          menuItems={[
            {
              id: 'reset_memory',
              label: 'Reset Taste Learning Vector to Neutral Prior',
              onClick: handleResetTaste,
            },
          ]}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.5 }}>
              Paladio learns your travel tastes organically as you approve, swap, or reject POIs.
              Your sovereign user embedding shifts category affinities dynamically without cloud telemetry or third-party tracking.
            </p>
            {tasteLoading ? (
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                Loading semantic taste vector...
              </span>
            ) : tasteAffinities.length > 0 ? (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', paddingTop: '8px' }}>
                {tasteAffinities.map((aff) => (
                  <span
                    key={aff.category}
                    style={{
                      fontSize: '11px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--color-surface-card)',
                      border: '1px solid var(--color-border)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {aff.category}: {aff.score.toFixed(2)}
                  </span>
                ))}
              </div>
            ) : (
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--color-text-muted)',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px dashed var(--color-border)',
                  backgroundColor: 'var(--color-bg-main)',
                }}
              >
                No taste interactions recorded yet — affinities populate dynamically as you approve or swap POIs.
              </div>
            )}
          </div>
        </SettingsCardFrame>
      )}
    </div>
  );
}
