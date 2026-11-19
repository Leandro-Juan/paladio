"use client";

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  GtfsRegistryResponse,
  CityGtfsItem,
  fetchDomainSettingsApi,
  updateDomainSettingsApi,
  EngineConfigData,
} from '@/utils/api';
import { SettingsHeader } from '../SettingsHeader';
import { SettingsCardFrame } from '../SettingsCardFrame';
import { TransitSection } from './TransitSection';
import { notify } from '@/utils/notify';

interface EngineSectionProps {
  onBackToOverview: () => void;
  subTab?: 'solver' | 'transit';
  isAdmin?: boolean;
  gtfsTelemetry: GtfsRegistryResponse | null;
  gtfsMessage: { type: 'success' | 'error'; text: string } | null;
  setGtfsMessage: React.Dispatch<React.SetStateAction<{ type: 'success' | 'error'; text: string } | null>>;
  fetchGtfsData: (silent?: boolean) => Promise<void>;
  deleteGtfsCandidate: CityGtfsItem | null;
  setDeleteGtfsCandidate: React.Dispatch<React.SetStateAction<CityGtfsItem | null>>;
  deletingGtfs: boolean;
  handleDeleteGtfs: () => Promise<void>;
  syncTripsModalOpen: boolean;
  setSyncTripsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function EngineSection({
  onBackToOverview,
  subTab = 'transit',
  isAdmin = true,
  gtfsTelemetry,
  gtfsMessage,
  setGtfsMessage,
  fetchGtfsData,
  deleteGtfsCandidate,
  setDeleteGtfsCandidate,
  deletingGtfs,
  handleDeleteGtfs,
  syncTripsModalOpen,
  setSyncTripsModalOpen,
}: EngineSectionProps) {
  const { t } = useTranslation();

  // Engine & Solver config state
  const [engineConfig, setEngineConfig] = useState<EngineConfigData>({
    default_max_walking_km: 12.0,
    pacing_tempo: 'balanced',
    meal_windows: { breakfast: 45, lunch: 60, dinner: 90 },
    attraction_burnout_limit: 6,
    deal_scraper_cadence_hours: 24,
    price_alert_threshold_pct: 15.0,
  });
  useEffect(() => {
    let mounted = true;
    fetchDomainSettingsApi<EngineConfigData>('engine')
      .then((res) => {
        if (mounted && res.config) {
          setEngineConfig(res.config);
        }
      })
      .catch(() => {
        // Fallback gracefully to default state
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveEngineConfig = async (patch: Partial<EngineConfigData>) => {
    if (!isAdmin) {
      notify.error(t('config.admin_required_title'), t('config.admin_required_engine_msg'));
      return;
    }
    const previous = engineConfig;
    const updated = { ...engineConfig, ...patch };
    setEngineConfig(updated);
    try {
      const res = await updateDomainSettingsApi<EngineConfigData>('engine', patch);
      if (res.config) {
        setEngineConfig(res.config);
      }
      notify.success(t('config.engine_saved_title'), t('config.engine_saved_msg'));
    } catch {
      setEngineConfig(previous);
      notify.error(t('config.persistence_error_title'), t('config.engine_persist_failed'));
    }
  };

  if (subTab === 'transit') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <TransitSection
          onBackToOverview={onBackToOverview}
          gtfsTelemetry={gtfsTelemetry}
          gtfsMessage={gtfsMessage}
          setGtfsMessage={setGtfsMessage}
          fetchGtfsData={fetchGtfsData}
          deleteGtfsCandidate={deleteGtfsCandidate}
          setDeleteGtfsCandidate={setDeleteGtfsCandidate}
          deletingGtfs={deletingGtfs}
          handleDeleteGtfs={handleDeleteGtfs}
          syncTripsModalOpen={syncTripsModalOpen}
          setSyncTripsModalOpen={setSyncTripsModalOpen}
        />
      </div>
    );
  }

  const pacingTempoBadge =
    engineConfig.pacing_tempo === 'leisurely'
      ? t('config.tempo_leisurely_upper')
      : engineConfig.pacing_tempo === 'intense'
      ? t('config.tempo_intense_upper')
      : t('config.tempo_balanced_upper');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <SettingsHeader
        title={
          subTab === 'solver'
            ? t('config.solver_header_title')
            : t('config.deal_header_title')
        }
        onBackToOverview={onBackToOverview}
      />

      {!isAdmin && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface-card)',
            fontSize: '12px',
            color: 'var(--color-text-muted)',
          }}
        >
          {t('config.engine_readonly_notice')}
        </div>
      )}

      {/* 1. Solver Constraints & Pacing Card */}
      {subTab === 'solver' && (
        <SettingsCardFrame
          title={t('config.solver_card_title')}
          subtitle={t('config.solver_card_subtitle')}
          badge={pacingTempoBadge}
          badgeTone="coral"
          innerTitle={t('config.solver_inner_title')}
          innerBadge={t('config.km_per_day_spaced', { km: engineConfig.default_max_walking_km })}
          menuItems={[
            {
              id: 'reset_solver',
              label: t('config.reset_solver_defaults'),
              onClick: () =>
                handleSaveEngineConfig({
                  default_max_walking_km: 12.0,
                  pacing_tempo: 'balanced',
                  attraction_burnout_limit: 6,
                  meal_windows: { breakfast: 45, lunch: 60, dinner: 90 },
                }),
            },
          ]}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Daily Walking Distance */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {t('config.max_daily_walking_label', { km: engineConfig.default_max_walking_km })}
                </span>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                  {t('config.max_daily_walking_desc')}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="range"
                  min="3"
                  max="30"
                  step="0.5"
                  disabled={!isAdmin}
                  value={engineConfig.default_max_walking_km}
                  onChange={(e) => handleSaveEngineConfig({ default_max_walking_km: parseFloat(e.target.value) })}
                  aria-label={t('config.max_daily_walking_aria')}
                  style={{ width: '160px', accentColor: 'var(--color-accent-coral, #C86D51)' }}
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, minWidth: '45px', textAlign: 'right' }}>
                  {t('config.km_value', { km: engineConfig.default_max_walking_km })}
                </span>
              </div>
            </div>

            {/* Pacing Tempo Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {t('config.pacing_tempo_label')}
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                {[
                  { id: 'leisurely', title: t('config.tempo_leisurely_title'), desc: t('config.tempo_leisurely_desc') },
                  { id: 'balanced', title: t('config.tempo_balanced_title'), desc: t('config.tempo_balanced_desc') },
                  { id: 'intense', title: t('config.tempo_intense_title'), desc: t('config.tempo_intense_desc') },
                ].map((tempo) => (
                  <button
                    key={tempo.id}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => handleSaveEngineConfig({ pacing_tempo: tempo.id as EngineConfigData['pacing_tempo'] })}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: engineConfig.pacing_tempo === tempo.id ? '2px solid var(--color-accent-coral, #C86D51)' : '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface-card)',
                      color: 'var(--color-text-primary)',
                      textAlign: 'left',
                      cursor: isAdmin ? 'pointer' : 'not-allowed',
                      opacity: isAdmin ? 1 : 0.7,
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '13px', display: 'block' }}>{tempo.title}</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{tempo.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Attraction Burnout Cap */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {t('config.fatigue_threshold_label', { count: engineConfig.attraction_burnout_limit })}
                </span>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                  {t('config.fatigue_threshold_desc')}
                </p>
              </div>
              <input
                type="number"
                min="1"
                max="20"
                disabled={!isAdmin}
                value={engineConfig.attraction_burnout_limit}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 6));
                  handleSaveEngineConfig({ attraction_burnout_limit: val });
                }}
                aria-label={t('config.fatigue_threshold_aria')}
                style={{
                  width: '76px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface-card)',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                }}
              />
            </div>

            {/* Meal Allocation Windows (Minutes) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
              <div style={{ minWidth: '220px', flex: '1 1 240px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {t('config.meal_windows_label')}
                </span>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                  {t('config.meal_windows_desc')}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {([
                  { key: 'breakfast', label: t('config.meal_breakfast'), min: 15, max: 120 },
                  { key: 'lunch', label: t('config.meal_lunch'), min: 30, max: 180 },
                  { key: 'dinner', label: t('config.meal_dinner'), min: 30, max: 240 },
                ] as const).map((meal) => (
                  <label
                    key={meal.key}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      fontSize: '11px',
                      color: 'var(--color-text-muted)',
                      fontWeight: 600,
                    }}
                  >
                    <span>{meal.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        min={meal.min}
                        max={meal.max}
                        disabled={!isAdmin}
                        value={engineConfig.meal_windows[meal.key]}
                        onChange={(e) => {
                          const parsed = parseInt(e.target.value, 10);
                          if (Number.isNaN(parsed)) return;
                          const clamped = Math.max(meal.min, Math.min(meal.max, parsed));
                          handleSaveEngineConfig({
                            meal_windows: {
                              ...engineConfig.meal_windows,
                              [meal.key]: clamped,
                            },
                          });
                        }}
                        aria-label={t('config.meal_window_minutes_aria', { label: meal.label })}
                        style={{
                          width: '68px',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--color-border)',
                          backgroundColor: 'var(--color-surface-card)',
                          color: 'var(--color-text-primary)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '13px',
                        }}
                      />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{t('config.minutes_short')}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </SettingsCardFrame>
      )}
    </div>
  );
}
