/**
 * Removes all custom drag preview floating cards from the document immediately.
 */
export function cleanupCustomDragPreview(): void {
  if (typeof document === 'undefined') return;
  const existing = document.querySelectorAll('[data-paladio-custom-drag-preview]');
  existing.forEach((node) => node.remove());
}

/**
 * Starts a 100% solid, fully opaque ("full macizo") floating drag preview tracking cursor movement,
 * completely suppressing the browser's hardcoded translucent ghost.
 */
export function startCustomDragPreview(
  e: DragEvent | React.DragEvent,
  poi: {
    name: string;
    category?: string;
    duration_mins?: number;
    cost_eur?: number;
  }
): HTMLElement {
  // 1. Suppress native browser drag ghost & file icons using a loaded 1x1 transparent image in DOM
  if (e.dataTransfer && typeof document !== 'undefined') {
    try {
      let blankImg = document.getElementById('paladio-blank-drag-pixel') as HTMLImageElement | null;
      if (!blankImg) {
        blankImg = document.createElement('img');
        blankImg.id = 'paladio-blank-drag-pixel';
        blankImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        blankImg.alt = '';
        blankImg.width = 1;
        blankImg.height = 1;
        blankImg.style.position = 'fixed';
        blankImg.style.left = '-9999px';
        blankImg.style.top = '-9999px';
        blankImg.style.opacity = '0.01';
        blankImg.style.pointerEvents = 'none';
        document.body.appendChild(blankImg);
      }
      e.dataTransfer.setDragImage(blankImg, 0, 0);
    } catch {
      // fallback
    }
  }

  // Remove any stale custom drag clones immediately
  cleanupCustomDragPreview();

  // 2. Create the floating solid opaque card clone
  const el = document.createElement('div');
  el.setAttribute('data-paladio-custom-drag-preview', 'true');
  el.style.position = 'fixed';
  const startX = (e.clientX || 0) - 24;
  const startY = (e.clientY || 0) - 20;
  el.style.top = `${startY}px`;
  el.style.left = `${startX}px`;
  el.style.width = '320px';
  el.style.padding = '10px 14px';
  el.style.background = '#FFFFFF';
  el.style.borderRadius = '14px';
  el.style.border = '2px solid #0F4C5C';
  el.style.boxShadow = '0 18px 40px rgba(15, 76, 92, 0.32), 0 4px 14px rgba(0, 0, 0, 0.16)';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'space-between';
  el.style.gap = '10px';
  el.style.fontFamily = 'var(--font-sans, system-ui, sans-serif)';
  el.style.zIndex = '999999';
  el.style.pointerEvents = 'none';
  el.style.opacity = '1';
  el.style.userSelect = 'none';
  el.style.transition = 'none';

  const name = poi.name || 'Scheduled Place';
  const cat = poi.category || 'Waypoint';
  const dur = poi.duration_mins ? `${poi.duration_mins}m` : '60m';

  el.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
      <div style="width: 24px; height: 24px; border-radius: 6px; background: rgba(15, 76, 92, 0.14); color: #0F4C5C; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; font-family: monospace;">
        +
      </div>
      <div style="min-width: 0;">
        <div style="font-size: 13px; font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 175px;">
          ${name}
        </div>
        <div style="font-size: 11px; color: #64748b; text-transform: capitalize;">
          ${cat} · ${dur}
        </div>
      </div>
    </div>
    <div style="font-size: 10px; font-weight: 700; font-family: monospace; color: #0F4C5C; background: rgba(15, 76, 92, 0.1); padding: 3px 8px; border-radius: 9999px; white-space: nowrap;">
      ROUTE STOP
    </div>
  `;

  document.body.appendChild(el);

  // 3. Track cursor coordinates smoothly on drag / dragover
  const handleDragUpdate = (ev: DragEvent | MouseEvent) => {
    if (ev.clientX !== 0 || ev.clientY !== 0) {
      el.style.top = `${ev.clientY - 20}px`;
      el.style.left = `${ev.clientX - 24}px`;
    }
  };

  const removeListeners = () => {
    document.removeEventListener('drag', handleDragUpdate, true);
    document.removeEventListener('dragover', handleDragUpdate, true);
    document.removeEventListener('dragend', cleanup, true);
    document.removeEventListener('mouseup', cleanup, true);
    document.removeEventListener('pointerup', cleanup, true);
    document.removeEventListener('touchend', cleanup, true);
    document.removeEventListener('drop', cleanup, false);

    window.removeEventListener('dragend', cleanup, true);
    window.removeEventListener('mouseup', cleanup, true);
    window.removeEventListener('pointerup', cleanup, true);
    window.removeEventListener('touchend', cleanup, true);
    window.removeEventListener('drop', cleanup, false);
  };

  const cleanup = () => {
    removeListeners();
    cleanupCustomDragPreview();
    if (el.parentElement) {
      el.remove();
    }
    // Defer clearing active POI slightly to allow onDrop handlers in the DOM to consume the payload
    window.setTimeout(() => {
      if (typeof window !== 'undefined') {
        (window as unknown as { __paladioActivePoi?: unknown }).__paladioActivePoi = null;
        (window as unknown as { __paladioActiveSearchPoi?: unknown }).__paladioActiveSearchPoi = null;
        window.dispatchEvent(new CustomEvent('paladio:drag-ended'));
      }
    }, 50);
  };

  document.addEventListener('drag', handleDragUpdate, true);
  document.addEventListener('dragover', handleDragUpdate, true);
  document.addEventListener('dragend', cleanup, true);
  document.addEventListener('mouseup', cleanup, true);
  document.addEventListener('pointerup', cleanup, true);
  document.addEventListener('touchend', cleanup, true);
  document.addEventListener('drop', cleanup, false);

  window.addEventListener('dragend', cleanup, true);
  window.addEventListener('mouseup', cleanup, true);
  window.addEventListener('pointerup', cleanup, true);
  window.addEventListener('touchend', cleanup, true);
  window.addEventListener('drop', cleanup, false);

  return el;
}

export function markPaladioDropHandled(): void {
  if (typeof window !== 'undefined') {
    const win = window as unknown as { __paladioDropHandled?: boolean; __paladioLastDropTimestamp?: number };
    win.__paladioDropHandled = true;
    win.__paladioLastDropTimestamp = Date.now();
  }
}

export function resetPaladioDropHandled(): void {
  if (typeof window !== 'undefined') {
    const win = window as unknown as { __paladioDropHandled?: boolean; __paladioLastDropTimestamp?: number };
    win.__paladioDropHandled = false;
    win.__paladioLastDropTimestamp = 0;
  }
}

export function isPaladioDropHandled(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as { __paladioDropHandled?: boolean; __paladioLastDropTimestamp?: number };
  return Boolean(win.__paladioDropHandled || (Date.now() - (win.__paladioLastDropTimestamp || 0) < 600));
}
