import React, { useState } from 'react';
import { TransitLeg, TransitStep, TransitRecommendation } from '../types/domain';

interface TransitLegViewProps {
  transitLeg?: TransitLeg | null;
  originName?: string;
  destinationName?: string;
}

export function TransitLegView({ transitLeg, originName, destinationName }: TransitLegViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!transitLeg) {
    return null;
  }

  const {
    duration_mins = 0,
    cost_eur = 0,
    cost_is_estimated = false,
    price_source,
    mode = 'multimodal',
    steps = [],
    airport_surcharge_eur = 0,
  } = transitLeg;

  // Extract unique transit lines from steps (e.g. Line 1, Line 10)
  const transitLines = Array.from(
    new Set(
      steps
        .map((s) => s.transit_line)
        .filter((l): l is string => Boolean(l && l.trim().length > 0))
    )
  );

  const isTransit = mode === 'transit' || transitLines.length > 0 || steps.some((s) => s.type === 'transit' || s.type === 'transit_board');

  const getStepIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'transit':
      case 'transit_board':
        return '🚇';
      case 'transit_alight':
        return '🏁';
      case 'transfer':
        return '🔄';
      case 'walk':
      default:
        return '🚶';
    }
  };

  return (
    <div
      data-testid="transit-leg-view"
      title={originName && destinationName ? `${originName} → ${destinationName}` : undefined}
      style={{
        margin: '0.5rem 0 1rem 1.75rem',
        padding: '0.6rem 0.85rem',
        borderRadius: '6px',
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        fontSize: '0.825rem',
        fontFamily: 'var(--font-mono)',
        position: 'relative',
      }}
    >
      {/* Connector line to the timeline */}
      <div
        style={{
          position: 'absolute',
          left: '-19px',
          top: '50%',
          width: '18px',
          height: '2px',
          background: 'var(--color-border)',
        }}
      />

      {/* Header / Summary Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1rem' }}>{isTransit ? '🚇' : '🚶'}</span>
          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {isTransit ? 'PUBLIC TRANSIT' : 'WALK'}
          </span>
          <span style={{ color: 'var(--color-text-muted)' }}>·</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{duration_mins} MINS</span>

          {/* Transit Line Chips */}
          {transitLines.map((line, idx) => (
            <span
              key={idx}
              data-testid="transit-line-chip"
              style={{
                background: 'var(--color-accent-primary)',
                color: '#FFF',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '0.7rem',
                fontWeight: 600,
                letterSpacing: '0.5px',
              }}
            >
              LINE {line}
            </span>
          ))}

          {/* Fare / Cost Badge */}
          <span style={{ color: 'var(--color-text-muted)' }}>·</span>
          {cost_eur > 0 ? (
            <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
              {cost_eur.toFixed(2)} €
            </span>
          ) : (
            <span style={{ color: '#16A34A', fontWeight: 600 }}>FREE</span>
          )}

          {airport_surcharge_eur > 0 && (
            <span
              data-testid="airport-surcharge-badge"
              style={{
                fontSize: '0.65rem',
                background: '#DBEAFE',
                color: '#1E40AF',
                border: '1px solid #93C5FD',
                padding: '1px 5px',
                borderRadius: '3px',
                fontWeight: 600,
                letterSpacing: '0.3px',
              }}
            >
              +{airport_surcharge_eur.toFixed(2)} € AIRPORT SURCHARGE INCLUDED
            </span>
          )}

          {price_source && price_source.startsWith('official_') && (
            <span
              data-testid="official-tariff-source"
              style={{
                fontSize: '0.65rem',
                color: 'var(--color-text-muted)',
                fontStyle: 'italic',
              }}
            >
              Official {price_source.replace('official_', '').replace(/_/g, ' ').toUpperCase()} tariff
            </span>
          )}

          {cost_is_estimated && (
            <span
              data-testid="estimated-fare-badge"
              style={{
                fontSize: '0.65rem',
                background: '#FEF3C7',
                color: '#92400E',
                border: '1px solid #FCD34D',
                padding: '1px 5px',
                borderRadius: '3px',
                fontWeight: 500,
              }}
            >
              ESTIMATED FARE
            </span>
          )}
        </div>

        {/* Expand / Collapse Button */}
        {steps.length > 0 && (
          <button
            type="button"
            data-testid="toggle-transit-steps-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-accent-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 4px',
            }}
          >
            {isExpanded ? `HIDE DIRECTIONS ▲` : `DIRECTIONS (${steps.length} STEPS) ▼`}
          </button>
        )}
      </div>

      {/* Expanded Turn-by-Turn Steps */}
      {isExpanded && steps.length > 0 && (
        <div
          data-testid="transit-steps-container"
          style={{
            marginTop: '0.75rem',
            paddingTop: '0.6rem',
            borderTop: '1px dashed var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {steps.map((step: TransitStep, idx: number) => {
            const icon = getStepIcon(step.type);
            return (
              <div
                key={idx}
                data-testid={`transit-step-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  fontSize: '0.8rem',
                  lineHeight: '1.4',
                }}
              >
                <span style={{ fontSize: '0.9rem', marginTop: '1px' }}>{icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--color-text-primary)' }}>
                    <span style={{ fontWeight: 600, marginRight: '6px' }}>{idx + 1}.</span>
                    {step.instruction}
                  </div>
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--color-text-muted)',
                      marginTop: '2px',
                      display: 'flex',
                      gap: '0.5rem',
                    }}
                  >
                    {step.duration_mins > 0 && <span>⏱ {step.duration_mins}m</span>}
                    {step.distance_km > 0 && <span>📏 {step.distance_km} km</span>}
                    {step.transit_line && (
                      <span style={{ color: 'var(--color-accent-primary)', fontWeight: 600 }}>
                        Line: {step.transit_line}
                      </span>
                    )}
                    {step.headsign && <span>Towards: {step.headsign}</span>}
                    {step.station_name && <span>Station: {step.station_name}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface TransitRecommendationCardProps {
  recommendation?: TransitRecommendation | null;
}

export function TransitRecommendationCard({ recommendation }: TransitRecommendationCardProps) {
  if (!recommendation) return null;

  const isPassRecommended = recommendation.type === '24H_PASS_RECOMMENDED';

  return (
    <div
      data-testid="transit-recommendation-card"
      style={{
        margin: '0.75rem 0 1rem 0',
        padding: '0.75rem 1rem',
        borderRadius: '6px',
        background: isPassRecommended ? '#EFF6FF' : 'var(--color-surface-card)',
        border: `1px solid ${isPassRecommended ? '#93C5FD' : 'var(--color-border)'}`,
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '1rem' }}>{isPassRecommended ? '💡' : '🎫'}</span>
        <span
          style={{
            fontWeight: 700,
            color: isPassRecommended ? '#1E40AF' : 'var(--color-text-primary)',
            fontSize: '0.85rem',
          }}
        >
          {isPassRecommended ? 'TRANSIT PASS ADVISORY: 24H PASS RECOMMENDED' : 'TRANSIT FARE SUMMARY'}
        </span>
      </div>

      <p style={{ color: 'var(--color-text-primary)', margin: '0.25rem 0', lineHeight: 1.4 }}>
        {recommendation.message || (
          isPassRecommended
            ? `Buy the ${recommendation.pass_name || '24h Tourist Pass'} for ${recommendation.pass_price_eur?.toFixed(2)}€ instead of individual fares (${recommendation.single_tickets_total_eur.toFixed(2)}€) to save ${recommendation.savings_eur.toFixed(2)}€!`
            : `Individual single tickets optimal (${recommendation.single_tickets_total_eur.toFixed(2)}€ total).`
        )}
      </p>

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          fontSize: '0.725rem',
          color: 'var(--color-text-muted)',
          marginTop: '0.4rem',
        }}
      >
        <span>Individual Tickets: {recommendation.single_tickets_total_eur.toFixed(2)}€</span>
        {recommendation.pass_price_eur != null && (
          <span>24h Pass Price: {recommendation.pass_price_eur.toFixed(2)}€</span>
        )}
        {recommendation.savings_eur > 0 && (
          <span style={{ color: '#16A34A', fontWeight: 600 }}>
            Estimated Savings: +{recommendation.savings_eur.toFixed(2)}€
          </span>
        )}
      </div>
    </div>
  );
}
