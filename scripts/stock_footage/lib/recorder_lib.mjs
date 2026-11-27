import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(
  process.env.PALADIO_REPO_ROOT || path.join(LIB_DIR, '..', '..', '..'),
);

const require = createRequire(path.join(REPO_ROOT, 'frontend', 'package.json'));
export const { chromium } = require('playwright');

export const BASE_URL = process.env.PALADIO_BASE_URL || 'http://localhost:3000';
export const API_URL = process.env.PALADIO_API_URL || 'http://localhost:8000';
export const RECORD_USER = process.env.PALADIO_RECORD_USER || 'admin';
export const RECORD_PASSWORD = process.env.PALADIO_RECORD_PASSWORD || 'PaladioRecord2026!';
export const WORK_DIR = path.resolve(
  process.env.STOCK_WORK_DIR || path.join(REPO_ROOT, '.local', 'stock-footage', '.work'),
);
export const SCRATCH = WORK_DIR;
export const AUTH_STATE_PATH = path.resolve(
  process.env.PALADIO_AUTH_STATE || path.join(WORK_DIR, 'auth_state.json'),
);

function ensureWorkDirs() {
  fs.mkdirSync(path.join(WORK_DIR, 'raw'), { recursive: true });
  fs.mkdirSync(path.join(WORK_DIR, 'qa'), { recursive: true });
  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
}

