"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Trip, TripParticipant, TripExpense, TripSettlement, SettlementTransfer, useTrips } from '@/hooks/useTrips';
import type { RouteItineraryData } from '@/types/domain';
import { CostsSummaryCards, CostsTotals } from './costs/CostsSummaryCards';
import { CostsFilterToolbar, FilterScope } from './costs/CostsFilterToolbar';
import { ExpenseRow, DisplayExpenseItem } from './costs/ExpenseRow';
import { SettleUpWidget } from './costs/SettleUpWidget';
import { BalancesWidget } from './costs/BalancesWidget';
import { CategoryBreakdownWidget } from './costs/CategoryBreakdownWidget';
import { ExpenseModal } from './costs/ExpenseModal';
import { SettlementModal } from './costs/SettlementModal';
import { useAuth } from '@/contexts/AuthContext';
import {
  resolveDestinationCurrency,
  fetchLiveExchangeRate,
  getCurrencyInfo,
  convertCurrency,
  fetchEurRates,
  BASELINE_EUR_RATES,
} from '@/utils/currencyResolver';
import { CurrencyWheelPicker } from './costs/CurrencyWheelPicker';
import { getCostCategoryMeta } from './costs/costsCategories';

interface TripCostsViewProps {
  trip: Trip;
  itinerary?: RouteItineraryData | null;
  onTripUpdated?: () => void;
}

