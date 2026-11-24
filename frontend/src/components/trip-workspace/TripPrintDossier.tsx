"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Trip, TripExpense, TripSettlement, useTrips } from '@/hooks/useTrips';
import { TripTicket } from '@/hooks/useTripTickets';
import { apiFetch } from '@/utils/api';
import { extractTripTitle, countWaypoints, extractTotalCost } from '@/utils/tripParser';
import { getScheduledPoiTimes } from '@/utils/date';
import { BarcodeStripe } from '@/components/past-trip/BarcodeStripe';
import { CodeRenderer } from '@/components/trip-workspace/wallet/codes/CodeRenderer';

interface TripPrintDossierProps {
  trip: Trip;
}

function extractPhotoUrl(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (typeof obj.url === 'string') return obj.url;
    if (typeof obj.src === 'string') return obj.src;
    if (typeof obj.path === 'string') return obj.path;
  }
  return '';
}

function formatDateDisplay(dateStr?: string, locale?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(locale && locale !== 'en' ? locale : 'en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function calculateDayDate(startDate?: string, dayOffset: number = 0, locale?: string): string {
  if (!startDate) return '';
  try {
    const d = new Date(startDate);
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + dayOffset);
    return d.toLocaleDateString(locale && locale !== 'en' ? locale : 'en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export function TripPrintDossier({ trip }: TripPrintDossierProps) {
  const { t, locale } = useTranslation();
  const { getTripExpenses, getTripSettlement } = useTrips();
  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [settlement, setSettlement] = useState<TripSettlement | null>(null);
  const [tickets, setTickets] = useState<TripTicket[]>([]);

  const tripId = trip.id;

  useEffect(() => {
    if (!tripId) return;
    let isMounted = true;

    // Load expenses & settlement
    Promise.all([
      getTripExpenses(tripId),
      getTripSettlement(tripId, false),
    ])
      .then(([expList, settl]) => {
        if (!isMounted) return;
        setExpenses(Array.isArray(expList) ? expList : []);
        setSettlement(settl || null);
      })
      .catch((err) => {
        console.warn('Failed to load print expenses:', err);
      });

    // Load wallet tickets
    apiFetch<TripTicket[] | { tickets: TripTicket[] }>(`/trips/${tripId}/tickets?include=suggestions`)
      .then((res) => {
        if (!isMounted) return;
        if (Array.isArray(res)) {
          setTickets(res);
        } else if (res && Array.isArray(res.tickets)) {
          setTickets(res.tickets);
        } else {
          setTickets([]);
        }
      })
      .catch((err) => {
        console.warn('Failed to load print tickets:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [tripId, getTripExpenses, getTripSettlement]);

  const itineraryData = useMemo(() => {
    return (trip.itinerary_data || {}) as Record<string, any>;
  }, [trip.itinerary_data]);

  const tripTitle = useMemo(() => extractTripTitle(trip), [trip]);

  // Extract cover photo
  const coverPhoto = useMemo(() => {
    if (Array.isArray(itineraryData.photos) && itineraryData.photos.length > 0) {
      const u = extractPhotoUrl(itineraryData.photos[0]);
      if (u) return u;
    }
    const cover = extractPhotoUrl(itineraryData.cover_photo) || extractPhotoUrl(itineraryData.photo_url);
    if (cover) return cover;

    // Fallback: check first stop with a photo in any day
    if (Array.isArray(itineraryData.days)) {
      for (const d of itineraryData.days) {
        if (Array.isArray(d?.itinerary?.path)) {
          for (const stop of d.itinerary.path) {
            const stopPhoto = extractPhotoUrl(stop?.poi?.photo_url || stop?.poi?.image_url);
            if (stopPhoto) return stopPhoto;
          }
        }
      }
    }
    return '';
  }, [itineraryData]);

  // Description / notes
  const tripDescription = useMemo(() => {
    if (typeof itineraryData.description === 'string' && itineraryData.description.trim()) {
      return itineraryData.description.trim();
    }
    if (typeof itineraryData.notes === 'string' && itineraryData.notes.trim()) {
      return itineraryData.notes.trim();
    }
    if (typeof itineraryData.summary === 'string' && itineraryData.summary.trim()) {
      return itineraryData.summary.trim();
    }
    return t('print.default_description', { destination: trip.destination });
  }, [itineraryData, trip.destination, t]);

  // Constraints & metrics
  const travelConstraints = (itineraryData.travel_constraints || {}) as Record<string, any>;
  const totalWaypoints = countWaypoints(itineraryData);
  const totalCost = extractTotalCost(itineraryData);
  const allocatedBudget = travelConstraints.budget_usd ?? itineraryData.budget ?? null;
  const currency = travelConstraints.currency || itineraryData.currency || 'EUR';

  // Days list
  const days = useMemo(() => {
    if (Array.isArray(itineraryData.days)) {
      return itineraryData.days;
    }
    return [];
  }, [itineraryData]);

  // Calculate budget breakdown by category
  const categoryStats = useMemo(() => {
    const cats: Record<string, { label: string; total: number; count: number }> = {
      lodging: { label: t('print.cat_lodging'), total: 0, count: 0 },
      transport: { label: t('print.cat_transport'), total: 0, count: 0 },
      food: { label: t('print.cat_food'), total: 0, count: 0 },
      activities: { label: t('print.cat_activities'), total: 0, count: 0 },
      general: { label: t('print.cat_general'), total: 0, count: 0 },
    };

    if (!Array.isArray(expenses)) return [];
    expenses.forEach((exp) => {
      const catKey = (exp.category || 'general').toLowerCase();
      const target = cats[catKey] || cats.general;
      target.total += exp.amount || 0;
      target.count += 1;
    });

    return Object.entries(cats).filter(([, val]) => val.count > 0 || val.total > 0);
  }, [expenses, t]);

  const totalSpentExpenses = useMemo(() => {
    if (!Array.isArray(expenses)) return 0;
    return expenses.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  }, [expenses]);

  return (
    <div
      id="trip-print-dossier"
      className="print-only font-sans"
      style={{
        color: '#0F172A',
        backgroundColor: '#FFFFFF',
        fontSize: '13px',
        lineHeight: 1.5,
      }}
    >
      {/* ========================================================================= */}
      {/* SECTION 1: COVER PAGE & EXPEDITION OVERVIEW                               */}
      {/* ========================================================================= */}
      <section
        style={{
          minHeight: 'calc(100vh - 4mm)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '24px 0',
          boxSizing: 'border-box',
        }}
      >
        <div>
          {/* Header Masthead */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              borderBottom: '2px solid #0F172A',
              paddingBottom: '16px',
              marginBottom: '28px',
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-code, monospace)',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: '#475569',
                }}
              >
                {t('print.cover_subtitle')}
              </div>
              <h1
                style={{
                  fontFamily: 'var(--font-display, "Jost", sans-serif)',
                  fontSize: '32px',
                  fontWeight: 800,
                  margin: '6px 0 0',
                  color: '#0F172A',
                  letterSpacing: '-0.02em',
                }}
              >
                {tripTitle}
              </h1>
            </div>

            <div style={{ textAlign: 'right', fontFamily: 'var(--font-code, monospace)' }}>
              <div
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.15em',
                  color: '#64748B',
                  fontWeight: 700,
                }}
              >
                {t('print.mission_identifier')}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#0F172A',
                  marginTop: '2px',
                }}
              >
                PLD-{trip.id ? trip.id.substring(0, 8).toUpperCase() : t('print.expedition_tag')}
              </div>
              {trip.destination_timezone && (
                <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>
                  {t('print.tz_prefix', { tz: trip.destination_timezone })}
                </div>
              )}
            </div>
          </div>

          {/* Destination Corridor & Dates Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px',
              padding: '12px 16px',
              backgroundColor: '#F8FAFC',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              marginBottom: '24px',
              fontFamily: 'var(--font-code, monospace)',
            }}
          >
            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#64748B', fontWeight: 700 }}>
                {t('print.destination_label')}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                {trip.destination}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#64748B', fontWeight: 700 }}>
                {t('print.date_window_label')}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                {formatDateDisplay(trip.start_date, locale)}
                <br />
                <span style={{ color: '#64748B' }}>{t('print.to_date', { date: formatDateDisplay(trip.end_date, locale) })}</span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#64748B', fontWeight: 700 }}>
                {t('print.duration_upper')}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                {days.length === 1
                  ? t('print.duration_day_singular', { count: days.length })
                  : t('print.duration_days_plural', { count: days.length })}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#64748B', fontWeight: 700 }}>
                {t('print.waypoints_upper')}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                {t('print.stops_count_upper', { count: totalWaypoints })}
              </div>
            </div>
          </div>

          {/* Cover Photo */}
          {coverPhoto && (
            <div
              style={{
                width: '100%',
                height: '240px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid #CBD5E1',
                marginBottom: '24px',
                position: 'relative',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverPhoto}
                alt={trip.destination}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: '8px',
                  right: '12px',
                  background: 'rgba(15, 23, 42, 0.75)',
                  color: '#FFFFFF',
                  fontFamily: 'var(--font-code, monospace)',
                  fontSize: '10px',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  letterSpacing: '0.1em',
                }}
              >
                {t('print.corridor_prefix')} {trip.origin_iata || t('print.origin_upper')} ➔ {trip.destination_iata || trip.destination.substring(0, 3).toUpperCase()}
              </div>
            </div>
          )}

          {/* Description Section */}
          <div style={{ marginBottom: '24px' }}>
            <div
              style={{
                fontFamily: 'var(--font-code, monospace)',
                fontSize: '10px',
                letterSpacing: '0.15em',
                color: '#64748B',
                fontWeight: 700,
                marginBottom: '6px',
              }}
            >
              {t('print.mission_brief_objectives')}
            </div>
            <p
              style={{
                fontSize: '13px',
                color: '#334155',
                lineHeight: 1.6,
                margin: 0,
                textAlign: 'justify',
              }}
            >
              {tripDescription}
            </p>
          </div>

          {/* Participants Roster */}
          <div style={{ marginBottom: '24px' }}>
            <div
              style={{
                fontFamily: 'var(--font-code, monospace)',
                fontSize: '10px',
                letterSpacing: '0.15em',
                color: '#64748B',
                fontWeight: 700,
                marginBottom: '8px',
              }}
            >
              {t('print.expedition_travelers', { count: trip.participants?.length || 1 })}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '10px',
              }}
            >
              {(trip.participants && trip.participants.length > 0
                ? trip.participants
                : [{ name: t('print.primary_traveler'), role: t('print.lead_role') }]
              ).map((p, idx) => (
                <div
                  key={idx}
                  style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: '#0F172A',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--font-code, monospace)',
                      fontSize: '12px',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {(p.name || 'T')[0].toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '12px', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.name || t('print.traveler_label')}
                    </div>
                    <div style={{ fontFamily: 'var(--font-code, monospace)', fontSize: '10px', color: '#64748B' }}>
                      {p.role ? p.role.toUpperCase() : t('print.traveler_upper')} {'email' in p && p.email ? `// ${p.email}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer info & document stamp */}
        <div
          style={{
            borderTop: '1px solid #E2E8F0',
            paddingTop: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: 'var(--font-code, monospace)',
            fontSize: '9px',
            color: '#64748B',
          }}
        >
          <div>{t('print.footer_engine')}</div>
          <div>{t('print.footer_confidential')}</div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2: BUDGET BREAKDOWN & FINANCIAL TELEMETRY ("BUDGET DESGLOSE")      */}
      {/* ========================================================================= */}
      <section
        className="print-page-break-before"
        style={{
          padding: '24px 0',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            borderBottom: '2px solid #0F172A',
            paddingBottom: '12px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-code, monospace)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#475569',
              }}
            >
              {t('print.section_02')}
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display, "Jost", sans-serif)',
                fontSize: '24px',
                fontWeight: 800,
                margin: '4px 0 0',
                color: '#0F172A',
              }}
            >
              {t('print.section_02_title')}
            </h2>
          </div>
          <div style={{ fontFamily: 'var(--font-code, monospace)', fontSize: '11px', color: '#64748B' }}>
            {t('print.currency_prefix', { currency })}
          </div>
        </div>

        {/* Top Summary Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              padding: '12px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              fontFamily: 'var(--font-code, monospace)',
            }}
          >
            <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 700, letterSpacing: '0.1em' }}>
              {t('print.target_budget_upper')}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
              {allocatedBudget !== null ? `${Number(allocatedBudget).toFixed(2)} ${currency}` : t('print.unspecified_upper')}
            </div>
          </div>

          <div
            style={{
              padding: '12px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              fontFamily: 'var(--font-code, monospace)',
            }}
          >
            <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 700, letterSpacing: '0.1em' }}>
              {t('print.actual_recorded_upper')}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
              {totalSpentExpenses.toFixed(2)} {currency}
            </div>
          </div>

          <div
            style={{
              padding: '12px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              fontFamily: 'var(--font-code, monospace)',
            }}
          >
            <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 700, letterSpacing: '0.1em' }}>
              {t('print.estimated_itinerary_upper')}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
              {totalCost ? `${Number(totalCost).toFixed(2)} ${currency}` : `${totalSpentExpenses.toFixed(2)} ${currency}`}
            </div>
          </div>

          <div
            style={{
              padding: '12px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              fontFamily: 'var(--font-code, monospace)',
            }}
          >
            <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 700, letterSpacing: '0.1em' }}>
              {t('print.budget_variance_upper')}
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 800,
                color: allocatedBudget && totalSpentExpenses > Number(allocatedBudget) ? '#DC2626' : '#16A34A',
                marginTop: '4px',
              }}
            >
              {allocatedBudget !== null
                ? `${(Number(allocatedBudget) - totalSpentExpenses).toFixed(2)} ${currency}`
                : t('print.balanced_upper')}
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        <div style={{ marginBottom: '28px' }}>
          <div
            style={{
              fontFamily: 'var(--font-code, monospace)',
              fontSize: '10px',
              letterSpacing: '0.15em',
              color: '#64748B',
              fontWeight: 700,
              marginBottom: '10px',
            }}
          >
            {t('print.spending_by_category_upper')}
          </div>

          <div
            style={{
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid #CBD5E1', textAlign: 'left', fontFamily: 'var(--font-code, monospace)', fontSize: '10px' }}>
                  <th style={{ padding: '8px 12px' }}>{t('print.col_category')}</th>
                  <th style={{ padding: '8px 12px' }}>{t('print.col_expenses_count')}</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>{t('print.col_subtotal', { currency })}</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>{t('print.col_percentage')}</th>
                </tr>
              </thead>
              <tbody>
                {categoryStats.length > 0 ? (
                  categoryStats.map(([key, cat]) => {
                    const pct = totalSpentExpenses > 0 ? ((cat.total / totalSpentExpenses) * 100).toFixed(1) : '0.0';
                    return (
                      <tr key={key} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{cat.label}</td>
                        <td style={{ padding: '8px 12px', color: '#64748B', fontFamily: 'var(--font-code, monospace)' }}>{t('print.items_count', { count: cat.count })}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-code, monospace)' }}>
                          {cat.total.toFixed(2)}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748B', fontFamily: 'var(--font-code, monospace)' }}>
                          {pct}%
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} style={{ padding: '12px', textAlign: 'center', color: '#64748B', fontStyle: 'italic' }}>
                      {t('print.no_expenses_logged')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Itemized Expenses Ledger */}
        <div style={{ marginBottom: '28px' }}>
          <div
            style={{
              fontFamily: 'var(--font-code, monospace)',
              fontSize: '10px',
              letterSpacing: '0.15em',
              color: '#64748B',
              fontWeight: 700,
              marginBottom: '10px',
            }}
          >
            {t('print.itemized_expense_log', { count: expenses.length })}
          </div>

          <div
            style={{
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid #CBD5E1', textAlign: 'left', fontFamily: 'var(--font-code, monospace)', fontSize: '9px' }}>
                  <th style={{ padding: '8px 10px' }}>{t('print.col_date')}</th>
                  <th style={{ padding: '8px 10px' }}>{t('print.col_description')}</th>
                  <th style={{ padding: '8px 10px' }}>{t('print.col_category')}</th>
                  <th style={{ padding: '8px 10px' }}>{t('print.col_paid_by')}</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>{t('print.col_amount')}</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length > 0 ? (
                  expenses.map((exp, idx) => (
                    <tr key={exp.id || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '6px 10px', fontFamily: 'var(--font-code, monospace)', color: '#64748B' }}>
                        {exp.expense_date ? exp.expense_date.substring(0, 10) : '—'}
                      </td>
                      <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0F172A' }}>
                        {exp.description || t('print.expense_item_fallback')}
                      </td>
                      <td style={{ padding: '6px 10px', textTransform: 'capitalize', color: '#475569' }}>
                        {exp.category || t('print.general_fallback')}
                      </td>
                      <td style={{ padding: '6px 10px', color: '#475569' }}>
                        {exp.payer_name || t('print.group_fallback')}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-code, monospace)' }}>
                        {exp.amount.toFixed(2)} {exp.currency || currency}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ padding: '12px', textAlign: 'center', color: '#64748B', fontStyle: 'italic' }}>
                      {t('print.no_manual_expenses')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Group Debt Settlement / Who Owes Whom */}
        {settlement && settlement.transfers && settlement.transfers.length > 0 && (
          <div>
            <div
              style={{
                fontFamily: 'var(--font-code, monospace)',
                fontSize: '10px',
                letterSpacing: '0.15em',
                color: '#64748B',
                fontWeight: 700,
                marginBottom: '10px',
              }}
            >
              {t('print.settlement_matrix_upper')}
            </div>

            <div
              style={{
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid #CBD5E1', textAlign: 'left', fontFamily: 'var(--font-code, monospace)', fontSize: '9px' }}>
                    <th style={{ padding: '8px 10px' }}>{t('print.col_from_debtor')}</th>
                    <th style={{ padding: '8px 10px' }}>{t('print.col_to_creditor')}</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>{t('print.col_transfer_amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {settlement.transfers.map((tr, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '6px 10px', fontWeight: 600 }}>{tr.sender_name}</td>
                      <td style={{ padding: '6px 10px', fontWeight: 600 }}>{tr.receiver_name}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-code, monospace)', color: '#0F172A' }}>
                        {tr.amount.toFixed(2)} {currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* SECTION 3: CHRONOLOGICAL ITINERARY (ALL DAYS)                             */}
      {/* ========================================================================= */}
      <section className="print-page-break-before" style={{ padding: '24px 0', boxSizing: 'border-box' }}>
        <div
          style={{
            borderBottom: '2px solid #0F172A',
            paddingBottom: '12px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-code, monospace)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#475569',
              }}
            >
              {t('print.section_03')}
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display, "Jost", sans-serif)',
                fontSize: '24px',
                fontWeight: 800,
                margin: '4px 0 0',
                color: '#0F172A',
              }}
            >
              {t('print.section_03_title')}
            </h2>
          </div>
          <div style={{ fontFamily: 'var(--font-code, monospace)', fontSize: '11px', color: '#64748B' }}>
            {t('print.total_days_waypoints', { days: days.length, waypoints: totalWaypoints })}
          </div>
        </div>

        {/* Days loop */}
        {days.map((dayObj: any, dayIdx: number) => {
          const dayNumber = typeof dayObj.day === 'number' ? dayObj.day : dayIdx + 1;
          const dayTitle = dayObj.theme || dayObj.anchor || t('print.day_highlights', { day: dayNumber });
          const dayDate = calculateDayDate(trip.start_date, dayIdx, locale);
          const path: any[] = Array.isArray(dayObj.itinerary?.path) ? dayObj.itinerary.path : [];

          return (
            <div
              key={dayIdx}
              style={{
                marginBottom: '32px',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                backgroundColor: '#FFFFFF',
              }}
            >
              {/* Day Header */}
              <div
                className="print-keep-with-next"
                style={{
                  backgroundColor: '#0F172A',
                  color: '#FFFFFF',
                  padding: '12px 16px',
                  borderTopLeftRadius: '7px',
                  borderTopRightRadius: '7px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span
                    style={{
                      fontFamily: 'var(--font-code, monospace)',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.15em',
                      backgroundColor: 'rgba(255,255,255,0.15)',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      marginRight: '10px',
                    }}
                  >
                    {t('transit.day_upper', { day: dayNumber })}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-display, "Jost", sans-serif)',
                      fontSize: '16px',
                      fontWeight: 700,
                    }}
                  >
                    {dayTitle}
                  </span>
                </div>

                <div
                  style={{
                    fontFamily: 'var(--font-code, monospace)',
                    fontSize: '11px',
                    color: '#CBD5E1',
                    textAlign: 'right',
                  }}
                >
                  {dayDate && <div>{dayDate}</div>}
                  <div style={{ fontSize: '10px', color: '#94A3B8' }}>{t('print.stops_count_upper', { count: path.length })}</div>
                </div>
              </div>

              {/* Waypoint list for this day */}
              <div style={{ padding: '16px' }}>
                {path.length === 0 ? (
                  <div style={{ color: '#64748B', fontStyle: 'italic', padding: '12px 0' }}>
                    {t('print.rest_day_empty')}
                  </div>
                ) : (
                  path.map((stop: any, stopIdx: number) => {
                    const times = getScheduledPoiTimes(stop);
                    const poi = stop.poi || {};
                    const transit = stop.transit_from_previous;

                    return (
                      <React.Fragment key={stopIdx}>
                        {/* Transit leg from previous stop */}
                        {stopIdx > 0 && transit && (
                          <div
                            className="print-keep-with-next"
                            style={{
                              margin: '8px 0 8px 36px',
                              padding: '6px 12px',
                              backgroundColor: '#F8FAFC',
                              borderLeft: '2px dashed #94A3B8',
                              fontSize: '11px',
                              fontFamily: 'var(--font-code, monospace)',
                              color: '#475569',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                          >
                            <span>
                              {transit.mode === 'transit' ? t('print.leg_transit') : t('print.leg_walk')}:
                            </span>
                            <span style={{ fontWeight: 600 }}>
                              {transit.duration_mins
                                ? t('workspace.duration_minutes', { duration: transit.duration_mins })
                                : t('print.duration_short_fallback')}
                            </span>
                            {transit.steps && transit.steps.length > 0 && transit.steps[0].instruction && (
                              <span style={{ color: '#64748B' }}>
                                {`// ${transit.steps[0].instruction}`}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Stop card */}
                        <div
                          className="print-avoid-break"
                          style={{
                            display: 'flex',
                            gap: '12px',
                            padding: '10px 12px',
                            borderRadius: '6px',
                            border: '1px solid #E2E8F0',
                            backgroundColor: stopIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC',
                            marginBottom: '8px',
                          }}
                        >
                          {/* Index badge */}
                          <div
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              backgroundColor: '#0F172A',
                              color: '#FFFFFF',
                              fontFamily: 'var(--font-code, monospace)',
                              fontSize: '11px',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              marginTop: '2px',
                            }}
                          >
                            {stopIdx + 1}
                          </div>

                          {/* Time Column */}
                          <div
                            style={{
                              width: '85px',
                              flexShrink: 0,
                              fontFamily: 'var(--font-code, monospace)',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#0F172A',
                            }}
                          >
                            <div>{times.start}</div>
                            <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 500 }}>
                              {t('print.to_time', { time: times.end })}
                            </div>
                            {poi.duration_mins && (
                              <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '2px' }}>
                                ({poi.duration_mins}m)
                              </div>
                            )}
                          </div>

                          {/* Stop Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>
                                {poi.name || t('workspace.waypoint_fallback')}
                              </span>
                              {poi.category && (
                                <span
                                  style={{
                                    fontFamily: 'var(--font-code, monospace)',
                                    fontSize: '9px',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    padding: '1px 6px',
                                    borderRadius: '3px',
                                    backgroundColor: '#E2E8F0',
                                    color: '#334155',
                                  }}
                                >
                                  {poi.category}
                                </span>
                              )}
                              {poi.cost_eur !== undefined && (
                                <span
                                  style={{
                                    fontFamily: 'var(--font-code, monospace)',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    color: poi.cost_eur > 0 ? '#0F172A' : '#16A34A',
                                    marginLeft: 'auto',
                                  }}
                                >
                                  {poi.cost_eur > 0 ? `€${poi.cost_eur.toFixed(2)}` : t('transit.free_upper')}
                                </span>
                              )}
                            </div>

                            {poi.address && (
                              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                                📍 {poi.address}
                              </div>
                            )}

                            {poi.description && (
                              <div
                                style={{
                                  fontSize: '11px',
                                  color: '#334155',
                                  marginTop: '4px',
                                  lineHeight: 1.4,
                                }}
                              >
                                {poi.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* ========================================================================= */}
      {/* SECTION 4: DIGITAL WALLET TICKETS & RESERVATION VOUCHERS                   */}
      {/* ========================================================================= */}
      <section
        className="print-page-break-before"
        style={{
          padding: '24px 0',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            borderBottom: '2px solid #0F172A',
            paddingBottom: '12px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-code, monospace)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#475569',
              }}
            >
              {t('print.section_04')}
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display, "Jost", sans-serif)',
                fontSize: '24px',
                fontWeight: 800,
                margin: '4px 0 0',
                color: '#0F172A',
              }}
            >
              {t('print.section_04_title')}
            </h2>
          </div>
          <div style={{ fontFamily: 'var(--font-code, monospace)', fontSize: '11px', color: '#64748B' }}>
            {t('print.credentials_recorded', { count: tickets.length })}
          </div>
        </div>

        {tickets.length === 0 ? (
          <div
            style={{
              padding: '32px',
              textAlign: 'center',
              border: '1px dashed #CBD5E1',
              borderRadius: '8px',
              color: '#64748B',
              fontFamily: 'var(--font-code, monospace)',
              fontSize: '12px',
            }}
          >
            {t('print.no_wallet_passes_title')}
            <br />
            <span style={{ fontSize: '10px', color: '#94A3B8' }}>
              {t('print.no_wallet_passes_hint')}
            </span>
          </div>
        ) : (
          <div>
            {tickets.map((ticket, idx) => {
              const meta = (ticket.metadata || {}) as Record<string, any>;
              const isFlight = ticket.ticket_type === 'flight';
              const isHotel = ticket.ticket_type === 'hotel';
              const isTransit = ticket.ticket_type === 'transit';
              const isAttraction = ticket.ticket_type === 'attraction';

              const originCode = meta.departure_iata || meta.origin_station || (ticket.location_or_venue ? ticket.location_or_venue.substring(0, 3).toUpperCase() : 'DEP');
              const destCode = meta.arrival_iata || meta.destination_station || (trip.destination ? trip.destination.substring(0, 3).toUpperCase() : 'ARR');

              return (
                <div
                  key={ticket.id || idx}
                  className="print-avoid-break"
                  style={{
                    border: '1px solid #0F172A',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    display: 'flex',
                    backgroundColor: '#FFFFFF',
                    marginBottom: idx < tickets.length - 1 ? '20px' : 0,
                  }}
                >
                  {/* Left Main Voucher Body */}
                  <div
                    style={{
                      flex: 1,
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      borderRight: '2px dashed #CBD5E1',
                    }}
                  >
                    <div>
                      {/* Top Header of Ticket */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '12px',
                          borderBottom: '1px solid #E2E8F0',
                          paddingBottom: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-code, monospace)',
                              fontSize: '10px',
                              fontWeight: 700,
                              backgroundColor: '#0F172A',
                              color: '#FFFFFF',
                              padding: '2px 6px',
                              borderRadius: '3px',
                              letterSpacing: '0.1em',
                              textTransform: 'uppercase',
                            }}
                          >
                            {ticket.ticket_type}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>
                            {ticket.provider || ticket.title}
                          </span>
                        </div>

                        <div
                          style={{
                            fontFamily: 'var(--font-code, monospace)',
                            fontSize: '10px',
                            color: '#64748B',
                          }}
                        >
                          {t('print.confirmation_label')}{' '}
                          <span style={{ fontWeight: 700, color: '#0F172A' }}>
                            {ticket.booking_reference || ticket.reference_code || t('print.confirmed_upper')}
                          </span>
                        </div>
                      </div>

                      {/* Corridor / Key Flight / Transit Points */}
                      {(isFlight || isTransit) && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '14px',
                            fontFamily: 'var(--font-code, monospace)',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>
                              {originCode}
                            </div>
                            <div style={{ fontSize: '10px', color: '#64748B' }}>
                              {meta.departure_city || t('print.departure_upper')}
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 600, marginTop: '2px' }}>
                              {ticket.start_time ? formatDateDisplay(ticket.start_time, locale) : t('print.scheduled_upper')}
                            </div>
                          </div>

                          <div style={{ textAlign: 'center', color: '#94A3B8' }}>
                            <div style={{ fontSize: '11px' }}>✈ ──────── ✈</div>
                            {meta.flight_number && (
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A' }}>
                                {meta.flight_number}
                              </div>
                            )}
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>
                              {destCode}
                            </div>
                            <div style={{ fontSize: '10px', color: '#64748B' }}>
                              {meta.arrival_city || trip.destination}
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 600, marginTop: '2px' }}>
                              {ticket.end_time ? formatDateDisplay(ticket.end_time, locale) : t('print.estimated_upper')}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Hotel / Attraction / General Information */}
                      {(isHotel || isAttraction || (!isFlight && !isTransit)) && (
                        <div style={{ marginBottom: '14px' }}>
                          <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                            {ticket.title}
                          </h3>
                          {ticket.location_or_venue && (
                            <div style={{ fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                              📍 {ticket.location_or_venue}
                            </div>
                          )}
                          <div
                            style={{
                              display: 'flex',
                              gap: '16px',
                              fontSize: '11px',
                              fontFamily: 'var(--font-code, monospace)',
                              color: '#64748B',
                            }}
                          >
                            {ticket.start_time && (
                              <div>
                                {t('print.valid_from_label')} <span style={{ fontWeight: 600, color: '#0F172A' }}>{formatDateDisplay(ticket.start_time, locale)}</span>
                              </div>
                            )}
                            {ticket.end_time && (
                              <div>
                                {t('print.until_label')} <span style={{ fontWeight: 600, color: '#0F172A' }}>{formatDateDisplay(ticket.end_time, locale)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Metadata Grid (Seat, Room, Passenger, Price) */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4, 1fr)',
                          gap: '8px',
                          backgroundColor: '#F8FAFC',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          fontFamily: 'var(--font-code, monospace)',
                          fontSize: '10px',
                        }}
                      >
                        <div>
                          <div style={{ color: '#64748B' }}>{t('print.col_passenger_guest')}</div>
                          <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                            {ticket.holder_name || trip.participants?.[0]?.name || t('print.traveler_label')}
                          </div>
                        </div>

                        <div>
                          <div style={{ color: '#64748B' }}>{t('print.col_seat_room')}</div>
                          <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                            {ticket.seat_or_room || t('print.unassigned_upper')}
                          </div>
                        </div>

                        <div>
                          <div style={{ color: '#64748B' }}>{t('print.col_status')}</div>
                          <div style={{ fontWeight: 700, color: '#16A34A', marginTop: '2px', textTransform: 'uppercase' }}>
                            {ticket.status || t('print.confirmed_upper')}
                          </div>
                        </div>

                        <div>
                          <div style={{ color: '#64748B' }}>{t('print.col_price_fare')}</div>
                          <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                            {ticket.price !== undefined && ticket.price !== null
                              ? `${Number(ticket.price).toFixed(2)} ${ticket.currency || currency}`
                              : t('print.paid_upper')}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Barcode bottom strip */}
                    <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
                      <BarcodeStripe
                        value={ticket.barcode_value || ticket.booking_reference || ticket.reference_code || `TKT-${idx + 1}`}
                        height={26}
                        showText={true}
                      />
                    </div>
                  </div>

                  {/* Right Stub Section with Scannable QR / Access Code */}
                  <div
                    style={{
                      width: '130px',
                      padding: '12px',
                      backgroundColor: '#FAFAFA',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontFamily: 'var(--font-code, monospace)', fontSize: '9px', fontWeight: 700, color: '#64748B' }}>
                      {t('print.machine_scan_upper')}
                    </div>

                    <div style={{ padding: '4px', backgroundColor: '#FFFFFF', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                      <CodeRenderer
                        value={ticket.barcode_value || ticket.booking_reference || ticket.reference_code || `PLD-TKT-${ticket.id || idx}`}
                        format={ticket.barcode_format || 'qr'}
                        size={84}
                      />
                    </div>

                    <div style={{ fontFamily: 'var(--font-code, monospace)', fontSize: '8px', color: '#94A3B8' }}>
                      {ticket.booking_reference || ticket.reference_code || 'PLD-TICKET'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
