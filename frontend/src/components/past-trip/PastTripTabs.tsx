"use client";

import React, { useState } from 'react';
import { useNotificationStore } from '@/stores/notificationStore';
import { BalancesWidget } from '@/components/trip-workspace/costs/BalancesWidget';
import { CategoryBreakdownWidget } from '@/components/trip-workspace/costs/CategoryBreakdownWidget';
import { TripPhotosView } from '@/components/trip-workspace/TripPhotosView';
import type { TripParticipant, TripSettlement } from '@/hooks/useTrips';
import type { DisplayExpenseItem } from '@/components/trip-workspace/costs/ExpenseRow';

import { MinimalistPoiCard } from '@/components/trip-workspace/MinimalistPoiCard';
import { getScheduledPoiTimes } from '@/utils/date';
import type { ScheduledPoi } from '@/types/domain';

export type PastTripTabId = 'about' | 'itinerary' | 'costs' | 'photos';

interface PastTripTabsProps {
  activeTab: PastTripTabId;
  onTabChange: (tab: PastTripTabId) => void;
  description: string;
  notes: string;
  onSaveDescriptionAndNotes: (desc: string, notes: string) => Promise<boolean>;
  itineraryData: unknown;
  selectedDay: number | null;
  participants: TripParticipant[];
  settlement: TripSettlement | null;
  expenseItems: DisplayExpenseItem[];
  currency: string;
  photos: string[];
  destination?: string;
}

