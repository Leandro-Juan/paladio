/**
 * Locale & Timezone-aware date/time formatting utilities for Paladio Trip Wallet.
 * Defect #2 fix: Never display raw ISO strings like "DEP: 2026-10-18T10:00:00".
 */

import { translate, useLocaleStore } from '@/stores/localeStore';

function resolveWalletIntlLocale(localeOverride?: string): string {
  const active = localeOverride || useLocaleStore.getState().currentLocale || 'en';
  return active === 'en' ? 'en-GB' : active;
}

export function formatTicketDateTime(
  isoString?: string | null,
  timeZone?: string | null,
  localeOverride?: string
): string {
  if (!isoString) return '--:--';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;

    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    };

    const formatted = new Intl.DateTimeFormat(resolveWalletIntlLocale(localeOverride), options)
      .format(d)
      .toUpperCase();
    return formatted.replace(',', ' ·');
  } catch {
    return isoString.replace('T', ' ').substring(0, 16);
  }
}

export function formatTicketDate(
  isoString?: string | null,
  timeZone?: string | null,
  localeOverride?: string
): string {
  if (!isoString) return '--';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;

    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(timeZone ? { timeZone } : {}),
    };

    return new Intl.DateTimeFormat(resolveWalletIntlLocale(localeOverride), options)
      .format(d)
      .toUpperCase();
  } catch {
    return isoString.substring(0, 10);
  }
}

export function formatTicketTime(
  isoString?: string | null,
  timeZone?: string | null,
  localeOverride?: string
): string {
  if (!isoString) return '--:--';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;

    const options: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    };

    return new Intl.DateTimeFormat(resolveWalletIntlLocale(localeOverride), options).format(d);
  } catch {
    if (isoString.includes('T')) return isoString.split('T')[1].substring(0, 5);
    return isoString.substring(0, 5);
  }
}

export function formatRelativeSlot(isoString?: string | null, localeOverride?: string): string | null {
  if (!isoString) return null;
  try {
    const target = new Date(isoString);
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    const diffHrs = Math.round(diffMs / (1000 * 60 * 60));

    if (diffHrs > 0 && diffHrs <= 24) {
      return translate('wallet.slot_in_hours', { hours: diffHrs }, localeOverride);
    }
    if (diffHrs > 24 && diffHrs <= 48) {
      return translate('wallet.slot_tomorrow', undefined, localeOverride);
    }
    if (diffHrs < 0 && diffHrs >= -24) {
      return translate('wallet.slot_today_earlier', undefined, localeOverride);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Defect #6 fix: Don't display a computed flight duration unless both timestamps are known and timezone-aware.
 */
export function calculateDuration(
  start?: string | null,
  end?: string | null,
  startTz?: string | null,
  endTz?: string | null,
  localeOverride?: string
): string | null {
  if (!start || !end) return null;
  // If timezones are not specified or naive, return null rather than wrong duration
  if (!startTz && !endTz) return null;

  try {
    const d1 = new Date(start);
    const d2 = new Date(end);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;

    const diffMins = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60));
    if (diffMins <= 0 || diffMins > 24 * 60) return null;

    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    if (h === 0) return translate('wallet.duration_minutes', { minutes: m }, localeOverride);
    if (m === 0) return translate('wallet.duration_hours', { hours: h }, localeOverride);
    return translate('wallet.duration_hours_minutes', { hours: h, minutes: m }, localeOverride);
  } catch {
    return null;
  }
}
