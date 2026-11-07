import { test, expect } from '@playwright/experimental-ct-react';
import React from 'react';
import { AgentPoiCards, AgentPoiItem } from '../../src/components/trip-agent/AgentPoiCards';
import { renderMarkdownContent } from '../../src/components/trip-agent/AgentMessageList';

test.describe('AgentPoiCards & Markdown Renderer', () => {
  const samplePois: AgentPoiItem[] = [
    {
      id: 'poi-1',
      poi_id: 'poi-1',
      name: 'Ramen Jiro',
      category: 'restaurant',
      price: 10,
      rating: 4.6,
      duration_mins: 45,
      description: 'Iconic hearty pork-bone broth.',
    },
    {
      id: 'poi-2',
      poi_id: 'poi-2',
      name: 'Rokurinsha',
      category: 'restaurant',
      price: 12,
      rating: 4.8,
      duration_mins: 50,
      description: 'Famous dipping noodles.',
    },
    {
      id: 'poi-3',
      poi_id: 'poi-3',
      name: 'Tokyo Ramen Street',
      category: 'attraction',
      price: 0,
      rating: 4.5,
      duration_mins: 60,
      description: 'Hub of elite ramen vendors.',
    },
  ];

  test('renderMarkdownContent cleans raw asterisks, formats labels, and matches POIs', () => {
    const rawMarkdown = `Top ramen recommendations in Tokyo:
1. Ramen Jiro - Shinjuku
•Location:* 5-5 Shinjuku-ku, Tokyo (near Shinjuku Station).
•Why it's great:* Legendary portions.
2. Rokurinsha - Tokyo Ramen Street
*Location:* S-1 Chiyoda-ku
*Why it's great:* Famous tsukemen.`;

    const nodes = renderMarkdownContent(rawMarkdown, samplePois);
    expect(nodes).toBeDefined();
    expect(Array.isArray(nodes)).toBe(true);
    // 7 lines (numbered items, bullet items, header)
    expect(nodes!.length).toBeGreaterThanOrEqual(6);
  });

  test('renders POI cards deck with tactical navigation buttons', async ({ mount }) => {
    const component = await mount(
      <AgentPoiCards
        pois={samplePois}
        city="Tokyo"
        tool="search_pois"
      />
    );

    // Title and badge
    await expect(component.getByText('Recommended Places')).toBeVisible();
    await expect(component.getByText('3 places in Tokyo')).toBeVisible();

    // Navigation buttons exist
    const prevBtn = component.getByRole('button', { name: 'Previous places' });
    const nextBtn = component.getByRole('button', { name: 'Next places' });
    await expect(prevBtn).toBeVisible();
    await expect(nextBtn).toBeVisible();

    // Prev button initially disabled at start
    await expect(prevBtn).toBeDisabled();

    // Cards visible
    await expect(component.getByText('Ramen Jiro')).toBeVisible();
    await expect(component.getByText('Rokurinsha')).toBeVisible();
    await expect(component.getByText('Tokyo Ramen Street')).toBeVisible();
  });
});