export const CURSOR_INIT_SCRIPT = () => {
  if (typeof window === 'undefined') return;
  const setupCursor = () => {
    if (document.getElementById('paladio-stock-cursor-root')) return;
    const style = document.createElement('style');
    style.id = 'paladio-stock-cursor-style';
    style.textContent = `
      #paladio-stock-cursor-root {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 2147483647;
        overflow: hidden;
      }
      #paladio-stock-cursor-pointer {
        position: fixed;
        top: -2px;
        left: -2px;
        width: 24px;
        height: 24px;
        pointer-events: none;
        transform: translate3d(-100px, -100px, 0) scale(1);
        transform-origin: 4px 3px;
        transition: transform 0.06s linear, opacity 0.15s ease;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.28));
        will-change: transform;
      }
      #paladio-stock-cursor-pointer.pressed {
        transform: translate3d(var(--cx, -100px), var(--cy, -100px), 0) scale(0.86);
      }
      .paladio-stock-ripple {
        position: fixed;
        width: 28px;
        height: 28px;
        margin-left: -14px;
        margin-top: -14px;
        border-radius: 50%;
        border: 2px solid rgba(15, 76, 92, 0.55);
        background: rgba(15, 76, 92, 0.14);
        pointer-events: none;
        animation: paladioStockRipple 0.36s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }
      @keyframes paladioStockRipple {
        0% { transform: scale(0.35); opacity: 0.9; }
        100% { transform: scale(1.65); opacity: 0; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);

    const root = document.createElement('div');
    root.id = 'paladio-stock-cursor-root';

    const pointer = document.createElement('div');
    pointer.id = 'paladio-stock-cursor-pointer';
    pointer.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.5 2.5L19.5 11.8L12.6 13.7L9.6 20.5L4.5 2.5Z" fill="#0F2933" stroke="#FFFFFF" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>`;
    root.appendChild(pointer);
    (document.body || document.documentElement).appendChild(root);

    let lastX = -100;
    let lastY = -100;
    const updatePos = (x, y, pressed = false) => {
      lastX = x;
      lastY = y;
      pointer.style.setProperty('--cx', `${x}px`);
      pointer.style.setProperty('--cy', `${y}px`);
      pointer.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${pressed ? 0.86 : 1})`;
    };

    window.addEventListener('mousemove', (e) => updatePos(e.clientX, e.clientY, pointer.classList.contains('pressed')), { capture: true, passive: true });
    window.addEventListener('pointermove', (e) => updatePos(e.clientX, e.clientY, pointer.classList.contains('pressed')), { capture: true, passive: true });
    window.addEventListener('mousedown', (e) => {
      pointer.classList.add('pressed');
      updatePos(e.clientX, e.clientY, true);
      const ripple = document.createElement('div');
      ripple.className = 'paladio-stock-ripple';
      ripple.style.left = `${e.clientX}px`;
      ripple.style.top = `${e.clientY}px`;
      root.appendChild(ripple);
      setTimeout(() => ripple.remove(), 400);
    }, { capture: true, passive: true });
    window.addEventListener('mouseup', (e) => {
      pointer.classList.remove('pressed');
      updatePos(e.clientX ?? lastX, e.clientY ?? lastY, false);
    }, { capture: true, passive: true });
  };

  const attachObserver = () => {
    if (!document.documentElement) {
      setTimeout(attachObserver, 50);
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupCursor, { once: true });
    } else {
      setupCursor();
    }
    const observer = new MutationObserver(() => {
      if (document.body && !document.getElementById('paladio-stock-cursor-root')) {
        setupCursor();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: false });
  };
  attachObserver();
};

function hasHardwareRenderNode() {
  if (process.platform !== 'linux') return false;
  try {
    const driDir = '/dev/dri';
    if (!fs.existsSync(driDir)) return false;
    const nodes = fs.readdirSync(driDir).filter((n) => n.startsWith('renderD'));
    return nodes.some((node) => {
      try {
        fs.accessSync(path.join(driDir, node), fs.constants.R_OK | fs.constants.W_OK);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function resolveChromiumLaunchConfig() {
  const requested = (process.env.PALADIO_RECORDER_GL || 'auto').toLowerCase();
  const useHardware =
    requested === 'gl' ||
    requested === 'hardware' ||
    (requested === 'auto' && hasHardwareRenderNode());

  if (useHardware) {
    return {
      backend: 'hardware (angle/gl)',
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--use-gl=angle',
        '--use-angle=gl',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--disable-gpu-shader-disk-cache',
      ],
    };
  }
  return {
    backend: 'software (swiftshader)',
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--enable-webgl',
    ],
  };
}

export async function createRecorderContext({ name, useAuthState = true, extraInitScript = null } = {}) {
  ensureWorkDirs();
  const { backend, args } = resolveChromiumLaunchConfig();
  console.log(`[${name || 'chapter'}] Chromium GL backend: ${backend}`);
  const browser = await chromium.launch({
    headless: true,
    args,
  });

  const contextOpts = {
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: path.join(WORK_DIR, 'raw'),
      size: { width: 1920, height: 1080 },
    },
    acceptDownloads: true,
    reducedMotion: 'no-preference',
  };
  if (useAuthState && fs.existsSync(AUTH_STATE_PATH)) {
    contextOpts.storageState = AUTH_STATE_PATH;
  }

  const context = await browser.newContext(contextOpts);
  await context.addInitScript(CURSOR_INIT_SCRIPT);
  if (extraInitScript) {
    await context.addInitScript(extraInitScript);
  }

  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.setViewportSize({ width: 1920, height: 1080 }).catch(() => {});
  await page.mouse.move(960, 540).catch(() => {});
  await page.waitForTimeout(350);
  const startEpoch = Date.now();
  const logs = [];

  page.on('pageerror', (err) => logs.push(`[PAGEERROR] ${err.message}`));
  page.on('crash', () => logs.push('[PAGE_CRASH] Renderer process crashed'));
  page.on('console', (msg) => {
    if (msg.type() === 'error') logs.push(`[CONSOLE_ERROR] ${msg.text()}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 500) {
      logs.push(`[HTTP_${res.status()}] ${res.request().method()} ${res.url()}`);
    }
  });

  const cursorState = { x: 960, y: 540, trimSec: 0, slug: name || 'chapter', startEpoch };

  const markContentStart = () => {
    cursorState.trimSec = Math.max(0.5, Number(((Date.now() - startEpoch) / 1000 + 0.5).toFixed(2)));
    console.log(`[${cursorState.slug}] 0.0s — markContentStart (trim=${cursorState.trimSec}s)`);
    return cursorState.trimSec;
  };

  return { browser, context, page, logs, cursorState, markContentStart };
}

export function stepLog(cursorStateOrSlug, msg) {
  const slug = typeof cursorStateOrSlug === 'string' ? cursorStateOrSlug : (cursorStateOrSlug?.slug || 'chapter');
  const start = typeof cursorStateOrSlug === 'object' && cursorStateOrSlug?.startEpoch ? cursorStateOrSlug.startEpoch : null;
  const elapsed = start ? ((Date.now() - start) / 1000).toFixed(1) : '?';
  console.log(`[${slug}] ${elapsed}s — ${msg}`);
}

