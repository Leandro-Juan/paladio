import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export interface DemoSnapshotRaw {
  version: number;
  demo_user: Record<string, unknown>;
  demo_embedding: number[];
  trips: Array<Record<string, unknown>>;
  pois_by_city: Record<string, Array<Record<string, unknown>>>;
  gtfs_by_city: Record<string, Record<string, unknown>>;
  market: {
    summary: Record<string, unknown>;
    routes: Array<Record<string, unknown>>;
    deals: Array<Record<string, unknown>>;
    by_route: Record<string, Record<string, unknown>>;
  };
  dashboard_recommended_pois?: Record<string, Array<Record<string, unknown>>>;
  media_blobs: Record<string, { mime_type: string; b64: string }>;
}

let cachedSnapshot: DemoSnapshotRaw | null = null;
let cachedSnapshotPromise: Promise<DemoSnapshotRaw> | null = null;
let cachedEncMtimeMs: number | null = null;

function resolveEncFileMtimeMs(): number | null {
  if (process.env.NODE_ENV === 'production' || (process.env.DEMO_SNAPSHOT_URL || '').trim()) {
    return null;
  }
  const mainWorktreeFrontend = resolveMainWorktreeFrontendDir();
  const candidates = [
    path.join(process.cwd(), 'src', 'server', 'demo-snapshot.enc'),
    mainWorktreeFrontend ? path.join(mainWorktreeFrontend, 'src', 'server', 'demo-snapshot.enc') : null,
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) {
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ p)) {
        return fs.statSync(/*turbopackIgnore: true*/ p).mtimeMs;
      }
    } catch {
      // Ignore stat errors
    }
  }
  return null;
}

function resolveMainWorktreeFrontendDir(): string | null {
  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  const gitMarker = path.resolve(process.cwd(), '..', '.git');
  try {
    if (fs.existsSync(/*turbopackIgnore: true*/ gitMarker) && fs.statSync(/*turbopackIgnore: true*/ gitMarker).isFile()) {
      const content = fs.readFileSync(/*turbopackIgnore: true*/ gitMarker, 'utf8').trim();
      const match = /^gitdir:\s*(.+)$/m.exec(content);
      if (match) {
        const gitDir = path.resolve(path.dirname(gitMarker), match[1].trim());
        const normalized = gitDir.replace(/\\/g, '/');
        const worktreesIdx = normalized.indexOf('/.git/worktrees/');
        if (worktreesIdx !== -1) {
          const mainRepoRoot = gitDir.slice(0, worktreesIdx);
          const candidate = path.join(mainRepoRoot, 'frontend');
          if (fs.existsSync(/*turbopackIgnore: true*/ candidate)) {
            return candidate;
          }
        }
      }
    }
  } catch {
    // Ignore filesystem errors when probing git worktree parent
  }

  const siblingFallback = path.resolve(process.cwd(), '..', '..', 'Paladio', 'frontend');
  if (fs.existsSync(/*turbopackIgnore: true*/ siblingFallback)) {
    return siblingFallback;
  }
  return null;
}

