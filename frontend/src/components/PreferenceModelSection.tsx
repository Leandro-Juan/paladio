"use client";

import React, { useState, useEffect } from 'react';
import PreferenceRadar from '@/components/PreferenceRadar';
import { fetchCurrentUser, fetchUserEmbeddingApi } from '@/utils/api';
import { User } from '@/types/auth';

interface TagConfig {
  key: string;
  label: string;
  description: string;
}

const CATEGORY_MAP: TagConfig[] = [
  { key: 'art_culture', label: 'Art & Culture', description: 'Museums, galleries, fine arts' },
  { key: 'history_heritage', label: 'Historical Sites', description: 'Castles, monuments, ruins' },
  { key: 'nature_outdoors', label: 'Nature & Outdoors', description: 'Parks, botanical gardens, trails' },
  { key: 'architecture', label: 'Architecture', description: 'Iconic facades, plazas, bridges' },
  { key: 'food_culinary', label: 'Culinary & Food', description: 'Tapas, bistros, gastronomy' },
  { key: 'nightlife', label: 'Nightlife', description: 'Speakeasies, wine bars, lounges' },
  { key: 'shopping', label: 'Shopping & Bazaars', description: 'Artisan craft markets, boutiques' },
  { key: 'scenic_views', label: 'Scenic Views', description: 'Panoramic miradors, terraces' },
];

