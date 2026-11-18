import { User } from '@/types/auth';

export const TASTE_TAG_KEYS = [
  'art_culture',
  'history_heritage',
  'nature_outdoors',
  'architecture',
  'food_culinary',
  'nightlife',
  'shopping',
  'scenic_views',
] as const;

export type TasteTagKey = (typeof TASTE_TAG_KEYS)[number];

export type PaceValue = 'leisurely' | 'balanced' | 'intense';
export type BudgetValue = 'budget' | 'balanced' | 'luxury';

export interface CalibrationOption {
  id: 'A' | 'B' | 'C' | 'D';
  label: string;
  sublabel: string;
  deltas: Partial<Record<TasteTagKey, number>>;
  pace?: PaceValue;
  budget_tier?: BudgetValue;
  crowd_tolerance?: number;
}

export interface CalibrationQuestion {
  id: string;
  trackTitle: string;
  dimensionLabel: string;
  prompt: string;
  options: [CalibrationOption, CalibrationOption, CalibrationOption, CalibrationOption];
}

/**
 * Returns true ONLY when the user is authenticated and every taste vector
 * tag affinity is still around the initial 0.5 neutral baseline.
 */
export function isTasteVectorNeutral(user: User | null | undefined): boolean {
  if (!user) return false;

  const prefs = (user.preferences || {}) as Record<string, unknown>;
  const rawAffinities = prefs.tag_affinities;

  if (!rawAffinities || typeof rawAffinities !== 'object') {
    return true;
  }

  const affinities = rawAffinities as Record<string, unknown>;
  return TASTE_TAG_KEYS.every((key) => {
    const raw = affinities[key];
    const val = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0.5;
    return Math.abs(val - 0.5) <= 0.02;
  });
}

