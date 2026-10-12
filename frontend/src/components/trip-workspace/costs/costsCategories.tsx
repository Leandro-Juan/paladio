import React from 'react';

export type CostCategoryKey =
  | 'transport'
  | 'flights'
  | 'accommodation'
  | 'food'
  | 'groceries'
  | 'activities'
  | 'sightseeing'
  | 'other';

export interface CostCategoryMeta {
  key: CostCategoryKey;
  label: string;
  color: string;
  bgLight: string;
  borderColor: string;
  icon: (props: { size?: number; className?: string }) => React.JSX.Element;
}

// Aligned with Paladio's core design system and POI category tokens
export const COST_CATEGORIES: Record<CostCategoryKey, CostCategoryMeta> = {
  transport: {
    key: 'transport',
    label: 'Transport',
    color: '#0891B2', // Matches poiCategory transit
    bgLight: 'rgba(8, 145, 178, 0.08)',
    borderColor: 'rgba(8, 145, 178, 0.25)',
    icon: ({ size = 16, className }) => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.1 11.2 2 11.6 2 12v4c0 .6.4 1 1 1h2" />
        <circle cx="7" cy="17" r="2" />
        <path d="M9 17h6" />
        <circle cx="17" cy="17" r="2" />
      </svg>
    ),
  },
  flights: {
    key: 'flights',
    label: 'Flights',
    color: '#0F4C5C', // Pacific Jazz Deep Teal
    bgLight: 'rgba(15, 76, 92, 0.08)',
    borderColor: 'rgba(15, 76, 92, 0.25)',
    icon: ({ size = 16, className }) => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z" />
      </svg>
    ),
  },
  accommodation: {
    key: 'accommodation',
    label: 'Accommodation',
    color: '#14788D', // Pacific Jazz Mid Teal
    bgLight: 'rgba(20, 120, 141, 0.08)',
    borderColor: 'rgba(20, 120, 141, 0.25)',
    icon: ({ size = 16, className }) => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M3 21h18" />
        <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
        <path d="M10 9h4" />
        <path d="M10 13h4" />
        <path d="M10 17h4" />
      </svg>
    ),
  },
  food: {
    key: 'food',
    label: 'Food & Drink',
    color: '#D97706', // Paladio Warm Amber
    bgLight: 'rgba(217, 119, 6, 0.08)',
    borderColor: 'rgba(217, 119, 6, 0.25)',
    icon: ({ size = 16, className }) => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2" />
        <path d="M15 2v18" />
        <path d="M7 2v20" />
        <path d="M4 2v6a3 3 0 0 0 6 0V2" />
      </svg>
    ),
  },
  groceries: {
    key: 'groceries',
    label: 'Groceries',
    color: '#166534', // Matches poiCategory park / green
    bgLight: 'rgba(22, 101, 52, 0.08)',
    borderColor: 'rgba(22, 101, 52, 0.25)',
    icon: ({ size = 16, className }) => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <circle cx="8" cy="21" r="1" />
        <circle cx="19" cy="21" r="1" />
        <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
      </svg>
    ),
  },
  activities: {
    key: 'activities',
    label: 'Activities',
    color: '#E2B33C', // Pacific Jazz Mustard Gold
    bgLight: 'rgba(226, 179, 60, 0.08)',
    borderColor: 'rgba(226, 179, 60, 0.25)',
    icon: ({ size = 16, className }) => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M6 12h.01" />
        <path d="M18 12h.01" />
        <path d="M10 6v12" />
        <path d="M14 6v12" />
      </svg>
    ),
  },
  sightseeing: {
    key: 'sightseeing',
    label: 'Sightseeing',
    color: '#7C3AED', // Matches poiCategory landmark
    bgLight: 'rgba(124, 58, 237, 0.08)',
    borderColor: 'rgba(124, 58, 237, 0.25)',
    icon: ({ size = 16, className }) => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
        <circle cx="12" cy="13" r="3" />
      </svg>
    ),
  },
  other: {
    key: 'other',
    label: 'Other',
    color: '#64748B', // Paladio Neutral Slate
    bgLight: 'rgba(100, 116, 139, 0.08)',
    borderColor: 'rgba(100, 116, 139, 0.25)',
    icon: ({ size = 16, className }) => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
        <circle cx="5" cy="12" r="1" />
      </svg>
    ),
  },
};

export const COST_CATEGORY_LIST = Object.values(COST_CATEGORIES);

const CATEGORY_ALIAS_MAP: Record<string, CostCategoryKey> = {
  transport: 'transport',
  transportation: 'transport',
  transit: 'transport',
  car: 'transport',
  drive: 'transport',
  bus: 'transport',
  bus_stop: 'transport',
  train: 'transport',
  taxi: 'transport',
  rental: 'transport',
  fuel: 'transport',
  gas: 'transport',
  parking: 'transport',

  flight: 'flights',
  flights: 'flights',
  plane: 'flights',
  airport: 'flights',

  accommodation: 'accommodation',
  hotel: 'accommodation',
  lodging: 'accommodation',
  hostel: 'accommodation',
  stay: 'accommodation',
  resort: 'accommodation',
  apartment: 'accommodation',

  food: 'food',
  dining: 'food',
  restaurant: 'food',
  meal: 'food',
  lunch: 'food',
  dinner: 'food',
  breakfast: 'food',
  drink: 'food',
  bar: 'food',
  cafe: 'food',

  groceries: 'groceries',
  grocery: 'groceries',
  supermarket: 'groceries',

  activities: 'activities',
  activity: 'activities',
  ticket: 'activities',
  tour: 'activities',
  museum: 'activities',
  park: 'activities',
  attraction: 'activities',
  landmark: 'activities',

  sightseeing: 'sightseeing',
  photo: 'sightseeing',
  viewpoint: 'sightseeing',

  other: 'other',
  misc: 'other',
  general: 'other',
};

export function getCostCategoryMeta(rawCategory?: string | null): CostCategoryMeta {
  if (!rawCategory) return COST_CATEGORIES.other;
  const normalized = rawCategory.trim().toLowerCase();
  const key =
    CATEGORY_ALIAS_MAP[normalized] ||
    (normalized in COST_CATEGORIES ? (normalized as CostCategoryKey) : 'other');
  return COST_CATEGORIES[key] || COST_CATEGORIES.other;
}
