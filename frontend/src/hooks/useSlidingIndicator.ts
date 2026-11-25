"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type React from 'react';

interface IndicatorRect {
  left: number;
  top: number;
  width: number;
  height: number;
  isReady: boolean;
  animate: boolean;
}

export interface SlidingIndicatorResult<K extends string, T extends HTMLElement = HTMLDivElement> {
  containerRef: React.RefObject<T | null>;
  registerItem: (key: K) => (el: HTMLElement | null) => void;
  indicatorStyle: React.CSSProperties;
  isReady: boolean;
  animate: boolean;
  remeasure: () => void;
}

/**
 * Measures the active tab/nav element relative to its container and produces
 * GPU-composited `translate3d` coordinates for a gliding active pill or underline.
 */
export function useSlidingIndicator<K extends string, T extends HTMLElement = HTMLDivElement>(
  activeKey: K | null | undefined,
  deps: readonly unknown[] = []
): SlidingIndicatorResult<K, T> {
  const containerRef = useRef<T | null>(null);
  const itemRefs = useRef<Partial<Record<K, HTMLElement | null>>>({});

  const [rect, setRect] = useState<IndicatorRect>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    isReady: false,
    animate: false,
  });

  const measure = useCallback(() => {
    const container = containerRef.current;
    const activeEl = activeKey ? itemRefs.current[activeKey] : null;
    if (!container || !activeEl) {
      setRect((prev) => (prev.isReady ? { ...prev, isReady: false, animate: false } : prev));
      return;
    }

    let left: number;
    let top: number;
    const width = activeEl.offsetWidth;
    const height = activeEl.offsetHeight;

    if (activeEl.offsetParent === container) {
      left = activeEl.offsetLeft;
      top = activeEl.offsetTop;
    } else {
      const containerRect = container.getBoundingClientRect();
      const elRect = activeEl.getBoundingClientRect();
      left = elRect.left - containerRect.left + container.scrollLeft;
      top = elRect.top - containerRect.top + container.scrollTop;
    }

    if (width === 0 && height === 0) return;

    setRect((prev) => {
      if (
        prev.isReady &&
        Math.abs(prev.left - left) < 0.5 &&
        Math.abs(prev.top - top) < 0.5 &&
        Math.abs(prev.width - width) < 0.5 &&
        Math.abs(prev.height - height) < 0.5
      ) {
        return prev;
      }
      return {
        left,
        top,
        width,
        height,
        isReady: true,
        animate: prev.isReady,
      };
    });
  }, [activeKey]);

  useLayoutEffect(() => {
    const raf = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...deps]);

  useEffect(() => {
    const container = containerRef.current;
    const activeEl = activeKey ? itemRefs.current[activeKey] : null;

    window.addEventListener('resize', measure);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => measure());
      if (container) observer.observe(container);
      if (activeEl) observer.observe(activeEl);
    }

    let cancelled = false;
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) measure();
      });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [measure, activeKey]);

  const registerItem = useCallback(
    (key: K) => (el: HTMLElement | null) => {
      itemRefs.current[key] = el;
    },
    []
  );

  const indicatorStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    opacity: rect.isReady ? 1 : 0,
    pointerEvents: 'none',
  };

  return {
    containerRef,
    registerItem,
    indicatorStyle,
    isReady: rect.isReady,
    animate: rect.animate,
    remeasure: measure,
  };
}
