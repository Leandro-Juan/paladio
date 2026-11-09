"use client";

import React from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { useTypographyStore } from '@/stores/typographyStore';
import { useNavigationStore } from '@/stores/navigationStore';
import { SettingsHeader } from '../SettingsHeader';

interface AppearanceSectionProps {
  onBackToOverview: () => void;
  subTab?: 'appearance' | 'typography' | 'navigation';
}

export function AppearanceSection({ onBackToOverview, subTab = 'appearance' }: AppearanceSectionProps) {
  const { theme, setTheme } = useThemeStore();
  const { typography, setTypography, toggleTypography } = useTypographyStore();
  const { navStyle, setNavStyle } = useNavigationStore();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <SettingsHeader
        title={
          subTab === 'typography'
            ? 'Interface Typography'
            : subTab === 'navigation'
            ? 'Navigation Layout'
            : 'Interface Appearance'
        }
        onBackToOverview={onBackToOverview}
      />

      {/* 1. Interface Appearance & Theme Engine */}
      <section
        id="appearance-theme"
        className="bg-surface border-subtle"
        style={{
          borderRadius: '10px',
          padding: '1.5rem',
          border: subTab === 'appearance' ? '1px solid var(--color-border)' : '1px solid var(--color-border-subtle)',
        }}
      >
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 className="font-display" style={{ fontSize: '1.2rem', margin: 0 }}>
            Interface Appearance
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {/* Light Theme Card */}
          <button
            type="button"
            onClick={() => setTheme('light')}
            aria-label="Switch to light mode"
            aria-pressed={theme === 'light'}
            style={{
              padding: '1.25rem',
              borderRadius: '8px',
              border: theme === 'light' ? '2px solid var(--color-gold, #E2B33C)' : '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              transition: 'all 0.2s ease',
              position: 'relative',
              boxShadow: theme === 'light' ? '0 0 16px rgba(226, 179, 60, 0.2)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="5" r="1" fill="currentColor" />
                  <circle cx="12" cy="19" r="1" fill="currentColor" />
                  <circle cx="5" cy="12" r="1" fill="currentColor" />
                  <circle cx="19" cy="12" r="1" fill="currentColor" />
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
                <span className="font-display" style={{ fontWeight: 600, fontSize: '15px' }}>Pacific Jazz Light</span>
              </div>
              {theme === 'light' && (
                <span
                  className="font-mono"
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'var(--color-gold, #E2B33C)',
                    color: '#0A2A35',
                    letterSpacing: '0.5px',
                  }}
                >
                  ACTIVE
                </span>
              )}
            </div>
            <p className="font-mono text-muted" style={{ fontSize: '12px', margin: 0 }}>
              Daytime operational palette: warm cream and paper background, deep sea sidebar, and sun coral accents.
            </p>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
              <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: '#F6F0E1', border: '1px solid #D9CEB2' }} title="Cream #F6F0E1" />
              <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: '#FFFBF0', border: '1px solid #D9CEB2' }} title="Paper #FFFBF0" />
              <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: '#0F4C5C' }} title="Deep Sea #0F4C5C" />
              <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: '#D42A2F' }} title="Sun Red #D42A2F" />
              <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: '#E2B33C' }} title="Gold #E2B33C" />
            </div>
          </button>

          {/* Dark Theme Card */}
          <button
            type="button"
            onClick={() => setTheme('dark')}
            aria-label="Switch to dark mode"
            aria-pressed={theme === 'dark'}
            style={{
              padding: '1.25rem',
              borderRadius: '8px',
              border: theme === 'dark' ? '2px solid var(--color-gold, #E2B33C)' : '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              transition: 'all 0.2s ease',
              position: 'relative',
              boxShadow: theme === 'dark' ? '0 0 16px rgba(226, 179, 60, 0.2)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <span className="font-display" style={{ fontWeight: 600, fontSize: '15px' }}>Pacific Jazz Dark</span>
              </div>
              {theme === 'dark' && (
                <span
                  className="font-mono"
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'var(--color-gold, #E2B33C)',
                    color: '#0A2A35',
                    letterSpacing: '0.5px',
                  }}
                >
                  ACTIVE
                </span>
              )}
            </div>
            <p className="font-mono text-muted" style={{ fontSize: '12px', margin: 0 }}>
              Nighttime deep ocean palette: low-glare dark abyss, sky teal highlights, and gold markers.
            </p>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
              <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: '#08222B', border: '1px solid #1C4553' }} title="Abyss #08222B" />
              <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: '#0F333F', border: '1px solid #1C4553' }} title="Card #0F333F" />
              <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: '#061B22' }} title="Sidebar #061B22" />
              <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: '#7CC4D1' }} title="Sky Teal #7CC4D1" />
              <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: '#E2B33C' }} title="Gold #E2B33C" />
            </div>
          </button>

          {/* Silent Waters Theme Card */}
          <button
            type="button"
            onClick={() => setTheme('silent-waters')}
            aria-label="Switch to Silent Waters palette"
            aria-pressed={theme === 'silent-waters'}
            style={{
              padding: '1.25rem',
              borderRadius: '8px',
              border: theme === 'silent-waters' ? '2px solid #5C6B73' : '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              transition: 'all 0.2s ease',
              position: 'relative',
              boxShadow: theme === 'silent-waters' ? '0 0 16px rgba(92, 107, 115, 0.25)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                </svg>
                <span className="font-display" style={{ fontWeight: 600, fontSize: '15px' }}>Silent Waters</span>
              </div>
              {theme === 'silent-waters' && (
                <span
                  className="font-mono"
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: '#5C6B73',
                    color: '#FFFFFF',
                    letterSpacing: '0.5px',
                  }}
                >
                  ACTIVE
                </span>
              )}
            </div>
            <p className="font-mono text-muted" style={{ fontSize: '12px', margin: 0 }}>
              Dewy blues and weathered gray merge into a hushed palette, like drifting fog on silent waters.
            </p>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
              <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: '#E0FBFC', border: '1px solid #C2DFE3' }} title="Light Cyan #E0FBFC" />
              <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: '#C2DFE3', border: '1px solid #9DB4C0' }} title="Powder Blue #C2DFE3" />
              <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: '#9DB4C0' }} title="Pewter Mist #9DB4C0" />
              <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: '#5C6B73' }} title="Slate Gray #5C6B73" />
              <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: '#253237' }} title="Gunmetal #253237" />
            </div>
          </button>
        </div>
      </section>

      {/* 2. Interface Typography Engine */}
      <section
        id="appearance-typography"
        className="bg-surface border-subtle"
        style={{
          borderRadius: '10px',
          padding: '1.5rem',
          border: subTab === 'typography' ? '1px solid var(--color-border)' : '1px solid var(--color-border-subtle)',
        }}
      >
        <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 className="font-display" style={{ fontSize: '1.2rem', margin: 0 }}>
              Interface Typography Engine
            </h3>
          </div>

          <button
            type="button"
            onClick={toggleTypography}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: typography === 'inter' 
                ? 'var(--color-surface-card)' 
                : 'var(--color-accent-teal-soft, rgba(13, 148, 136, 0.1))',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-mono, monospace)',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            className="hover:opacity-90 active:scale-98"
          >
            <span>{typography === 'inter' ? 'Switch to Classic Typography' : 'Switch to Inter Typography'}</span>
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {/* Inter Modern Pairing Card */}
          <button
            type="button"
            onClick={() => setTypography('inter')}
            aria-label="Set typography to Inter (Universal)"
            aria-pressed={typography === 'inter'}
            style={{
              padding: '1.25rem',
              borderRadius: '8px',
              border: typography === 'inter' ? '2px solid var(--color-gold, #E2B33C)' : '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              transition: 'all 0.2s ease',
              boxShadow: typography === 'inter' ? '0 0 16px rgba(226, 179, 60, 0.2)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-display" style={{ fontWeight: 600, fontSize: '15px' }}>Inter Modern (Universal)</span>
              {typography === 'inter' && (
                <span
                  className="font-mono"
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'var(--color-gold, #E2B33C)',
                    color: '#0A2A35',
                    letterSpacing: '0.5px',
                  }}
                >
                  ACTIVE
                </span>
              )}
            </div>
            <p className="font-mono text-muted" style={{ fontSize: '12px', margin: 0 }}>
              Engineered for high density and legibility across all data tables, flight manifests, and transit cards.
            </p>
            <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--color-surface-muted, rgba(148, 163, 184, 0.1))' }}>
              <div style={{ fontSize: '15px', fontWeight: 600, fontFamily: 'var(--font-inter, sans-serif)' }}>Tokyo Haneda • HND → CDG</div>
              <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono, monospace)' }}>Inter Headings • Inter Body • JetBrains Mono</div>
            </div>
          </button>

          {/* Classic Editorial Pairing Card */}
          <button
            type="button"
            onClick={() => setTypography('classic')}
            aria-label="Set typography to Classic Editorial"
            aria-pressed={typography === 'classic'}
            style={{
              padding: '1.25rem',
              borderRadius: '8px',
              border: typography === 'classic' ? '2px solid var(--color-gold, #E2B33C)' : '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              transition: 'all 0.2s ease',
              boxShadow: typography === 'classic' ? '0 0 16px rgba(226, 179, 60, 0.2)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-display" style={{ fontWeight: 600, fontSize: '15px' }}>Classic Editorial (Jost)</span>
              {typography === 'classic' && (
                <span
                  className="font-mono"
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'var(--color-gold, #E2B33C)',
                    color: '#0A2A35',
                    letterSpacing: '0.5px',
                  }}
                >
                  ACTIVE
                </span>
              )}
            </div>
            <p className="font-mono text-muted" style={{ fontSize: '12px', margin: 0 }}>
              Refined geometric editorial elegance with expressive Jost titling paired with crisp Inter metadata.
            </p>
            <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--color-surface-muted, rgba(148, 163, 184, 0.1))' }}>
              <div style={{ fontSize: '16px', fontWeight: 600, fontFamily: 'var(--font-jost, sans-serif)', letterSpacing: '0.02em' }}>Tokyo Haneda • HND → CDG</div>
              <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono, monospace)' }}>Jost Headings • Inter Body • JetBrains Mono</div>
            </div>
          </button>
        </div>
      </section>

      {/* 3. Navigation Layout Engine */}
      <section
        id="appearance-navigation"
        className="bg-surface border-subtle"
        style={{
          borderRadius: '10px',
          padding: '1.5rem',
          border: subTab === 'navigation' ? '1px solid var(--color-border)' : '1px solid var(--color-border-subtle)',
        }}
      >
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 className="font-display" style={{ fontSize: '1.2rem', margin: 0 }}>
            Navigation Layout Engine
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {/* Sidebar Layout Card */}
          <button
            type="button"
            onClick={() => setNavStyle('sidebar')}
            aria-label="Set navigation to Sidebar"
            aria-pressed={navStyle === 'sidebar'}
            style={{
              padding: '1.25rem',
              borderRadius: '8px',
              border: navStyle === 'sidebar' ? '2px solid var(--color-gold, #E2B33C)' : '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              transition: 'all 0.2s ease',
              boxShadow: navStyle === 'sidebar' ? '0 0 16px rgba(226, 179, 60, 0.2)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
                <span className="font-display" style={{ fontWeight: 600, fontSize: '15px' }}>Tactical Sidebar Layout</span>
              </div>
              {navStyle === 'sidebar' && (
                <span
                  className="font-mono"
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'var(--color-gold, #E2B33C)',
                    color: '#0A2A35',
                    letterSpacing: '0.5px',
                  }}
                >
                  ACTIVE
                </span>
              )}
            </div>
            <p className="font-mono text-muted" style={{ fontSize: '12px', margin: 0 }}>
              Full-height persistent left command rail with collapsible Japanese Minimalist icons, workspace drawers, and quick links.
            </p>
          </button>

          {/* Floating Dock Layout Card */}
          <button
            type="button"
            onClick={() => setNavStyle('dock')}
            aria-label="Set navigation to Floating Bottom Dock"
            aria-pressed={navStyle === 'dock'}
            style={{
              padding: '1.25rem',
              borderRadius: '8px',
              border: navStyle === 'dock' ? '2px solid var(--color-gold, #E2B33C)' : '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface-card)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              transition: 'all 0.2s ease',
              boxShadow: navStyle === 'dock' ? '0 0 16px rgba(226, 179, 60, 0.2)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="16" width="20" height="5" rx="2" />
                  <line x1="6" y1="18" x2="6.01" y2="18" />
                  <line x1="10" y1="18" x2="10.01" y2="18" />
                  <line x1="14" y1="18" x2="14.01" y2="18" />
                  <line x1="18" y1="18" x2="18.01" y2="18" />
                </svg>
                <span className="font-display" style={{ fontWeight: 600, fontSize: '15px' }}>Floating Dock Layout</span>
              </div>
              {navStyle === 'dock' && (
                <span
                  className="font-mono"
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'var(--color-gold, #E2B33C)',
                    color: '#0A2A35',
                    letterSpacing: '0.5px',
                  }}
                >
                  ACTIVE
                </span>
              )}
            </div>
            <p className="font-mono text-muted" style={{ fontSize: '12px', margin: 0 }}>
              Modern macOS-inspired centered floating pill dock pinned to the bottom of the viewport with spring magnifications.
            </p>
          </button>
        </div>
      </section>
    </div>
  );
}
