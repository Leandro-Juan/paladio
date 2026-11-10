"use client";

import React, { useEffect, useState, useRef, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

interface TooltipState {
  target: HTMLElement | null;
  text: string;
  shortcut: string | null;
  position: 'top' | 'bottom' | 'left' | 'right';
  x: number;
  y: number;
  tx: string;
  ty: string;
  status: 'idle' | 'entering' | 'visible' | 'exiting';
}

const INITIAL_STATE: TooltipState = {
  target: null,
  text: '',
  shortcut: null,
  position: 'top',
  x: 0,
  y: 0,
  tx: '-50%',
  ty: '-100%',
  status: 'idle',
};

// Global timestamp to support instant transition between sibling tooltips
let lastTooltipDismissTime = 0;

export function PaladioTooltipProvider() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [tooltip, setTooltip] = useState<TooltipState>(INITIAL_STATE);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTargetRef = useRef<HTMLElement | null>(null);

  const calculatePosition = useCallback(
    (target: HTMLElement, posPreference?: 'top' | 'bottom' | 'left' | 'right') => {
      const rect = target.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;

      // Determine best placement
      let placement = posPreference;
      if (!placement) {
        if (rect.top < 65) {
          placement = 'bottom';
        } else {
          placement = 'top';
        }
      }

      // Check collision & auto-flip
      if (placement === 'top' && rect.top - 38 < 0) {
        placement = 'bottom';
      } else if (placement === 'bottom' && rect.bottom + 38 > viewportH) {
        placement = 'top';
      } else if (placement === 'left' && rect.left - 120 < 0) {
        placement = 'right';
      } else if (placement === 'right' && rect.right + 120 > viewportW) {
        placement = 'left';
      }

      let x = 0;
      let y = 0;
      let tx = '0';
      let ty = '0';

      const gap = 7;

      switch (placement) {
        case 'bottom':
          x = rect.left + rect.width / 2;
          y = rect.bottom + gap;
          tx = '-50%';
          ty = '0';
          break;
        case 'left':
          x = rect.left - gap;
          y = rect.top + rect.height / 2;
          tx = '-100%';
          ty = '-50%';
          break;
        case 'right':
          x = rect.right + gap;
          y = rect.top + rect.height / 2;
          tx = '0';
          ty = '-50%';
          break;
        case 'top':
        default:
          x = rect.left + rect.width / 2;
          y = rect.top - gap;
          tx = '-50%';
          ty = '-100%';
          break;
      }

      // Horizontal boundary clamp to avoid clipping at viewport edges
      if (placement === 'top' || placement === 'bottom') {
        const minX = 60;
        const maxX = viewportW - 60;
        x = Math.max(minX, Math.min(x, maxX));
      }

      return { x, y, tx, ty, placement };
    },
    []
  );

  const hideTooltip = useCallback((immediate = false) => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }

    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }

    currentTargetRef.current = null;

    if (immediate) {
      lastTooltipDismissTime = Date.now();
      setTooltip(INITIAL_STATE);
      return;
    }

    setTooltip((prev) => {
      if (prev.status === 'idle') return prev;
      return { ...prev, status: 'exiting' };
    });

    exitTimerRef.current = setTimeout(() => {
      lastTooltipDismissTime = Date.now();
      setTooltip(INITIAL_STATE);
      exitTimerRef.current = null;
    }, 100);
  }, []);

  const showTooltip = useCallback(
    (target: HTMLElement) => {
      // Ignore touch / coarse pointer devices per UI Architecture Bible Section 44
      if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
        return;
      }

      // Read raw tooltip or title
      let rawText = target.getAttribute('data-tooltip') || '';

      // Intercept standard browser title attribute if present
      if (!rawText && target.hasAttribute('title') && target.tagName.toLowerCase() !== 'title') {
        const titleVal = target.getAttribute('title')?.trim();
        if (titleVal) {
          rawText = titleVal;
          target.setAttribute('data-tooltip', rawText);
          if (!target.hasAttribute('aria-label') && !target.hasAttribute('aria-labelledby')) {
            target.setAttribute('aria-label', rawText);
          }
          target.removeAttribute('title');
        }
      }

      if (!rawText.trim()) return;

      // Extract shortcut if present
      let text = rawText.trim();
      let shortcut = target.getAttribute('data-tooltip-shortcut') || null;

      if (!shortcut) {
        const shortcutMatch = text.match(/\s*(\[|\()([A-Za-z0-9\s⌘⌥⇧⌃+–-]+)(\]|\))$/);
        if (shortcutMatch) {
          text = text.replace(shortcutMatch[0], '').trim();
          shortcut = shortcutMatch[2].trim();
        }
      }

      const explicitPos = target.getAttribute('data-tooltip-position') as 'top' | 'bottom' | 'left' | 'right' | null;
      const { x, y, tx, ty, placement } = calculatePosition(target, explicitPos || undefined);

      currentTargetRef.current = target;

      // Determine open delay: 0ms if sibling hovered within 300ms, otherwise 400ms
      const now = Date.now();
      const isSiblingHover = now - lastTooltipDismissTime < 300;
      const openDelay = isSiblingHover ? 0 : 400;

      if (openTimerRef.current) {
        clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }

      const activate = () => {
        if (currentTargetRef.current !== target) return;
        setTooltip({
          target,
          text,
          shortcut,
          position: placement,
          x,
          y,
          tx,
          ty,
          status: 'entering',
        });
      };

      if (openDelay === 0) {
        activate();
      } else {
        openTimerRef.current = setTimeout(activate, openDelay);
      }
    },
    [calculatePosition]
  );

  useEffect(() => {
    if (!mounted) return;

    const handlePointerOver = (e: PointerEvent) => {
      // Disregard touch pointers
      if (e.pointerType === 'touch') return;

      const target = (e.target as HTMLElement | null)?.closest?.('[data-tooltip], [title]') as HTMLElement | null;
      if (!target || target.tagName.toLowerCase() === 'title') {
        return;
      }

      // Convert title attribute immediately to prevent native browser tooltip
      if (target.hasAttribute('title')) {
        const titleVal = target.getAttribute('title')?.trim();
        if (titleVal) {
          target.setAttribute('data-tooltip', titleVal);
          if (!target.hasAttribute('aria-label') && !target.hasAttribute('aria-labelledby')) {
            target.setAttribute('aria-label', titleVal);
          }
          target.removeAttribute('title');
        }
      }

      if (currentTargetRef.current === target) return;
      showTooltip(target);
    };

    const handlePointerOut = (e: PointerEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.('[data-tooltip]') as HTMLElement | null;
      if (!target) return;

      // Check if moving to an element within the same target
      const related = e.relatedTarget as Node | null;
      if (related && target.contains(related)) {
        return;
      }

      if (currentTargetRef.current === target) {
        hideTooltip(false);
      }
    };

    const handlePointerDown = () => {
      hideTooltip(true);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideTooltip(true);
      }
    };

    const handleScrollOrResize = () => {
      if (currentTargetRef.current) {
        hideTooltip(true);
      }
    };

    document.addEventListener('pointerover', handlePointerOver, { capture: true, passive: true });
    document.addEventListener('pointerout', handlePointerOut, { capture: true, passive: true });
    document.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
    window.addEventListener('keydown', handleKeyDown, { passive: true });
    window.addEventListener('scroll', handleScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });

    return () => {
      document.removeEventListener('pointerover', handlePointerOver, { capture: true });
      document.removeEventListener('pointerout', handlePointerOut, { capture: true });
      document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [mounted, showTooltip, hideTooltip]);

  if (!mounted || tooltip.status === 'idle') {
    return null;
  }

  const animClass = tooltip.status === 'entering' || tooltip.status === 'visible' ? styles.entering : styles.exiting;

  return createPortal(
    <div className={styles.tooltipPortal}>
      <div
        ref={tooltipRef}
        role="tooltip"
        id="paladio-global-tooltip"
        className={`${styles.tooltip} ${animClass}`}
        style={
          {
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            '--tx': tooltip.tx,
            '--ty': tooltip.ty,
          } as React.CSSProperties
        }
      >
        <span className={styles.label}>{tooltip.text}</span>
        {tooltip.shortcut && <kbd className={styles.kbd}>{tooltip.shortcut}</kbd>}
      </div>
    </div>,
    document.body
  );
}
