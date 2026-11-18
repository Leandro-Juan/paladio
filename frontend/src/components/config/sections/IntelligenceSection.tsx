"use client";

import React from 'react';
import { LlmConfigCard } from '../LlmConfigCard';
import { SettingsHeader } from '../SettingsHeader';

interface IntelligenceSectionProps {
  onBackToOverview: () => void;
  subTab?: 'llm';
  isAdmin?: boolean;
}

export function IntelligenceSection({
  onBackToOverview,
  subTab = 'llm',
  isAdmin = false,
}: IntelligenceSectionProps) {
  if (!isAdmin) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <SettingsHeader
        title="AI & Multi-Provider LLM Engine"
        onBackToOverview={onBackToOverview}
      />

      {subTab === 'llm' && <LlmConfigCard />}
    </div>
  );
}
