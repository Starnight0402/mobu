/**
 * Makes moving around the app instant instead of "blank, then data".
 *
 * Convex drops a query's subscription the moment the last component using it
 * unmounts, so every tab switch used to start from nothing and wait a network
 * round trip. Three layers fix that:
 *
 * 1. Keep-alive: a screen you leave keeps its subscriptions open for a while
 *    (KEEP_ALIVE_MS), still receiving live updates, so coming back renders the
 *    current data on the very first frame.
 * 2. Snapshots: every result is also saved to localStorage. After a reload, a
 *    resume or a cold start, screens draw from the last snapshot immediately
 *    and swap to live data the moment it arrives (stale-while-revalidate).
 * 3. Session gating: on a cold start the app renders from snapshots before the
 *    server has confirmed the login (see SessionGate in App.tsx). Live queries
 *    wait for that confirmation, and so do mutations (useMutation below), so
 *    nothing is ever sent unauthenticated.
 *
 * Drop-in replacements for convex/react's useQuery / useMutation.
 */
import { useCallback, useEffect } from 'react';
import {
  useConvex,
  useConvexAuth,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
  type ConvexReactClient,
  type OptionalRestArgsOrSkip,
} from 'convex/react';
import {
  getFunctionName,
  type FunctionReference,
  type FunctionReturnType,
  type OptionalRestArgs,
} from 'convex/server';
import { convexToJson, jsonToConvex, type Value } from 'convex/values';

type AnyQuery = FunctionReference<'query'>;
type AnyMutation = FunctionReference<'mutation'>;

// ---------------------------------------------------------------------------
// Session readiness (set by SessionGate once the server confirms the login)
// ---------------------------------------------------------------------------

let sessionReady = false;
let readyWaiters: (() => void)[] = [];

export function setSessionReady(ready: boolean) {
  sessionReady = ready;
  if (ready) {
    const waiters = readyWaiters;
    readyWaiters = [];
    for (const w of waiters) w();
  }
}

function whenSessionReady(): Promise<void> {
  return sessionReady ? Promise.resolve() : new Promise((r) => readyWaiters.push(r));
}

// ---------------------------------------------------------------------------
// Snapshots: in memory, mirrored to localStorage
// ---------------------------------------------------------------------------

// Bump to throw away every device's snapshots (e.g. after a breaking change to
// what a query returns). A mismatch is also self-healing: see
// recoverFromSnapshotError.
const VERSION = 1;
const PREFIX = `mobu-qc${VERSION}:`;
const INDEX_KEY = `mobu-qc${VERSION}-index`;
const MAX_ENTRIES = 120;
// localStorage is ~5 MB per origin; one runaway query (chat after a lot of
// "Load earlier") shouldn't be able to crowd everything else out.
const MAX_ENTRY_CHARS = 1_200_000;

// Live data must never be shown stale: an incoming call from a snapshot would
// ring for a call that ended hours ago. hasUndelivered only drives a receipt
// mutation.
const NEVER_PERSIST = [/^calls:/, /^messages:hasUndelivered$/];

type MemEntry = { value: unknown; live: boolean };
const mem = new Map<string, MemEntry>();
const dirty = new Set<string>();
let index: Record<string, number> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadIndex(): Record<string, number> {
  if (index) return index;
  try {
    index = JSON.parse(storage()?.getItem(INDEX_KEY) ?? '{}') ?? {};
  } catch {
    index = {};
  }
  return index!;
}

function persistable(key: string) {
  const name = key.slice(0, key.indexOf('|'));
  return !NEVER_PERSIST.some((re) => re.test(name));
}

function cacheKey(query: AnyQuery, args: Record<string, Value>) {
  return `${getFunctionName(query)}|${JSON.stringify(convexToJson(args))}`;
}

/** The last known value for a key: live from this session, or a snapshot. */
function readSnapshot(key: string): unknown {
  const hit = mem.get(key);
  if (hit) return hit.value;
  if (!persistable(key)) return undefined;
  const raw = storage()?.getItem(PREFIX + key);
  if (raw == null) return undefined;
  try {
    const value = jsonToConvex(JSON.parse(raw));
    mem.set(key, { value, live: false });
    servedSnapshot = true;
    return value;
  } catch {
    storage()?.removeItem(PREFIX + key);
    return undefined;
  }
}

