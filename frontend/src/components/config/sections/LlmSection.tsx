"use client";

import React from 'react';
import { LlmConfigCard } from '../LlmConfigCard';
import { SettingsHeader } from '../SettingsHeader';

interface LlmSectionProps {
  onBackToOverview: () => void;
}

export function LlmSection({ onBackToOverview }: LlmSectionProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <SettingsHeader
        title="AI & LLM Engine"
        onBackToOverview={onBackToOverview}
      />

      <LlmConfigCard />
    </div>
  );
}
