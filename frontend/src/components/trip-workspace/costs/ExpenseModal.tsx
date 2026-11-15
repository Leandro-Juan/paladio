"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useIsMounted } from '@/hooks/useIsMounted';
import { TripParticipant, TripExpense, ExpenseSplit } from '@/hooks/useTrips';
import { COST_CATEGORY_LIST, getCostCategoryMeta, CostCategoryKey } from './costsCategories';
import { DisplayExpenseItem } from './ExpenseRow';
import { CurrencyWheelPicker } from './CurrencyWheelPicker';
import { FlagIcon } from './FlagIcon';
import { getCurrencyInfo, fetchLiveExchangeRate } from '@/utils/currencyResolver';
import { CalendarIcon, CloseIcon } from '@/components/icons';
import { PaladioSingleDatePicker } from '@/components/trip-creation/PaladioSingleDatePicker';
import { CustomSelect } from '../wallet/parts/CustomSelect';

interface ExpenseModalProps {
  participants: TripParticipant[];
  prefill?: DisplayExpenseItem | null;
  defaultPayerId?: string;
  defaultCurrency?: string;
  destinationCurrency?: string;
  onClose: () => void;
  onSave: (data: {
    payer_id: string;
    description: string;
    amount: number;
    currency: string;
    category: string;
    split_type: string;
    splits: ExpenseSplit[];
    expense_date: string;
  }) => Promise<boolean>;
}

