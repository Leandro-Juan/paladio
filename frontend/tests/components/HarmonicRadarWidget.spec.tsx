import { test, expect } from '@playwright/experimental-ct-react';
import { HarmonicRadarWidget } from '../../src/components/HarmonicRadarWidget';
import { User } from '../../src/types/auth';

test('renders HarmonicRadarWidget with user preferences correctly', async ({ mount }) => {
  const mockUser: User = {
    id: 'user-123',
    username: 'traveler',
    email: 'traveler@paladio.internal',
    role: 'user',
    is_active: true,
    preferences: {
      pace: 'leisurely',
      budget_tier: 'budget',
      tag_affinities: {
        art_culture: 0.85,
        history_heritage: 0.45,
        nature_outdoors: 0.9,
        architecture: 0.6,
        food_culinary: 0.75,
        nightlife: 0.3,
        shopping: 0.4,
        scenic_views: 0.95,
      },
    },
  };

  const component = await mount(<HarmonicRadarWidget user={mockUser} />);

  // Verify header tags
  await expect(component.getByText('// 8-POINT HARMONIC RADAR')).toBeVisible();
  await expect(component.getByText('C++20 UTILITY')).toBeVisible();

  // Verify pace readout reflects user preference
  await expect(component.getByText('TRAVEL PACE')).toBeVisible();
  await expect(component.getByText('leisurely')).toBeVisible();
  await expect(component.getByText('90-150m dwell')).toBeVisible();

  // Verify budget readout reflects user preference
  await expect(component.getByText('BUDGET STRATEGY')).toBeVisible();
  await expect(component.getByText('budget', { exact: true })).toBeVisible();
  await expect(component.getByText('Cost sensitive')).toBeVisible();
});

test('renders HarmonicRadarWidget with explicit props override', async ({ mount }) => {
  const affinities = {
    art_culture: 0.9,
    history_heritage: 0.8,
    nature_outdoors: 0.7,
    architecture: 0.6,
    food_culinary: 0.5,
    nightlife: 0.4,
    shopping: 0.3,
    scenic_views: 0.2,
  };

  const component = await mount(
    <HarmonicRadarWidget tagAffinities={affinities} pace="intense" budgetTier="luxury" />
  );

  await expect(component.getByText('intense')).toBeVisible();
  await expect(component.getByText('30-60m highlights')).toBeVisible();
  await expect(component.getByText('luxury')).toBeVisible();
  await expect(component.getByText('Zero penalty')).toBeVisible();
});
