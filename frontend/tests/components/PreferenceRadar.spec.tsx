import { test, expect } from '@playwright/experimental-ct-react';
import PreferenceRadar from '../../src/components/PreferenceRadar';

test('renders radar chart with correct subjects', async ({ mount }) => {
  const testData = [
    { subject: 'Culture', A: 90, fullMark: 100 },
    { subject: 'Nature', A: 80, fullMark: 100 }
  ];
  
  const component = await mount(<PreferenceRadar data={testData} />);
  
  // Expect the subjects to be rendered by Recharts
  await expect(component.getByText('Culture')).toBeVisible();
  await expect(component.getByText('Nature')).toBeVisible();
});

test('shows no data message when empty', async ({ mount }) => {
  const emptyComponent = await mount(<PreferenceRadar data={[]} />);
  await expect(emptyComponent.getByText('No data available')).toBeVisible();
});