function remember(key: string, value: unknown) {
  const hit = mem.get(key);
  if (hit && hit.live && hit.value === value) return;
  mem.set(key, { value, live: true });
  if (!persistable(key)) return;
  dirty.add(key);
  if (flushTimer == null) flushTimer = setTimeout(flush, 800);
}

function evictOldest(count: number) {
  const idx = loadIndex();
  const oldest = Object.entries(idx)
    .sort((a, b) => a[1] - b[1])
    .slice(0, count);
  for (const [key] of oldest) {
    storage()?.removeItem(PREFIX + key);
    delete idx[key];
  }
}

function flush() {
  if (flushTimer != null) clearTimeout(flushTimer);
  flushTimer = null;
  const store = storage();
  if (!store || dirty.size === 0) return;
  const idx = loadIndex();
  for (const key of dirty) {
    const entry = mem.get(key);
    if (!entry) continue;
    let json: string;
    try {
      json = JSON.stringify(convexToJson(entry.value as Value));
    } catch {
      continue;
    }
    if (json.length > MAX_ENTRY_CHARS) {
      store.removeItem(PREFIX + key);
      delete idx[key];
      continue;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        store.setItem(PREFIX + key, json);
        idx[key] = Date.now();
        break;
      } catch {
        // Quota: make room by dropping the least recently written snapshots.
        evictOldest(10);
      }
    }
  }
  dirty.clear();
  const keys = Object.keys(idx);
  if (keys.length > MAX_ENTRIES) evictOldest(keys.length - MAX_ENTRIES);
  try {
    store.setItem(INDEX_KEY, JSON.stringify(idx));
  } catch {
    /* best effort */
  }
}

