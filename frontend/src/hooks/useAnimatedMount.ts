"use client";

import { useEffect, useRef, useState } from 'react';

export type AnimatedMountState = 'open' | 'closing';

export interface AnimatedMountResult {
  /** Whether the element should currently be rendered in the DOM. */
  shouldRender: boolean;
  /** Whether the element is currently playing its exit transition. */
  isClosing: boolean;
  /** Attribute value for `data-state` CSS animation selectors. */
  dataState: AnimatedMountState;
}

/**
 * Keeps a conditionally visible overlay mounted briefly while its exit animation plays,
 * respecting `prefers-reduced-motion` and guaranteeing cleanup via timeout.
 */
export function useAnimatedMount(isOpen: boolean, exitDurationMs = 150): AnimatedMountResult {
  const [prevOpen, setPrevOpen] = useState(isOpen);
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      setIsRendered(true);
      setIsClosing(false);
    } else if (isRendered) {
      setIsClosing(true);
    }
  }

  useEffect(() => {
    if (!isClosing) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const delay =
      exitDurationMs <= 0 ? 0 : prefersReduced ? Math.min(exitDurationMs, 80) : exitDurationMs;

    const timer = window.setTimeout(() => {
      setIsClosing(false);
      setIsRendered(false);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [isClosing, exitDurationMs]);

  return {
    shouldRender: isRendered,
    isClosing,
    dataState: isClosing ? 'closing' : 'open',
  };
}

/**
 * Handles Escape key dismissal and restores focus to the trigger element when an overlay closes.
 */
export function useEscapeAndFocusReturn(
  isOpen: boolean,
  onClose: () => void,
  restoreFocus = true
): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    if (restoreFocus && document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (
        restoreFocus &&
        previousFocusRef.current &&
        previousFocusRef.current.isConnected
      ) {
        previousFocusRef.current.focus({ preventScroll: true });
      }
      previousFocusRef.current = null;
    };
  }, [isOpen, restoreFocus]);
}
