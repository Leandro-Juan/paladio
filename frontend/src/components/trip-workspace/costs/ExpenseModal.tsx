"use client";

import React, { useState } from 'react';
import { TripParticipant, ExpenseSplit } from '@/hooks/useTrips';
import { COST_CATEGORY_LIST, getCostCategoryMeta, CostCategoryKey } from './costsCategories';
import { DisplayExpenseItem } from './ExpenseRow';

interface ExpenseModalProps {
  participants: TripParticipant[];
  prefill?: DisplayExpenseItem | null;
  onClose: () => void;
  onSave: (data: {
    payer_id: string;
    description: string;
    amount: number;
    category: string;
    split_type: string;
    splits: ExpenseSplit[];
    expense_date: string;
  }) => Promise<boolean>;
}

export function ExpenseModal({
  participants,
  prefill,
  onClose,
  onSave,
}: ExpenseModalProps) {
  const [description, setDescription] = useState(prefill?.title || '');
  const [amount, setAmount] = useState(prefill ? String(prefill.amount) : '');
  const [category, setCategory] = useState(prefill?.category ? getCostCategoryMeta(prefill.category).key : 'food');
  const [payerId, setPayerId] = useState(prefill?.payerId || participants[0]?.id || '');
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(
    participants.map((p) => p.id)
  );
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [expenseDate, setExpenseDate] = useState(
    prefill?.date || new Date().toISOString().split('T')[0]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const numAmount = parseFloat(amount);
    if (!description.trim()) {
      setError('Please provide an expense description.');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid positive amount.');
      return;
    }
    if (!payerId) {
      setError('Please select who paid for this expense.');
      return;
    }

    let finalSplits: ExpenseSplit[] = [];
    if (splitType === 'equal') {
      if (selectedParticipants.length === 0) {
        setError('At least one traveler must be included in the split.');
        return;
      }
      const splitAmount = numAmount / selectedParticipants.length;
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

      if (Math.abs(sum - numAmount) > 0.05) {
        setError(
          `Custom split total (€${sum.toFixed(2)}) must match the expense amount (€${numAmount.toFixed(2)}).`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const ok = await onSave({
        payer_id: payerId,
        description: description.trim(),
        amount: numAmount,
        category,
        split_type: splitType,
        splits: finalSplits,
        expense_date: expenseDate,
      });
      if (ok) {
        onClose();
      } else {
        setError('Failed to record expense. Please try again.');
      }
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
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
              {prefill ? 'Assign / Edit Expense' : 'Add Trip Expense'}
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              Log shared costs and update balances
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
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', overflowY: 'auto' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '6px' }}>
                  Amount (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-subtle)',
                    fontSize: '0.9rem',
                    outline: 'none',
                    background: 'var(--color-surface-card)',
                    color: 'var(--color-text-main)',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontFeatureSettings: '"tnum"',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '6px' }}>
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
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
            </div>

            {/* Category & Payer row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '6px' }}>
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CostCategoryKey)}
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
                >
                  {COST_CATEGORY_LIST.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '6px' }}>
                  Paid By
                </label>
                <select
                  value={payerId}
                  onChange={(e) => setPayerId(e.target.value)}
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
                >
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Split options */}
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
    </div>
  );
}