export function TripCostsView({ trip, itinerary, onTripUpdated }: TripCostsViewProps) {
  const {
    getTripExpenses,
    addTripExpense,
    deleteTripExpense,
    getTripSettlement,
  } = useTrips();

  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [settlement, setSettlement] = useState<TripSettlement | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(trip.id));

  // Filters state
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [scopeFilter, setScopeFilter] = useState<FilterScope>('all');

  // Modals state
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<DisplayExpenseItem | null>(null);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementPrefill, setSettlementPrefill] = useState<SettlementTransfer | null>(null);
  const [simplifyDebts, setSimplifyDebts] = useState<boolean>(false);

  const { user } = useAuth();
  const userDefaultCurrency = (user?.preferences?.default_currency as string) || 'EUR';

  const participants: TripParticipant[] = useMemo(
    () => trip.participants || [],
    [trip.participants]
  );

  const currentParticipant = useMemo(() => {
    if (!participants.length) return null;
    if (user) {
      // 1. Direct user_id link
      const byId = participants.find((p) => p.user_id && p.user_id === user.id);
      if (byId) return byId;

      // 2. Email match
      if (user.email) {
        const byEmail = participants.find(
          (p) => p.email && p.email.toLowerCase() === user.email?.toLowerCase()
        );
        if (byEmail) return byEmail;
      }

      // 3. Username match
      if (user.username) {
        const byName = participants.find(
          (p) => p.name && p.name.toLowerCase() === user.username.toLowerCase()
        );
        if (byName) return byName;
      }
    }
    return participants[0];
  }, [participants, user]);

  const currentUserId = currentParticipant?.id || '';

  // Destination country currency
  const destCurrencyMeta = useMemo(() => resolveDestinationCurrency(trip.destination), [trip.destination]);
  const destinationCurrency = destCurrencyMeta.currency;

  // Active viewing currency state (defaults to user preference, overridable via wheel picker)
  const [selectedCurrencyOverride, setSelectedCurrencyOverride] = useState<string | null>(null);
  const activeCurrency = selectedCurrencyOverride ?? userDefaultCurrency;
  const [isWheelPickerOpen, setIsWheelPickerOpen] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number>(1.0);
  const [isLiveRate, setIsLiveRate] = useState<boolean>(true);
  const [eurToActiveRate, setEurToActiveRate] = useState<number>(1.0);
  const [eurRates, setEurRates] = useState<Record<string, number>>(BASELINE_EUR_RATES);

  // Fetch live exchange rates dynamically
  useEffect(() => {
    let active = true;

    // Rate between active and destination currency
    fetchLiveExchangeRate(activeCurrency, destinationCurrency).then((res) => {
      if (active) {
        setExchangeRate(res.rate);
        setIsLiveRate(res.isLive);
      }
    });

    // Rate between base EUR and active currency
    fetchLiveExchangeRate('EUR', activeCurrency).then((res) => {
      if (active) {
        setEurToActiveRate(res.rate);
      }
    });

    // All rates against base EUR for multi-currency conversion
    fetchEurRates().then((rates) => {
      if (active) {
        setEurRates(rates);
      }
    });

    return () => {
      active = false;
    };
  }, [activeCurrency, destinationCurrency]);

  // Load backend data
  const loadData = useCallback(async () => {
    if (!trip.id) return;
    try {
      const [expList, settl] = await Promise.all([
        getTripExpenses(trip.id),
        getTripSettlement(trip.id, simplifyDebts),
      ]);
      setExpenses(expList || []);
      setSettlement(settl || null);
    } catch (err) {
      console.error('Failed to load trip expenses and settlement', err);
    } finally {
      setIsLoading(false);
    }
  }, [trip.id, getTripExpenses, getTripSettlement, simplifyDebts]);

  useEffect(() => {
    let active = true;
    if (!trip.id) return;

    Promise.all([getTripExpenses(trip.id), getTripSettlement(trip.id, simplifyDebts)])
      .then(([expList, settl]) => {
        if (active) {
          setExpenses(expList || []);
          setSettlement(settl || null);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.error('Failed to load trip expenses and settlement', err);
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [trip.id, getTripExpenses, getTripSettlement, simplifyDebts]);

  // Extract planned costs from itinerary route
  const itineraryItems = useMemo<DisplayExpenseItem[]>(() => {
    const items: DisplayExpenseItem[] = [];
    if (!Array.isArray(itinerary?.days)) return items;

    itinerary.days.forEach((day, dayIdx) => {
      const dayNum = day.day ?? dayIdx + 1;
      const rawDate = (day as { date?: string }).date;
      const dayDate =
        rawDate ||
        (trip.start_date
          ? new Date(new Date(trip.start_date).getTime() + dayIdx * 86400000)
              .toISOString()
              .split('T')[0]
          : '');

      if (Array.isArray(day?.itinerary?.path)) {
        day.itinerary.path.forEach((scheduledPoi, poiIdx) => {
          const p = scheduledPoi?.poi;
          const cost = Number(p?.cost_eur || 0);

          if (cost > 0) {
            items.push({
              id: `itin-poi-${dayNum}-${poiIdx}-${p?.name || 'ticket'}`,
              source: 'itinerary',
              title: p?.name ? `${p.name} admission` : `Day ${dayNum} Admission`,
              category: p?.category || 'activities',
              amount: cost,
              convertedAmount: convertCurrency(cost, 'EUR', activeCurrency, eurRates),
              currency: 'EUR',
              date: dayDate || `Day ${dayNum}`,
              isUnfinished: true,
              splitSummary: 'Route ticket estimate',
              raw: scheduledPoi,
            });
          }
        });
      }
    });

    return items;
  }, [itinerary, trip.start_date, activeCurrency, eurRates]);

  // Map logged expenses
  const loggedItems = useMemo<DisplayExpenseItem[]>(() => {
    return expenses.map((e) => {
      const payer = participants.find((p) => p.id === e.payer_id);
      const originalAmount = Number(e.amount);
      const cur = e.currency || 'EUR';
      return {
        id: e.id,
        source: 'logged',
        title: e.description,
        category: e.category,
        amount: originalAmount,
        convertedAmount: convertCurrency(originalAmount, cur, activeCurrency, eurRates),
        currency: cur,
        date: e.expense_date || undefined,
        payerId: e.payer_id,
        payerName: payer?.name || e.payer_name || 'Traveler',
        isUnfinished: !e.payer_id,
        splitSummary:
          e.split_type === 'custom'
            ? 'Custom split'
            : `Split among ${e.splits?.length || participants.length} travelers`,
        raw: e,
      };
    });
  }, [expenses, participants, activeCurrency, eurRates]);

  // Combined item list
  const allItems = useMemo(() => {
    return [...loggedItems, ...itineraryItems];
  }, [loggedItems, itineraryItems]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      // Search
      if (search) {
        const query = search.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesCat = item.category.toLowerCase().includes(query);
        const matchesPayer = (item.payerName || '').toLowerCase().includes(query);
        if (!matchesTitle && !matchesCat && !matchesPayer) return false;
      }

      // Category filter
      if (categoryFilter) {
        const meta = getCostCategoryMeta(item.category);
        if (meta.key !== categoryFilter) return false;
      }

      // Day filter
      if (dayFilter && item.date !== dayFilter) {
        return false;
      }

      // Scope filter
      if (scopeFilter === 'mine' && item.payerId !== currentUserId) {
        return false;
      }
      if (scopeFilter === 'owed') {
        // Belongs to expenses where current user paid or is participant
        if (item.payerId !== currentUserId) return false;
      }

      return true;
    });
  }, [allItems, search, categoryFilter, dayFilter, scopeFilter, currentUserId]);

  // Available day options for dropdown
  const dayOptions = useMemo(() => {
    const dates = Array.from(new Set(allItems.map((i) => i.date).filter(Boolean))) as string[];
    return dates.map((d) => ({ value: d, label: d }));
  }, [allItems]);

  // Converted settlement transfers & balances in active currency
  const settlementTransfers = settlement?.transfers;
  const settlementBalances = settlement?.balances;
  const settlementCurrency = settlement?.currency || 'EUR';

  const convertedTransfers = useMemo(() => {
    if (!settlementTransfers) return [];
    return settlementTransfers.map((t) => ({
      ...t,
      amount: convertCurrency(t.amount, settlementCurrency, activeCurrency, eurRates),
    }));
  }, [settlementTransfers, settlementCurrency, activeCurrency, eurRates]);

  const convertedBalances = useMemo(() => {
    if (!settlementBalances) return [];
    return settlementBalances.map((b) => ({
      ...b,
      total_paid: convertCurrency(b.total_paid, settlementCurrency, activeCurrency, eurRates),
      total_share: convertCurrency(b.total_share, settlementCurrency, activeCurrency, eurRates),
      net_balance: convertCurrency(b.net_balance, settlementCurrency, activeCurrency, eurRates),
    }));
  }, [settlementBalances, settlementCurrency, activeCurrency, eurRates]);

  // Calculate KPI Totals
  const totals = useMemo<CostsTotals>(() => {
    let owe = 0;
    let owed = 0;

    convertedTransfers.forEach((t) => {
      if (t.sender_id === currentUserId) owe += t.amount;
      if (t.receiver_id === currentUserId) owed += t.amount;
    });

    const unfinishedItems = allItems.filter((i) => i.isUnfinished);
    const outstanding = unfinishedItems.reduce((acc, i) => acc + (i.convertedAmount ?? i.amount), 0);

    const totalSpend = loggedItems.reduce((acc, i) => acc + (i.convertedAmount ?? i.amount), 0);

    const myBalance = convertedBalances.find((b) => b.participant_id === currentUserId);
    const myShare = myBalance?.total_share || 0;
    const myPaid = myBalance?.total_paid || 0;

    return {
      owe,
      owed,
      outstanding,
      outstandingCount: unfinishedItems.length,
      totalSpend,
      myShare,
      myPaid,
      currency: activeCurrency,
    };
  }, [convertedTransfers, convertedBalances, allItems, loggedItems, currentUserId, activeCurrency]);

  // Group items by date for timeline
  const groupedByDate = useMemo(() => {
    const groups: Record<string, DisplayExpenseItem[]> = {};
    filteredItems.forEach((item) => {
      const dateKey = item.date || 'NO DATE';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    });
    return Object.entries(groups).map(([date, entries]) => ({
      date,
      entries,
      subtotal: entries.reduce((sum, e) => sum + (e.convertedAmount ?? e.amount), 0),
    }));
  }, [filteredItems]);

  // Date range formatted
  const tripDateMeta = useMemo(() => {
    if (!trip.start_date) return null;
    try {
      const d1 = new Date(trip.start_date);
      const d2 = trip.end_date ? new Date(trip.end_date) : d1;
      const days = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 3600 * 24)) + 1);
      const opt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
      const range = `${d1.toLocaleDateString(undefined, opt)} - ${d2.toLocaleDateString(undefined, opt)}`;
      return { range, days };
    } catch {
      return null;
    }
  }, [trip.start_date, trip.end_date]);

  // Today's spend in active currency
  const todaySpend = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayExpenses = loggedItems.filter((e) => e.date === todayStr);
    return todayExpenses.reduce((acc, e) => acc + (e.convertedAmount ?? e.amount), 0);
  }, [loggedItems]);

  // Planned trip budget in active currency
  const totalBudget = useMemo(() => {
    const itinData = trip.itinerary_data as Record<string, any> | undefined;
    const constraintBudget = itinData?.travel_constraints?.budget_usd ?? (itinerary as any)?.travel_constraints?.budget_usd;
    if (typeof constraintBudget === 'number' && constraintBudget > 0) {
      return convertCurrency(constraintBudget, 'USD', activeCurrency, eurRates);
    }
    if (typeof itinerary?.total_trip_cost === 'number' && itinerary.total_trip_cost > 0) {
      return convertCurrency(itinerary.total_trip_cost, 'EUR', activeCurrency, eurRates);
    }
    const plannedItemsSum = itineraryItems.reduce((sum, item) => sum + (item.convertedAmount ?? item.amount), 0);
    if (plannedItemsSum > 0) {
      return plannedItemsSum;
    }
    const days = tripDateMeta?.days || 5;
    return convertCurrency(days * 120, 'EUR', activeCurrency, eurRates);
  }, [trip.itinerary_data, itinerary, itineraryItems, activeCurrency, eurRates, tripDateMeta?.days]);

  // Action handlers
  const handleSaveExpense = async (data: {
    payer_id: string;
    description: string;
    amount: number;
    currency: string;
    category: string;
    split_type: string;
    splits: { participant_id: string; amount: number }[];
    expense_date: string;
  }) => {
    if (!trip.id) return false;
    const res = await addTripExpense(trip.id, data);
    if (res) {
      await loadData();
      if (onTripUpdated) onTripUpdated();
      return true;
    }
    return false;
  };

  const handleDeleteExpense = async (item: DisplayExpenseItem) => {
    if (!trip.id || item.source !== 'logged') return;
    if (window.confirm(`Delete expense "${item.title}"?`)) {
      const ok = await deleteTripExpense(trip.id, item.id);
      if (ok) {
        await loadData();
        if (onTripUpdated) onTripUpdated();
      }
    }
  };

  const handleClaimItem = (item: DisplayExpenseItem) => {
    setEditingExpense(item);
    setShowExpenseModal(true);
  };

  const handleRecordPayment = async (data: {
    sender_id: string;
    receiver_id: string;
    amount: number;
    description: string;
  }) => {
    if (!trip.id) return false;
    // Record as a settled reimbursement expense where sender pays receiver
    const res = await addTripExpense(trip.id, {
      payer_id: data.sender_id,
      description: data.description || 'Debt settlement payment',
      amount: data.amount,
      currency: activeCurrency,
      category: 'other',
      split_type: 'custom',
      splits: [{ participant_id: data.receiver_id, amount: data.amount }],
      expense_date: new Date().toISOString().split('T')[0],
    });
    if (res) {
      await loadData();
      if (onTripUpdated) onTripUpdated();
      return true;
    }
    return false;
  };

  const handleSettleFlow = (transfer: SettlementTransfer) => {
    setSettlementPrefill(transfer);
    setShowSettlementModal(true);
  };

  const handleExportCsv = () => {
    if (allItems.length === 0) return;
    const headers = ['Date', 'Title', 'Category', 'Amount', 'Currency', 'Source', 'Payer'];
    const rows = allItems.map((i) => [
      `"${i.date || ''}"`,
      `"${i.title.replace(/"/g, '""')}"`,
      `"${i.category}"`,
      i.amount.toFixed(2),
      i.currency || 'EUR',
      i.source,
      `"${i.payerName || ''}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `trip-costs-${trip.id || 'export'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      style={{
        padding: '2rem 1.5rem',
        maxWidth: '1280px',
        margin: '0 auto',
        minHeight: '100%',
        color: 'var(--color-text-main)',
      }}
    >
      {/* Top Bar Header with trip details and primary actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {tripDateMeta && (
            <span
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.82rem',
                color: 'var(--color-text-muted)',
                fontWeight: 500,
              }}
            >
              {tripDateMeta.range} · <b style={{ color: 'var(--color-text-main)' }}>{tripDateMeta.days} days</b>
            </span>
          )}

          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '999px',
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-subtle)',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.76rem',
              fontWeight: 600,
              color: 'var(--color-text-main)',
            }}
          >
            <span
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: 'var(--color-accent-primary)',
                color: 'var(--color-text-on-accent, #FFFFFF)',
                display: 'grid',
                placeItems: 'center',
                fontSize: '0.65rem',
                fontWeight: 700,
              }}
            >
              {participants.length || 1}
            </span>
            {participants.length || 1} traveler{participants.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => {
              setSettlementPrefill(null);
              setShowSettlementModal(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: '12px',
              border: '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface-card)',
              color: 'var(--color-text-main)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Settle up
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingExpense(null);
              setShowExpenseModal(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 18px',
              borderRadius: '10px',
              border: 'none',
              background: 'var(--color-accent-primary)',
              color: 'var(--color-text-on-accent, #FFFFFF)',
              fontFamily: 'var(--font-body, "Inter", sans-serif)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
              transition: 'transform 0.1s ease',
            }}
            className="hover:opacity-95 active:scale-95"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add expense
          </button>
        </div>
      </div>

      {/* Top KPI Summary Cards with Live Converter & Merged Settlement Card */}
      <CostsSummaryCards
        totals={totals}
        activeCurrency={activeCurrency}
        destinationCurrency={destinationCurrency}
        destinationCountryCode={destCurrencyMeta.countryCode}
        destinationCountryName={destCurrencyMeta.country}
        destinationCity={trip.destination}
        exchangeRate={exchangeRate}
        isLiveRate={isLiveRate}
        onOpenCurrencyPicker={() => setIsWheelPickerOpen(true)}
        startDate={trip.start_date}
        endDate={trip.end_date}
        todaySpend={todaySpend}
        totalBudget={totalBudget}
      />

      {/* 3D Cylinder Currency Wheel Picker Modal */}
      <CurrencyWheelPicker
        isOpen={isWheelPickerOpen}
        onClose={() => setIsWheelPickerOpen(false)}
        selectedCurrency={activeCurrency}
        defaultCurrency={userDefaultCurrency}
        destinationCurrency={destinationCurrency}
        onSelectCurrency={(cur) => setSelectedCurrencyOverride(cur.code)}
      />

      {/* Main 2-Column Responsive Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 380px',
          gap: '32px',
          alignItems: 'start',
        }}
        className="max-lg:!grid-cols-1"
      >
        {/* Left Column: Expenses Feed */}
        <div>
          <CostsFilterToolbar
            totalCount={filteredItems.length}
            search={search}
            onSearchChange={setSearch}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            dayFilter={dayFilter}
            onDayFilterChange={setDayFilter}
            days={dayOptions}
            scopeFilter={scopeFilter}
            onScopeFilterChange={setScopeFilter}
            onExportCsv={handleExportCsv}
          />

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-muted)' }}>
              Loading trip expenses...
            </div>
          ) : groupedByDate.length === 0 ? (
            <div
              style={{
                background: 'var(--color-surface-card)',
                border: '1px dashed var(--color-border-subtle)',
                borderRadius: '20px',
                padding: '60px 20px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'var(--color-surface-subtle, var(--color-surface-card))',
                  color: 'var(--color-text-muted)',
                  display: 'grid',
                  placeItems: 'center',
                  margin: '0 auto 16px auto',
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
              </div>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-main)' }}>
                No expenses found
              </h4>
              <p style={{ margin: '6px 0 16px 0', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                {search || categoryFilter || dayFilter || scopeFilter !== 'all'
                  ? 'Try clearing active filters to see all trip costs.'
                  : 'Start by logging your first expense or assigning route tickets.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingExpense(null);
                  setShowExpenseModal(true);
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'var(--color-accent-primary)',
                  color: 'var(--color-text-on-accent, #FFFFFF)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + Add first expense
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {groupedByDate.map((group) => (
                <div key={group.date}>
                  {/* Date section header with daily subtotal */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                      padding: '0 4px',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {group.date}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '0.76rem',
                        color: 'var(--color-text-muted)',
                        fontWeight: 600,
                      }}
                    >
                      {getCurrencyInfo(activeCurrency).symbol}{group.subtotal.toFixed(2)} spent
                    </span>
                  </div>

                  {/* List of items */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {group.entries.map((item) => (
                      <ExpenseRow
                        key={item.id}
                        item={item}
                        activeCurrency={activeCurrency}
                        onEdit={(it) => {
                          setEditingExpense(it);
                          setShowExpenseModal(true);
                        }}
                        onDelete={handleDeleteExpense}
                        onClaim={handleClaimItem}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Sidebar Widgets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 1. Settle Up Widget */}
          <SettleUpWidget
            transfers={convertedTransfers}
            isSimplified={simplifyDebts}
            currency={activeCurrency}
            onToggleSimplified={() => setSimplifyDebts((prev) => !prev)}
            onAddPayment={() => {
              setSettlementPrefill(null);
              setShowSettlementModal(true);
            }}
            onSettleFlow={handleSettleFlow}
          />

          {/* 2. Balances Widget */}
          <BalancesWidget
            balances={convertedBalances}
            participants={participants}
            currency={activeCurrency}
          />

          {/* 3. By Category Graph Widget (User requested!) */}
          <CategoryBreakdownWidget
            items={allItems}
            currency={activeCurrency}
          />
        </div>
      </div>

      {/* Expense Modal */}
      {showExpenseModal && (
        <ExpenseModal
          participants={participants}
          prefill={editingExpense}
          defaultPayerId={currentUserId}
          defaultCurrency={userDefaultCurrency}
          destinationCurrency={destinationCurrency}
          onClose={() => {
            setShowExpenseModal(false);
            setEditingExpense(null);
          }}
          onSave={handleSaveExpense}
        />
      )}

      {/* Settlement Modal */}
      {showSettlementModal && (
        <SettlementModal
          participants={participants}
          prefillTransfer={settlementPrefill}
          defaultSenderId={currentUserId}
          onClose={() => {
            setShowSettlementModal(false);
            setSettlementPrefill(null);
          }}
          onSave={handleRecordPayment}
        />
      )}
    </div>
  );
}
