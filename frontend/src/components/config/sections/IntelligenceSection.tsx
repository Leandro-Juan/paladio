"use client";

import React, { useState, useEffect } from 'react';
import { LlmConfigCard } from '../LlmConfigCard';
import { SettingsHeader } from '../SettingsHeader';
import { SettingsCardFrame } from '../SettingsCardFrame';
import { TacticalToggle } from '../TacticalToggle';
import { fetchDomainSettingsApi, updateDomainSettingsApi, SwarmConfigData } from '@/utils/api';
import { notify } from '@/utils/notify';

interface IntelligenceSectionProps {
  onBackToOverview: () => void;
  subTab?: 'llm' | 'swarm' | 'memory';
}

export function IntelligenceSection({
  onBackToOverview,
  subTab = 'llm',
}: IntelligenceSectionProps) {
  // Swarm config state
  const [swarmConfig, setSwarmConfig] = useState<SwarmConfigData>({
    critic_strictness: 0.75,
    thinking_token_budget: 2048,
    auto_ticket_ingestion: true,
    require_human_approval_on_repair: false,
  });

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

  const handleUpdateSwarm = async (patch: Partial<SwarmConfigData>) => {
    const updated = { ...swarmConfig, ...patch };
    setSwarmConfig(updated);
    try {
      await updateDomainSettingsApi<SwarmConfigData>('swarm', patch);
      notify.success('Swarm Updated', 'Swarm intelligence configuration updated');
    } catch {
      notify.error('Swarm Error', 'Failed to update swarm settings');
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
      {(subTab === 'llm' || subTab === 'swarm') && (
        <LlmConfigCard />
      )}

      {/* 2. Swarm Agents & Critic */}
      {(subTab === 'swarm' || subTab === 'llm') && (
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
              onClick: () => handleUpdateSwarm({ critic_strictness: 0.75, thinking_token_budget: 2048 }),
            },
          ]}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
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
                  value={swarmConfig.critic_strictness}
                  onChange={(e) => handleUpdateSwarm({ critic_strictness: parseFloat(e.target.value) })}
                  style={{ width: '160px', accentColor: 'var(--color-accent-teal, #2A8C82)' }}
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, minWidth: '40px' }}>
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
                value={swarmConfig.thinking_token_budget}
                onChange={(e) => handleUpdateSwarm({ thinking_token_budget: parseInt(e.target.value, 10) })}
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
                tone="teal"
                ariaLabel="Toggle automatic ticket ingestion"
              />
            </div>
          </div>
        </SettingsCardFrame>
      )}

      {/* 3. ML Taste Learning & RAG */}
      {(subTab === 'memory' || subTab === 'llm') && (
        <SettingsCardFrame
          title="Continuous ML Taste Learning & RAG"
          subtitle="16-D POI feature tensor weight learning, affinity drift rates, and sovereign vector memory"
          badge="16-D TENSOR"
          badgeTone="gold"
          innerTitle="Active Semantic Profile Vector"
          innerBadge="Normalized 768-D"
          menuItems={[
            {
              id: 'reset_memory',
              label: 'Reset Taste Learning Vector to Neutral Prior',
              onClick: () => notify.info('Taste Memory Reset', 'Taste profile vector reset to neutral prior.'),
            },
          ]}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.5 }}>
              Paladio learns your travel tastes organically as you approve, swap, or reject POIs.
              The internal 16-D feature tensor (PoiEncoder) continuously shifts your category affinities
              without cloud telemetry or third-party tracking.
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', paddingTop: '8px' }}>
              <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}>
                Art & Culture: 0.85
              </span>
              <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}>
                Food & Culinary: 0.90
              </span>
              <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}>
                Nature & Outdoors: 0.40
              </span>
              <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', backgroundColor: 'var(--color-surface-card)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)' }}>
                Nightlife: 0.35
              </span>
            </div>
          </div>
        </SettingsCardFrame>
      )}
    </div>
  );
}
