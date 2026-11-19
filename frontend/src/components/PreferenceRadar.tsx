"use client";
import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { chartTheme } from '@/utils/chartTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface PreferenceRadarProps {
  data: { subject: string; A: number; fullMark: number }[];
  height?: number | string;
  outerRadius?: string | number;
  fontSize?: number;
}

export default function PreferenceRadar({
  data,
  height = 350,
  outerRadius = '70%',
  fontSize,
}: PreferenceRadarProps) {
  const { t } = useTranslation();
  const containerHeight = typeof height === 'number' ? `${height}px` : height;

  if (!data || data.length === 0) {
    return (
      <div style={{ width: '100%', height: containerHeight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-muted font-mono">{t('preferences.no_data_available')}</p>
      </div>
    );
  }

  const tickStyle = fontSize
    ? { ...chartTheme.axisLabel, fontSize }
    : chartTheme.axisLabel;

  const renderTooltip = ({
    active,
    payload,
  }: any) => {
    if (active && payload && payload.length) {
      const val = payload[0].value;
      return (
        <div
          style={{
            backgroundColor: 'var(--color-surface-card, #FFFFFF)',
            borderColor: 'var(--color-border, #E2E8F0)',
            borderRadius: 'var(--radius-md, 8px)',
            color: 'var(--color-text-primary, #0F172A)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '11px',
            fontWeight: 600,
            boxShadow: 'var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1))',
            border: '1px solid var(--color-border, #E2E8F0)',
            padding: '4px 8px',
          }}
        >
          <span style={{ color: 'var(--color-accent-teal-mid, #14788D)' }}>{t('preferences.affinity_label')}</span> {String(val)}%
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ width: '100%', height: containerHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius={outerRadius} data={data}>
          <PolarGrid stroke={chartTheme.grid} />
          <PolarAngleAxis
            dataKey="subject"
            tick={tickStyle}
          />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Tooltip content={renderTooltip} />
          <Radar
            name={t('preferences.radar_series_name')}
            dataKey="A"
            stroke={chartTheme.series[1]}
            fill={chartTheme.series[1]}
            fillOpacity={0.2}
            dot={{ r: 3, fill: chartTheme.series[1], stroke: 'var(--color-surface-card, #FFFFFF)', strokeWidth: 1.5 }}
            style={{ stroke: chartTheme.series[1], fill: chartTheme.series[1] }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
