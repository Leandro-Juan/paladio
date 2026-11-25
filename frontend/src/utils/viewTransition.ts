/**
 * Wraps DOM/state visual transitions in the View Transitions API when supported
 * and when the user has not requested reduced motion.
 */
export function withViewTransition(update: () => void): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    update();
    return;
  }

  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };

  if (prefersReduced || typeof doc.startViewTransition !== 'function') {
    update();
    return;
  }

  try {
    const transition = doc.startViewTransition(() => {
      update();
    });
    transition?.finished?.catch(() => {
      // Ignore skipped/aborted transitions during rapid toggles.
    });
  } catch {
    update();
  }
}
