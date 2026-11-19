import { User } from '@/types/auth';
import { translate } from '@/stores/localeStore';

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
    trackTitle: 'taste_calibration.questions.first_morning.track_title',
    dimensionLabel: 'taste_calibration.questions.first_morning.dimension',
    prompt: 'taste_calibration.questions.first_morning.prompt',
    options: [
      {
        id: 'A',
        label: 'taste_calibration.questions.first_morning.opt_a_label',
        sublabel: 'taste_calibration.questions.first_morning.opt_a_sublabel',
        deltas: { art_culture: 0.3, history_heritage: 0.15, nightlife: -0.05 },
      },
      {
        id: 'B',
        label: 'taste_calibration.questions.first_morning.opt_b_label',
        sublabel: 'taste_calibration.questions.first_morning.opt_b_sublabel',
        deltas: { history_heritage: 0.3, architecture: 0.15 },
      },
      {
        id: 'C',
        label: 'taste_calibration.questions.first_morning.opt_c_label',
        sublabel: 'taste_calibration.questions.first_morning.opt_c_sublabel',
        deltas: { food_culinary: 0.28, shopping: 0.12 },
      },
      {
        id: 'D',
        label: 'taste_calibration.questions.first_morning.opt_d_label',
        sublabel: 'taste_calibration.questions.first_morning.opt_d_sublabel',
        deltas: { scenic_views: 0.25, nature_outdoors: 0.25 },
      },
    ],
  },
  {
    id: 'afternoon_pace',
    trackTitle: 'taste_calibration.questions.afternoon_pace.track_title',
    dimensionLabel: 'taste_calibration.questions.afternoon_pace.dimension',
    prompt: 'taste_calibration.questions.afternoon_pace.prompt',
    options: [
      {
        id: 'A',
        label: 'taste_calibration.questions.afternoon_pace.opt_a_label',
        sublabel: 'taste_calibration.questions.afternoon_pace.opt_a_sublabel',
        deltas: { food_culinary: 0.1, scenic_views: 0.1 },
        pace: 'leisurely',
      },
      {
        id: 'B',
        label: 'taste_calibration.questions.afternoon_pace.opt_b_label',
        sublabel: 'taste_calibration.questions.afternoon_pace.opt_b_sublabel',
        deltas: { art_culture: 0.08, history_heritage: 0.08 },
        pace: 'balanced',
      },
      {
        id: 'C',
        label: 'taste_calibration.questions.afternoon_pace.opt_c_label',
        sublabel: 'taste_calibration.questions.afternoon_pace.opt_c_sublabel',
        deltas: { architecture: 0.12, history_heritage: 0.12 },
        pace: 'intense',
      },
      {
        id: 'D',
        label: 'taste_calibration.questions.afternoon_pace.opt_d_label',
        sublabel: 'taste_calibration.questions.afternoon_pace.opt_d_sublabel',
        deltas: { scenic_views: 0.12, shopping: 0.1 },
        pace: 'balanced',
      },
    ],
  },
  {
    id: 'urban_form',
    trackTitle: 'taste_calibration.questions.urban_form.track_title',
    dimensionLabel: 'taste_calibration.questions.urban_form.dimension',
    prompt: 'taste_calibration.questions.urban_form.prompt',
    options: [
      {
        id: 'A',
        label: 'taste_calibration.questions.urban_form.opt_a_label',
        sublabel: 'taste_calibration.questions.urban_form.opt_a_sublabel',
        deltas: { architecture: 0.32, art_culture: 0.1 },
      },
      {
        id: 'B',
        label: 'taste_calibration.questions.urban_form.opt_b_label',
        sublabel: 'taste_calibration.questions.urban_form.opt_b_sublabel',
        deltas: { nature_outdoors: 0.34, scenic_views: 0.12 },
      },
      {
        id: 'C',
        label: 'taste_calibration.questions.urban_form.opt_c_label',
        sublabel: 'taste_calibration.questions.urban_form.opt_c_sublabel',
        deltas: { scenic_views: 0.34, architecture: 0.08 },
      },
      {
        id: 'D',
        label: 'taste_calibration.questions.urban_form.opt_d_label',
        sublabel: 'taste_calibration.questions.urban_form.opt_d_sublabel',
        deltas: { history_heritage: 0.22, architecture: 0.2 },
      },
    ],
  },
  {
    id: 'dining_style',
    trackTitle: 'taste_calibration.questions.dining_style.track_title',
    dimensionLabel: 'taste_calibration.questions.dining_style.dimension',
    prompt: 'taste_calibration.questions.dining_style.prompt',
    options: [
      {
        id: 'A',
        label: 'taste_calibration.questions.dining_style.opt_a_label',
        sublabel: 'taste_calibration.questions.dining_style.opt_a_sublabel',
        deltas: { food_culinary: 0.28, nightlife: 0.05 },
        budget_tier: 'budget',
      },
      {
        id: 'B',
        label: 'taste_calibration.questions.dining_style.opt_b_label',
        sublabel: 'taste_calibration.questions.dining_style.opt_b_sublabel',
        deltas: { food_culinary: 0.32, art_culture: 0.05 },
        budget_tier: 'balanced',
      },
      {
        id: 'C',
        label: 'taste_calibration.questions.dining_style.opt_c_label',
        sublabel: 'taste_calibration.questions.dining_style.opt_c_sublabel',
        deltas: { food_culinary: 0.35, nightlife: 0.08 },
        budget_tier: 'luxury',
      },
      {
        id: 'D',
        label: 'taste_calibration.questions.dining_style.opt_d_label',
        sublabel: 'taste_calibration.questions.dining_style.opt_d_sublabel',
        deltas: { food_culinary: -0.15, history_heritage: 0.08, nature_outdoors: 0.08 },
      },
    ],
  },
  {
    id: 'after_sunset',
    trackTitle: 'taste_calibration.questions.after_sunset.track_title',
    dimensionLabel: 'taste_calibration.questions.after_sunset.dimension',
    prompt: 'taste_calibration.questions.after_sunset.prompt',
    options: [
      {
        id: 'A',
        label: 'taste_calibration.questions.after_sunset.opt_a_label',
        sublabel: 'taste_calibration.questions.after_sunset.opt_a_sublabel',
        deltas: { nightlife: 0.36, food_culinary: 0.06 },
        crowd_tolerance: 0.75,
      },
      {
        id: 'B',
        label: 'taste_calibration.questions.after_sunset.opt_b_label',
        sublabel: 'taste_calibration.questions.after_sunset.opt_b_sublabel',
        deltas: { scenic_views: 0.24, architecture: 0.12, nightlife: -0.12 },
        crowd_tolerance: 0.3,
      },
      {
        id: 'C',
        label: 'taste_calibration.questions.after_sunset.opt_c_label',
        sublabel: 'taste_calibration.questions.after_sunset.opt_c_sublabel',
        deltas: { art_culture: 0.16, shopping: 0.14, nightlife: 0.1 },
        crowd_tolerance: 0.6,
      },
      {
        id: 'D',
        label: 'taste_calibration.questions.after_sunset.opt_d_label',
        sublabel: 'taste_calibration.questions.after_sunset.opt_d_sublabel',
        deltas: { nightlife: -0.28, nature_outdoors: 0.1 },
        crowd_tolerance: 0.25,
      },
    ],
  },
  {
    id: 'markets_craft',
    trackTitle: 'taste_calibration.questions.markets_craft.track_title',
    dimensionLabel: 'taste_calibration.questions.markets_craft.dimension',
    prompt: 'taste_calibration.questions.markets_craft.prompt',
    options: [
      {
        id: 'A',
        label: 'taste_calibration.questions.markets_craft.opt_a_label',
        sublabel: 'taste_calibration.questions.markets_craft.opt_a_sublabel',
        deltas: { shopping: 0.34, art_culture: 0.12 },
      },
      {
        id: 'B',
        label: 'taste_calibration.questions.markets_craft.opt_b_label',
        sublabel: 'taste_calibration.questions.markets_craft.opt_b_sublabel',
        deltas: { shopping: 0.22, food_culinary: 0.16 },
      },
      {
        id: 'C',
        label: 'taste_calibration.questions.markets_craft.opt_c_label',
        sublabel: 'taste_calibration.questions.markets_craft.opt_c_sublabel',
        deltas: { shopping: 0.05 },
      },
      {
        id: 'D',
        label: 'taste_calibration.questions.markets_craft.opt_d_label',
        sublabel: 'taste_calibration.questions.markets_craft.opt_d_sublabel',
        deltas: { shopping: -0.26, nature_outdoors: 0.1, history_heritage: 0.1 },
      },
    ],
  },
  {
    id: 'budget_strategy',
    trackTitle: 'taste_calibration.questions.budget_strategy.track_title',
    dimensionLabel: 'taste_calibration.questions.budget_strategy.dimension',
    prompt: 'taste_calibration.questions.budget_strategy.prompt',
    options: [
      {
        id: 'A',
        label: 'taste_calibration.questions.budget_strategy.opt_a_label',
        sublabel: 'taste_calibration.questions.budget_strategy.opt_a_sublabel',
        deltas: { nature_outdoors: 0.1, scenic_views: 0.1 },
        budget_tier: 'budget',
      },
      {
        id: 'B',
        label: 'taste_calibration.questions.budget_strategy.opt_b_label',
        sublabel: 'taste_calibration.questions.budget_strategy.opt_b_sublabel',
        deltas: { art_culture: 0.08, food_culinary: 0.08 },
        budget_tier: 'balanced',
      },
      {
        id: 'C',
        label: 'taste_calibration.questions.budget_strategy.opt_c_label',
        sublabel: 'taste_calibration.questions.budget_strategy.opt_c_sublabel',
        deltas: { food_culinary: 0.12, shopping: 0.1 },
        budget_tier: 'luxury',
      },
      {
        id: 'D',
        label: 'taste_calibration.questions.budget_strategy.opt_d_label',
        sublabel: 'taste_calibration.questions.budget_strategy.opt_d_sublabel',
        deltas: { food_culinary: 0.16, art_culture: 0.14, shopping: -0.1 },
        budget_tier: 'balanced',
      },
    ],
  },
  {
    id: 'crowd_discovery',
    trackTitle: 'taste_calibration.questions.crowd_discovery.track_title',
    dimensionLabel: 'taste_calibration.questions.crowd_discovery.dimension',
    prompt: 'taste_calibration.questions.crowd_discovery.prompt',
    options: [
      {
        id: 'A',
        label: 'taste_calibration.questions.crowd_discovery.opt_a_label',
        sublabel: 'taste_calibration.questions.crowd_discovery.opt_a_sublabel',
        deltas: { history_heritage: 0.18, art_culture: 0.16 },
        crowd_tolerance: 0.85,
      },
      {
        id: 'B',
        label: 'taste_calibration.questions.crowd_discovery.opt_b_label',
        sublabel: 'taste_calibration.questions.crowd_discovery.opt_b_sublabel',
        deltas: { architecture: 0.12, scenic_views: 0.12 },
        crowd_tolerance: 0.5,
      },
      {
        id: 'C',
        label: 'taste_calibration.questions.crowd_discovery.opt_c_label',
        sublabel: 'taste_calibration.questions.crowd_discovery.opt_c_sublabel',
        deltas: { nature_outdoors: 0.2, scenic_views: 0.16, nightlife: -0.1 },
        crowd_tolerance: 0.2,
      },
      {
        id: 'D',
        label: 'taste_calibration.questions.crowd_discovery.opt_d_label',
        sublabel: 'taste_calibration.questions.crowd_discovery.opt_d_sublabel',
        deltas: { nightlife: 0.18, food_culinary: 0.14 },
        crowd_tolerance: 0.75,
      },
    ],
  },
];

export function getCalibrationQuestions(
  translateFn: (key: string) => string = (key) => translate(key)
): CalibrationQuestion[] {
  return CALIBRATION_QUESTIONS.map((q) => ({
    ...q,
    trackTitle: translateFn(q.trackTitle),
    dimensionLabel: translateFn(q.dimensionLabel),
    prompt: translateFn(q.prompt),
    options: q.options.map((opt) => ({
      ...opt,
      label: translateFn(opt.label),
      sublabel: translateFn(opt.sublabel),
    })) as CalibrationQuestion['options'],
  }));
}

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
    .map((k) => translate(`taste_calibration.tag_${k}`));

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
    taste_bio: translate('taste_calibration.taste_bio', {
      pace: translate(`taste_calibration.pace_${pace}`),
      budgetTier: translate(`taste_calibration.budget_${budgetTier}`),
      topTags: sortedTop.join(', '),
    }),
  };
}