export const CALIBRATION_QUESTIONS: CalibrationQuestion[] = [
  {
    id: 'first_morning',
    trackTitle: 'First Morning Ritual',
    dimensionLabel: 'CULTURE & HERITAGE',
    prompt: 'You land in a new city with one free morning. Where do you head first?',
    options: [
      {
        id: 'A',
        label: 'A quiet, world-class museum or gallery',
        sublabel: 'Curated collections before the crowds arrive',
        deltas: { art_culture: 0.3, history_heritage: 0.15, nightlife: -0.05 },
      },
      {
        id: 'B',
        label: 'The oldest historic quarter & ruins',
        sublabel: 'Cobblestones, cathedrals, and centuries of stories',
        deltas: { history_heritage: 0.3, architecture: 0.15 },
      },
      {
        id: 'C',
        label: 'A bustling local market & espresso bar',
        sublabel: 'Street-level flavors and neighborhood energy',
        deltas: { food_culinary: 0.28, shopping: 0.12 },
      },
      {
        id: 'D',
        label: 'A hilltop park or waterfront promenade',
        sublabel: 'Fresh air, wide horizons, and morning light',
        deltas: { scenic_views: 0.25, nature_outdoors: 0.25 },
      },
    ],
  },
  {
    id: 'afternoon_pace',
    trackTitle: 'Itinerary Cadence',
    dimensionLabel: 'TRAVEL PACE',
    prompt: 'How should your ideal afternoon schedule feel on a multi-day trip?',
    options: [
      {
        id: 'A',
        label: 'Unhurried & spacious',
        sublabel: 'One anchor stop, long café breaks, zero rush',
        deltas: { food_culinary: 0.1, scenic_views: 0.1 },
        pace: 'leisurely',
      },
      {
        id: 'B',
        label: 'Balanced rhythm',
        sublabel: 'Two or three key highlights with breathing room',
        deltas: { art_culture: 0.08, history_heritage: 0.08 },
        pace: 'balanced',
      },
      {
        id: 'C',
        label: 'High-density explorer',
        sublabel: 'Pack in landmarks, transit hops, and hidden corners',
        deltas: { architecture: 0.12, history_heritage: 0.12 },
        pace: 'intense',
      },
      {
        id: 'D',
        label: 'Spontaneous wandering',
        sublabel: 'Follow interesting streets and viewpoints on foot',
        deltas: { scenic_views: 0.12, shopping: 0.1 },
        pace: 'balanced',
      },
    ],
  },
  {
    id: 'urban_form',
    trackTitle: 'Skyline & Landscape',
    dimensionLabel: 'ARCHITECTURE & NATURE',
    prompt: 'Which visual backdrop makes a destination unforgettable for you?',
    options: [
      {
        id: 'A',
        label: 'Bold modern & monumental architecture',
        sublabel: 'Bridges, civic plazas, and iconic facades',
        deltas: { architecture: 0.32, art_culture: 0.1 },
      },
      {
        id: 'B',
        label: 'Botanical gardens, trails & coastlines',
        sublabel: 'Green escapes and natural terrain inside the city',
        deltas: { nature_outdoors: 0.34, scenic_views: 0.12 },
      },
      {
        id: 'C',
        label: 'Elevated miradors & rooftop horizons',
        sublabel: 'Panoramic viewpoints at golden hour',
        deltas: { scenic_views: 0.34, architecture: 0.08 },
      },
      {
        id: 'D',
        label: 'Layered medieval & classical streetscapes',
        sublabel: 'Preserved heritage districts and stone facades',
        deltas: { history_heritage: 0.22, architecture: 0.2 },
      },
    ],
  },
  {
    id: 'dining_style',
    trackTitle: 'Culinary Philosophy',
    dimensionLabel: 'FOOD & GASTRONOMY',
    prompt: 'When it comes to eating on the road, what is your default move?',
    options: [
      {
        id: 'A',
        label: 'Street stalls & neighborhood holes-in-the-wall',
        sublabel: 'Authentic local staples at everyday prices',
        deltas: { food_culinary: 0.28, nightlife: 0.05 },
        budget_tier: 'budget',
      },
      {
        id: 'B',
        label: 'Bistros, tapas bars & regional kitchens',
        sublabel: 'Thoughtful local menus with great atmosphere',
        deltas: { food_culinary: 0.32, art_culture: 0.05 },
        budget_tier: 'balanced',
      },
      {
        id: 'C',
        label: 'Destination tasting menus & wine pairings',
        sublabel: 'Memorable fine dining as a centerpiece of the trip',
        deltas: { food_culinary: 0.35, nightlife: 0.08 },
        budget_tier: 'luxury',
      },
      {
        id: 'D',
        label: 'Quick fuel between sights',
        sublabel: 'Keep meals simple so more time goes to exploring',
        deltas: { food_culinary: -0.15, history_heritage: 0.08, nature_outdoors: 0.08 },
      },
    ],
  },
  {
    id: 'after_sunset',
    trackTitle: 'After Sunset Energy',
    dimensionLabel: 'NIGHTLIFE & EVENING',
    prompt: 'It is 9:30 PM after dinner. How does your ideal evening continue?',
    options: [
      {
        id: 'A',
        label: 'Cocktail speakeasies, live jazz, or late bars',
        sublabel: 'Social energy and curated late-night spots',
        deltas: { nightlife: 0.36, food_culinary: 0.06 },
        crowd_tolerance: 0.75,
      },
      {
        id: 'B',
        label: 'An evening stroll to a lit-up viewpoint',
        sublabel: 'Quiet city lights and night photography',
        deltas: { scenic_views: 0.24, architecture: 0.12, nightlife: -0.12 },
        crowd_tolerance: 0.3,
      },
      {
        id: 'C',
        label: 'Night market or late-opening cultural venue',
        sublabel: 'Evening browsing, galleries, or performances',
        deltas: { art_culture: 0.16, shopping: 0.14, nightlife: 0.1 },
        crowd_tolerance: 0.6,
      },
      {
        id: 'D',
        label: 'Back to the hotel to recharge for tomorrow',
        sublabel: 'Early nights for fresh early mornings',
        deltas: { nightlife: -0.28, nature_outdoors: 0.1 },
        crowd_tolerance: 0.25,
      },
    ],
  },
  {
    id: 'markets_craft',
    trackTitle: 'Markets & Objects',
    dimensionLabel: 'SHOPPING & ARTISANS',
    prompt: 'How much space do markets, design shops, and local crafts get in your itinerary?',
    options: [
      {
        id: 'A',
        label: 'High priority — independent boutiques & vintage',
        sublabel: 'Hunting for local design, ceramics, and rare finds',
        deltas: { shopping: 0.34, art_culture: 0.12 },
      },
      {
        id: 'B',
        label: 'Food & artisan bazaars only',
        sublabel: 'Open-air markets with regional crafts and snacks',
        deltas: { shopping: 0.22, food_culinary: 0.16 },
      },
      {
        id: 'C',
        label: 'Occasional stop if we pass by',
        sublabel: 'A quick browse without dedicating a whole block',
        deltas: { shopping: 0.05 },
      },
      {
        id: 'D',
        label: 'Skip shopping altogether',
        sublabel: 'Save every hour for sights, nature, and culture',
        deltas: { shopping: -0.26, nature_outdoors: 0.1, history_heritage: 0.1 },
      },
    ],
  },
  {
    id: 'budget_strategy',
    trackTitle: 'Budget Strategy',
    dimensionLabel: 'COST & COMFORT',
    prompt: 'Which spending philosophy should Paladio optimize your routes around?',
    options: [
      {
        id: 'A',
        label: 'Lean & resourceful',
        sublabel: 'Free viewpoints, public transit, high-value local eats',
        deltas: { nature_outdoors: 0.1, scenic_views: 0.1 },
        budget_tier: 'budget',
      },
      {
        id: 'B',
        label: 'Smart middle ground',
        sublabel: 'Pay for standout museums and meals, save on filler',
        deltas: { art_culture: 0.08, food_culinary: 0.08 },
        budget_tier: 'balanced',
      },
      {
        id: 'C',
        label: 'Comfort & curated experiences',
        sublabel: 'Skip-the-line access, prime locations, zero friction',
        deltas: { food_culinary: 0.12, shopping: 0.1 },
        budget_tier: 'luxury',
      },
      {
        id: 'D',
        label: 'Splurge on food & culture, frugal everywhere else',
        sublabel: 'Save on transit and shopping to fund great tables and art',
        deltas: { food_culinary: 0.16, art_culture: 0.14, shopping: -0.1 },
        budget_tier: 'balanced',
      },
    ],
  },
  {
    id: 'crowd_discovery',
    trackTitle: 'Crowd & Discovery',
    dimensionLabel: 'ATMOSPHERE',
    prompt: 'What is your tolerance for famous must-see landmarks versus off-beat detours?',
    options: [
      {
        id: 'A',
        label: 'Hit the iconic landmarks—crowds are worth it',
        sublabel: 'Do not miss the headline monuments and major museums',
        deltas: { history_heritage: 0.18, art_culture: 0.16 },
        crowd_tolerance: 0.85,
      },
      {
        id: 'B',
        label: 'Mix icons with quiet neighborhood detours',
        sublabel: 'One major landmark, then slip into side streets',
        deltas: { architecture: 0.12, scenic_views: 0.12 },
        crowd_tolerance: 0.5,
      },
      {
        id: 'C',
        label: 'Avoid crowds—seek hidden parks and quiet corners',
        sublabel: 'Serene viewpoints, lesser-known galleries, calm trails',
        deltas: { nature_outdoors: 0.2, scenic_views: 0.16, nightlife: -0.1 },
        crowd_tolerance: 0.2,
      },
      {
        id: 'D',
        label: 'Follow local buzz—lively plazas and social districts',
        sublabel: 'Energy, street life, and vibrant evening quarters',
        deltas: { nightlife: 0.18, food_culinary: 0.14 },
        crowd_tolerance: 0.75,
      },
    ],
  },
];

