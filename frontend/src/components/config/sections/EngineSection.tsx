"use client";

import React, { useState, useEffect } from 'react';
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
      notify.error('Admin Required', 'Administrator privileges are required to modify engine settings.');
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
      notify.success('Engine Settings Saved', 'Travel engine configuration updated');
    } catch {
      setEngineConfig(previous);
      notify.error('Persistence Error', 'Failed to persist engine settings to backend');
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <SettingsHeader
        title={
          subTab === 'solver'
            ? 'C++ Solver Constraints & Pacing'
            : 'Deal Hunter & Scraper Cadence'
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
          Read-only preview: administrator privileges are required to save changes to instance engine settings.
        </div>
      )}

      {/* 1. Solver Constraints & Pacing Card */}
      {subTab === 'solver' && (
        <SettingsCardFrame
          title="Deterministic Solver Constraints & Pacing"
          subtitle="Configure C++20 combinatorial TSPTW boundaries, daily walking limits, and meal intervals"
          badge={engineConfig.pacing_tempo.toUpperCase()}
          badgeTone="coral"
          innerTitle="Active Solver Pacing Model"
          innerBadge={`${engineConfig.default_max_walking_km} km / day`}
          menuItems={[
            {
              id: 'reset_solver',
              label: 'Reset to Balanced Defaults (12 km/day)',
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
                  Maximum Daily Walking Distance: {engineConfig.default_max_walking_km} km
                </span>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                  Hard limit enforced during C++ knapsack candidate graph pruning
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
                  aria-label="Maximum daily walking distance"
                  style={{ width: '160px', accentColor: 'var(--color-accent-coral, #C86D51)' }}
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, minWidth: '45px', textAlign: 'right' }}>
                  {engineConfig.default_max_walking_km} km
                </span>
              </div>
            </div>

            {/* Pacing Tempo Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Itinerary Pacing Tempo
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                {[
                  { id: 'leisurely', title: 'Leisurely', desc: 'Long rests, max 3-4 POIs/day' },
                  { id: 'balanced', title: 'Balanced', desc: 'Optimal rhythm, 5-6 POIs/day' },
                  { id: 'intense', title: 'Intense', desc: 'Dense schedule, 7+ POIs/day' },
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
                  Attraction Fatigue Threshold: {engineConfig.attraction_burnout_limit} POIs/day
                </span>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                  Prevents cognitive burnout by inserting scenic park rests or coffee breaks
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
                aria-label="Attraction fatigue threshold"
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
                  Meal Allocation Windows (Minutes)
                </span>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                  Default time budgets reserved for breakfast, lunch, and dinner stops
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {([
                  { key: 'breakfast', label: 'Breakfast', min: 15, max: 120 },
                  { key: 'lunch', label: 'Lunch', min: 30, max: 180 },
                  { key: 'dinner', label: 'Dinner', min: 30, max: 240 },
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
                        aria-label={`${meal.label} window minutes`}
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
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>m</span>
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
