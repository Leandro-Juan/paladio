"use client";

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTrips } from '@/hooks/useTrips';
import { MealRequirement } from '@/types/domain';
import {
  PinIcon,
  PlaneIcon,
  HotelIcon,
  CalendarIcon,
  Spinner,
  CheckIcon,
} from '@/components/icons';

interface TripCreationBoxesProps {
  onPersonalizedSubmit: (prompt: string, extras: Record<string, unknown>) => void;
  disabled?: boolean;
  initialDestination?: string;
  initialOrigin?: string;
  initialStartDate?: string;
  initialEndDate?: string;
  initialBudget?: number;
  status?: string;
}

const formatDateOffset = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

export function TripCreationBoxes({
  onPersonalizedSubmit,
  disabled = false,
  initialDestination = 'Paris',
  initialOrigin = 'Madrid',
  initialStartDate,
  initialEndDate,
  initialBudget = 1500,
  status = 'connected',
}: TripCreationBoxesProps) {
  const router = useRouter();
  const { saveTrip } = useTrips();

  // Mode: 'none' (two cards with big plus button) | 'blank' | 'personalized'
  const [selectedMode, setSelectedMode] = useState<'none' | 'blank' | 'personalized'>('none');

  // Shared form state
  const [destination, setDestination] = useState(initialDestination);
  const [origin, setOrigin] = useState(initialOrigin);
  const [startDate, setStartDate] = useState(() => initialStartDate || formatDateOffset(7));
  const [endDate, setEndDate] = useState(() => initialEndDate || formatDateOffset(12));
  const [budgetUsd, setBudgetUsd] = useState(initialBudget);

  // Blank trip specific fields
  const [hotelArea, setHotelArea] = useState('');
  const [isCreatingBlank, setIsCreatingBlank] = useState(false);
  const [blankError, setBlankError] = useState<string | null>(null);
  const [blankSuccess, setBlankSuccess] = useState<string | null>(null);

  // Personalized trip specific fields
  const [personalizedPrompt, setPersonalizedPrompt] = useState(
    'Visit the main cultural landmarks and museums. Love traditional bistros and relaxed cafes.'
  );
  const [meals] = useState<MealRequirement[]>([
    { meal_type: 'BREAKFAST', start_time: '08:00', end_time: '10:00' },
    { meal_type: 'LUNCH', start_time: '12:00', end_time: '14:30' },
    { meal_type: 'DINNER', start_time: '19:30', end_time: '22:00' },
  ]);
  const [anchorMode, setAnchorMode] = useState<'simulated' | 'direct'>('simulated');
  const [rawBookingText, setRawBookingText] = useState('');

  // Calculate duration
  const tripDurationDays = useMemo(() => {
    if (!startDate || !endDate) return 5;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 1;
  }, [startDate, endDate]);

  // Handle Blank Trip Submission
  const handleCreateBlankTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination.trim()) {
      setBlankError('Destination city is required.');
      return;
    }
    setBlankError(null);
    setIsCreatingBlank(true);

    try {
      const start = new Date(startDate);
      const days = [];
      for (let i = 1; i <= tripDurationDays; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + (i - 1));
        days.push({
          day: i,
          date: d.toISOString().split('T')[0],
          activities: [],
          theme: `Day ${i} Exploration`,
        });
      }

      const blankItineraryData = {
        destination: destination.trim(),
        origin: origin.trim() || undefined,
        travel_constraints: {
          destination_city: destination.trim(),
          origin_city: origin.trim() || undefined,
          start_date: startDate,
          end_date: endDate,
          budget_usd: Number(budgetUsd) || 1500,
          accommodation: hotelArea.trim() || undefined,
        },
        days,
        is_blank_trip: true,
      };

      const startIso = new Date(startDate).toISOString();
      const endIso = new Date(endDate).toISOString();

      const createdTrip = await saveTrip({
        destination: destination.trim(),
        start_date: startIso,
        end_date: endIso,
        itinerary_data: blankItineraryData,
      });

      if (createdTrip?.id) {
        setBlankSuccess('Trip created! Seeding POIs & GTFS in background...');
        setTimeout(() => {
          router.push(`/trips/${createdTrip.id}`);
        }, 500);
      } else {
        throw new Error('Failed to create trip in database.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating blank trip.';
      setBlankError(msg);
      setIsCreatingBlank(false);
    }
  };

  // Handle Personalized Trip Submission
  const handlePersonalizedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personalizedPrompt.trim()) return;

    if (anchorMode === 'simulated') {
      const extras: Record<string, unknown> = {
        test_mode: true,
        origin_city: origin.trim() || 'Madrid',
        destination_city: destination.trim() || 'Paris',
        start_date: startDate,
        end_date: endDate,
        budget_usd: Number(budgetUsd) || 1500,
        meals,
        manual_constraints: {
          budget_usd: Number(budgetUsd) || 1500,
          meals,
        },
      };
      onPersonalizedSubmit(personalizedPrompt, extras);
    } else {
      const extras: Record<string, unknown> = {
        test_mode: false,
        booking_text: rawBookingText,
        destination_city: destination.trim() || 'Paris',
        origin_city: origin.trim() || 'Madrid',
        start_date: startDate,
        end_date: endDate,
        budget_usd: Number(budgetUsd) || 1500,
        meals,
        manual_constraints: {
          budget_usd: Number(budgetUsd) || 1500,
          meals,
        },
      };
      onPersonalizedSubmit(personalizedPrompt, extras);
    }
  };

  const promptPresets = [
    { label: '🏛 Architecture & Art', text: 'Focus on iconic architecture, world-class art museums, and historical landmarks.' },
    { label: '🍷 Gastronomy & Cafes', text: 'Highlight traditional local bistros, artisanal bakeries, cozy coffee shops, and authentic food markets.' },
    { label: '🌿 Hidden Gems', text: 'Avoid large tourist queues. Prioritize charming hidden alleys, quiet parks, and neighborhood secrets.' },
    { label: '⚡ Fast-Paced', text: 'High-intensity efficient route covering maximum top sights with smooth transit connections.' },
  ];

  return (
    <div style={{ width: '100%', maxWidth: '1000px', margin: '0 auto' }}>
      {/* ================= STAGE 1: TWO WINDOWS SELECTION ================= */}
      {selectedMode === 'none' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '2rem',
            width: '100%',
            animation: 'fadeInSlide 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Card 1: Blank Trip */}
          <div
            onClick={() => setSelectedMode('blank')}
            style={{
              background: 'var(--color-surface-raised, #FFFFFF)',
              border: '1px solid var(--color-border)',
              borderRadius: '28px',
              padding: '2.5rem 2rem',
              boxShadow: 'var(--shadow-sm, 0 4px 20px rgba(0,0,0,0.04))',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              textAlign: 'center',
              gap: '2rem',
              cursor: 'pointer',
              minHeight: '320px',
              transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.borderColor = 'var(--color-accent-primary, #0F4C5C)';
              e.currentTarget.style.boxShadow = '0 12px 32px rgba(15, 76, 92, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.boxShadow = 'var(--shadow-sm, 0 4px 20px rgba(0,0,0,0.04))';
            }}
          >
            <div>
              <h3
                className="font-display"
                style={{
                  margin: 0,
                  fontSize: '1.75rem',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.01em',
                }}
              >
                Blank Trip
              </h3>
              <p
                className="font-sans text-muted"
                style={{
                  fontSize: '14px',
                  margin: '12px 0 0 0',
                  lineHeight: 1.5,
                  maxWidth: '320px',
                }}
              >
                Create an unscripted trip. Seeds destination attractions, dining, and transit schedules without generating an automated daily itinerary.
              </p>
            </div>

            {/* Big Button with Plus Sign */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedMode('blank');
              }}
              aria-label="Create Blank Trip"
              style={{
                width: '76px',
                height: '76px',
                borderRadius: '50%',
                background: 'var(--color-bg-main, #F0F2F4)',
                border: '1.5px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--color-accent-primary, #0F4C5C)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>

          {/* Card 2: Personalized Trip */}
          <div
            onClick={() => setSelectedMode('personalized')}
            style={{
              background: 'var(--color-surface-raised, #FFFFFF)',
              border: '1px solid var(--color-border)',
              borderRadius: '28px',
              padding: '2.5rem 2rem',
              boxShadow: 'var(--shadow-sm, 0 4px 20px rgba(0,0,0,0.04))',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              textAlign: 'center',
              gap: '2rem',
              cursor: 'pointer',
              minHeight: '320px',
              transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.borderColor = '#2563EB';
              e.currentTarget.style.boxShadow = '0 12px 32px rgba(37, 99, 235, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = 'var(--color-border)';
              e.currentTarget.style.boxShadow = 'var(--shadow-sm, 0 4px 20px rgba(0,0,0,0.04))';
            }}
          >
            <div>
              <h3
                className="font-display"
                style={{
                  margin: 0,
                  fontSize: '1.75rem',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.01em',
                }}
              >
                Personalized Trip
              </h3>
              <p
                className="font-sans text-muted"
                style={{
                  fontSize: '14px',
                  margin: '12px 0 0 0',
                  lineHeight: 1.5,
                  maxWidth: '320px',
                }}
              >
                Give a prompt with your travel vision. The sovereign engine crafts an optimal day-by-day itinerary tailored to your rhythm.
              </p>
            </div>

            {/* Big Button with Plus Sign */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedMode('personalized');
              }}
              aria-label="Create Personalized Trip"
              style={{
                width: '76px',
                height: '76px',
                borderRadius: '50%',
                background: 'var(--color-bg-main, #F0F2F4)',
                border: '1.5px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#2563EB',
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ================= STAGE 2: BLANK TRIP DETAIL FORM ================= */}
      {selectedMode === 'blank' && (
        <div
          style={{
            background: 'var(--color-surface-raised, #FFFFFF)',
            border: '1px solid var(--color-border)',
            borderRadius: '28px',
            padding: '2rem',
            boxShadow: 'var(--shadow-sm, 0 4px 24px rgba(0,0,0,0.04))',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            animation: 'fadeInSlide 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Top Bar with Back Button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem' }}>
            <button
              type="button"
              onClick={() => setSelectedMode('none')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--color-bg-main, #F0F2F4)',
                border: '1px solid var(--color-border)',
                borderRadius: '9999px',
                padding: '6px 14px',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              ← Back to trip types
            </button>
            <h3 className="font-display" style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Blank Trip
            </h3>
          </div>

          <p className="font-sans text-xs text-muted" style={{ margin: 0, lineHeight: 1.5 }}>
            Seeds destination attractions, dining venues, and GTFS transit schedules in the database. The daily schedule remains blank so you can curate every stop manually.
          </p>

          {/* Pill Input Form */}
          <form id="blank-trip-form" onSubmit={handleCreateBlankTrip} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* Destination */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'var(--color-bg-main, #F7F9FA)',
                border: '1px solid var(--color-border)',
                borderRadius: '9999px',
                padding: '9px 18px',
              }}
            >
              <PinIcon size={16} color="var(--color-accent-primary, #0F4C5C)" />
              <input
                type="text"
                required
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Destination (e.g. Paris, Tokyo, Rome, New York)"
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  color: 'var(--color-text-primary)',
                }}
              />
              <span className="font-mono text-xs text-muted" style={{ flexShrink: 0 }}>REQUIRED</span>
            </div>

            {/* Origin */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'var(--color-bg-main, #F7F9FA)',
                border: '1px solid var(--color-border)',
                borderRadius: '9999px',
                padding: '9px 18px',
              }}
            >
              <PlaneIcon size={16} color="var(--color-text-muted)" />
              <input
                type="text"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="Origin / Home base (e.g. Madrid, London, Berlin)"
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>

            {/* Dates & Duration */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr auto',
                alignItems: 'center',
                gap: '10px',
                background: 'var(--color-bg-main, #F7F9FA)',
                border: '1px solid var(--color-border)',
                borderRadius: '9999px',
                padding: '8px 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CalendarIcon size={14} color="var(--color-text-muted)" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    color: 'var(--color-text-primary)',
                    width: '100%',
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="font-mono text-xs text-muted">→</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    color: 'var(--color-text-primary)',
                    width: '100%',
                  }}
                />
              </div>
              <span
                style={{
                  background: 'var(--color-surface-raised, #FFFFFF)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '9999px',
                  padding: '2px 10px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  flexShrink: 0,
                }}
              >
                {tripDurationDays} {tripDurationDays === 1 ? 'DAY' : 'DAYS'}
              </span>
            </div>

            {/* Budget */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'var(--color-bg-main, #F7F9FA)',
                border: '1px solid var(--color-border)',
                borderRadius: '9999px',
                padding: '9px 18px',
              }}
            >
              <span className="font-mono text-muted" style={{ fontWeight: 600, fontSize: '14px' }}>$</span>
              <input
                type="number"
                min={0}
                step={50}
                value={budgetUsd}
                onChange={(e) => setBudgetUsd(Number(e.target.value))}
                placeholder="Budget ceiling (USD)"
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '14px',
                  color: 'var(--color-text-primary)',
                }}
              />
              <span className="font-mono text-xs text-muted" style={{ flexShrink: 0 }}>USD ENVELOPE</span>
            </div>

            {/* Hotel / Stay Anchor */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: 'var(--color-bg-main, #F7F9FA)',
                border: '1px solid var(--color-border)',
                borderRadius: '9999px',
                padding: '9px 18px',
              }}
            >
              <HotelIcon size={16} color="var(--color-text-muted)" />
              <input
                type="text"
                value={hotelArea}
                onChange={(e) => setHotelArea(e.target.value)}
                placeholder="Primary hotel / neighborhood (optional anchor)"
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>
          </form>

          {/* Feedback */}
          {blankError && (
            <div
              style={{
                background: 'rgba(179, 38, 30, 0.08)',
                border: '1px solid rgba(179, 38, 30, 0.2)',
                borderRadius: '12px',
                padding: '8px 12px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-danger, #B3261E)',
              }}
            >
              {blankError}
            </div>
          )}
          {blankSuccess && (
            <div
              style={{
                background: 'rgba(31, 122, 77, 0.08)',
                border: '1px solid rgba(31, 122, 77, 0.2)',
                borderRadius: '12px',
                padding: '8px 12px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-success, #1F7A4D)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <CheckIcon size={14} color="var(--color-success, #1F7A4D)" /> {blankSuccess}
            </div>
          )}

          {/* Submit Action */}
          <button
            type="submit"
            form="blank-trip-form"
            disabled={isCreatingBlank || disabled}
            style={{
              width: '100%',
              padding: '13px 24px',
              borderRadius: '9999px',
              border: 'none',
              background: isCreatingBlank ? 'var(--color-text-muted)' : 'var(--color-accent-primary, #0F4C5C)',
              color: '#FFFFFF',
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isCreatingBlank ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
              boxShadow: '0 2px 8px rgba(15, 76, 92, 0.25)',
            }}
          >
            {isCreatingBlank ? (
              <>
                <Spinner size={16} color="#FFFFFF" />
                Creating Blank Trip & Seeding POIs...
              </>
            ) : (
              <>Create Blank Trip →</>
            )}
          </button>
        </div>
      )}

      {/* ================= STAGE 3: PERSONALIZED TRIP DETAIL FORM ================= */}
      {selectedMode === 'personalized' && (
        <div
          style={{
            background: 'var(--color-surface-raised, #FFFFFF)',
            border: '1px solid var(--color-border)',
            borderRadius: '28px',
            padding: '2rem',
            boxShadow: 'var(--shadow-sm, 0 4px 24px rgba(0,0,0,0.04))',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            animation: 'fadeInSlide 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Top Bar with Back Button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem' }}>
            <button
              type="button"
              onClick={() => setSelectedMode('none')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--color-bg-main, #F0F2F4)',
                border: '1px solid var(--color-border)',
                borderRadius: '9999px',
                padding: '6px 14px',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              ← Back to trip types
            </button>
            <h3 className="font-display" style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Personalized Trip
            </h3>
          </div>

          <p className="font-sans text-xs text-muted" style={{ margin: 0, lineHeight: 1.5 }}>
            Provide your travel intent. The sovereign C++20 engine selects POIs, clusters them by district, and solves optimal daily time-windows and transit legs.
          </p>

          {/* Form */}
          <form id="personalized-trip-form" onSubmit={handlePersonalizedSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* Prompt Textarea Area */}
            <div
              style={{
                background: 'var(--color-bg-main, #F7F9FA)',
                border: '1px solid var(--color-border)',
                borderRadius: '20px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="font-mono text-xs text-muted" style={{ fontWeight: 600 }}>
                  Q INTENT & PREFERENCES
                </span>
                <span className="font-mono text-xs text-muted">NATURAL LANGUAGE</span>
              </div>
              <textarea
                rows={3}
                value={personalizedPrompt}
                onChange={(e) => setPersonalizedPrompt(e.target.value)}
                placeholder="Describe your travel vision, favorite cuisines, must-see places, or preferred rhythm..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  color: 'var(--color-text-primary)',
                  resize: 'none',
                  lineHeight: 1.45,
                }}
              />
              {/* Preset Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingTop: '4px' }}>
                {promptPresets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setPersonalizedPrompt(preset.text)}
                    style={{
                      background: 'var(--color-surface-raised, #FFFFFF)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '9999px',
                      padding: '4px 12px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-sans)',
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.1s ease',
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Destination & Origin */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'var(--color-bg-main, #F7F9FA)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '9999px',
                  padding: '9px 16px',
                }}
              >
                <PinIcon size={16} color="var(--color-accent-primary, #0F4C5C)" />
                <input
                  type="text"
                  required
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Destination (e.g. Paris)"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'var(--color-bg-main, #F7F9FA)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '9999px',
                  padding: '9px 16px',
                }}
              >
                <PlaneIcon size={16} color="var(--color-text-muted)" />
                <input
                  type="text"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="Origin City (e.g. Madrid)"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
            </div>

            {/* Dates & Budget */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--color-bg-main, #F7F9FA)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '9999px',
                  padding: '8px 14px',
                }}
              >
                <CalendarIcon size={14} color="var(--color-text-muted)" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--color-text-primary)',
                    width: '100%',
                  }}
                />
                <span className="font-mono text-muted text-xs">→</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--color-text-primary)',
                    width: '100%',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--color-bg-main, #F7F9FA)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '9999px',
                  padding: '8px 16px',
                }}
              >
                <span className="font-mono text-muted" style={{ fontSize: '13px', fontWeight: 600 }}>$</span>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={budgetUsd}
                  onChange={(e) => setBudgetUsd(Number(e.target.value))}
                  placeholder="Budget"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    color: 'var(--color-text-primary)',
                  }}
                />
                <span className="font-mono text-xs text-muted">USD</span>
              </div>
            </div>

            {/* Ingestion Mode */}
            <div
              style={{
                display: 'flex',
                background: 'var(--color-bg-main, #F7F9FA)',
                border: '1px solid var(--color-border)',
                borderRadius: '9999px',
                padding: '3px',
                gap: '4px',
              }}
            >
              <button
                type="button"
                onClick={() => setAnchorMode('simulated')}
                style={{
                  flex: 1,
                  padding: '6px 14px',
                  border: 'none',
                  borderRadius: '9999px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: anchorMode === 'simulated' ? 'var(--color-surface-raised, #FFFFFF)' : 'transparent',
                  color: anchorMode === 'simulated' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  boxShadow: anchorMode === 'simulated' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                Simulated Anchors (Test Mode)
              </button>
              <button
                type="button"
                onClick={() => setAnchorMode('direct')}
                style={{
                  flex: 1,
                  padding: '6px 14px',
                  border: 'none',
                  borderRadius: '9999px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: anchorMode === 'direct' ? 'var(--color-surface-raised, #FFFFFF)' : 'transparent',
                  color: anchorMode === 'direct' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  boxShadow: anchorMode === 'direct' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                Direct Ticket Ingestion (Prod)
              </button>
            </div>

            {anchorMode === 'direct' && (
              <textarea
                rows={2}
                value={rawBookingText}
                onChange={(e) => setRawBookingText(e.target.value)}
                placeholder="Paste airline PNR confirmation text, flight dates, hotel booking..."
                style={{
                  background: 'var(--color-bg-main, #F7F9FA)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                  resize: 'none',
                }}
              />
            )}
          </form>

          {/* Inference Status Badge */}
          {status === 'inferencing' && (
            <div
              style={{
                background: 'rgba(37, 99, 235, 0.08)',
                border: '1px solid rgba(37, 99, 235, 0.2)',
                borderRadius: '12px',
                padding: '10px 14px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Spinner size={16} color="#2563EB" />
              <span>Swarm inferencing & optimizing route in C++20...</span>
            </div>
          )}

          {/* Submit Action */}
          <button
            type="submit"
            form="personalized-trip-form"
            disabled={disabled || status === 'inferencing'}
            style={{
              width: '100%',
              padding: '13px 24px',
              borderRadius: '9999px',
              border: 'none',
              background: status === 'inferencing' || disabled ? 'var(--color-text-muted)' : '#2563EB',
              color: '#FFFFFF',
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: status === 'inferencing' || disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
            }}
          >
            {status === 'inferencing' ? (
              <>
                <Spinner size={16} color="#FFFFFF" />
                Optimization In Progress...
              </>
            ) : (
              <>Initialize & Optimize Trip →</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
