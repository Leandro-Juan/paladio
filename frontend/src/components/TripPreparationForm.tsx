"use client";

import React, { useState } from 'react';
import { MealRequirement } from '@/types/domain';

interface TripPreparationFormProps {
  onSubmit: (prompt: string, extras: Record<string, unknown>) => void;
  disabled?: boolean;
}

export function TripPreparationForm({ onSubmit, disabled = false }: TripPreparationFormProps) {
  // 1. Natural Language Intent Prompt
  const [prompt, setPrompt] = useState(
    'Visit the main cultural landmarks and museums. Love traditional bistros and relaxed cafes.'
  );

  // 2. Financial Budget Ceiling
  const [budgetUsd, setBudgetUsd] = useState(1500);

  // 3. Meal Constraints (Breakfast, Lunch & Dinner by default as supported by solver)
  const [meals, setMeals] = useState<MealRequirement[]>([
    { meal_type: 'BREAKFAST', start_time: '08:00', end_time: '10:00' },
    { meal_type: 'LUNCH', start_time: '12:00', end_time: '14:30' },
    { meal_type: 'DINNER', start_time: '19:30', end_time: '22:00' },
  ]);

  // 4. Ingestion Mode: 'simulated' (Test Mode) vs 'direct' (Production)
  const [anchorMode, setAnchorMode] = useState<'simulated' | 'direct'>('simulated');

  // Simulated Anchors (Test Mode) fields
  const [originCity, setOriginCity] = useState('Madrid');
  const [destinationCity, setDestinationCity] = useState('Paris');

  // Direct Ingestion (Production Mode) fields
  const [rawBookingText, setRawBookingText] = useState('');

  const handleMealChange = (
    index: number,
    field: 'meal_type' | 'start_time' | 'end_time',
    value: string
  ) => {
    const updated = [...meals];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'meal_type') {
      if (value === 'BREAKFAST' && updated[index].start_time === '16:00') {
        updated[index].start_time = '08:00';
        updated[index].end_time = '10:00';
      } else if (value === 'SNACK' && updated[index].start_time === '08:00') {
        updated[index].start_time = '16:00';
        updated[index].end_time = '17:00';
      }
    }
    setMeals(updated);
  };

  const handleAddMeal = () => {
    const hasBreakfast = meals.some((m) => m.meal_type.toUpperCase() === 'BREAKFAST');
    if (!hasBreakfast) {
      setMeals([
        { meal_type: 'BREAKFAST', start_time: '08:00', end_time: '10:00' },
        ...meals,
      ]);
    } else {
      setMeals([
        ...meals,
        { meal_type: 'SNACK', start_time: '16:00', end_time: '17:00' },
      ]);
    }
  };

  const handleRemoveMeal = (index: number) => {
    if (meals.length <= 2) {
      // Keep at least two meal windows for solver stability
      return;
    }
    setMeals(meals.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    if (anchorMode === 'simulated') {
      const extras: Record<string, unknown> = {
        test_mode: true,
        origin_city: originCity.trim() || 'Madrid',
        destination_city: destinationCity.trim() || 'Paris',
        budget_usd: Number(budgetUsd) || 1500,
        meals,
        manual_constraints: {
          origin_city: originCity.trim() || 'Madrid',
          destination_city: destinationCity.trim() || 'Paris',
          budget_usd: Number(budgetUsd) || 1500,
          meals,
        },
      };
      onSubmit(prompt, extras);
    } else {
      const extras: Record<string, unknown> = {
        test_mode: false,
        booking_text: rawBookingText,
        budget_usd: Number(budgetUsd) || 1500,
        meals,
        manual_constraints: {
          budget_usd: Number(budgetUsd) || 1500,
          meals,
        },
      };
      onSubmit(prompt, extras);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 1. Trip Mission Intent */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <label className="font-mono text-sm" style={{ fontWeight: 600 }}>
          {'>'} TRIP INTENT & PREFERENCES
        </label>
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe landmarks to visit, favorite cuisines, travel pace..."
          disabled={disabled}
          style={{
            background: 'var(--color-bg-main)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '0.75rem',
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            color: 'var(--color-text-primary)',
            resize: 'vertical',
            outline: 'none',
          }}
        />
      </div>

      {/* 2. Budget Ceiling */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="font-mono text-sm" style={{ fontWeight: 600 }}>
            {'>'} BUDGET CEILING
          </label>
          <span className="font-mono text-xs text-muted">USD CURRENCY ENVELOPE</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--color-bg-main)',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              padding: '0 0.75rem',
              flex: 1,
            }}
          >
            <span className="font-mono text-muted" style={{ marginRight: '0.5rem' }}>$</span>
            <input
              type="number"
              min={0}
              step={50}
              value={budgetUsd}
              onChange={(e) => setBudgetUsd(Number(e.target.value))}
              disabled={disabled}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '0.6rem 0',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.95rem',
                color: 'var(--color-text-primary)',
                width: '100%',
                outline: 'none',
              }}
            />
            <span className="font-mono text-xs text-muted">USD</span>
          </div>
        </div>
      </div>

      {/* 3. Meal Constraints */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="font-mono text-sm" style={{ fontWeight: 600 }}>
            {'>'} MEAL CONSTRAINTS
          </label>
          <span className="font-mono text-xs text-muted">MANDATORY C++ WINDOWS</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {meals.map((meal, idx) => (
            <div
              key={idx}
              className="bg-surface border-subtle"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                gap: '0.75rem',
              }}
            >
              <select
                value={meal.meal_type}
                onChange={(e) => handleMealChange(idx, 'meal_type', e.target.value)}
                disabled={disabled}
                className="font-mono text-xs text-accent"
                style={{
                  background: 'var(--color-bg-main)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  padding: '0.25rem 0.4rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none',
                  minWidth: '105px',
                }}
              >
                <option value="BREAKFAST">BREAKFAST</option>
                <option value="LUNCH">LUNCH</option>
                <option value="DINNER">DINNER</option>
                <option value="SNACK">SNACK</option>
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                <input
                  type="time"
                  value={meal.start_time}
                  onChange={(e) => handleMealChange(idx, 'start_time', e.target.value)}
                  disabled={disabled}
                  style={{
                    background: 'var(--color-bg-main)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    padding: '0.25rem 0.4rem',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    color: 'var(--color-text-primary)',
                  }}
                />
                <span className="font-mono text-xs text-muted">➔</span>
                <input
                  type="time"
                  value={meal.end_time}
                  onChange={(e) => handleMealChange(idx, 'end_time', e.target.value)}
                  disabled={disabled}
                  style={{
                    background: 'var(--color-bg-main)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    padding: '0.25rem 0.4rem',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
              {meals.length > 2 && (
                <button
                  type="button"
                  onClick={() => handleRemoveMeal(idx)}
                  disabled={disabled}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    fontSize: '1rem',
                  }}
                  title="Remove meal window"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={handleAddMeal}
          disabled={disabled}
          style={{
            alignSelf: 'flex-start',
            background: 'transparent',
            border: '1px dashed var(--color-border)',
            color: 'var(--color-text-muted)',
            padding: '0.3rem 0.6rem',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            marginTop: '0.2rem',
          }}
        >
          + ADD MEAL WINDOW
        </button>
      </div>

      {/* 4. Travel Anchors: Segmented Mode Switcher */}
      <div
        className="bg-surface border-subtle"
        style={{
          borderRadius: '8px',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="font-mono text-sm" style={{ fontWeight: 600 }}>
            {'>'} TRAVEL ANCHORS (FLIGHTS & HOTEL)
          </label>
        </div>

        {/* Segmented Control */}
        <div
          style={{
            display: 'flex',
            background: 'var(--color-bg-main)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '3px',
            gap: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => setAnchorMode('simulated')}
            disabled={disabled}
            style={{
              flex: 1,
              padding: '0.45rem',
              border: 'none',
              borderRadius: '4px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: anchorMode === 'simulated' ? 'var(--color-accent-primary)' : 'transparent',
              color: anchorMode === 'simulated' ? '#FFF' : 'var(--color-text-muted)',
              transition: 'all 0.2s',
            }}
          >
            SIMULATED ANCHORS (TEST MODE)
          </button>
          <button
            type="button"
            onClick={() => setAnchorMode('direct')}
            disabled={disabled}
            style={{
              flex: 1,
              padding: '0.45rem',
              border: 'none',
              borderRadius: '4px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: anchorMode === 'direct' ? 'var(--color-accent-primary)' : 'transparent',
              color: anchorMode === 'direct' ? '#FFF' : 'var(--color-text-muted)',
              transition: 'all 0.2s',
            }}
          >
            DIRECT TICKET INGESTION (PROD)
          </button>
        </div>

        {/* Content for Simulated Anchors Mode */}
        {anchorMode === 'simulated' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div
              style={{
                background: 'rgba(30, 58, 138, 0.05)',
                border: '1px solid rgba(30, 58, 138, 0.2)',
                borderRadius: '6px',
                padding: '0.6rem 0.75rem',
              }}
            >
              <div className="font-mono text-xs text-accent" style={{ fontWeight: 600, marginBottom: '2px' }}>
                {'// 5-DAY AUTOMATED MOCK GENERATION'}
              </div>
              <p className="font-mono text-xs text-muted" style={{ margin: 0, lineHeight: 1.4 }}>
                Schedules round-trip flights between real IATA airports and verifies a real hotel in the destination city for 5 days next week relative to today&apos;s date.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <span className="font-mono text-xs text-muted">ORIGIN CITY</span>
                <input
                  type="text"
                  value={originCity}
                  onChange={(e) => setOriginCity(e.target.value)}
                  placeholder="e.g. Madrid"
                  disabled={disabled}
                  style={{
                    background: 'var(--color-bg-main)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    padding: '0.5rem',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.85rem',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <span className="font-mono text-xs text-muted">DESTINATION CITY</span>
                <input
                  type="text"
                  value={destinationCity}
                  onChange={(e) => setDestinationCity(e.target.value)}
                  placeholder="e.g. Paris"
                  disabled={disabled}
                  style={{
                    background: 'var(--color-bg-main)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    padding: '0.5rem',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.85rem',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div
              className="font-mono text-xs text-muted"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                borderTop: '1px dashed var(--color-border)',
                paddingTop: '0.5rem',
              }}
            >
              <span className="text-accent">✈ ROUTE:</span>
              <span>{originCity.toUpperCase()} ➔ {destinationCity.toUpperCase()}</span>
              <span style={{ marginLeft: 'auto', opacity: 0.7 }}>5 DAYS NEXT WEEK</span>
            </div>
          </div>
        ) : (
          /* Content for Direct Ticket Ingestion Mode */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span className="font-mono text-xs text-muted">
              Paste airline confirmation text, flight PNR, and hotel reservation:
            </span>
            <textarea
              rows={4}
              value={rawBookingText}
              onChange={(e) => setRawBookingText(e.target.value)}
              placeholder="e.g. Flight outbound MAD to CDG on 2026-09-16 10:00. Flight return CDG to MAD on 2026-09-21 14:00. The Grand Hotel Paris booked..."
              disabled={disabled}
              style={{
                background: 'var(--color-bg-main)',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                padding: '0.6rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                color: 'var(--color-text-primary)',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>
        )}
      </div>

      {/* 5. Initialize Optimization Button */}
      <button
        type="submit"
        disabled={disabled}
        style={{
          padding: '0.85rem',
          background: disabled ? 'var(--color-text-muted)' : 'var(--color-accent-primary)',
          color: '#FFF',
          border: 'none',
          borderRadius: '6px',
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-display)',
          fontSize: '0.95rem',
          letterSpacing: '0.03em',
          transition: 'background 0.2s',
        }}
      >
        {disabled ? 'OPTIMIZATION IN PROGRESS...' : `INITIALIZE SOLVER [ ${originCity.toUpperCase()} ➔ ${destinationCity.toUpperCase()} ]`}
      </button>
    </form>
  );
}
