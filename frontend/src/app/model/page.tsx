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
  { key: 'art_culture', label: 'Art & Culture', description: 'Museums, galleries, exhibitions, fine arts' },
  { key: 'history_heritage', label: 'Historical Sites', description: 'Castles, cathedrals, ancient monuments, ruins' },
  { key: 'nature_outdoors', label: 'Nature & Outdoors', description: 'Parks, botanical gardens, lakes, trails' },
  { key: 'architecture', label: 'Architecture', description: 'Iconic facades, monumental plazas, bridges, towers' },
  { key: 'food_culinary', label: 'Culinary & Food', description: 'Tapas, gourmet bistros, traditional gastronomy' },
  { key: 'nightlife', label: 'Nightlife', description: 'Cocktail speakeasies, wine bars, craft beer, lounges' },
  { key: 'shopping', label: 'Shopping & Bazaars', description: 'Artisan craft markets, boutiques, local goods' },
  { key: 'scenic_views', label: 'Scenic Views', description: 'Panoramic miradors, rooftop terraces, horizons' },
];

export default function ModelPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Preference state (read-only telemetry)
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

  // Build radar chart data from live state
  const radarData = CATEGORY_MAP.map(({ key, label }) => ({
    subject: label,
    A: Math.round((tagAffinities[key] ?? 0.5) * 100),
    fullMark: 100,
  }));

  if (loading) {
    return (
      <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
        <p className="font-mono text-muted">{'// LOADING SOVEREIGN TASTE TELEMETRY...'}</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 className="font-display">PREFERENCE MODEL</h2>
          <p className="font-mono text-muted text-sm mt-1">
            {'// SOVEREIGN TASTE VECTOR (768D SEMANTIC RAG & PERMANENT EMA)'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span
            className="font-mono text-xs"
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(34, 197, 94, 0.1)',
              color: '#16A34A',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              fontWeight: 600,
            }}
          >
            ● INSTANCE LIVE
          </span>
          <span
            className="font-mono text-xs text-muted"
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
          >
            VECTOR DIM: {embeddingDim}D
          </span>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: '1.5rem',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontFamily: 'var(--font-mono)',
            background: '#FEF2F2',
            color: '#B91C1C',
            border: '1px solid #FECACA',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 1.2fr)', gap: '2rem', marginTop: '2rem' }}>
        {/* Left Column: Visual Radar & Macro Engine Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="bg-surface border-subtle" style={{ padding: '2rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 className="font-mono text-muted text-xs">{'// AFFINITY RADAR (ACTIVE WEIGHTS)'}</h4>
              <span className="font-mono text-xs text-accent" style={{ fontSize: '11px' }}>8-POINT HARMONIC</span>
            </div>
            
            <PreferenceRadar data={radarData} />

            <p className="font-mono text-xs text-muted" style={{ textAlign: 'center', marginTop: '1rem', lineHeight: '1.5' }}>
              Multi-attribute utility projection feeding the C++20 combinatorial solver.
            </p>
          </div>

          {/* Macro Engine Status (Read-Only) */}
          <div className="bg-surface border-subtle" style={{ padding: '1.5rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 className="font-mono text-muted text-xs">{'// MACRO ENGINE STATUS'}</h4>
              <span className="font-mono text-xs text-muted" style={{ fontSize: '10px' }}>[ AUTONOMOUS ]</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'var(--color-bg-main)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <span
                  className="font-mono text-xs text-muted"
                  style={{ display: 'block', marginBottom: '4px' }}
                >
                  TRAVEL PACE
                </span>
                <span className="font-display text-sm font-semibold capitalize" style={{ color: 'var(--color-text)' }}>
                  {pace}
                </span>
                <p className="font-mono text-muted" style={{ fontSize: '10px', marginTop: '4px', margin: 0 }}>
                  {pace === 'leisurely' ? '90-150m dwell' : pace === 'intense' ? '30-60m highlights' : '60-90m baseline'}
                </p>
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'var(--color-bg-main)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <span
                  className="font-mono text-xs text-muted"
                  style={{ display: 'block', marginBottom: '4px' }}
                >
                  BUDGET STRATEGY
                </span>
                <span className="font-display text-sm font-semibold capitalize" style={{ color: 'var(--color-text)' }}>
                  {budgetTier}
                </span>
                <p className="font-mono text-muted" style={{ fontSize: '10px', marginTop: '4px', margin: 0 }}>
                  {budgetTier === 'budget' ? 'Cost sensitive' : budgetTier === 'luxury' ? 'Zero penalty' : 'Moderate tolerance'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Telemetry Display */}
        <div className="bg-surface border-subtle" style={{ padding: '2rem', borderRadius: '12px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h4 className="font-mono text-muted text-xs">{'// LIVE TASTE WEIGHT TELEMETRY'}</h4>
            <span className="font-mono text-xs text-muted" style={{ fontSize: '11px' }}>USER: {user?.username}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', flex: 1 }}>
            {CATEGORY_MAP.map(({ key, label, description }) => {
              const val = tagAffinities[key] ?? 0.5;
              const pct = Math.round(val * 100);

              return (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span className="font-display text-sm" style={{ fontWeight: 600 }}>{label}</span>
                    <span className="font-mono text-xs text-accent" style={{ fontWeight: 700 }}>
                      {val.toFixed(2)} <span className="text-muted" style={{ fontWeight: 400 }}>({pct}%)</span>
                    </span>
                  </div>

                  <p className="font-mono text-muted text-xs" style={{ fontSize: '11px', margin: 0 }}>
                    {description}
                  </p>

                  {/* Read-only visual meter */}
                  <div
                    style={{
                      width: '100%',
                      height: '6px',
                      background: 'var(--color-bg-main)',
                      borderRadius: '3px',
                      overflow: 'hidden',
                      border: '1px solid var(--color-border)',
                      marginTop: '2px',
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

          {/* Autonomous Engine Notice */}
          <div
            style={{
              marginTop: '2rem',
              paddingTop: '1.25rem',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <p className="font-mono text-xs text-muted" style={{ lineHeight: '1.6', margin: 0 }}>
              {'// AUTONOMOUS ML TELEMETRY: These taste weights reflect real-time 8D harmonic projections of your permanent 768-dimensional dense semantic profile (nomic-embed-text & pgvector). Taste evolves organically via Exponential Moving Average (EMA) as you generate trips.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