export function PastTripTabs({
  activeTab,
  onTabChange,
  description,
  notes,
  onSaveDescriptionAndNotes,
  itineraryData,
  selectedDay,
  participants,
  settlement,
  expenseItems,
  currency,
  photos,
  destination = '',
}: PastTripTabsProps) {
  const { addNotification } = useNotificationStore();

  const [isEditing, setIsEditing] = useState(false);
  const [draftDesc, setDraftDesc] = useState(description);
  const [draftNotes, setDraftNotes] = useState(notes);
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = () => {
    setDraftDesc(description);
    setDraftNotes(notes);
    setIsEditing(true);
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      addNotification({
        type: 'success',
        title: 'Mission Link Copied',
        message: 'The URL for this vault recap has been copied to your clipboard.',
      });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const success = await onSaveDescriptionAndNotes(draftDesc, draftNotes);
      if (success) {
        setIsEditing(false);
        addNotification({
          type: 'success',
          title: 'Mission Notes Updated',
          message: 'Your description and notes have been permanently stored.',
        });
      } else {
        addNotification({
          type: 'error',
          title: 'Update Failed',
          message: 'Could not update trip notes on the server. Please try again.',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setDraftDesc(description);
    setDraftNotes(notes);
    setIsEditing(false);
  };

  // Extract day stops for Itinerary tab
  const daysList = React.useMemo(() => {
    const itin = itineraryData as {
      days?: Array<{
        day?: number;
        theme?: string;
        itinerary?: {
          path?: Array<{
            poi?: {
              id?: string;
              name?: string;
              category?: string;
              address?: string;
              duration_mins?: number;
              cost_eur?: number;
            };
            arrival_time?: string;
            departure_time?: string;
          }>;
        };
      }>;
    } | null | undefined;

    return itin?.days || [];
  }, [itineraryData]);

  const filteredDays = React.useMemo(() => {
    if (selectedDay === null) return daysList;
    return daysList.filter((d, idx) => {
      const dNum = typeof d.day === 'number' ? d.day : idx + 1;
      return dNum === selectedDay;
    });
  }, [daysList, selectedDay]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Tab Navigation Header (matching mockup with green underline & icons on right) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1.5px solid var(--color-border-subtle, rgba(15, 76, 92, 0.08))',
          paddingBottom: '0.25rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', gap: '1.75rem' }}>
          {(
            [
              { id: 'about', label: 'About' },
              { id: 'itinerary', label: 'Itinerary' },
              { id: 'costs', label: 'Costs' },
              { id: 'photos', label: 'Photos' },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onTabChange(tab.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '8px 2px',
                  fontFamily: 'var(--font-display, "Jost", sans-serif)',
                  fontSize: '0.92rem',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'var(--color-accent-teal, #0F4C5C)' : 'var(--color-text-muted, #566B76)',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'color 0.15s ease',
                }}
              >
                {tab.label}
                {isActive && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '-3.5px',
                      left: 0,
                      right: 0,
                      height: '3px',
                      borderRadius: '2px',
                      background: 'var(--color-accent-primary, #0F4C5C)',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Action icons on right (matching mockup share & more buttons) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={handleCopyLink}
            title="Share Vault Recap"
            aria-label="Share Vault Recap"
            style={{
              background: 'none',
              border: 'none',
              padding: '6px',
              borderRadius: '6px',
              cursor: 'pointer',
              color: 'var(--color-text-muted, #566B76)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-accent-primary, #0F4C5C)';
              e.currentTarget.style.background = 'rgba(15, 76, 92, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-muted, #566B76)';
              e.currentTarget.style.background = 'none';
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>

          {activeTab === 'about' && !isEditing && (
            <button
              type="button"
              onClick={startEditing}
              title="Edit Description & Notes"
              aria-label="Edit Description & Notes"
              style={{
                background: 'none',
                border: 'none',
                padding: '6px',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--color-text-muted, #566B76)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-accent-primary, #0F4C5C)';
                e.currentTarget.style.background = 'rgba(15, 76, 92, 0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-muted, #566B76)';
                e.currentTarget.style.background = 'none';
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tab Panes */}
      {activeTab === 'about' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {isEditing ? (
            /* Inline Edit Mode */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                background: '#FFFFFF',
                borderRadius: '16px',
                padding: '1.5rem',
                border: '1px solid var(--color-accent-primary, #0F4C5C)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div>
                <label
                  className="font-mono"
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    color: 'var(--color-text-primary, #1A2B32)',
                    marginBottom: '6px',
                  }}
                >
                  Trip Summary & Narrative
                </label>
                <textarea
                  value={draftDesc}
                  onChange={(e) => setDraftDesc(e.target.value)}
                  placeholder="Record your memories or impressions of this destination..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    fontFamily: 'inherit',
                    fontSize: '0.9rem',
                    color: 'var(--color-text-primary)',
                    background: 'var(--color-bg-main)',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <label
                  className="font-mono"
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    color: 'var(--color-text-primary, #1A2B32)',
                    marginBottom: '6px',
                  }}
                >
                  Field Notes & Debrief
                </label>
                <textarea
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  placeholder="Key recommendations, packing tips, or secret spots..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    fontFamily: 'inherit',
                    fontSize: '0.9rem',
                    color: 'var(--color-text-primary)',
                    background: 'var(--color-bg-main)',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isSaving}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: 'transparent',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--color-accent-primary, #0F4C5C)',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(15, 76, 92, 0.25)',
                  }}
                >
                  {isSaving ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
            </div>
          ) : (
            /* Read-Only Display Mode */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <h3
                  className="font-display"
                  style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: 'var(--color-text-primary, #1A2B32)',
                    margin: '0 0 0.5rem',
                  }}
                >
                  Expedition Narrative
                </h3>
                <p
                  style={{
                    fontSize: '0.9rem',
                    lineHeight: 1.65,
                    color: description ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    fontStyle: description ? 'normal' : 'italic',
                    margin: 0,
                  }}
                >
                  {description ||
                    'No summary recorded for this expedition yet. Click the pencil icon above to write your notes.'}
                </p>
              </div>

              <div>
                <h3
                  className="font-display"
                  style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: 'var(--color-text-primary, #1A2B32)',
                    margin: '0 0 0.5rem',
                  }}
                >
                  Field Notes & Observations
                </h3>
                <p
                  style={{
                    fontSize: '0.9rem',
                    lineHeight: 1.65,
                    color: notes ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    fontStyle: notes ? 'normal' : 'italic',
                    margin: 0,
                  }}
                >
                  {notes || 'No field notes attached.'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'itinerary' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {filteredDays.length === 0 ? (
            <div className="font-mono text-muted text-sm" style={{ padding: '2rem 0' }}>
              [ NO ITINERARY STOPS FOUND FOR SELECTED VIEW ]
            </div>
          ) : (
            filteredDays.map((day, idx) => {
              const dayNum = typeof day.day === 'number' ? day.day : idx + 1;
              const path = day.itinerary?.path || [];

              return (
                <div
                  key={dayNum}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid var(--color-border-subtle, rgba(15, 76, 92, 0.08))',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span
                      className="font-display"
                      style={{
                        fontSize: '1.05rem',
                        fontWeight: 700,
                        color: 'var(--color-accent-teal, #0F4C5C)',
                      }}
                    >
                      Day {dayNum} {day.theme ? `— ${day.theme}` : ''}
                    </span>
                    <span className="font-mono text-muted" style={{ fontSize: '0.72rem' }}>
                      {path.length} {path.length === 1 ? 'Stop' : 'Stops'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {path.map((step, sIdx) => {
                      const p = step.poi;
                      const { start: startTime, end: endTime } = getScheduledPoiTimes(step as unknown as ScheduledPoi);
                      const stopNum = String(sIdx + 1).padStart(2, '0');
                      const effectiveStartTime = startTime !== '--:--' ? startTime : step.arrival_time;
                      const effectiveEndTime = endTime !== '--:--' ? endTime : step.departure_time;

                      return (
                        <React.Fragment key={p?.name ? `${p.name}-${sIdx}` : `step-${sIdx}`}>
                          {sIdx > 0 && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                paddingLeft: '32px',
                                height: '14px',
                                position: 'relative',
                              }}
                            >
                              <div
                                style={{
                                  width: '0px',
                                  height: '100%',
                                  borderLeft: '2px dashed var(--color-accent-teal-deep, #0F4C5C)',
                                  opacity: 0.8,
                                }}
                              />
                            </div>
                          )}
                          <MinimalistPoiCard
                            id={p?.id}
                            name={p?.name || 'Waypoint'}
                            category={p?.category}
                            startTime={effectiveStartTime}
                            endTime={effectiveEndTime}
                            durationMins={p?.duration_mins}
                            costEur={p?.cost_eur}
                            city={destination}
                            stopNum={stopNum}
                          />
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'costs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <CategoryBreakdownWidget items={expenseItems} currency={currency} />
          {settlement && (
            <BalancesWidget
              balances={settlement.balances}
              participants={participants}
              currency={currency}
            />
          )}
        </div>
      )}

      {activeTab === 'photos' && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <TripPhotosView photos={photos} />
        </div>
      )}
    </div>
  );
}
