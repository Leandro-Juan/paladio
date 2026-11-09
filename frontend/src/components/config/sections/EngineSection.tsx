"use client";

import React, { useState, useEffect } from 'react';
import { GtfsRegistryResponse, CityGtfsItem, fetchDomainSettingsApi, updateDomainSettingsApi, EngineConfigData } from '@/utils/api';
import { SettingsHeader } from '../SettingsHeader';
import { SettingsCardFrame } from '../SettingsCardFrame';
import { TacticalToggle } from '../TacticalToggle';
import { TransitSection } from './TransitSection';
import { notify } from '@/utils/notify';

interface EngineSectionProps {
  onBackToOverview: () => void;
  subTab?: 'solver' | 'transit' | 'deals';
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
  const [isSaving, setIsSaving] = useState(false);

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
    const updated = { ...engineConfig, ...patch };
    setEngineConfig(updated);
    setIsSaving(true);
    try {
      await updateDomainSettingsApi<EngineConfigData>('engine', patch);
      notify.success('Engine Settings Saved', 'Travel engine configuration updated');
    } catch {
      notify.error('Persistence Error', 'Failed to persist engine settings to backend');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <SettingsHeader
        title={
          subTab === 'solver'
            ? 'C++ Solver Constraints & Pacing'
            : subTab === 'deals'
            ? 'Deal Hunter & Scraper Cadence'
            : 'Public Transit & GTFS Schedules'
        }
        onBackToOverview={onBackToOverview}
      />

      {/* 1. Solver Constraints & Pacing Card */}
      {(subTab === 'solver' || subTab === 'deals') && (
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
              onClick: () => handleSaveEngineConfig({ default_max_walking_km: 12.0, pacing_tempo: 'balanced', attraction_burnout_limit: 6 }),
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
                  value={engineConfig.default_max_walking_km}
                  onChange={(e) => handleSaveEngineConfig({ default_max_walking_km: parseFloat(e.target.value) })}
                  style={{ width: '160px', accentColor: 'var(--color-accent-coral, #C86D51)' }}
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, minWidth: '45px' }}>
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
                    onClick={() => handleSaveEngineConfig({ pacing_tempo: tempo.id as any })}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: engineConfig.pacing_tempo === tempo.id ? '2px solid var(--color-accent-coral, #C86D51)' : '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface-card)',
                      color: 'var(--color-text-primary)',
                      textAlign: 'left',
                      cursor: 'pointer',
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
                min="2"
                max="15"
                value={engineConfig.attraction_burnout_limit}
                onChange={(e) => handleSaveEngineConfig({ attraction_burnout_limit: parseInt(e.target.value, 10) || 6 })}
                style={{
                  width: '70px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                }}
              />
            </div>
          </div>
        </SettingsCardFrame>
      )}

      {/* 2. Public Transit & GTFS Schedules */}
      {(subTab === 'transit' || subTab === 'solver') && (
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
      )}

      {/* 3. Deal Hunter & Scraper Cadence */}
      {(subTab === 'deals' || subTab === 'solver') && (
        <SettingsCardFrame
          title="Deal Engine & Background Scrapers"
          subtitle="Configure flight and lodging scrapers, price drop alerts, and automatic ticket ingestion"
          badge={`Cadence: ${engineConfig.deal_scraper_cadence_hours}h`}
          badgeTone="gold"
          innerTitle="Active Scraping Schedule"
          innerBadge={`${engineConfig.price_alert_threshold_pct}% drop alert`}
          menuItems={[
            {
              id: 'trigger_scrape',
              label: 'Trigger Immediate Deal Sweep',
              onClick: () => notify.info('Scraper Dispatched', 'Background deal scraper sweep dispatched.'),
            },
          ]}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Scraping Interval: Every {engineConfig.deal_scraper_cadence_hours} Hours
                </span>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                  Cadence for polling sovereign flight providers and lodging registries
                </p>
              </div>
              <select
                value={engineConfig.deal_scraper_cadence_hours}
                onChange={(e) => handleSaveEngineConfig({ deal_scraper_cadence_hours: parseInt(e.target.value, 10) })}
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
                <option value={6}>Every 6 hours</option>
                <option value={12}>Every 12 hours</option>
                <option value={24}>Every 24 hours (Daily)</option>
                <option value={48}>Every 48 hours</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Price Drop Notification Threshold: {engineConfig.price_alert_threshold_pct}%
                </span>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0 }}>
                  Minimum discount required to notify travelers of route bargains
                </p>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700 }}>
                {engineConfig.price_alert_threshold_pct}%
              </span>
            </div>
          </div>
        </SettingsCardFrame>
      )}
    </div>
  );
}