export async function resetWorkspaceHorizontalScroll(page) {
  await page.evaluate(() => {
    window.scrollTo(0, window.scrollY || 0);
    if (document.documentElement) document.documentElement.scrollLeft = 0;
    if (document.body) document.body.scrollLeft = 0;
    const all = document.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
      if (all[i].scrollLeft !== 0) {
        all[i].scrollLeft = 0;
      }
    }
  }).catch(() => {});
}

export async function humanMove(page, cursorState, targetX, targetY, steps = 10) {
  const startX = cursorState.x;
  const startY = cursorState.y;
  const dx = targetX - startX;
  const dy = targetY - startY;
  const dist = Math.hypot(dx, dy);
  const effectiveSteps = Math.max(5, Math.min(steps, Math.round(dist / 90) + 5));
  const arcOffset = Math.min(28, dist * 0.05) * (dx >= 0 ? -1 : 1);

  for (let i = 1; i <= effectiveSteps; i++) {
    const t = i / effectiveSteps;
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const arc = Math.sin(Math.PI * t) * arcOffset;
    const x = startX + dx * ease;
    const y = startY + dy * ease + arc;
    await page.mouse.move(x, y);
    await page.waitForTimeout(8);
  }
  cursorState.x = targetX;
  cursorState.y = targetY;
}

export async function getCenter(locator, { scroll = true } = {}) {
  await locator.waitFor({ state: 'visible', timeout: 12000 });
  if (scroll) {
    await locator.scrollIntoViewIfNeeded().catch(() => {});
  }
  const box = await locator.boundingBox();
  if (!box) throw new Error('Locator has no bounding box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

export async function humanHover(page, cursorState, locator, { pauseMs = 350, scroll = true } = {}) {
  const { x, y, box } = await getCenter(locator, { scroll });
  await humanMove(page, cursorState, x, y);
  if (pauseMs > 0) await page.waitForTimeout(pauseMs);
  return { x, y, box };
}

export async function humanClick(page, cursorState, locator, { pauseBefore = 150, pauseAfter = 600, scroll = true } = {}) {
  const { x, y, box } = await getCenter(locator, { scroll });
  await humanMove(page, cursorState, x, y);
  if (pauseBefore > 0) await page.waitForTimeout(pauseBefore);
  await page.mouse.down();
  await page.waitForTimeout(75);
  await page.mouse.up();
  if (!scroll) {
    await resetWorkspaceHorizontalScroll(page);
  }
  if (pauseAfter > 0) await page.waitForTimeout(pauseAfter);
  return { x, y, box };
}

export async function safeHumanClick(page, cursorState, locator, opts = {}) {
  try {
    const shouldScroll = opts.scroll !== false;
    const { x, y, box } = await getCenter(locator, { scroll: shouldScroll });
    let clickX = x;
    let clickY = y;
    if (!shouldScroll && box) {
      const vp = page.viewportSize() || { width: 1920, height: 1080 };
      const minX = Math.max(2, Math.ceil(box.x) + 1);
      const maxX = Math.min(vp.width - 2, Math.floor(box.x + box.width) - 1);
      const minY = Math.max(2, Math.ceil(box.y) + 1);
      const maxY = Math.min(vp.height - 2, Math.floor(box.y + box.height) - 1);
      if (minX <= maxX) clickX = Math.max(minX, Math.min(clickX, maxX));
      if (minY <= maxY) clickY = Math.max(minY, Math.min(clickY, maxY));
    }
    await humanMove(page, cursorState, clickX, clickY);
    if (opts.pauseBefore ?? 150) await page.waitForTimeout(opts.pauseBefore ?? 150);
    if (opts.useLocatorClick) {
      await locator.click({ timeout: 8000, force: Boolean(opts.force) });
    } else {
      await page.mouse.down();
      await page.waitForTimeout(75);
      await page.mouse.up();
      if (!shouldScroll) {
        await resetWorkspaceHorizontalScroll(page);
      }
    }
    if (opts.pauseAfter ?? 600) await page.waitForTimeout(opts.pauseAfter ?? 600);
    return true;
  } catch {
    return false;
  }
}

export async function humanType(page, cursorState, locator, text, { delay = 38, clear = true, pressEnter = false, pauseAfter = 450 } = {}) {
  const clicked = await safeHumanClick(page, cursorState, locator, { pauseAfter: 180 });
  if (!clicked) {
    return false;
  }
  const hasEditableFocus = async () =>
    page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable === true;
    }).catch(() => false);

  if (!(await hasEditableFocus())) {
    await locator.focus().catch(() => {});
    if (!(await hasEditableFocus())) {
      return false;
    }
  }
  if (clear) {
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
  }
  if (text) {
    await page.keyboard.type(text, { delay });
  }
  if (pressEnter) {
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
  }
  if (pauseAfter > 0) await page.waitForTimeout(pauseAfter);
  return true;
}

