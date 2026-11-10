"use client";

import React from 'react';

export interface TooltipProps {
  content: string;
  shortcut?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  disabled?: boolean;
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
}

/**
 * Declarative Tooltip wrapper component adhering to Paladio Japanese Minimalist Tactical design.
 * Attaches data attributes intercepted seamlessly by PaladioTooltipProvider.
 */
export function Tooltip({
  content,
  shortcut,
  position = 'top',
  disabled = false,
  children,
}: TooltipProps) {
  if (disabled || !content) {
    return children;
  }

  return React.cloneElement(children, {
    'data-tooltip': content,
    'data-tooltip-position': position,
    'data-tooltip-shortcut': shortcut,
    'aria-label': children.props['aria-label'] || content,
  } as React.HTMLAttributes<HTMLElement>);
}

export { PaladioTooltipProvider } from './PaladioTooltipProvider';
