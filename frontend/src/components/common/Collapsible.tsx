"use client";

import React from 'react';
import { useAnimatedMount } from '@/hooks/useAnimatedMount';

interface CollapsibleProps {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  style?: React.CSSProperties;
  id?: string;
}

/**
 * Smoothly expands and collapses content using CSS Grid `0fr -> 1fr`
 * without animating layout height/width, unmounting settled-closed content
 * and preserving exit animation via `useAnimatedMount` + `@starting-style`.
 */
export function Collapsible({
  isOpen,
  children,
  className,
  contentClassName,
  style,
  id,
}: CollapsibleProps) {
  const { shouldRender } = useAnimatedMount(isOpen, 220);

  if (!shouldRender) {
    return null;
  }

  return (
    <div
      id={id}
      className={className ? `paladio-collapsible ${className}` : 'paladio-collapsible'}
      data-open={isOpen ? 'true' : 'false'}
      style={style}
    >
      <div
        className={
          contentClassName
            ? `paladio-collapsible-inner ${contentClassName}`
            : 'paladio-collapsible-inner'
        }
        aria-hidden={!isOpen}
        inert={!isOpen ? true : undefined}
      >
        {children}
      </div>
    </div>
  );
}