export async function humanScroll(page, cursorState, locatorOrNull, totalDeltaY, steps = 8) {
  if (locatorOrNull) {
    const { x, y } = await getCenter(locatorOrNull, { scroll: false });
    await humanMove(page, cursorState, x, y);
  }
  const perStep = totalDeltaY / steps;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, perStep);
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(280);
}

export async function humanDragSlider(page, cursorState, rangeLocator, targetValue, steps = 10, opts = {}) {
  const changeOnEndOnly = Boolean(opts.changeOnEndOnly);
  const info = await rangeLocator.evaluate((el) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = el.getBoundingClientRect();
    return {
      min: Number(el.min || 0),
      max: Number(el.max || 100),
      step: Number(el.step || 1),
      val: Number(el.value || 0),
      x: rect.left,
      y: rect.top + rect.height / 2,
      w: rect.width,
    };
  });

  const clamp = (v) => Math.min(info.max, Math.max(info.min, v));
  const startVal = clamp(info.val);
  const endVal = clamp(targetValue);
  const span = info.max - info.min || 1;
  const startX = info.x + ((startVal - info.min) / span) * info.w;

  await humanMove(page, cursorState, startX, info.y);
  await page.waitForTimeout(100);

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const raw = startVal + (endVal - startVal) * ease;
    const stepped = info.min + Math.round((raw - info.min) / info.step) * info.step;
    const curVal = clamp(stepped);
    const cx = info.x + ((curVal - info.min) / span) * info.w;
    await page.mouse.move(cx, info.y);
    cursorState.x = cx;
    cursorState.y = info.y;
    const dispatchChange = !changeOnEndOnly || i === steps;
    await rangeLocator.evaluate((el, { v, emitChange }) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (emitChange) {
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, { v: curVal, emitChange: dispatchChange });
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(400);
}

export async function waitForAppReady(page, { waitForMap = false } = {}) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForFunction(() => {
    const txt = document.body?.innerText || '';
    const loader = document.querySelector('[class*="PaladioLoader"], [data-testid="paladio-loader"]');
    return txt.trim().length > 0 && !loader;
  }, { timeout: 15000 }).catch(() => {});

  if (waitForMap) {
    await page.locator('.leaflet-container').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.maplibregl-canvas');
      const tiles = document.querySelectorAll('.leaflet-tile-loaded');
      return (canvas && canvas.width > 0 && canvas.height > 0) || tiles.length > 0;
    }, { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1400);
  } else {
    await page.waitForTimeout(700);
  }
}

export async function finalizeChapter({ page, context, browser, logs, chapterSlug, cursorState }) {
  ensureWorkDirs();
  await page.waitForTimeout(900);
  const video = page.video();
  const trimSec = cursorState?.trimSec || 0;
  await page.close();
  const videoPath = video ? await video.path() : null;
  await context.close();
  await browser.close();

  const logPath = path.join(WORK_DIR, 'qa', `${chapterSlug}.log`);
  fs.writeFileSync(logPath, logs.join('\n') + (logs.length ? '\n' : ''));
  const metaPath = path.join(WORK_DIR, 'qa', `${chapterSlug}.json`);
  fs.writeFileSync(metaPath, JSON.stringify({ chapterSlug, trimSec, videoPath, errorCount: logs.length }, null, 2));
  console.log(JSON.stringify({ chapterSlug, trimSec, videoPath, errorCount: logs.length }));
  return { videoPath, trimSec, logPath };
}
