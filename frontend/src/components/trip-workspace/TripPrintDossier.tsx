"use client";

import React, { useEffect, useState, useMemo } from 'react';
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

function formatDateDisplay(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function calculateDayDate(startDate?: string, dayOffset: number = 0): string {
  if (!startDate) return '';
  try {
    const d = new Date(startDate);
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + dayOffset);
    return d.toLocaleDateString('en-US', {
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
        setExpenses(expList || []);
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
    return `Comprehensive travel dossier and operational schedule for ${trip.destination}. Includes chronological itinerary routing, transit connections, financial telemetry, and boarding credentials.`;
  }, [itineraryData, trip.destination]);

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
      lodging: { label: 'Lodging & Accommodation', total: 0, count: 0 },
      transport: { label: 'Transportation & Transit', total: 0, count: 0 },
      food: { label: 'Food & Dining', total: 0, count: 0 },
      activities: { label: 'Activities, Tours & Tickets', total: 0, count: 0 },
      general: { label: 'General & Miscellaneous', total: 0, count: 0 },
    };

    expenses.forEach((exp) => {
      const catKey = (exp.category || 'general').toLowerCase();
      const target = cats[catKey] || cats.general;
      target.total += exp.amount || 0;
      target.count += 1;
    });

    return Object.entries(cats).filter(([, val]) => val.count > 0 || val.total > 0);
  }, [expenses]);

  const totalSpentExpenses = useMemo(() => {
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
        className="print-page-break"
        style={{
          minHeight: '100vh',
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
                PALADIO // EXPEDITION DOSSIER
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
                MISSION IDENTIFIER
              </div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#0F172A',
                  marginTop: '2px',
                }}
              >
                PLD-{trip.id ? trip.id.substring(0, 8).toUpperCase() : 'EXPEDITION'}
              </div>
              {trip.destination_timezone && (
                <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>
                  TZ: {trip.destination_timezone}
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
                DESTINATION
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                {trip.destination}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#64748B', fontWeight: 700 }}>
                DATE WINDOW
              </div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                {formatDateDisplay(trip.start_date)}
                <br />
                <span style={{ color: '#64748B' }}>to {formatDateDisplay(trip.end_date)}</span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#64748B', fontWeight: 700 }}>
                DURATION
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                {days.length} {days.length === 1 ? 'DAY' : 'DAYS'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#64748B', fontWeight: 700 }}>
                WAYPOINTS
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                {totalWaypoints} STOPS
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
                CORRIDOR: {trip.origin_iata || 'ORIGIN'} ➔ {trip.destination_iata || trip.destination.substring(0, 3).toUpperCase()}
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
              MISSION BRIEF & OBJECTIVES
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
              EXPEDITION TRAVELERS ({trip.participants?.length || 1})
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '10px',
              }}
            >
              {(trip.participants && trip.participants.length > 0 ? trip.participants : [{ name: 'Primary Traveler', role: 'lead' }]).map((p, idx) => (
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
                      {p.name || 'Traveler'}
                    </div>
                    <div style={{ fontFamily: 'var(--font-code, monospace)', fontSize: '10px', color: '#64748B' }}>
                      {p.role ? p.role.toUpperCase() : 'TRAVELER'} {'email' in p && p.email ? `// ${p.email}` : ''}
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
          <div>PALADIO AUTONOMOUS TRAVEL ENGINE // GENERATED DOSSIER</div>
          <div>CONFIDENTIAL & OPERATIONAL TRAVEL DOCUMENT</div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2: BUDGET BREAKDOWN & FINANCIAL TELEMETRY ("BUDGET DESGLOSE")      */}
      {/* ========================================================================= */}
      <section
        className="print-page-break"
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
              SECTION 02
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
              Financial Telemetry & Budget Breakdown
            </h2>
          </div>
          <div style={{ fontFamily: 'var(--font-code, monospace)', fontSize: '11px', color: '#64748B' }}>
            CURRENCY: {currency}
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
              TARGET BUDGET
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
              {allocatedBudget !== null ? `${Number(allocatedBudget).toFixed(2)} ${currency}` : 'UNSPECIFIED'}
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
              ACTUAL RECORDED
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
              ESTIMATED ITINERARY
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
              BUDGET VARIANCE
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
                : 'BALANCED'}
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
            SPENDING BREAKDOWN BY CATEGORY
          </div>

          <div
            style={{
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid #CBD5E1', textAlign: 'left', fontFamily: 'var(--font-code, monospace)', fontSize: '10px' }}>
                  <th style={{ padding: '8px 12px' }}>CATEGORY</th>
                  <th style={{ padding: '8px 12px' }}>EXPENSES COUNT</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>SUBTOTAL ({currency})</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>PERCENTAGE</th>
                </tr>
              </thead>
              <tbody>
                {categoryStats.length > 0 ? (
                  categoryStats.map(([key, cat]) => {
                    const pct = totalSpentExpenses > 0 ? ((cat.total / totalSpentExpenses) * 100).toFixed(1) : '0.0';
                    return (
                      <tr key={key} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{cat.label}</td>
                        <td style={{ padding: '8px 12px', color: '#64748B', fontFamily: 'var(--font-code, monospace)' }}>{cat.count} items</td>
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
                      No expenses explicitly logged yet. Costs will accrue based on scheduled route activities and booked wallet tickets.
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
            ITEMIZED EXPENSE LOG ({expenses.length} RECORDS)
          </div>

          <div
            style={{
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid #CBD5E1', textAlign: 'left', fontFamily: 'var(--font-code, monospace)', fontSize: '9px' }}>
                  <th style={{ padding: '8px 10px' }}>DATE</th>
                  <th style={{ padding: '8px 10px' }}>DESCRIPTION</th>
                  <th style={{ padding: '8px 10px' }}>CATEGORY</th>
                  <th style={{ padding: '8px 10px' }}>PAID BY</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>AMOUNT</th>
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
                        {exp.description || 'Expense item'}
                      </td>
                      <td style={{ padding: '6px 10px', textTransform: 'capitalize', color: '#475569' }}>
                        {exp.category || 'General'}
                      </td>
                      <td style={{ padding: '6px 10px', color: '#475569' }}>
                        {exp.payer_name || 'Group'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-code, monospace)' }}>
                        {exp.amount.toFixed(2)} {exp.currency || currency}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ padding: '12px', textAlign: 'center', color: '#64748B', fontStyle: 'italic' }}>
                      No manual expenses recorded.
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
              GROUP SETTLEMENT MATRIX (WHO OWES WHOM)
            </div>

            <div
              style={{
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid #CBD5E1', textAlign: 'left', fontFamily: 'var(--font-code, monospace)', fontSize: '9px' }}>
                    <th style={{ padding: '8px 10px' }}>FROM (DEBTOR)</th>
                    <th style={{ padding: '8px 10px' }}>TO (CREDITOR)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>TRANSFER AMOUNT</th>
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
      <section style={{ padding: '24px 0', boxSizing: 'border-box' }}>
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
              SECTION 03
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
              Chronological Expedition Itinerary
            </h2>
          </div>
          <div style={{ fontFamily: 'var(--font-code, monospace)', fontSize: '11px', color: '#64748B' }}>
            TOTAL {days.length} DAYS // {totalWaypoints} WAYPOINTS
          </div>
        </div>

        {/* Days loop */}
        {days.map((dayObj: any, dayIdx: number) => {
          const dayNumber = typeof dayObj.day === 'number' ? dayObj.day : dayIdx + 1;
          const dayTitle = dayObj.theme || dayObj.anchor || `Day ${dayNumber} Highlights`;
          const dayDate = calculateDayDate(trip.start_date, dayIdx);
          const path: any[] = Array.isArray(dayObj.itinerary?.path) ? dayObj.itinerary.path : [];

          return (
            <div
              key={dayIdx}
              className="print-avoid-break"
              style={{
                marginBottom: '32px',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: '#FFFFFF',
              }}
            >
              {/* Day Header */}
              <div
                style={{
                  backgroundColor: '#0F172A',
                  color: '#FFFFFF',
                  padding: '12px 16px',
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
                    DAY {dayNumber}
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
                  <div style={{ fontSize: '10px', color: '#94A3B8' }}>{path.length} STOPS</div>
                </div>
              </div>

              {/* Waypoint list for this day */}
              <div style={{ padding: '16px' }}>
                {path.length === 0 ? (
                  <div style={{ color: '#64748B', fontStyle: 'italic', padding: '12px 0' }}>
                    Rest and free exploration day. No scheduled stops.
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
                              {transit.mode === 'transit' ? '🚇 TRANSIT' : '🚶 WALK'}:
                            </span>
                            <span style={{ fontWeight: 600 }}>
                              {transit.duration_mins ? `${transit.duration_mins} min` : '5-10 min'}
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
                              to {times.end}
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
                                {poi.name || 'Waypoint'}
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
                                  {poi.cost_eur > 0 ? `€${poi.cost_eur.toFixed(2)}` : 'FREE'}
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
        className="print-page-break"
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
              SECTION 04
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
              Expedition Wallet & Reservation Vouchers
            </h2>
          </div>
          <div style={{ fontFamily: 'var(--font-code, monospace)', fontSize: '11px', color: '#64748B' }}>
            {tickets.length} CREDENTIALS RECORDED
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
            NO EXTERNAL PASSES OR BOARDING CARDS REGISTERED FOR THIS TRIP.
            <br />
            <span style={{ fontSize: '10px', color: '#94A3B8' }}>
              Drop flight PDFs or hotel reservations into the digital wallet tab to render authentic boarding credentials.
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {tickets.map((t, idx) => {
              const meta = (t.metadata || {}) as Record<string, any>;
              const isFlight = t.ticket_type === 'flight';
              const isHotel = t.ticket_type === 'hotel';
              const isTransit = t.ticket_type === 'transit';
              const isAttraction = t.ticket_type === 'attraction';

              const originCode = meta.departure_iata || meta.origin_station || (t.location_or_venue ? t.location_or_venue.substring(0, 3).toUpperCase() : 'DEP');
              const destCode = meta.arrival_iata || meta.destination_station || (trip.destination ? trip.destination.substring(0, 3).toUpperCase() : 'ARR');

              return (
                <div
                  key={t.id || idx}
                  className="print-avoid-break"
                  style={{
                    border: '1px solid #0F172A',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    display: 'flex',
                    backgroundColor: '#FFFFFF',
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
                            {t.ticket_type}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>
                            {t.provider || t.title}
                          </span>
                        </div>

                        <div
                          style={{
                            fontFamily: 'var(--font-code, monospace)',
                            fontSize: '10px',
                            color: '#64748B',
                          }}
                        >
                          CONFIRMATION:{' '}
                          <span style={{ fontWeight: 700, color: '#0F172A' }}>
                            {t.booking_reference || t.reference_code || 'CONFIRMED'}
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
                              {meta.departure_city || 'DEPARTURE'}
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 600, marginTop: '2px' }}>
                              {t.start_time ? formatDateDisplay(t.start_time) : 'SCHEDULED'}
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
                              {t.end_time ? formatDateDisplay(t.end_time) : 'ESTIMATED'}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Hotel / Attraction / General Information */}
                      {(isHotel || isAttraction || (!isFlight && !isTransit)) && (
                        <div style={{ marginBottom: '14px' }}>
                          <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                            {t.title}
                          </h3>
                          {t.location_or_venue && (
                            <div style={{ fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                              📍 {t.location_or_venue}
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
                            {t.start_time && (
                              <div>
                                VALID FROM: <span style={{ fontWeight: 600, color: '#0F172A' }}>{formatDateDisplay(t.start_time)}</span>
                              </div>
                            )}
                            {t.end_time && (
                              <div>
                                UNTIL: <span style={{ fontWeight: 600, color: '#0F172A' }}>{formatDateDisplay(t.end_time)}</span>
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
                          <div style={{ color: '#64748B' }}>PASSENGER / GUEST</div>
                          <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                            {t.holder_name || trip.participants?.[0]?.name || 'Traveler'}
                          </div>
                        </div>

                        <div>
                          <div style={{ color: '#64748B' }}>SEAT / ROOM</div>
                          <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                            {t.seat_or_room || 'UNASSIGNED'}
                          </div>
                        </div>

                        <div>
                          <div style={{ color: '#64748B' }}>STATUS</div>
                          <div style={{ fontWeight: 700, color: '#16A34A', marginTop: '2px', textTransform: 'uppercase' }}>
                            {t.status || 'CONFIRMED'}
                          </div>
                        </div>

                        <div>
                          <div style={{ color: '#64748B' }}>PRICE / FARE</div>
                          <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                            {t.price !== undefined && t.price !== null
                              ? `${Number(t.price).toFixed(2)} ${t.currency || currency}`
                              : 'PAID'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Barcode bottom strip */}
                    <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
                      <BarcodeStripe
                        value={t.barcode_value || t.booking_reference || t.reference_code || `TKT-${idx + 1}`}
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
                      MACHINE SCAN
                    </div>

                    <div style={{ padding: '4px', backgroundColor: '#FFFFFF', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                      <CodeRenderer
                        value={t.barcode_value || t.booking_reference || t.reference_code || `PLD-TKT-${t.id || idx}`}
                        format={t.barcode_format || 'qr'}
                        size={84}
                      />
                    </div>

                    <div style={{ fontFamily: 'var(--font-code, monospace)', fontSize: '8px', color: '#94A3B8' }}>
                      {t.booking_reference || t.reference_code || 'PLD-TICKET'}
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
