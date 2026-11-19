"use client";

import React from 'react';
import { RouteItineraryData, TransitRecommendation } from '@/types/domain';
import { BulbIcon, TicketIcon } from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';

interface TransitAdvisorySectionProps {
  itinerary?: RouteItineraryData | null;
  onAddDayPass?: (rec: TransitRecommendation) => void;
}

export function TransitAdvisorySection({ itinerary, onAddDayPass }: TransitAdvisorySectionProps) {
  const { t } = useTranslation();
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
      // Omit advisory if there are no transit legs scheduled or no transit pass price
      const hasMissingFareData = !rec.single_tickets_total_eur || rec.single_tickets_total_eur <= 0.001;
      const hasMissingPassData = !rec.pass_price_eur || rec.pass_price_eur <= 0.001;
      if (hasMissingFareData || hasMissingPassData) {
        return;
      }

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
        <h3 className="font-mono text-xs" style={{ margin: 0, color: 'var(--color-text-primary, #1A2B32)', fontWeight: 700 }}>
          {t('wallet.transit_advisory_heading')}
        </h3>
        <span className="font-mono text-muted" style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)' }}>
          {t('wallet.solver_fare_analysis')}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {recEntries.map(({ dayNumber, date, recommendation: rec }, idx) => {
          const isPassRecommended = rec.type === '24H_PASS_RECOMMENDED';

          return (
            <div
              key={idx}
              data-testid="transit-advisory-card"
              style={{
                background: isPassRecommended ? '#EFF6FF' : '#FFFFFF',
                border: `1px solid ${isPassRecommended ? '#BFDBFE' : 'var(--color-border, #CBD5E1)'}`,
                borderRadius: '12px',
                padding: '1.25rem',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.85rem',
                boxShadow: '0 1px 4px rgba(15, 23, 42, 0.05)',
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
                      background: isPassRecommended ? '#DBEAFE' : 'var(--color-surface-card, #F8FAFC)',
                      border: `1px solid ${isPassRecommended ? '#BFDBFE' : 'var(--color-border, #CBD5E1)'}`,
                    }}
                  >
                    {isPassRecommended ? (
                      <BulbIcon size={15} color="#1E3A8A" />
                    ) : (
                      <TicketIcon size={15} color="var(--color-text-muted, #64748B)" />
                    )}
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: isPassRecommended ? '#1E3A8A' : 'var(--color-text-primary, #0F172A)',
                      fontSize: '0.9rem',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {isPassRecommended
                      ? t('wallet.advisory_24h_recommended')
                      : t('wallet.transit_fare_summary')}
                  </span>
                </div>

                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--color-text-muted, #64748B)',
                    background: '#FFFFFF',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--color-border, #CBD5E1)',
                  }}
                >
                  {t('wallet.day_upper', { number: dayNumber })}{date ? ` · ${date}` : ''}
                </span>
              </div>

              {/* Rationale explanation */}
              <p
                style={{
                  color: 'var(--color-text-primary, #0F172A)',
                  margin: '0 0 1rem 0',
                  lineHeight: '1.45',
                  fontSize: '0.8rem',
                }}
              >
                {rec.message || (isPassRecommended ? t('wallet.advisory_24h_rationale') : t('wallet.advisory_single_rationale'))}
              </p>

              {/* Pricing breakdown stats row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '8px',
                  background: isPassRecommended ? '#FFFFFF' : 'var(--color-surface-card, #F8FAFC)',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: `1px solid ${isPassRecommended ? '#DBEAFE' : 'var(--color-border, #E2E8F0)'}`,
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--color-text-muted, #64748B)',
                      display: 'block',
                      textTransform: 'uppercase',
                    }}
                  >
                    {t('wallet.point_to_point_fare')}
                  </span>
                  <span
                    style={{
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: 'var(--color-text-primary, #0F172A)',
                    }}
                  >
                    €{Number(rec.single_tickets_total_eur).toFixed(2)}
                  </span>
                </div>

                <div>
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--color-text-muted, #64748B)',
                      display: 'block',
                      textTransform: 'uppercase',
                    }}
                  >
                    {t('wallet.day_pass_24h')}
                  </span>
                  <span
                    style={{
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: isPassRecommended ? '#1E3A8A' : 'var(--color-text-primary, #0F172A)',
                    }}
                  >
                    €{Number(rec.pass_price_eur).toFixed(2)}
                  </span>
                </div>

                <div>
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--color-text-muted, #64748B)',
                      display: 'block',
                      textTransform: 'uppercase',
                    }}
                  >
                    {isPassRecommended ? t('wallet.savings_label') : t('wallet.difference_label')}
                  </span>
                  <span
                    style={{
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: isPassRecommended ? '#059669' : 'var(--color-text-muted, #64748B)',
                    }}
                  >
                    {isPassRecommended
                      ? `+€${Number(rec.savings_eur).toFixed(2)}`
                      : `€${Number(rec.savings_eur).toFixed(2)}`}
                  </span>
                </div>

                {onAddDayPass && isPassRecommended && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => onAddDayPass(rec)}
                      style={{
                        background: 'var(--color-accent-primary, #1E3A8A)',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#FFFFFF',
                        padding: '6px 12px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 1px 3px rgba(30, 58, 138, 0.2)',
                      }}
                    >
                      {t('wallet.add_day_pass_btn')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