if (typeof window !== 'undefined') {
  // Snapshots are worth most right before the app is closed or backgrounded.
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

// ---------------------------------------------------------------------------
// Keep-alive subscriptions
// ---------------------------------------------------------------------------

const KEEP_ALIVE_MS = 20 * 60 * 1000;
const MAX_IDLE = 60;

type LiveEntry = {
  unsubscribe: () => void;
  refs: number;
  timer: ReturnType<typeof setTimeout> | null;
  idleSince: number;
};
const subscriptions = new Map<string, LiveEntry>();

function retain(client: ConvexReactClient, key: string, query: AnyQuery, args: Record<string, Value>) {
  let entry = subscriptions.get(key);
  if (!entry) {
    const watch = client.watchQuery(query, args);
    const unsubscribe = watch.onUpdate(() => {
      // Runs even while no screen is showing this query, so the snapshot
      // stays current in the background.
      try {
        const value = watch.localQueryResult();
        if (value !== undefined) remember(key, value);
      } catch {
        /* a query error: the mounted useQuery surfaces it */
      }
    });
    entry = { unsubscribe, refs: 0, timer: null, idleSince: 0 };
    subscriptions.set(key, entry);
  }
  entry.refs++;
  if (entry.timer != null) clearTimeout(entry.timer);
  entry.timer = null;
  return () => release(key);
}

function release(key: string) {
  const entry = subscriptions.get(key);
  if (!entry) return;
  entry.refs = Math.max(0, entry.refs - 1);
  if (entry.refs > 0) return;
  entry.idleSince = Date.now();
  entry.timer = setTimeout(() => drop(key), KEEP_ALIVE_MS);
  // Bound the number of idle subscriptions (chat pages, calendar months...).
  const idle = [...subscriptions.entries()].filter(([, e]) => e.refs === 0);
  if (idle.length > MAX_IDLE) {
    idle.sort((a, b) => a[1].idleSince - b[1].idleSince);
    for (const [k] of idle.slice(0, idle.length - MAX_IDLE)) drop(k);
  }
}

function drop(key: string) {
  const entry = subscriptions.get(key);
  if (!entry || entry.refs > 0) return;
  if (entry.timer != null) clearTimeout(entry.timer);
  entry.unsubscribe();
  subscriptions.delete(key);
}

/**
 * Starts loading a query in the background so its screen opens with live data
 * on the first visit too. It then stays subscribed for KEEP_ALIVE_MS.
 */
export function prefetchQuery<Query extends AnyQuery>(
  client: ConvexReactClient,
  query: Query,
  ...args: OptionalRestArgs<Query>
) {
  if (!sessionReady) return;
  const a = (args[0] ?? {}) as Record<string, Value>;
  retain(client, cacheKey(query, a), query, a)();
}

// ---------------------------------------------------------------------------
// Sign-out and recovery
// ---------------------------------------------------------------------------

let servedSnapshot = false;

/** Forget everything: on sign-out nothing from the old session may linger. */
export function clearQueryCache() {
  for (const key of [...subscriptions.keys()]) {
    const entry = subscriptions.get(key)!;
    if (entry.timer != null) clearTimeout(entry.timer);
    entry.unsubscribe();
    subscriptions.delete(key);
  }
  clearSnapshots(true);
}

function clearSnapshots(includeLive: boolean) {
  for (const [key, entry] of [...mem]) if (includeLive || !entry.live) mem.delete(key);
  dirty.clear();
  const store = storage();
  if (store) {
    for (let i = store.length - 1; i >= 0; i--) {
      const k = store.key(i);
      if (k && k.startsWith('mobu-qc')) store.removeItem(k);
    }
  }
  index = {};
  servedSnapshot = false;
}

/**
 * A screen crashed while showing saved data. The likeliest cause is a snapshot
 * from an older build in a shape the new code doesn't expect, so drop the
 * snapshots and let the caller retry once with live data only.
 * Returns whether a retry is worthwhile.
 */
export function recoverFromSnapshotError(): boolean {
  if (!servedSnapshot) return false;
  clearSnapshots(false);
  return true;
}

/**
 * True when this device was signed in last time and still holds a refresh
 * token, so it's safe to draw the app from snapshots while the login is being
 * confirmed. If the server then rejects the session, SessionGate shows the
 * sign-in screen and clears everything.
 */
export function hasCachedSession(): boolean {
  const store = storage();
  if (!store) return false;
  let hasToken = false;
  for (let i = 0; i < store.length; i++) {
    if (store.key(i)?.startsWith('__convexAuthRefreshToken_')) {
      hasToken = true;
      break;
    }
  }
  if (!hasToken) return false;
  const me = readSnapshot('users:current|{}') as { name?: string } | null | undefined;
  return !!me?.name;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------


/**
 * Same as convex/react's useQuery, but returns the last known value (kept
 * alive or saved) instead of `undefined` while the live result loads.
 */
export function useQuery<Query extends AnyQuery>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): FunctionReturnType<Query> | undefined {
  const client = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const skip = args[0] === 'skip';
  const a = (skip ? {} : (args[0] ?? {})) as Record<string, Value>;
  const key = skip ? null : cacheKey(query, a);
  const active = isAuthenticated && key != null;

  const live = useConvexQuery(query, ...((active ? [a] : ['skip']) as OptionalRestArgsOrSkip<Query>));

  useEffect(() => {
    if (!active || key == null) return;
    return retain(client, key, query, a);
    // `key` captures query + args.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, client]);

  useEffect(() => {
    if (key != null && live !== undefined) remember(key, live);
  }, [key, live]);

  // readSnapshot is a Map lookup after the first read, and returns the same
  // object every time, so effects keyed on the data don't re-run.
  if (live !== undefined) return live;
  return key == null ? undefined : (readSnapshot(key) as FunctionReturnType<Query> | undefined);
}

/**
 * Same as convex/react's useMutation, except calls made before the login is
 * confirmed (the first moments of a cold start, while the app is already drawn
 * from snapshots) wait for it rather than going out unauthenticated.
 */
export function useMutation<Mutation extends AnyMutation>(mutation: Mutation) {
  const run = useConvexMutation(mutation);
  return useCallback(
    (...args: OptionalRestArgs<Mutation>): Promise<FunctionReturnType<Mutation>> =>
      sessionReady ? run(...args) : whenSessionReady().then(() => run(...args)),
    [run],
  );
}
