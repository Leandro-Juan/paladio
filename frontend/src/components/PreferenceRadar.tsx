"use client";
import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { chartTheme } from '@/utils/chartTheme';

interface PreferenceRadarProps {
  data: { subject: string; A: number; fullMark: number }[];
}

export default function PreferenceRadar({ data }: PreferenceRadarProps) {
  if (!data || data.length === 0) {
    return (
      <div style={{ width: '100%', height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-muted font-mono">No data available</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '350px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke={chartTheme.grid} />
          <PolarAngleAxis
            dataKey="subject"
            tick={chartTheme.axisLabel}
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
