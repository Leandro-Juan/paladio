"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Trip, TripParticipant, TripExpense, TripSettlement, useTrips } from '@/hooks/useTrips';
import type { RouteItineraryData } from '@/app/vault/[id]/page';

interface TripBudgetWalletProps {
  trip: Trip;
  itinerary?: RouteItineraryData | null;
  onTripUpdated?: () => void;
}

type TabType = 'dissection' | 'expenses' | 'settlement';

export function TripBudgetWallet({ trip, itinerary, onTripUpdated }: TripBudgetWalletProps) {
  const {
    getTripExpenses,
    addTripExpense,
    deleteTripExpense,
    getTripSettlement,
  } = useTrips();

  const [activeTab, setActiveTab] = useState<TabType>('dissection');
  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [settlement, setSettlement] = useState<TripSettlement | null>(null);

  // Modal / Form state for Add Expense
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('food');
  const [payerId, setPayerId] = useState('');
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const participants: TripParticipant[] = useMemo(() => trip.participants || [], [trip.participants]);

  const loadData = useCallback(async () => {
    if (!trip.id) return;
    try {
      const [expList, settl] = await Promise.all([
        getTripExpenses(trip.id),
        getTripSettlement(trip.id),
      ]);
      setExpenses(expList);
      setSettlement(settl);
    } catch (err) {
      console.error('Failed to load budget and settlement data', err);
    }
  }, [trip.id, getTripExpenses, getTripSettlement]);

  useEffect(() => {
    let ignore = false;
    async function fetchData() {
      if (!trip.id) return;
      try {
        const [expList, settl] = await Promise.all([
          getTripExpenses(trip.id),
          getTripSettlement(trip.id),
        ]);
        if (!ignore) {
          setExpenses(expList);
          setSettlement(settl);
        }
      } catch (err) {
        console.error('Failed to load budget and settlement data', err);
      }
    }
    fetchData();
    return () => {
      ignore = true;
    };
  }, [trip.id, getTripExpenses, getTripSettlement]);

  // Compute Itinerary-based planned baseline costs
  const itineraryCosts = useMemo(() => {
    const transit = 0;
    let activities = 0;
    let lodging = 0;

    if (Array.isArray(itinerary?.days)) {
      itinerary.days.forEach(day => {
        // Daily total or transit
        if (day.itinerary?.path) {
          day.itinerary.path.forEach(step => {
            const cost = step.poi?.cost_eur || 0;
            const cat = (step.poi?.category || '').toLowerCase();
            if (cat.includes('hotel') || cat.includes('lodging')) {
              lodging += cost;
            } else if (cost > 0) {
              activities += cost;
            }
          });
        }
      });
    }

    return { transit, activities, lodging };
  }, [itinerary]);

  // Compute Category breakdown combining logged shared expenses + itinerary
  const categoryBreakdown = useMemo(() => {
    let transitExp = 0;
    let lodgingExp = 0;
    let activitiesExp = 0;
    let diningExp = 0;
    let otherExp = 0;

    expenses.forEach(e => {
      const c = e.category.toLowerCase();
      if (c === 'transport' || c === 'transit' || c === 'flight') {
        transitExp += e.amount;
      } else if (c === 'accommodation' || c === 'lodging' || c === 'hotel') {
        lodgingExp += e.amount;
      } else if (c === 'activities' || c === 'attraction' || c === 'poi') {
        activitiesExp += e.amount;
      } else if (c === 'food' || c === 'dining' || c === 'meals') {
        diningExp += e.amount;
      } else {
        otherExp += e.amount;
      }
    });

    const totalTransit = transitExp + itineraryCosts.transit;
    const totalLodging = lodgingExp + itineraryCosts.lodging;
    const totalActivities = activitiesExp + itineraryCosts.activities;
    const totalDining = diningExp;
    const totalOther = otherExp;

    const grandTotal = totalTransit + totalLodging + totalActivities + totalDining + totalOther;

    return {
      transit: totalTransit,
      lodging: totalLodging,
      activities: totalActivities,
      dining: totalDining,
      other: totalOther,
      grandTotal,
    };
  }, [expenses, itineraryCosts]);

  const crewCount = Math.max(participants.length, 1);
  const costPerPerson = categoryBreakdown.grandTotal > 0
    ? (categoryBreakdown.grandTotal / crewCount).toFixed(2)
    : '0.00';

  const handleOpenAddExpense = () => {
    setDescription('');
    setAmount('');
    setCategory('food');
    setPayerId(participants[0]?.id || '');
    setSplitType('equal');
    setSelectedParticipants(participants.map(p => p.id));
    setCustomSplits({});
    setFormError(null);
    setShowAddExpense(true);
  };

  const handleSelectAllParticipants = () => {
    if (selectedParticipants.length === participants.length) {
      setSelectedParticipants([]);
    } else {
      setSelectedParticipants(participants.map(p => p.id));
    }
  };

  const handleToggleParticipant = (id: string) => {
    if (selectedParticipants.includes(id)) {
      setSelectedParticipants(prev => prev.filter(p => p !== id));
    } else {
      setSelectedParticipants(prev => [...prev, id]);
    }
  };

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError('Please enter a valid expense amount greater than 0.');
      return;
    }
    if (!description.trim()) {
      setFormError('Please enter an expense description.');
      return;
    }
    if (!payerId) {
      setFormError('Please select who paid this expense.');
      return;
    }
    if (selectedParticipants.length === 0) {
      setFormError('Please select at least one traveler to split this expense with.');
      return;
    }

    let splitsPayload: { participant_id: string; amount: number }[] = [];
    if (splitType === 'equal') {
      const splitAmount = Math.round((parsedAmount / selectedParticipants.length) * 100) / 100;
      splitsPayload = selectedParticipants.map(pid => ({
        participant_id: pid,
        amount: splitAmount,
      }));
    } else {
      let customSum = 0;
      splitsPayload = selectedParticipants.map(pid => {
        const val = parseFloat(customSplits[pid] || '0');
        customSum += val;
        return {
          participant_id: pid,
          amount: isNaN(val) ? 0 : val,
        };
      });

      if (Math.abs(customSum - parsedAmount) > 0.05) {
        setFormError(`Custom split sum (€${customSum.toFixed(2)}) must equal total amount (€${parsedAmount.toFixed(2)}).`);
        return;
      }
    }

    if (!trip.id) return;
    setIsSubmitting(true);

    const res = await addTripExpense(trip.id, {
      payer_id: payerId,
      description: description.trim(),
      amount: parsedAmount,
      category,
      split_type: splitType,
      splits: splitsPayload,
      expense_date: expenseDate,
    });

    setIsSubmitting(false);

    if (res) {
      setShowAddExpense(false);
      await loadData();
      if (onTripUpdated) onTripUpdated();
    } else {
      setFormError('Failed to save expense. Please verify server connection.');
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!trip.id) return;
    const ok = await deleteTripExpense(trip.id, expenseId);
    if (ok) {
      await loadData();
      if (onTripUpdated) onTripUpdated();
    }
  };

  return (
    <div className="bg-surface border-subtle" style={{ borderRadius: '8px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h4 className="font-mono text-muted text-sm">{'// MISSION BUDGET & EXPENSE DISSECTION'}</h4>
          <p className="font-mono text-xs text-muted mt-0.5">{'// TRICOUNT LEDGER & DYNAMIC DEBT SETTLEMENT'}</p>
        </div>
        <button
          onClick={handleOpenAddExpense}
          disabled={participants.length === 0}
          style={{
            background: 'var(--color-accent-primary)',
            color: '#FFF',
            border: 'none',
            borderRadius: '4px',
            padding: '6px 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: participants.length === 0 ? 'not-allowed' : 'pointer',
            opacity: participants.length === 0 ? 0.5 : 1,
          }}
        >
          + LOG EXPENSE
        </button>
      </div>

      {/* KPI Overview Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
        <div style={{ padding: '0.75rem', background: 'var(--color-surface-card)', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
          <span className="font-mono text-xs text-muted block">TOTAL BUDGET</span>
          <span className="font-mono text-sm font-bold text-accent mt-1 block">€{categoryBreakdown.grandTotal.toFixed(2)}</span>
        </div>
        <div style={{ padding: '0.75rem', background: 'var(--color-surface-card)', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
          <span className="font-mono text-xs text-muted block">PER TRAVELER</span>
          <span className="font-mono text-sm font-bold mt-1 block">€{costPerPerson}</span>
        </div>
        <div style={{ padding: '0.75rem', background: 'var(--color-surface-card)', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
          <span className="font-mono text-xs text-muted block">CREW COUNT</span>
          <span className="font-mono text-sm font-bold mt-1 block">{participants.length} TRAVELER{participants.length !== 1 ? 'S' : ''}</span>
        </div>
        <div style={{ padding: '0.75rem', background: 'var(--color-surface-card)', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
          <span className="font-mono text-xs text-muted block">TRICOUNT STATUS</span>
          <span className="font-mono text-xs font-semibold mt-1 block" style={{ color: (settlement?.transfers.length || 0) === 0 ? '#10B981' : '#D97706' }}>
            {(settlement?.transfers.length || 0) === 0 ? 'SETTLED' : `${settlement?.transfers.length} PENDING`}
          </span>
        </div>
      </div>

      {/* Tab Switcher */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', gap: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('dissection')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'dissection' ? '2px solid var(--color-accent-primary)' : '2px solid transparent',
            color: activeTab === 'dissection' ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
            padding: '6px 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          [ DISSECTION ]
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'expenses' ? '2px solid var(--color-accent-primary)' : '2px solid transparent',
            color: activeTab === 'expenses' ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
            padding: '6px 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          [ SHARED EXPENSES ({expenses.length}) ]
        </button>
        <button
          onClick={() => setActiveTab('settlement')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'settlement' ? '2px solid var(--color-accent-primary)' : '2px solid transparent',
            color: activeTab === 'settlement' ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
            padding: '6px 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          [ DEBT SETTLEMENT ]
        </button>
      </div>

      {/* Tab 1: Category Dissection View */}
      {activeTab === 'dissection' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Visual Category Distribution Bar */}
          {categoryBreakdown.grandTotal > 0 ? (
            <div>
              <div style={{ height: '10px', borderRadius: '5px', overflow: 'hidden', display: 'flex', background: 'var(--color-border)' }}>
                {categoryBreakdown.transit > 0 && (
                  <div
                    style={{
                      width: `${(categoryBreakdown.transit / categoryBreakdown.grandTotal) * 100}%`,
                      background: '#4F46E5',
                    }}
                    title={`Transit: €${categoryBreakdown.transit.toFixed(2)}`}
                  />
                )}
                {categoryBreakdown.lodging > 0 && (
                  <div
                    style={{
                      width: `${(categoryBreakdown.lodging / categoryBreakdown.grandTotal) * 100}%`,
                      background: '#2563EB',
                    }}
                    title={`Lodging: €${categoryBreakdown.lodging.toFixed(2)}`}
                  />
                )}
                {categoryBreakdown.activities > 0 && (
                  <div
                    style={{
                      width: `${(categoryBreakdown.activities / categoryBreakdown.grandTotal) * 100}%`,
                      background: '#059669',
                    }}
                    title={`Activities: €${categoryBreakdown.activities.toFixed(2)}`}
                  />
                )}
                {categoryBreakdown.dining > 0 && (
                  <div
                    style={{
                      width: `${(categoryBreakdown.dining / categoryBreakdown.grandTotal) * 100}%`,
                      background: '#D97706',
                    }}
                    title={`Dining: €${categoryBreakdown.dining.toFixed(2)}`}
                  />
                )}
                {categoryBreakdown.other > 0 && (
                  <div
                    style={{
                      width: `${(categoryBreakdown.other / categoryBreakdown.grandTotal) * 100}%`,
                      background: '#64748B',
                    }}
                    title={`Other: €${categoryBreakdown.other.toFixed(2)}`}
                  />
                )}
              </div>
            </div>
          ) : (
            <p className="font-mono text-xs text-muted">[ NO RECORDED COSTS YET ]</p>
          )}

          {/* Category Metric Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {[
              { label: 'TRANSIT & FLIGHTS', tag: '[TRANSIT]', amount: categoryBreakdown.transit, color: '#4F46E5' },
              { label: 'LODGING & STAYS', tag: '[LODGING]', amount: categoryBreakdown.lodging, color: '#2563EB' },
              { label: 'ACTIVITIES & POIS', tag: '[ACTIVITIES]', amount: categoryBreakdown.activities, color: '#059669' },
              { label: 'FOOD & DINING', tag: '[DINING]', amount: categoryBreakdown.dining, color: '#D97706' },
              { label: 'MISCELLANEOUS', tag: '[MISC]', amount: categoryBreakdown.other, color: '#64748B' },
            ].map((cat, i) => {
              const pct = categoryBreakdown.grandTotal > 0
                ? Math.round((cat.amount / categoryBreakdown.grandTotal) * 100)
                : 0;
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    background: 'var(--color-surface-card)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '2px',
                        background: cat.color,
                        display: 'inline-block',
                      }}
                    />
                    <span className="font-mono text-xs" style={{ fontWeight: 600 }}>{cat.tag}</span>
                    <span className="font-mono text-xs text-muted">{cat.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="font-mono text-xs text-muted">{pct}%</span>
                    <span className="font-mono text-sm font-semibold">€{cat.amount.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Shared Expenses List */}
      {activeTab === 'expenses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {expenses.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', border: '1px dashed var(--color-border)', borderRadius: '4px' }}>
              <p className="font-mono text-xs text-muted">[ NO SHARED EXPENSES LOGGED YET ]</p>
              <button
                onClick={handleOpenAddExpense}
                disabled={participants.length === 0}
                style={{
                  marginTop: '0.75rem',
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  cursor: participants.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                + ADD FIRST EXPENSE
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '280px', overflowY: 'auto' }}>
              {expenses.map(e => (
                <div
                  key={e.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.625rem 0.75rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    background: 'var(--color-surface-card)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="font-mono text-xs" style={{ background: 'rgba(30, 58, 138, 0.08)', padding: '1px 6px', borderRadius: '3px', fontWeight: 600 }}>
                        [{e.category.toUpperCase()}]
                      </span>
                      <span className="font-mono text-sm" style={{ fontWeight: 600 }}>{e.description}</span>
                    </div>
                    <span className="font-mono text-xs text-muted">
                      Paid by: {e.payer_name || 'Traveler'} | Split: {e.splits?.length || participants.length} travelers {e.expense_date ? `| ${e.expense_date}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="font-mono text-sm font-bold text-accent">€{e.amount.toFixed(2)}</span>
                    <button
                      onClick={() => handleDeleteExpense(e.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-accent-secondary, #DC2626)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        padding: '2px 4px',
                      }}
                      title="Delete expense"
                    >
                      [DEL]
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Debt Settlement View (Tricount Engine) */}
      {activeTab === 'settlement' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Individual Balances */}
          <div>
            <span className="font-mono text-xs text-muted block mb-2">{'// PARTICIPANT BALANCES'}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(settlement?.balances || []).length > 0 ? (
                settlement?.balances.map(b => {
                  const isPositive = b.net_balance > 0.01;
                  const isNegative = b.net_balance < -0.01;

                  return (
                    <div
                      key={b.participant_id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid var(--color-border)',
                        borderRadius: '4px',
                        background: 'var(--color-surface-card)',
                      }}
                    >
                      <div>
                        <span className="font-mono text-sm font-semibold">{b.name}</span>
                        <div className="font-mono text-xs text-muted mt-0.5">
                          Paid: €{b.total_paid.toFixed(2)} | Share: €{b.total_share.toFixed(2)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span
                          className="font-mono text-sm font-bold block"
                          style={{
                            color: isPositive ? '#10B981' : isNegative ? '#DC2626' : 'var(--color-text-muted)',
                          }}
                        >
                          {isPositive ? `+€${b.net_balance.toFixed(2)}` : `€${b.net_balance.toFixed(2)}`}
                        </span>
                        <span
                          className="font-mono text-xs block"
                          style={{
                            color: isPositive ? '#10B981' : isNegative ? '#DC2626' : 'var(--color-text-muted)',
                            fontSize: '0.7rem',
                          }}
                        >
                          {isPositive ? '[OWED]' : isNegative ? '[OWES]' : '[SETTLED]'}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="font-mono text-xs text-muted">[ NO BALANCE DATA AVAILABLE ]</p>
              )}
            </div>
          </div>

          {/* Minimal Cash Transfers (Settlement Matrix) */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
            <span className="font-mono text-xs text-muted block mb-2">{'// MINIMAL SETTLEMENT TRANSFERS'}</span>
            {(settlement?.transfers || []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {settlement?.transfers.map((t, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.625rem 0.75rem',
                      background: 'rgba(30, 58, 138, 0.04)',
                      border: '1px dashed var(--color-accent-primary)',
                      borderRadius: '4px',
                    }}
                  >
                    <div className="font-mono text-xs">
                      <span style={{ fontWeight: 600 }}>{t.sender_name}</span>
                      <span style={{ color: 'var(--color-text-muted)', margin: '0 6px' }}>{'->'}</span>
                      <span style={{ fontWeight: 600 }}>{t.receiver_name}</span>
                    </div>
                    <span className="font-mono text-sm font-bold text-accent">
                      €{t.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '1rem', textAlign: 'center', background: 'var(--color-surface-card)', borderRadius: '4px' }}>
                <span className="font-mono text-xs" style={{ color: '#10B981', fontWeight: 600 }}>
                  [ ALL DEBTS FULLY BALANCED - NO TRANSFERS NEEDED ]
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Add Expense */}
      {showAddExpense && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            className="bg-surface border-subtle"
            style={{
              width: '100%',
              maxWidth: '520px',
              borderRadius: '8px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 className="font-display" style={{ margin: 0, fontSize: '1.25rem' }}>LOG SHARED EXPENSE</h3>
                <p className="font-mono text-muted text-xs mt-1">{'// TRICOUNT COST ALLOCATION'}</p>
              </div>
              <button
                onClick={() => setShowAddExpense(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                }}
              >
                [X]
              </button>
            </div>

            {formError && (
              <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(220, 38, 38, 0.1)', border: '1px solid #DC2626', borderRadius: '4px' }}>
                <span className="font-mono text-xs" style={{ color: '#DC2626' }}>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitExpense} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Description */}
              <div>
                <label className="font-mono text-xs text-muted block mb-1">DESCRIPTION</label>
                <input
                  type="text"
                  placeholder="e.g. Dinner in Trastevere, Museum Tickets, Airport Taxi..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-main)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              {/* Amount & Category */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="font-mono text-xs text-muted block mb-1">AMOUNT (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-main)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
                <div>
                  <label className="font-mono text-xs text-muted block mb-1">CATEGORY</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-main)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <option value="food">FOOD & DINING</option>
                    <option value="transport">TRANSIT & FLIGHTS</option>
                    <option value="accommodation">LODGING & HOTELS</option>
                    <option value="activities">ACTIVITIES & POIS</option>
                    <option value="other">MISCELLANEOUS</option>
                  </select>
                </div>
              </div>

              {/* Payer and Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="font-mono text-xs text-muted block mb-1">PAID BY</label>
                  <select
                    value={payerId}
                    onChange={(e) => setPayerId(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-main)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.85rem',
                    }}
                  >
                    {participants.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-mono text-xs text-muted block mb-1">DATE</label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-main)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              </div>

              {/* Split Mode and Participants */}
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label className="font-mono text-xs text-muted">SPLIT METHOD</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setSplitType('equal')}
                      style={{
                        padding: '2px 8px',
                        background: splitType === 'equal' ? 'var(--color-accent-primary)' : 'transparent',
                        color: splitType === 'equal' ? '#FFF' : 'var(--color-text-muted)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '3px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      EQUAL
                    </button>
                    <button
                      type="button"
                      onClick={() => setSplitType('custom')}
                      style={{
                        padding: '2px 8px',
                        background: splitType === 'custom' ? 'var(--color-accent-primary)' : 'transparent',
                        color: splitType === 'custom' ? '#FFF' : 'var(--color-text-muted)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '3px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      CUSTOM (€)
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectAllParticipants}
                      style={{
                        padding: '2px 8px',
                        background: 'transparent',
                        color: 'var(--color-accent-primary)',
                        border: '1px dashed var(--color-accent-primary)',
                        borderRadius: '3px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      {selectedParticipants.length === participants.length ? 'DESELECT ALL' : 'ALL'}
                    </button>
                  </div>
                </div>

                {/* Participant Selection Checkboxes / Custom Inputs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '160px', overflowY: 'auto' }}>
                  {participants.map(p => {
                    const isChecked = selectedParticipants.includes(p.id);
                    return (
                      <div
                        key={p.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.375rem 0.5rem',
                          background: isChecked ? 'rgba(30, 58, 138, 0.05)' : 'var(--color-surface-card)',
                          border: `1px solid ${isChecked ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                          borderRadius: '4px',
                        }}
                      >
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', flex: 1 }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleParticipant(p.id)}
                          />
                          <span className="font-mono text-xs font-semibold">{p.name}</span>
                        </label>

                        {splitType === 'custom' && isChecked && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span className="font-mono text-xs">€</span>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={customSplits[p.id] || ''}
                              onChange={(e) => setCustomSplits(prev => ({ ...prev, [p.id]: e.target.value }))}
                              style={{
                                width: '70px',
                                padding: '2px 4px',
                                borderRadius: '3px',
                                border: '1px solid var(--color-border)',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.75rem',
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAddExpense(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'transparent',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                  }}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'var(--color-accent-primary)',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  {isSubmitting ? 'RECORDING...' : 'SAVE EXPENSE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
