"use client";

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { LlmConfigCard } from '../LlmConfigCard';
import { SettingsHeader } from '../SettingsHeader';
import { DemoFeatureGate } from '@/components/common/DemoFeatureGate';

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
  const { t } = useTranslation();

  if (!isAdmin) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <SettingsHeader
        title={t('config.llm_header_title')}
        onBackToOverview={onBackToOverview}
      />

      {subTab === 'llm' && (
        <DemoFeatureGate message={t('demo.locked_llm')} borderRadius="14px">
          <LlmConfigCard />
        </DemoFeatureGate>
      )}
    </div>
  );
}
