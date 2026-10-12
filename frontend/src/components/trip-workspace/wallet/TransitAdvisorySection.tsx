"use client";

import React from 'react';
import { RouteItineraryData } from '@/app/vault/[id]/page';
import { TransitRecommendation } from '@/types/domain';
import { BulbIcon, TicketIcon } from '@/components/icons';

interface TransitAdvisorySectionProps {
  itinerary?: RouteItineraryData | null;
  onAddDayPass?: (rec: TransitRecommendation) => void;
}

export function TransitAdvisorySection({ itinerary, onAddDayPass }: TransitAdvisorySectionProps) {
  if (!itinerary?.days || !Array.isArray(itinerary.days)) {
    return null;
  }

  // Extract daily transit recommendations and deduplicate or index by day
  const recEntries: Array<{
    dayNumber: number;
    date?: string;
    recommendation: TransitRecommendation;
  }> = [];

  const seenKeys = new Set<string>();

  itinerary.days.forEach((day, index) => {
    const rec = day.itinerary?.transit_recommendation;
    if (rec) {
      // Deduplicate key based on fare comparison values
      const key = `${rec.type}-${rec.single_tickets_total_eur}-${rec.pass_price_eur}-${rec.savings_eur}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        recEntries.push({
          dayNumber: index + 1,
          date: (day as unknown as { date?: string }).date,
          recommendation: rec,
        });
      }
    }
  });

  if (recEntries.length === 0) {
    return null;
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 className="font-mono text-muted text-xs" style={{ margin: 0 }}>
          {'// TRANSIT PASS SAVINGS ADVISORY'}
        </h3>
        <span className="font-mono text-muted" style={{ fontSize: '11px' }}>
          SOLVER FARE ANALYSIS
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {recEntries.map(({ dayNumber, date, recommendation: rec }, idx) => {
          // Defect #4 fix: if single tickets total is 0.00 EUR or null, this almost certainly means
          // missing fare data, not free travel. Do not mislead the user that single tickets are more cost-effective.
          const hasMissingFareData = rec.single_tickets_total_eur <= 0.001;
          const isPassRecommended = !hasMissingFareData && rec.type === '24H_PASS_RECOMMENDED';

          return (
            <div
              key={idx}
              data-testid="transit-advisory-card"
              style={{
                background: isPassRecommended
                  ? 'rgba(30, 58, 138, 0.25)'
                  : 'rgba(30, 41, 59, 0.7)',
                backdropFilter: 'blur(16px)',
                border: `1px solid ${
                  isPassRecommended ? 'rgba(96, 165, 250, 0.45)' : 'rgba(255, 255, 255, 0.12)'
                }`,
                borderRadius: '12px',
                padding: '1.25rem',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.85rem',
                boxShadow: '0 4px 18px rgba(0,0,0,0.25)',
              }}
            >
              {/* Header Badge & Title */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.65rem',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      background: isPassRecommended
                        ? 'rgba(59, 130, 246, 0.2)'
                        : 'rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    {isPassRecommended ? (
                      <BulbIcon size={15} color="#93C5FD" />
                    ) : (
                      <TicketIcon size={15} color="#94A3B8" />
                    )}
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: isPassRecommended ? '#93C5FD' : '#FFFFFF',
                      fontSize: '0.9rem',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {isPassRecommended
                      ? 'TRANSIT PASS ADVISORY: 24H PASS RECOMMENDED'
                      : hasMissingFareData
                      ? 'TRANSIT FARE NOTICE: INSUFFICIENT FARE DATA'
                      : 'TRANSIT FARE SUMMARY'}
                  </span>
                </div>

                <span
                  style={{
                    fontSize: '11px',
                    color: '#94A3B8',
                    background: 'rgba(255, 255, 255, 0.05)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  DAY {dayNumber} {date ? `· ${date}` : ''}
                </span>
              </div>

              {/* Message */}
              <p
                style={{
                  color: '#CBD5E1',
                  margin: '0.25rem 0 0.75rem 0',
                  lineHeight: 1.45,
                  fontSize: '0.85rem',
                }}
              >
                {hasMissingFareData
                  ? 'Not enough data to compare single ticket fares against travel passes for this date. Check local station kiosks for regional pricing.'
                  : isPassRecommended
                  ? rec.message ||
                    `Buy the ${rec.pass_name || '24h Tourist Pass'} for ${rec.pass_price_eur?.toFixed(2)}€ instead of individual fares (${rec.single_tickets_total_eur.toFixed(2)}€) to save ${rec.savings_eur.toFixed(2)}€!`
                  : rec.message ||
                    `Individual single tickets optimal (${rec.single_tickets_total_eur.toFixed(2)}€ total estimated).`}
              </p>

              {/* Cost stats bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  background: 'rgba(15, 23, 42, 0.45)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '0.65rem 0.85rem',
                  fontSize: '0.775rem',
                }}
              >
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <span style={{ color: '#94A3B8' }}>
                    Individual Tickets:{' '}
                    <strong style={{ color: hasMissingFareData ? '#64748B' : '#FFF' }}>
                      {hasMissingFareData ? 'N/A' : `${rec.single_tickets_total_eur.toFixed(2)} €`}
                    </strong>
                  </span>
                  {rec.pass_price_eur != null && (
                    <span style={{ color: '#94A3B8' }}>
                      24h Pass:{' '}
                      <strong style={{ color: '#DDD6FE' }}>
                        {rec.pass_price_eur.toFixed(2)} €
                      </strong>
                    </span>
                  )}
                  {isPassRecommended && rec.savings_eur > 0 && (
                    <span style={{ color: '#4ADE80', fontWeight: 700 }}>
                      Estimated Savings: +{rec.savings_eur.toFixed(2)} €
                    </span>
                  )}
                </div>

                {/* Add Day Pass button */}
                {isPassRecommended && onAddDayPass && (
                  <button
                    type="button"
                    onClick={() => onAddDayPass(rec)}
                    className="font-mono"
                    style={{
                      background: 'rgba(59, 130, 246, 0.2)',
                      border: '1px solid rgba(96, 165, 250, 0.4)',
                      color: '#93C5FD',
                      borderRadius: '4px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontWeight: 700,
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.35)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                    }}
                  >
                    + ADD PASS TO WALLET
                  </button>
                )}
              </div>

              {/* Disclaimer */}
              <div
                style={{
                  marginTop: '0.65rem',
                  paddingTop: '0.5rem',
                  borderTop: '1px dashed rgba(255, 255, 255, 0.08)',
                  fontSize: '0.675rem',
                  color: '#64748B',
                  fontStyle: 'italic',
                }}
              >
                * Notice: Transit fares are calculated automatically and may vary. Please verify with local transit authorities.
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