function resolveKeyBuffer(): Buffer {
  let keyHex = (process.env.DEMO_DATA_KEY || '').trim();
  if (!keyHex && process.env.NODE_ENV !== 'production') {
    const mainWorktreeFrontend = resolveMainWorktreeFrontendDir();
    const envCandidates = [
      path.join(process.cwd(), '.env.local'),
      mainWorktreeFrontend ? path.join(mainWorktreeFrontend, '.env.local') : null,
    ].filter((p): p is string => Boolean(p));

    for (const devEnvPath of envCandidates) {
      if (fs.existsSync(/*turbopackIgnore: true*/ devEnvPath)) {
        const content = fs.readFileSync(/*turbopackIgnore: true*/ devEnvPath, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          if (line.startsWith('DEMO_DATA_KEY=')) {
            keyHex = line.slice('DEMO_DATA_KEY='.length).trim().replace(/^["']|["']$/g, '');
            break;
          }
        }
        if (keyHex) break;
      }
    }
  }
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('DEMO_DATA_KEY must be a 64-character hex AES-256 key.');
  }
  return Buffer.from(keyHex, 'hex');
}

async function loadEncryptedBase64(): Promise<string> {
  const remoteUrl = (process.env.DEMO_SNAPSHOT_URL || '').trim();
  if (remoteUrl) {
    const headers: Record<string, string> = {};
    const blobToken = (process.env.DEMO_SNAPSHOT_AUTH_TOKEN || '').trim();
    if (blobToken) {
      headers['Authorization'] = `Bearer ${blobToken}`;
    }
    const res = await fetch(remoteUrl, { cache: 'no-store', headers });
    if (!res.ok) {
      throw new Error(`Failed to load DEMO_SNAPSHOT_URL (${res.status})`);
    }
    return (await res.text()).trim();
  }

  const mainWorktreeFrontend = resolveMainWorktreeFrontendDir();
  const encCandidates = [
    path.join(process.cwd(), 'src', 'server', 'demo-snapshot.enc'),
    mainWorktreeFrontend ? path.join(mainWorktreeFrontend, 'src', 'server', 'demo-snapshot.enc') : null,
  ].filter((p): p is string => Boolean(p));

  for (const localEncPath of encCandidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ localEncPath)) {
      return fs.readFileSync(/*turbopackIgnore: true*/ localEncPath, 'utf8').trim();
    }
  }
  throw new Error('Encrypted demo snapshot unavailable: set DEMO_SNAPSHOT_URL or provide src/server/demo-snapshot.enc.');
}

function loadRawSnapshotFallback(): DemoSnapshotRaw | null {
  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  const mainWorktreeFrontend = resolveMainWorktreeFrontendDir();
  const rawCandidates = [
    path.join(process.cwd(), 'src', 'server', 'demo-snapshot.raw.json'),
    mainWorktreeFrontend ? path.join(mainWorktreeFrontend, 'src', 'server', 'demo-snapshot.raw.json') : null,
  ].filter((p): p is string => Boolean(p));

  for (const rawPath of rawCandidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ rawPath)) {
      const content = fs.readFileSync(/*turbopackIgnore: true*/ rawPath, 'utf8');
      return JSON.parse(content) as DemoSnapshotRaw;
    }
  }
  return null;
}

function decryptAndInflate(b64Payload: string, key: Buffer): DemoSnapshotRaw {
  const packed = Buffer.from(b64Payload, 'base64');
  if (packed.length < 29) {
    throw new Error('Encrypted demo snapshot payload is malformed.');
  }
  const nonce = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  const gzBuffer = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const jsonBuffer = zlib.gunzipSync(gzBuffer);
  return JSON.parse(jsonBuffer.toString('utf8')) as DemoSnapshotRaw;
}

export async function getDemoSnapshotBaseline(): Promise<DemoSnapshotRaw> {
  const currentMtime = resolveEncFileMtimeMs();
  if (cachedSnapshot && currentMtime !== null && cachedEncMtimeMs !== null && currentMtime !== cachedEncMtimeMs) {
    cachedSnapshot = null;
    cachedSnapshotPromise = null;
  }
  if (cachedSnapshot) {
    return cachedSnapshot;
  }
  if (!cachedSnapshotPromise) {
    cachedSnapshotPromise = (async () => {
      try {
        const key = resolveKeyBuffer();
        const b64 = await loadEncryptedBase64();
        const parsed = decryptAndInflate(b64, key);
        cachedSnapshot = parsed;
        cachedEncMtimeMs = resolveEncFileMtimeMs();
        return parsed;
      } catch (err) {
        const rawFallback = loadRawSnapshotFallback();
        if (rawFallback) {
          cachedSnapshot = rawFallback;
          cachedEncMtimeMs = resolveEncFileMtimeMs();
          return rawFallback;
        }
        throw err;
      }
    })().catch((err) => {
      cachedSnapshotPromise = null;
      throw err;
    });
  }
  return cachedSnapshotPromise;
}

export function addDaysIso(baseDate: Date, offsetDays: number): string {
  const dt = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate() + offsetDays));
  return dt.toISOString().slice(0, 10);
}

export function addHoursIso(baseDate: Date, offsetHours: number): string {
  return new Date(baseDate.getTime() + offsetHours * 3600_000).toISOString();
}
