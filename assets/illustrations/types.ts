import React from 'react';

export interface IllustrationProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export type IllustrationCategory =
  | 'Culture & Sights'
  | 'Transit & Waypoints'
  | 'Navigation'
  | 'Hospitality & Leisure'
  | 'Tactical & Protocol';

export interface IllustrationMetadata {
  id: string;
  title: string;
  category: IllustrationCategory;
  tags: string[];
  description: string;
  recommendedUse: string;
  Component: React.ComponentType<IllustrationProps>;
}
