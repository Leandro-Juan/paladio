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
  media_blobs: Record<string, { mime_type: string; b64: string }>;
}

let cachedSnapshot: DemoSnapshotRaw | null = null;
let cachedSnapshotPromise: Promise<DemoSnapshotRaw> | null = null;

function resolveKeyBuffer(): Buffer {
  let keyHex = (process.env.DEMO_DATA_KEY || '').trim();
  if (!keyHex && process.env.NODE_ENV !== 'production') {
    const devEnvPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(/*turbopackIgnore: true*/ devEnvPath)) {
      const content = fs.readFileSync(/*turbopackIgnore: true*/ devEnvPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        if (line.startsWith('DEMO_DATA_KEY=')) {
          keyHex = line.slice('DEMO_DATA_KEY='.length).trim().replace(/^["']|["']$/g, '');
          break;
        }
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

  const localEncPath = path.join(process.cwd(), 'src', 'server', 'demo-snapshot.enc');
  if (fs.existsSync(localEncPath)) {
    return fs.readFileSync(localEncPath, 'utf8').trim();
  }
  throw new Error('Encrypted demo snapshot unavailable: set DEMO_SNAPSHOT_URL or provide src/server/demo-snapshot.enc.');
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
  if (cachedSnapshot) {
    return cachedSnapshot;
  }
  if (!cachedSnapshotPromise) {
    cachedSnapshotPromise = (async () => {
      const key = resolveKeyBuffer();
      const b64 = await loadEncryptedBase64();
      const parsed = decryptAndInflate(b64, key);
      cachedSnapshot = parsed;
      return parsed;
    })();
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