function clampAffinity(val: number): number {
  return Math.round(Math.min(0.95, Math.max(0.1, val)) * 100) / 100;
}

export function computeCalibratedPreferences(
  answers: Record<string, 'A' | 'B' | 'C' | 'D'>,
  existingPreferences: Record<string, unknown> | undefined
): Record<string, unknown> {
  const affinities: Record<TasteTagKey, number> = {
    art_culture: 0.5,
    history_heritage: 0.5,
    nature_outdoors: 0.5,
    architecture: 0.5,
    food_culinary: 0.5,
    nightlife: 0.5,
    shopping: 0.5,
    scenic_views: 0.5,
  };

  let pace: PaceValue =
    (existingPreferences?.pace as PaceValue | undefined) ?? 'balanced';
  let budgetTier: BudgetValue =
    (existingPreferences?.budget_tier as BudgetValue | undefined) ?? 'balanced';
  let crowdToleranceSum = 0;
  let crowdToleranceCount = 0;

  for (const question of CALIBRATION_QUESTIONS) {
    const choiceId = answers[question.id];
    if (!choiceId) continue;
    const option = question.options.find((o) => o.id === choiceId);
    if (!option) continue;

    for (const key of TASTE_TAG_KEYS) {
      const delta = option.deltas[key];
      if (typeof delta === 'number') {
        affinities[key] += delta;
      }
    }

    if (option.pace) pace = option.pace;
    if (option.budget_tier) budgetTier = option.budget_tier;
    if (typeof option.crowd_tolerance === 'number') {
      crowdToleranceSum += option.crowd_tolerance;
      crowdToleranceCount += 1;
    }
  }

  const normalizedAffinities: Record<string, number> = {};
  for (const key of TASTE_TAG_KEYS) {
    normalizedAffinities[key] = clampAffinity(affinities[key]);
  }

  // Ensure at least one dimension moves meaningfully away from 0.5 if user answered
  const allStillNeutral = TASTE_TAG_KEYS.every(
    (k) => Math.abs(normalizedAffinities[k] - 0.5) <= 0.02
  );
  if (allStillNeutral && Object.keys(answers).length > 0) {
    normalizedAffinities.art_culture = 0.62;
    normalizedAffinities.food_culinary = 0.62;
  }

  const sortedTop = [...TASTE_TAG_KEYS]
    .sort((a, b) => normalizedAffinities[b] - normalizedAffinities[a])
    .slice(0, 3)
    .map((k) => k.replace(/_/g, ' '));

  const crowdTolerance =
    crowdToleranceCount > 0
      ? Math.round((crowdToleranceSum / crowdToleranceCount) * 100) / 100
      : typeof existingPreferences?.crowd_tolerance === 'number'
      ? existingPreferences.crowd_tolerance
      : 0.5;

  return {
    ...(existingPreferences || {}),
    pace,
    budget_tier: budgetTier,
    crowd_tolerance: crowdTolerance,
    tag_affinities: normalizedAffinities,
    taste_bio: `Calibrated ${pace} traveler (${budgetTier} tier) gravitating toward ${sortedTop.join(', ')}.`,
  };
}
