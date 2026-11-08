/**
 * Android Health Connect, through the native MobuHealthConnect plugin
 * (android/.../MobuHealthConnectPlugin.kt). In a browser, or in an APK built
 * before the plugin existed, everything reports "unavailable" and the rest of
 * Health keeps working with manual entries.
 *
 * Reads: steps, distance, calories, heart rate (daily average), resting HR,
 * HRV, SpO2, breathing rate, body temperature, blood pressure, blood glucose,
 * weight, height, body fat, VO2 max, sleep (with stages), workouts, water, and
 * cycle data (period, flow, basal temperature, ovulation tests, mucus,
 * intimacy). Writes back: BP, glucose, weight, temperature, SpO2, height and
 * body fat you type into Mobu, so other apps see them too.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export type HcStatus = 'available' | 'update' | 'unavailable' | 'no-plugin';

export interface HcVital {
  hcId: string;
  type: string;
  time: number;
  value: number;
  value2?: number;
  context?: string;
  source: string;
  extra?: { durationMin?: number; stages?: { stage: string; min: number }[]; exerciseType?: string; title?: string; distanceKm?: number; kcal?: number; endTime?: number };
}
export interface HcCycleDay {
  date: string;
  flow?: 'none' | 'spotting' | 'light' | 'medium' | 'heavy';
  bbt?: number;
  ovulationTest?: 'positive' | 'high' | 'negative' | 'inconclusive';
  mucus?: 'dry' | 'sticky' | 'creamy' | 'watery' | 'eggwhite';
  intimacy?: 'protected' | 'unprotected';
}
export interface HcWrite {
  type: 'bp' | 'glucose' | 'weight' | 'temp' | 'spo2' | 'height' | 'bodyFat';
  time: number;
  value: number;
  value2?: number;
  context?: string;
}

interface Plugin {
  availability(): Promise<{ status: 'available' | 'update' | 'unavailable' }>;
  granted(opts: { cycle: boolean; write: boolean }): Promise<{ read: number; total: number; write: number; history: boolean }>;
  askPermissions(opts: { cycle: boolean; write: boolean }): Promise<{ read: number; total: number; write: number; history: boolean }>;
  openSettings(): Promise<void>;
  read(opts: { since: number; until: number; cycle: boolean }): Promise<{ vitals: HcVital[]; cycle: HcCycleDay[] }>;
  write(opts: { records: HcWrite[] }): Promise<{ written: number }>;
}

const plugin = registerPlugin<Plugin>('MobuHealthConnect');
const native = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export async function hcStatus(): Promise<HcStatus> {
  if (!native()) return 'unavailable';
  try {
    return (await plugin.availability()).status;
  } catch {
    return 'no-plugin';
  }
}

export const hcGranted = (cycle: boolean, write: boolean) => plugin.granted({ cycle, write });
export const hcRequest = (cycle: boolean, write: boolean) => plugin.askPermissions({ cycle, write });
export const hcOpenSettings = () => plugin.openSettings();

const LAST_KEY = 'mobu-hc-last-sync';
export const lastSync = (): number => {
  try {
    return Number(localStorage.getItem(LAST_KEY)) || 0;
  } catch {
    return 0;
  }
};
const setLastSync = (t: number) => {
  try {
    localStorage.setItem(LAST_KEY, String(t));
  } catch {
    /* private mode */
  }
};

const DAY = 86_400_000;
const CHUNK = 300;

export interface SyncDeps {
  importBatch: (args: { vitals: HcVital[]; cycle?: HcCycleDay[]; done?: boolean }) => Promise<{ added: number; updated: number }>;
  manualSince: (since: number) => Promise<HcWrite[]>;
  cycle: boolean;
  write: boolean;
}

/** First sync reads the last 60 days (or everything Health Connect allows); later syncs re-read a 3-day overlap. */
export async function syncHealthConnect(deps: SyncDeps, onProgress?: (msg: string) => void): Promise<{ added: number; updated: number; written: number }> {
  const now = Date.now();
  const last = lastSync();
  const since = last ? last - 3 * DAY : now - 60 * DAY;
  onProgress?.('Reading Health Connect…');
  const { vitals, cycle } = await plugin.read({ since, until: now, cycle: deps.cycle });

  let added = 0;
  let updated = 0;
  const total = Math.ceil(Math.max(vitals.length, cycle.length) / CHUNK) || 1;
  for (let i = 0; i < total; i++) {
    onProgress?.(`Saving ${Math.min((i + 1) * CHUNK, vitals.length)} of ${vitals.length} readings…`);
    const r = await deps.importBatch({
      vitals: vitals.slice(i * CHUNK, (i + 1) * CHUNK),
      cycle: deps.cycle ? cycle.slice(i * CHUNK, (i + 1) * CHUNK) : undefined,
      done: i === total - 1,
    });
    added += r.added;
    updated += r.updated;
  }

  let written = 0;
  if (deps.write) {
    // Only readings typed into Mobu since the last write; Health Connect would store duplicates otherwise.
    const wroteKey = 'mobu-hc-last-write';
    let from = 0;
    try {
      from = Number(localStorage.getItem(wroteKey)) || now - 30 * DAY;
    } catch {
      from = now - 30 * DAY;
    }
    const records = await deps.manualSince(from);
    if (records.length) written = (await plugin.write({ records })).written;
    try {
      localStorage.setItem(wroteKey, String(now));
    } catch {
      /* private mode */
    }
  }
  setLastSync(now);
  return { added, updated, written };
}