export function ExpenseModal({
  participants,
  prefill,
  defaultPayerId,
  defaultCurrency = 'EUR',
  destinationCurrency,
  onClose,
  onSave,
}: ExpenseModalProps) {
  const isMounted = useIsMounted();

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const resolvedDefaultCurrency = defaultCurrency || 'EUR';
  const [currency, setCurrency] = useState(
    prefill?.currency || destinationCurrency || resolvedDefaultCurrency
  );
  const [isCurrencyPickerOpen, setIsCurrencyPickerOpen] = useState(false);
  const [fxRateToDefault, setFxRateToDefault] = useState<number>(1.0);

  useEffect(() => {
    let active = true;
    if (currency !== resolvedDefaultCurrency) {
      fetchLiveExchangeRate(currency, resolvedDefaultCurrency).then((res) => {
        if (active) {
          setFxRateToDefault(res.rate);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [currency, resolvedDefaultCurrency]);

  const isSingleTraveler = participants.length <= 1;

  const rawExpense = prefill?.source === 'logged' ? (prefill.raw as TripExpense | undefined) : undefined;
  const initialSplitType: 'equal' | 'custom' =
    rawExpense?.split_type === 'custom' ? 'custom' : 'equal';
  const initialSelectedParticipants =
    rawExpense?.splits && rawExpense.splits.length > 0 && initialSplitType === 'equal'
      ? rawExpense.splits.map((s) => s.participant_id)
      : participants.map((p) => p.id);
  const initialCustomSplits =
    rawExpense?.splits && initialSplitType === 'custom'
      ? Object.fromEntries(rawExpense.splits.map((s) => [s.participant_id, String(s.amount)]))
      : {};

  const [description, setDescription] = useState(prefill?.title || '');
  const [amount, setAmount] = useState(prefill ? String(prefill.amount) : '');
  const [category, setCategory] = useState(prefill?.category ? getCostCategoryMeta(prefill.category).key : 'food');
  const [payerId, setPayerId] = useState(prefill?.payerId || defaultPayerId || participants[0]?.id || '');
  const [splitType, setSplitType] = useState<'equal' | 'custom'>(initialSplitType);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(
    initialSelectedParticipants
  );
  const [customSplits, setCustomSplits] = useState<Record<string, string>>(initialCustomSplits);
  const [expenseDate, setExpenseDate] = useState(
    prefill?.date || new Date().toISOString().split('T')[0]
  );
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const curInfo = getCurrencyInfo(currency);
  const defaultCurInfo = getCurrencyInfo(resolvedDefaultCurrency);
  const numAmount = parseFloat(amount) || 0;
  const effectiveFxRate = currency === resolvedDefaultCurrency ? 1.0 : fxRateToDefault || 1.0;
  const convertedAmount = numAmount * effectiveFxRate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = parseFloat(amount);
    if (!description.trim()) {
      setError('Please provide an expense description.');
      return;
    }
    if (isNaN(parsed) || parsed <= 0) {
      setError('Please enter a valid positive amount.');
      return;
    }
    const effectivePayerId = isSingleTraveler
      ? payerId || defaultPayerId || participants[0]?.id || ''
      : payerId;

    if (!effectivePayerId) {
      setError('Please select who paid for this expense.');
      return;
    }

    let finalSplits: ExpenseSplit[] = [];
    if (isSingleTraveler) {
      finalSplits = [{ participant_id: effectivePayerId, amount: parsed }];
    } else if (splitType === 'equal') {
      if (selectedParticipants.length === 0) {
        setError('At least one traveler must be included in the split.');
        return;
      }
      const splitAmount = parsed / selectedParticipants.length;
      finalSplits = selectedParticipants.map((pid) => ({
        participant_id: pid,
        amount: splitAmount,
      }));
    } else {
      let sum = 0;
      finalSplits = Object.entries(customSplits)
        .map(([pid, amtStr]) => {
          const a = parseFloat(amtStr) || 0;
          sum += a;
          return { participant_id: pid, amount: a };
        })
        .filter((s) => s.amount > 0);

      if (Math.abs(sum - parsed) > 0.05) {
        setError(
          `Custom split total (${curInfo.symbol}${sum.toFixed(2)}) must match the expense amount (${curInfo.symbol}${parsed.toFixed(2)}).`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const ok = await onSave({
        payer_id: effectivePayerId,
        description: description.trim(),
        amount: parsed,
        currency,
        category,
        split_type: isSingleTraveler ? 'equal' : splitType,
        splits: finalSplits,
        expense_date: expenseDate,
      });
      if (ok) {
        onClose();
      } else {
        setError('Failed to record expense. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isMounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overscrollBehavior: 'contain',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--color-surface-card)',
          borderRadius: '24px',
          maxWidth: '520px',
          width: '100%',
          boxShadow: 'var(--shadow-lg, 0 25px 50px -12px rgba(0, 0, 0, 0.25))',
          border: '1px solid var(--color-border-subtle)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overscrollBehavior: 'contain',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-display, "Jost", sans-serif)', color: 'var(--color-text-main)' }}>
              {isSingleTraveler
                ? prefill
                  ? 'Edit Expense'
                  : 'Add Trip Expense'
                : prefill
                ? 'Assign / Edit Expense'
                : 'Add Trip Expense'}
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              {isSingleTraveler ? 'Log your trip expense' : 'Log shared costs and update balances'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'var(--color-surface-subtle, var(--color-surface-card))',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              fontSize: '1rem',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', overflowY: 'auto', overscrollBehavior: 'contain' }}>
          {error && (
            <div
              style={{
                background: 'rgba(212, 42, 47, 0.1)',
                border: '1px solid var(--color-danger)',
                color: 'var(--color-danger)',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '0.8rem',
                marginBottom: '16px',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Description */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '6px' }}>
                Description
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 4x4 hire, ten days"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border-subtle)',
                  fontSize: '0.9rem',
                  outline: 'none',
                  background: 'var(--color-surface-card)',
                  color: 'var(--color-text-main)',
                }}
              />
            </div>

            {/* Amount & Date row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-main)' }}>
                    Amount
                  </label>
                  <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                    Payment currency
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setIsCurrencyPickerOpen(true)}
                    title="Change payment currency"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '9px 10px',
                      borderRadius: '10px',
                      border: '1px solid var(--color-border-subtle)',
                      background: 'var(--color-surface-subtle, rgba(0, 0, 0, 0.04))',
                      color: 'var(--color-text-main)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontWeight: 650,
                      flexShrink: 0,
                      transition: 'all 0.15s ease',
                    }}
                    className="hover:border-teal-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <FlagIcon countryCode={curInfo.countryCode} width={18} height={12} />
                    <span>{curInfo.code}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-muted)' }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--color-text-muted)',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '0.88rem',
                        pointerEvents: 'none',
                      }}
                    >
                      {curInfo.symbol}
                    </span>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 28px',
                        borderRadius: '10px',
                        border: '1px solid var(--color-border-subtle)',
                        fontSize: '0.9rem',
                        outline: 'none',
                        background: 'var(--color-surface-card)',
                        color: 'var(--color-text-main)',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontFeatureSettings: '"tnum"',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
                {currency !== resolvedDefaultCurrency && numAmount > 0 && (
                  <div
                    style={{
                      marginTop: '6px',
                      fontSize: '0.72rem',
                      fontFamily: 'var(--font-mono, monospace)',
                      color: 'var(--color-accent-teal-deep, #0F4C5C)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>≈</span>
                    <span>
                      {defaultCurInfo.symbol}
                      {convertedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      in default currency ({resolvedDefaultCurrency})
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '6px' }}>
                  Date
                </label>
                <button
                  type="button"
                  onClick={() => setIsDatePickerOpen(true)}
                  aria-label="Select expense date"
                  aria-expanded={isDatePickerOpen}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-subtle)',
                    fontSize: '0.9rem',
                    outline: 'none',
                    background: 'var(--color-surface-card)',
                    color: 'var(--color-text-main)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <CalendarIcon size={14} color="var(--color-accent-primary, #0F4C5C)" />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                    {expenseDate
                      ? new Date(`${expenseDate}T12:00:00`).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'Select date'}
                  </span>
                </button>
              </div>
            </div>

            {/* Category & Payer row */}
            <div style={{ display: 'grid', gridTemplateColumns: isSingleTraveler ? '1fr' : '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '6px' }}>
                  Category
                </label>
                <CustomSelect
                  value={category}
                  onChange={(val) => setCategory(val as CostCategoryKey)}
                  label="Category"
                  options={COST_CATEGORY_LIST.map((c) => ({ value: c.key, label: c.label }))}
                  style={{ fontFamily: 'var(--font-body, "Inter", sans-serif)' }}
                  buttonStyle={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-subtle)',
                    fontSize: '0.9rem',
                    color: 'var(--color-text-main)',
                  }}
                />
              </div>

              {!isSingleTraveler && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '6px' }}>
                    Paid By
                  </label>
                  <CustomSelect
                    value={payerId}
                    onChange={setPayerId}
                    label="Paid By"
                    options={participants.map((p) => ({ value: p.id, label: p.name }))}
                    style={{ fontFamily: 'var(--font-body, "Inter", sans-serif)' }}
                    buttonStyle={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid var(--color-border-subtle)',
                      fontSize: '0.9rem',
                      color: 'var(--color-text-main)',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Split options */}
            {!isSingleTraveler && (
              <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '8px' }}>
                Split Method
              </label>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button
                  type="button"
                  onClick={() => setSplitType('equal')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '8px',
                    border: splitType === 'equal' ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border-subtle)',
                    background: splitType === 'equal' ? 'var(--color-accent-primary)' : 'var(--color-surface-card)',
                    color: splitType === 'equal' ? 'var(--color-text-on-accent, #FFFFFF)' : 'var(--color-text-muted)',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  Split Equally
                </button>
                <button
                  type="button"
                  onClick={() => setSplitType('custom')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '8px',
                    border: splitType === 'custom' ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border-subtle)',
                    background: splitType === 'custom' ? 'var(--color-accent-primary)' : 'var(--color-surface-card)',
                    color: splitType === 'custom' ? 'var(--color-text-on-accent, #FFFFFF)' : 'var(--color-text-muted)',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  Custom Amounts
                </button>
              </div>

              {splitType === 'equal' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Select participants to share cost:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {participants.map((p) => {
                      const checked = selectedParticipants.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: checked ? 'rgba(15, 76, 92, 0.15)' : 'var(--color-surface-card)',
                            border: checked ? '1px solid var(--color-accent-primary)' : '1px solid var(--color-border-subtle)',
                            padding: '6px 12px',
                            borderRadius: '20px',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            color: checked ? 'var(--color-accent-primary)' : 'var(--color-text-muted)',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedParticipants((prev) => [...prev, p.id]);
                              } else {
                                setSelectedParticipants((prev) =>
                                    prev.filter((id) => id !== p.id)
                                );
                              }
                            }}
                          />
                          {p.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {participants.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <span style={{ fontSize: '0.85rem', color: 'var(--color-text-main)', fontWeight: 500 }}>
                        {p.name}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={customSplits[p.id] || ''}
                        onChange={(e) =>
                          setCustomSplits((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        style={{
                          width: '100px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border-subtle)',
                          fontSize: '0.85rem',
                          textAlign: 'right',
                          background: 'var(--color-surface-card)',
                          color: 'var(--color-text-main)',
                          fontFamily: 'var(--font-mono, monospace)',
                          fontFeatureSettings: '"tnum"',
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '24px',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-surface-card)',
                color: 'var(--color-text-main)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '10px 22px',
                borderRadius: '12px',
                border: 'none',
                background: 'var(--color-accent-primary)',
                color: 'var(--color-text-on-accent, #FFFFFF)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              {isSubmitting ? 'Saving...' : 'Save Expense'}
            </button>
          </div>
        </form>
      </div>

      {/* 3D Cylinder Currency Wheel Picker Modal */}
      <CurrencyWheelPicker
        isOpen={isCurrencyPickerOpen}
        onClose={() => setIsCurrencyPickerOpen(false)}
        selectedCurrency={currency}
        defaultCurrency={resolvedDefaultCurrency}
        destinationCurrency={destinationCurrency}
        onSelectCurrency={(cur) => {
          setCurrency(cur.code);
          setIsCurrencyPickerOpen(false);
        }}
      />

      {/* Custom Paladio Single Date Picker Modal */}
      {isDatePickerOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsDatePickerOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10050,
            background: 'rgba(0, 0, 0, 0.25)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <PaladioSingleDatePicker
            title="EXPENSE DATE"
            selectedDate={expenseDate}
            onChange={(d) => {
              if (d) setExpenseDate(d);
              setIsDatePickerOpen(false);
            }}
            onClose={() => setIsDatePickerOpen(false)}
          />
        </div>
      )}
    </div>,
    document.body
  );
}
