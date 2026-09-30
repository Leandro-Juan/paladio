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

export interface ItemizedCost {
  id: string;
  source: 'itinerary' | 'manual';
  category: 'transit' | 'lodging' | 'activities' | 'dining' | 'other';
  title: string;
  location?: string;
  dateTime: string;
  amount: number;
  isEstimated?: boolean;
  transitLine?: string;
  expenseId?: string;
}

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

  // Excluded itinerary cost tracking and amber warning modal state
  const [excludedCostIds, setExcludedCostIds] = useState<string[]>([]);
  const [costToExclude, setCostToExclude] = useState<ItemizedCost | null>(null);

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

  // Extract all individual planned itinerary costs (transit legs, POIs, lodging)
  const allItineraryCosts = useMemo<ItemizedCost[]>(() => {
    const items: ItemizedCost[] = [];
    if (!Array.isArray(itinerary?.days)) return items;

    itinerary.days.forEach((day, dayIdx) => {
      const dayNum = day.day || (dayIdx + 1);
      const path = day.itinerary?.path || [];

      path.forEach((step, stepIdx) => {
        // 1. Scheduled Public Transit Leg from previous POI
        const transit = step.transit_from_previous;
        const transitCost = transit?.cost_eur ?? 0;
        if (transitCost > 0 && stepIdx > 0) {
          const prevName = path[stepIdx - 1]?.poi?.name || 'Previous Location';
          const destName = step.poi?.name || 'Destination';
          const lines = (transit?.steps || [])
            .map(s => s.transit_line)
            .filter((l): l is string => Boolean(l && l.trim().length > 0));
          const lineStr = lines.length > 0 ? lines.join(', ') : (transit?.mode || 'Public Transit');

          items.push({
            id: `itinerary-transit-${dayIdx}-${stepIdx}`,
            source: 'itinerary',
            category: 'transit',
            title: `${prevName} -> ${destName}`,
            location: `${destName}`,
            dateTime: `Day ${dayNum} • ${step.scheduled_start || step.arrival_time || '--:--'}`,
            amount: transitCost,
            isEstimated: transit?.cost_is_estimated ?? true,
            transitLine: lineStr,
          });
        }

        // 2. Scheduled POI Activity or Lodging Cost
        const poiCost = step.poi?.cost_eur || 0;
        if (poiCost > 0) {
          const catStr = (step.poi?.category || '').toLowerCase();
          const isLodging = catStr.includes('hotel') || catStr.includes('lodging') || catStr.includes('hostel');
          const category = isLodging ? 'lodging' : 'activities';

          items.push({
            id: `itinerary-poi-${dayIdx}-${stepIdx}`,
            source: 'itinerary',
            category,
            title: step.poi?.name || 'Scheduled Activity',
            location: step.poi?.city || step.poi?.name || '',
            dateTime: `Day ${dayNum} • ${step.scheduled_start || step.arrival_time || '--:--'}`,
            amount: poiCost,
            isEstimated: false,
          });
        }
      });
    });

    return items;
  }, [itinerary]);

  const activeItineraryCosts = useMemo(
    () => allItineraryCosts.filter(c => !excludedCostIds.includes(c.id)),
    [allItineraryCosts, excludedCostIds]
  );

  const excludedItineraryCosts = useMemo(
    () => allItineraryCosts.filter(c => excludedCostIds.includes(c.id)),
    [allItineraryCosts, excludedCostIds]
  );

  // Map logged manual shared expenses into itemized list items
  const manualExpenseCosts = useMemo<ItemizedCost[]>(() => {
    return expenses.map(e => {
      let cat: ItemizedCost['category'] = 'other';
      const c = e.category.toLowerCase();
      if (c === 'transport' || c === 'transit' || c === 'flight') cat = 'transit';
      else if (c === 'accommodation' || c === 'lodging' || c === 'hotel') cat = 'lodging';
      else if (c === 'activities' || c === 'attraction' || c === 'poi') cat = 'activities';
      else if (c === 'food' || c === 'dining' || c === 'meals') cat = 'dining';

      return {
        id: `manual-exp-${e.id}`,
        source: 'manual',
        category: cat,
        title: e.description,
        location: e.payer_name ? `Paid by ${e.payer_name}` : undefined,
        dateTime: e.expense_date || 'Logged Expense',
        amount: e.amount,
        isEstimated: false,
        expenseId: e.id,
      };
    });
  }, [expenses]);

  // Combined itemized cost list (active itinerary costs + manual shared expenses)
  const allActiveItemizedCosts = useMemo(() => {
    return [...activeItineraryCosts, ...manualExpenseCosts];
  }, [activeItineraryCosts, manualExpenseCosts]);

  // Compute Category breakdown combining non-excluded planned items + logged shared expenses
  const categoryBreakdown = useMemo(() => {
    let transitTotal = 0;
    let lodgingTotal = 0;
    let activitiesTotal = 0;
    let diningTotal = 0;
    let otherTotal = 0;

    activeItineraryCosts.forEach(item => {
      if (item.category === 'transit') transitTotal += item.amount;
      else if (item.category === 'lodging') lodgingTotal += item.amount;
      else if (item.category === 'activities') activitiesTotal += item.amount;
      else if (item.category === 'dining') diningTotal += item.amount;
      else otherTotal += item.amount;
    });

    expenses.forEach(e => {
      const c = e.category.toLowerCase();
      if (c === 'transport' || c === 'transit' || c === 'flight') {
        transitTotal += e.amount;
      } else if (c === 'accommodation' || c === 'lodging' || c === 'hotel') {
        lodgingTotal += e.amount;
      } else if (c === 'activities' || c === 'attraction' || c === 'poi') {
        activitiesTotal += e.amount;
      } else if (c === 'food' || c === 'dining' || c === 'meals') {
        diningTotal += e.amount;
      } else {
        otherTotal += e.amount;
      }
    });

    const grandTotal = transitTotal + lodgingTotal + activitiesTotal + diningTotal + otherTotal;

    return {
      transit: transitTotal,
      lodging: lodgingTotal,
      activities: activitiesTotal,
      dining: diningTotal,
      other: otherTotal,
      grandTotal,
    };
  }, [activeItineraryCosts, expenses]);

  const handleRequestRemoveCost = (item: ItemizedCost) => {
    if (item.source === 'itinerary') {
      setCostToExclude(item);
    } else if (item.expenseId) {
      handleDeleteExpense(item.expenseId);
    }
  };

  const handleConfirmExclude = () => {
    if (!costToExclude) return;
    setExcludedCostIds(prev => [...prev, costToExclude.id]);
    setCostToExclude(null);
  };

  const handleRestoreCost = (id: string) => {
    setExcludedCostIds(prev => prev.filter(x => x !== id));
  };

  const handleRestoreAllCosts = () => {
    setExcludedCostIds([]);
  };

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
          <p className="font-mono text-xs text-muted mt-0.5">{'// PEER EXPENSE LEDGER & DYNAMIC DEBT SETTLEMENT'}</p>
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
          <span className="font-mono text-xs text-muted block">SETTLEMENT STATUS</span>
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

          {/* Itinerary Desynchronization Notice Banner */}
          {excludedItineraryCosts.length > 0 && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                border: '1px solid #D97706',
                background: 'rgba(217, 119, 6, 0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div>
                <span className="font-mono text-xs" style={{ color: '#D97706', fontWeight: 700 }}>
                  [!] ITINERARY BUDGET DESYNCHRONIZED
                </span>
                <p className="font-mono text-xs text-muted" style={{ margin: '2px 0 0 0' }}>
                  {excludedItineraryCosts.length} scheduled cost(s) excluded totaling €{excludedItineraryCosts.reduce((s, c) => s + c.amount, 0).toFixed(2)}. The budget does not match the active travel timeline.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRestoreAllCosts}
                style={{
                  background: 'transparent',
                  border: '1px solid #D97706',
                  color: '#D97706',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                RESTORE ALL COSTS
              </button>
            </div>
          )}

          {/* Itemized Planned & Shared Costs Section */}
          <div style={{ marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span className="font-mono text-xs text-muted">
                ITEMIZED PLANNED & SHARED COSTS ({allActiveItemizedCosts.length})
              </span>
              <span className="font-mono text-xs text-muted">
                [ REMOVE ANY COST TO EXCLUDE FROM BUDGET ]
              </span>
            </div>

            {allActiveItemizedCosts.length === 0 ? (
              <p className="font-mono text-xs text-muted" style={{ padding: '0.75rem', textAlign: 'center', border: '1px dashed var(--color-border)', borderRadius: '4px' }}>
                [ NO ACTIVE COSTS INCLUDED IN BUDGET ]
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '320px', overflowY: 'auto' }}>
                {allActiveItemizedCosts.map(item => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.6rem 0.75rem',
                      border: '1px solid var(--color-border)',
                      borderRadius: '4px',
                      background: 'var(--color-surface-card)',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span
                          className="font-mono text-xs"
                          style={{
                            background:
                              item.category === 'transit' ? 'rgba(79, 70, 229, 0.12)' :
                              item.category === 'lodging' ? 'rgba(37, 99, 235, 0.12)' :
                              item.category === 'activities' ? 'rgba(5, 150, 105, 0.12)' :
                              item.category === 'dining' ? 'rgba(217, 119, 6, 0.12)' :
                              'rgba(100, 116, 139, 0.12)',
                            color:
                              item.category === 'transit' ? '#4F46E5' :
                              item.category === 'lodging' ? '#2563EB' :
                              item.category === 'activities' ? '#059669' :
                              item.category === 'dining' ? '#D97706' :
                              '#64748B',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            fontWeight: 700,
                            letterSpacing: '0.3px',
                          }}
                        >
                          [{item.category.toUpperCase()}]
                        </span>
                        <span className="font-mono text-sm" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </span>
                        {item.transitLine && (
                          <span className="font-mono text-xs text-muted">
                            ({item.transitLine})
                          </span>
                        )}
                        {item.isEstimated && (
                          <span
                            className="font-mono text-xs"
                            style={{
                              padding: '1px 4px',
                              borderRadius: '2px',
                              background: '#FEF3C7',
                              color: '#92400E',
                              fontSize: '0.65rem',
                              fontWeight: 600,
                            }}
                          >
                            ESTIMATED
                          </span>
                        )}
                        {item.source === 'manual' && (
                          <span
                            className="font-mono text-xs"
                            style={{
                              padding: '1px 4px',
                              borderRadius: '2px',
                              background: 'rgba(30, 58, 138, 0.08)',
                              color: 'var(--color-accent-primary)',
                              fontSize: '0.65rem',
                            }}
                          >
                            LOGGED
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-xs text-muted" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span>{item.dateTime}</span>
                        {item.location && <span>• {item.location}</span>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                      <span className="font-mono text-sm font-bold text-accent">€{item.amount.toFixed(2)}</span>
                      <button
                        type="button"
                        onClick={() => handleRequestRemoveCost(item)}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-accent-secondary, #DC2626)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          padding: '3px 6px',
                          borderRadius: '3px',
                        }}
                        title={item.source === 'itinerary' ? 'Exclude planned cost from budget' : 'Delete logged expense'}
                      >
                        REMOVE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Excluded Itinerary Costs Section */}
          {excludedItineraryCosts.length > 0 && (
            <div style={{ marginTop: '0.5rem', borderTop: '1px dashed var(--color-border)', paddingTop: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span className="font-mono text-xs" style={{ color: '#D97706', fontWeight: 600 }}>
                  EXCLUDED FROM BUDGET ({excludedItineraryCosts.length})
                </span>
                <button
                  type="button"
                  onClick={handleRestoreAllCosts}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#D97706',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  RESTORE ALL
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: '180px', overflowY: 'auto' }}>
                {excludedItineraryCosts.map(item => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.4rem 0.6rem',
                      border: '1px dashed #D97706',
                      borderRadius: '4px',
                      background: 'rgba(217, 119, 6, 0.04)',
                      opacity: 0.85,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span className="font-mono text-xs" style={{ color: '#D97706', fontWeight: 600 }}>
                        [{item.category.toUpperCase()}]
                      </span>
                      <span className="font-mono text-xs" style={{ textDecoration: 'line-through' }}>
                        {item.title}
                      </span>
                      <span className="font-mono text-xs text-muted">
                        ({item.dateTime})
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="font-mono text-xs font-semibold" style={{ color: '#D97706' }}>
                        €{item.amount.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRestoreCost(item.id)}
                        style={{
                          background: 'transparent',
                          border: '1px solid #D97706',
                          color: '#D97706',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.65rem',
                          cursor: 'pointer',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          fontWeight: 600,
                        }}
                      >
                        + RESTORE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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

      {/* Tab 3: Debt Settlement View (Settlement Engine) */}
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
                <p className="font-mono text-muted text-xs mt-1">{'// SHARED COST ALLOCATION'}</p>
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

      {/* Amber Consistency Warning Modal */}
      {costToExclude && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            className="bg-surface"
            style={{
              width: '100%',
              maxWidth: '520px',
              borderRadius: '8px',
              border: '2px solid #D97706',
              boxShadow: '0 8px 30px rgba(217, 119, 6, 0.2)',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span
                  className="font-mono text-xs"
                  style={{
                    display: 'inline-block',
                    background: 'rgba(217, 119, 6, 0.15)',
                    color: '#D97706',
                    border: '1px solid #D97706',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                  }}
                >
                  [!] ITINERARY BUDGET DESYNCHRONIZATION
                </span>
                <h3 className="font-display" style={{ margin: '0.5rem 0 0 0', fontSize: '1.2rem', color: '#D97706' }}>
                  CONSISTENCY WARNING
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCostToExclude(null)}
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

            {/* Warning Message in Amber */}
            <div
              style={{
                background: 'rgba(217, 119, 6, 0.08)',
                border: '1px solid rgba(217, 119, 6, 0.3)',
                borderRadius: '6px',
                padding: '0.85rem',
              }}
            >
              <p className="font-mono text-xs" style={{ margin: 0, lineHeight: 1.5, color: '#D97706', fontWeight: 600 }}>
                WARNING: Removing this cost causes your budget to diverge from the active scheduled itinerary.
              </p>
              <p className="font-mono text-xs text-muted" style={{ margin: '0.5rem 0 0 0', lineHeight: 1.4 }}>
                This expense is required by a scheduled event or transit route in your timeline. Omitting it will reduce the budget total, but the activity or transit leg will still remain scheduled in your daily timeline.
              </p>
            </div>

            {/* Target Item Details Box */}
            <div
              style={{
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-mono text-xs" style={{ fontWeight: 700 }}>
                  [{costToExclude.category.toUpperCase()}] {costToExclude.title}
                </span>
                <span className="font-mono text-sm font-bold" style={{ color: '#D97706' }}>
                  €{costToExclude.amount.toFixed(2)}
                </span>
              </div>
              <div className="font-mono text-xs text-muted" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span>SCHEDULED: {costToExclude.dateTime}</span>
                {costToExclude.location && <span>LOCATION: {costToExclude.location}</span>}
                {costToExclude.transitLine && <span>LINE / ROUTE: {costToExclude.transitLine}</span>}
                {costToExclude.isEstimated && <span style={{ color: '#D97706' }}>STATUS: ESTIMATED ITINERARY FARE</span>}
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
              <button
                type="button"
                onClick={() => setCostToExclude(null)}
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
                KEEP IN BUDGET
              </button>
              <button
                type="button"
                onClick={handleConfirmExclude}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#D97706',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                }}
              >
                [!] EXCLUDE FROM BUDGET
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

