/**
 * Recharts Color Harmonization Theme (Pacific Jazz)
 * Exports series colors, grid, axis, and tooltip styling tokens
 * based on the design system CSS variables.
 */

export interface ChartTheme {
  grid: string;
  axis: string;
  axisLabel: {
    fill: string;
    fontSize: number;
    fontFamily: string;
  };
  series: string[];
  tooltip: {
    backgroundColor: string;
    borderColor: string;
    color: string;
    borderRadius: string;
    fontFamily: string;
    boxShadow: string;
  };
}

export const chartTheme: ChartTheme = {
  grid: 'var(--color-border, #E2E8F0)',
  axis: 'var(--color-text-muted, #64748B)',
  axisLabel: {
    fill: 'var(--color-text-muted, #64748B)',
    fontSize: 12,
    fontFamily: 'var(--font-mono, "Inter", sans-serif)',
  },
  series: [
    'var(--color-accent-primary, #0F4C5C)',
    'var(--color-accent-teal-mid, #14788D)',
    'var(--color-accent-secondary, #D42A2F)',
    'var(--color-accent-gold, #E2B33C)',
    'var(--color-accent-teal-soft, #7CC4D1)',
  ],
  tooltip: {
    backgroundColor: 'var(--color-surface-card, #FFFFFF)',
    borderColor: 'var(--color-border, #E2E8F0)',
    color: 'var(--color-text-primary, #0F172A)',
    borderRadius: 'var(--border-radius-md, 8px)',
    fontFamily: 'var(--font-mono, "Inter", sans-serif)',
    boxShadow: 'var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1))',
  },
};

/**
 * Helper to resolve computed CSS variable colors at runtime when var() cannot be parsed
 * by canvas/SVG rendering engines.
 */
export function getResolvedChartTheme(): ChartTheme {
  if (typeof window === 'undefined') {
    return {
      grid: '#E2E8F0',
      axis: '#64748B',
      axisLabel: {
        fill: '#64748B',
        fontSize: 12,
        fontFamily: 'Inter, sans-serif',
      },
      series: ['#0F4C5C', '#14788D', '#D42A2F', '#E2B33C', '#7CC4D1'],
      tooltip: {
        backgroundColor: '#FFFFFF',
        borderColor: '#E2E8F0',
        color: '#0F172A',
        borderRadius: '8px',
        fontFamily: 'Inter, sans-serif',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      },
    };
  }

  const computed = window.getComputedStyle(document.documentElement);
  const resolve = (varName: string, fallback: string) => {
    const val = computed.getPropertyValue(varName).trim();
    return val || fallback;
  };

  return {
    grid: resolve('--color-border', '#E2E8F0'),
    axis: resolve('--color-text-muted', '#64748B'),
    axisLabel: {
      fill: resolve('--color-text-muted', '#64748B'),
      fontSize: 12,
      fontFamily: resolve('--font-mono', 'Inter, sans-serif'),
    },
    series: [
      resolve('--color-accent-primary', '#0F4C5C'),
      resolve('--color-accent-teal-mid', '#14788D'),
      resolve('--color-accent-secondary', '#D42A2F'),
      resolve('--color-accent-gold', '#E2B33C'),
      resolve('--color-accent-teal-soft', '#7CC4D1'),
    ],
    tooltip: {
      backgroundColor: resolve('--color-surface-card', '#FFFFFF'),
      borderColor: resolve('--color-border', '#E2E8F0'),
      color: resolve('--color-text-primary', '#0F172A'),
      borderRadius: resolve('--border-radius-md', '8px'),
      fontFamily: resolve('--font-mono', 'Inter, sans-serif'),
      boxShadow: resolve('--shadow-md', '0 4px 6px -1px rgba(0, 0, 0, 0.1)'),
    },
  };
}
