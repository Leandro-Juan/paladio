"use client";
import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { chartTheme } from '@/utils/chartTheme';

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
  const containerHeight = typeof height === 'number' ? `${height}px` : height;

  if (!data || data.length === 0) {
    return (
      <div style={{ width: '100%', height: containerHeight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-muted font-mono">No data available</p>
      </div>
    );
  }

  const tickStyle = fontSize
    ? { ...chartTheme.axisLabel, fontSize }
    : chartTheme.axisLabel;

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
          <Radar
            name="Preference"
            dataKey="A"
            stroke={chartTheme.series[1]}
            fill={chartTheme.series[1]}
            fillOpacity={0.2}
            style={{ stroke: chartTheme.series[1], fill: chartTheme.series[1] }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
