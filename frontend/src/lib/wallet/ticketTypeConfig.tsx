import React from 'react';
import {
  PlaneIcon,
  HotelIcon,
  MuseumIcon,
  TransitIcon,
  DocumentIcon,
} from '@/components/icons';

export type TicketType = 'flight' | 'hotel' | 'attraction' | 'transit' | 'other';
export type TicketStatus = 'planned' | 'confirmed' | 'used' | 'cancelled';

export interface TicketTypeMeta {
  type: TicketType;
  label: string;
  tag: string;
  sectionTitle: string;
  renderIcon: (props?: { size?: number; color?: string }) => React.ReactNode;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
}

export const TICKET_TYPE_CONFIG: Record<TicketType, TicketTypeMeta> = {
  flight: {
    type: 'flight',
    label: 'Flights',
    tag: 'AIR TRANSIT',
    sectionTitle: '// FLIGHT BOARDING PASSES',
    renderIcon: ({ size = 16, color } = {}) => <PlaneIcon size={size} color={color || '#0F4C5C'} />,
    accentColor: '#0F4C5C',
    accentBg: 'rgba(15, 76, 92, 0.08)',
    accentBorder: 'rgba(15, 76, 92, 0.25)',
  },
  hotel: {
    type: 'hotel',
    label: 'Stays & Keys',
    tag: 'STAY / KEY CODE',
    sectionTitle: '// LODGING & ACCESS CODES',
    renderIcon: ({ size = 16, color } = {}) => <HotelIcon size={size} color={color || '#14788D'} />,
    accentColor: '#14788D',
    accentBg: 'rgba(20, 120, 141, 0.08)',
    accentBorder: 'rgba(20, 120, 141, 0.25)',
  },
  attraction: {
    type: 'attraction',
    label: 'Attractions',
    tag: 'MUSEUM PASS',
    sectionTitle: '// MUSEUMS & ATTRACTION PASSES',
    renderIcon: ({ size = 16, color } = {}) => <MuseumIcon size={size} color={color || '#E2B33C'} />,
    accentColor: '#E2B33C',
    accentBg: 'rgba(226, 179, 60, 0.08)',
    accentBorder: 'rgba(226, 179, 60, 0.25)',
  },
  transit: {
    type: 'transit',
    label: 'Transit',
    tag: 'RAIL / TRANSIT',
    sectionTitle: '// PUBLIC TRANSIT & RAIL TICKETS',
    renderIcon: ({ size = 16, color } = {}) => <TransitIcon size={size} color={color || '#0891B2'} />,
    accentColor: '#0891B2',
    accentBg: 'rgba(8, 145, 178, 0.08)',
    accentBorder: 'rgba(8, 145, 178, 0.25)',
  },
  other: {
    type: 'other',
    label: 'Other',
    tag: 'VOUCHER',
    sectionTitle: '// GENERAL VOUCHERS & CREDENTIALS',
    renderIcon: ({ size = 16, color } = {}) => <DocumentIcon size={size} color={color || '#64748B'} />,
    accentColor: '#64748B',
    accentBg: 'rgba(100, 116, 139, 0.08)',
    accentBorder: 'rgba(100, 116, 139, 0.25)',
  },
};

export const STATUS_BADGE_CONFIG: Record<TicketStatus, { label: string; color: string; bg: string; border: string }> = {
  planned: {
    label: 'PLANNED',
    color: 'var(--color-text-muted, #64748B)',
    bg: 'rgba(100, 116, 139, 0.08)',
    border: 'rgba(100, 116, 139, 0.25)',
  },
  confirmed: {
    label: 'CONFIRMED',
    color: 'var(--color-accent-teal-mid, #14788D)',
    bg: 'rgba(20, 120, 141, 0.08)',
    border: 'rgba(20, 120, 141, 0.25)',
  },
  used: {
    label: 'USED',
    color: 'var(--color-text-muted, #64748B)',
    bg: 'rgba(100, 116, 139, 0.08)',
    border: 'rgba(100, 116, 139, 0.25)',
  },
  cancelled: {
    label: 'CANCELLED',
    color: 'var(--color-accent-secondary, #D42A2F)',
    bg: 'rgba(212, 42, 47, 0.08)',
    border: 'rgba(212, 42, 47, 0.25)',
  },
};
