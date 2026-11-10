import { test, expect } from '@playwright/experimental-ct-react';
import React from 'react';
import { Tooltip, PaladioTooltipProvider } from '../../src/components/common/Tooltip';

test.describe('Paladio Native Tooltip System', () => {
  test('declarative Tooltip component sets data-tooltip attributes on children', async ({ mount }) => {
    const component = await mount(
      <div>
        <Tooltip content="Search destinations" shortcut="⌘K" position="bottom">
          <button data-testid="test-btn">Search</button>
        </Tooltip>
      </div>
    );

    const btn = component.getByTestId('test-btn');
    await expect(btn).toHaveAttribute('data-tooltip', 'Search destinations');
    await expect(btn).toHaveAttribute('data-tooltip-shortcut', '⌘K');
    await expect(btn).toHaveAttribute('data-tooltip-position', 'bottom');
    await expect(btn).toHaveAttribute('aria-label', 'Search destinations');
  });

  test('PaladioTooltipProvider renders tooltip on hover with label and shortcut chip', async ({ mount, page }) => {
    await mount(
      <div>
        <PaladioTooltipProvider />
        <button
          data-testid="search-btn"
          data-tooltip="Search Places"
          data-tooltip-shortcut="⌘K"
          data-tooltip-position="bottom"
        >
          Search
        </button>
      </div>
    );

    const btn = page.getByTestId('search-btn');
    await btn.hover();

    // Tooltip should appear after open delay
    const tooltip = page.locator('#paladio-global-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Search Places');
    await expect(tooltip.locator('kbd')).toHaveText('⌘K');
  });

  test('PaladioTooltipProvider intercepts raw title attributes and converts to custom tooltip', async ({ mount, page }) => {
    await mount(
      <div>
        <PaladioTooltipProvider />
        <button
          data-testid="legacy-title-btn"
          title="Optimize Route (⌘O)"
        >
          Optimize
        </button>
      </div>
    );

    const btn = page.getByTestId('legacy-title-btn');
    await btn.hover();

    // The title attribute should be stripped to prevent native browser tooltip
    await expect(btn).not.toHaveAttribute('title');
    await expect(btn).toHaveAttribute('data-tooltip', 'Optimize Route (⌘O)');

    // The custom tooltip should be visible with extracted shortcut
    const tooltip = page.locator('#paladio-global-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Optimize Route');
    await expect(tooltip.locator('kbd')).toHaveText('⌘O');
  });

  test('PaladioTooltipProvider applies white background and project blue text', async ({ mount, page }) => {
    await mount(
      <div>
        <PaladioTooltipProvider />
        <button
          data-testid="color-test-btn"
          data-tooltip="Weather Telemetry"
          data-tooltip-position="bottom"
        >
          Weather
        </button>
      </div>
    );

    const btn = page.getByTestId('color-test-btn');
    await btn.hover();

    const tooltip = page.locator('#paladio-global-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(tooltip).toHaveCSS('color', 'rgb(10, 54, 66)');
  });
});
