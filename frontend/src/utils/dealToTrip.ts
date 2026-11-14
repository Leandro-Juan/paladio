import type { DealPackage } from '@/hooks/useRouteMonitoring';
import { useTripDraftStore } from '@/stores/tripDraftStore';

function extractTimeHHMM(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 5);
  }
  const tIndex = trimmed.indexOf('T');
  if (tIndex !== -1 && trimmed.length >= tIndex + 6) {
    const candidate = trimmed.slice(tIndex + 1, tIndex + 6);
    if (/^\d{2}:\d{2}$/.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Builds the `/engine` URL with all relevant package deal query parameters.
 */
export function buildDealTripUrl(deal: DealPackage, currency?: string): string {
  const params = new URLSearchParams();

  const destination = deal.destination_name || deal.destination_code;
  const origin = deal.origin_name || deal.origin_iata;
  if (destination) params.set('destination', destination);
  if (origin) params.set('origin', origin);
  if (deal.origin_iata) params.set('origin_iata', deal.origin_iata);
  if (deal.destination_code) params.set('dest_iata', deal.destination_code);
  if (deal.depart_date) params.set('start_date', deal.depart_date);
  if (deal.return_date) params.set('end_date', deal.return_date);

  if (typeof deal.total_price_eur === 'number' && Number.isFinite(deal.total_price_eur) && deal.total_price_eur > 0) {
    params.set('budget', String(Math.round(deal.total_price_eur)));
  }

  const resolvedCurrency = (currency || deal.currency || 'EUR').toUpperCase().trim();
  if (resolvedCurrency) {
    params.set('currency', resolvedCurrency);
  }

  if (deal.travelers && deal.travelers > 1) {
    params.set('travelers', String(deal.travelers));
  }

  const departHour = extractTimeHHMM(deal.flight?.depart_time);
  if (departHour) params.set('departure_hour', departHour);

  const arrivalHour =
    extractTimeHHMM(deal.return_flight?.arrival_time) ||
    extractTimeHHMM(deal.flight?.arrival_time);
  if (arrivalHour) params.set('arrival_hour', arrivalHour);

  if (deal.lodging?.property_name) {
    params.set('hotel_name', deal.lodging.property_name);
  }
  if (deal.lodging?.address) {
    params.set('hotel_address', deal.lodging.address);
  }

  params.set('source', 'deal');
  return `/engine?${params.toString()}`;
}

/**
 * Persists deal participants (when present) into the draft store and returns
 * the `/engine` URL for navigating to the trip creator.
 */
export function prepareDealTripNavigation(deal: DealPackage, currency?: string): string {
  if (deal.participants && deal.participants.length > 0) {
    useTripDraftStore.getState().updateDraft({ participants: deal.participants });
  }
  return buildDealTripUrl(deal, currency);
}