export function PreferenceModelSection() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [tagAffinities, setTagAffinities] = useState<Record<string, number>>({});
  const [pace, setPace] = useState<string>('balanced');
  const [budgetTier, setBudgetTier] = useState<string>('balanced');
  const [embeddingDim, setEmbeddingDim] = useState<number>(768);

  useEffect(() => {
    let ignore = false;

    async function loadUserData() {
      try {
        const [currentUser, embData] = await Promise.all([
          fetchCurrentUser(),
          fetchUserEmbeddingApi().catch(() => ({ dimension: 768, embedding: [] })),
        ]);

        if (ignore) return;
        setUser(currentUser);
        setEmbeddingDim(embData.dimension || 768);

        const prefs = (currentUser.preferences || {}) as Record<string, unknown>;
        const rawAffinities = (prefs.tag_affinities || {}) as Record<string, number>;

        const initialAffinities: Record<string, number> = {};
        CATEGORY_MAP.forEach(({ key }) => {
          initialAffinities[key] = typeof rawAffinities[key] === 'number' ? rawAffinities[key] : 0.5;
        });
        setTagAffinities(initialAffinities);

        if (typeof prefs.pace === 'string') setPace(prefs.pace.toLowerCase());
        if (typeof prefs.budget_tier === 'string') setBudgetTier(prefs.budget_tier.toLowerCase());
      } catch (err: unknown) {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : 'Failed to load user preference model.';
          setError(msg);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadUserData();
    return () => {
      ignore = true;
    };
  }, []);

  const radarData = CATEGORY_MAP.map(({ key, label }) => ({
    subject: label,
    A: Math.round((tagAffinities[key] ?? 0.5) * 100),
    fullMark: 100,
  }));

  if (loading) {
    return (
      <div className="bg-surface border-subtle" style={{ padding: '2rem', borderRadius: '12px', textAlign: 'center' }}>
        <p className="font-mono text-muted">{'// LOADING SOVEREIGN TASTE TELEMETRY...'}</p>
      </div>
    );
  }

  return (
    <div
      data-testid="preference-model-section"
      className="bg-surface border-subtle"
      style={{
        borderRadius: '12px',
        padding: '1.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h3 className="font-display" style={{ margin: 0, fontSize: '1.25rem' }}>
              PREFERENCE MODEL & TASTE TELEMETRY
            </h3>
            <span
              className="font-mono text-xs"
              style={{
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'rgba(34, 197, 94, 0.1)',
                color: '#16A34A',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                fontWeight: 600,
              }}
            >
              ● [ AUTONOMOUS ]
            </span>
          </div>
          <p className="font-mono text-muted text-xs mt-1">
            {'// SOVEREIGN TASTE VECTOR (768D SEMANTIC RAG & PERMANENT EMA)'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span
            className="font-mono text-xs text-muted"
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'var(--color-bg-main)',
              border: '1px solid var(--color-border)',
            }}
          >
            VECTOR DIM: {embeddingDim}D
          </span>
          {user?.username && (
            <span
              className="font-mono text-xs text-muted"
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border)',
              }}
            >
              USER: {user.username}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            background: '#FEF2F2',
            color: '#B91C1C',
            border: '1px solid #FECACA',
          }}
        >
          {error}
        </div>
      )}

      {/* Grid: Radar + Status on Left, Taste Weights on Right */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(340px, 1.2fr)', gap: '1.5rem' }}>
        {/* Left Column: Radar Chart & Macro Engine Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div
            style={{
              padding: '1.25rem',
              borderRadius: '8px',
              background: 'var(--color-bg-main)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span className="font-mono text-muted text-xs">{'// 8-POINT HARMONIC RADAR'}</span>
              <span className="font-mono text-xs text-accent" style={{ fontSize: '11px', fontWeight: 600 }}>C++20 UTILITY</span>
            </div>

            <PreferenceRadar data={radarData} />

            <p className="font-mono text-xs text-muted" style={{ textAlign: 'center', marginTop: '0.75rem', lineHeight: '1.4' }}>
              Multi-attribute utility projection feeding branch-and-bound optimization.
            </p>
          </div>

          {/* Macro Status Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border)',
              }}
            >
              <span className="font-mono text-xs text-muted" style={{ display: 'block', marginBottom: '2px' }}>
                TRAVEL PACE
              </span>
              <span className="font-display text-sm font-semibold capitalize" style={{ color: 'var(--color-text-primary)' }}>
                {pace}
              </span>
              <p className="font-mono text-muted" style={{ fontSize: '10px', marginTop: '2px', margin: 0 }}>
                {pace === 'leisurely' ? '90-150m dwell' : pace === 'intense' ? '30-60m highlights' : '60-90m baseline'}
              </p>
            </div>

            <div
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border)',
              }}
            >
              <span className="font-mono text-xs text-muted" style={{ display: 'block', marginBottom: '2px' }}>
                BUDGET STRATEGY
              </span>
              <span className="font-display text-sm font-semibold capitalize" style={{ color: 'var(--color-text-primary)' }}>
                {budgetTier}
              </span>
              <p className="font-mono text-muted" style={{ fontSize: '10px', marginTop: '2px', margin: 0 }}>
                {budgetTier === 'budget' ? 'Cost sensitive' : budgetTier === 'luxury' ? 'Zero penalty' : 'Moderate tolerance'}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Live Taste Weight Telemetry */}
        <div
          style={{
            padding: '1.25rem',
            borderRadius: '8px',
            background: 'var(--color-bg-main)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span className="font-mono text-muted text-xs">{'// LIVE TASTE WEIGHT TELEMETRY'}</span>
            <span className="font-mono text-xs text-muted" style={{ fontSize: '11px' }}>ACTIVE WEIGHTS</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', flex: 1 }}>
            {CATEGORY_MAP.map(({ key, label }) => {
              const val = tagAffinities[key] ?? 0.5;
              const pct = Math.round(val * 100);

              return (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span className="font-display text-xs" style={{ fontWeight: 600 }}>{label}</span>
                    <span className="font-mono text-xs text-accent" style={{ fontWeight: 700 }}>
                      {val.toFixed(2)} <span className="text-muted" style={{ fontWeight: 400 }}>({pct}%)</span>
                    </span>
                  </div>

                  {/* Meter */}
                  <div
                    style={{
                      width: '100%',
                      height: '5px',
                      background: 'var(--color-surface-card)',
                      borderRadius: '3px',
                      overflow: 'hidden',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: 'var(--color-accent-primary)',
                        borderRadius: '3px',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: '1.25rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <p className="font-mono text-xs text-muted" style={{ lineHeight: '1.5', margin: 0, fontSize: '11px' }}>
              {'// AUTONOMOUS ML TELEMETRY: Taste weights reflect real-time 8D harmonic projections of your permanent 768-dimensional dense semantic profile (nomic-embed-text & pgvector).'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
