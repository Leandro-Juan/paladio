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
    renderIcon: ({ size = 16, color } = {}) => <PlaneIcon size={size} color={color || '#0284C7'} />,
    accentColor: '#0284C7',
    accentBg: '#F0F9FF',
    accentBorder: '#BAE6FD',
  },
  hotel: {
    type: 'hotel',
    label: 'Stays & Keys',
    tag: 'STAY / KEY CODE',
    sectionTitle: '// LODGING & ACCESS CODES',
    renderIcon: ({ size = 16, color } = {}) => <HotelIcon size={size} color={color || '#D97706'} />,
    accentColor: '#D97706',
    accentBg: '#FFFBEB',
    accentBorder: '#FDE68A',
  },
  attraction: {
    type: 'attraction',
    label: 'Attractions',
    tag: 'MUSEUM PASS',
    sectionTitle: '// MUSEUMS & ATTRACTION PASSES',
    renderIcon: ({ size = 16, color } = {}) => <MuseumIcon size={size} color={color || '#059669'} />,
    accentColor: '#059669',
    accentBg: '#ECFDF5',
    accentBorder: '#A7F3D0',
  },
  transit: {
    type: 'transit',
    label: 'Transit',
    tag: 'RAIL / TRANSIT',
    sectionTitle: '// PUBLIC TRANSIT & RAIL TICKETS',
    renderIcon: ({ size = 16, color } = {}) => <TransitIcon size={size} color={color || '#7C3AED'} />,
    accentColor: '#7C3AED',
    accentBg: '#F5F3FF',
    accentBorder: '#DDD6FE',
  },
  other: {
    type: 'other',
    label: 'Other',
    tag: 'VOUCHER',
    sectionTitle: '// GENERAL VOUCHERS & CREDENTIALS',
    renderIcon: ({ size = 16, color } = {}) => <DocumentIcon size={size} color={color || '#475569'} />,
    accentColor: '#475569',
    accentBg: '#F8FAFC',
    accentBorder: '#E2E8F0',
  },
};

export const STATUS_BADGE_CONFIG: Record<TicketStatus, { label: string; color: string; bg: string; border: string }> = {
  planned: {
    label: 'PLANNED',
    color: '#475569',
    bg: '#F1F5F9',
    border: '#CBD5E1',
  },
  confirmed: {
    label: 'CONFIRMED',
    color: '#059669',
    bg: '#ECFDF5',
    border: '#A7F3D0',
  },
  used: {
    label: 'USED',
    color: '#64748B',
    bg: '#F8FAFC',
    border: '#E2E8F0',
  },
  cancelled: {
    label: 'CANCELLED',
    color: '#DC2626',
    bg: '#FEF2F2',
    border: '#FECACA',
  },
};
