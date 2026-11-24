/**
 * B12: account and sync, client side. See worker/api.ts for the server.
 *
 * Sync is push-then-pull on the append-only attempt log: upload events the server hasn't
 * acknowledged, then download everything after our cursor. Events are deduplicated by id,
 * so syncing twice, or from many devices, can't conflict.
 */
import { applySyncedSettings } from '../lib/settings.svelte';
import { progress } from '../progress/store.svelte';

const CURSOR = 'sync.cursor';
const PUSH_BATCH = 500;
const DEBOUNCE_MS = 4000;
const PERIOD_MS = 5 * 60_000;

const SIGNED_IN = 'rtr.signedIn';

function remembered(): boolean | null {
  try {
    return localStorage.getItem(SIGNED_IN) === '1' ? true : null;
  } catch {
    return null;
  }
}

export const account = $state({
  /** Last known sign-in state (remembered, so it reads right offline); null before the first answer. */
  signedIn: remembered() as boolean | null,
  /** The server answered (false offline, in `npm run dev`, or before B12 is deployed). */
  available: false,
  syncing: false,
  lastSync: 0,
  error: '',
});

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, data?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'You’re offline.');
  }
  const type = res.headers.get('Content-Type') ?? '';
  if (!type.includes('application/json')) throw new ApiError(res.status || 503, 'This server has no sync API (it needs the B12 Worker).');
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Error ${res.status}`);
  return body;
}

interface SyncResponse {
  accepted: string[];
  events: unknown[];
  cursor: number;
  more: boolean;
}

function setSignedIn(v: boolean): void {
  account.signedIn = v;
  try {
    localStorage.setItem(SIGNED_IN, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

let running: Promise<void> | null = null;
let again = false;

/** Push and pull until both sides are up to date. Safe to call often. */
export function syncNow(): Promise<void> {
  if (!account.signedIn) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    account.syncing = true;
    try {
      do {
        again = false;
        for (let round = 0; round < 1000; round++) {
          const push = await progress.db.unsynced(PUSH_BATCH);
          const since = (await progress.db.getMeta<number>(CURSOR)) ?? 0;
          const r = await api<SyncResponse>('sync', { push, since });
          await progress.db.markSynced(r.accepted);
          if (r.events.length) {
            await progress.merge(r.events, true);
            applySyncedSettings();
          }
          await progress.db.setMeta(CURSOR, r.cursor);
          if (!r.more && push.length < PUSH_BATCH) break;
        }
      } while (again);
      account.lastSync = Date.now();
      account.error = '';
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setSignedIn(false);
      account.error = e instanceof Error ? e.message : String(e);
    } finally {
      account.syncing = false;
      running = null;
    }
  })();
  return running;
}

let timer: ReturnType<typeof setTimeout> | undefined;
function soon(): void {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), DEBOUNCE_MS);
}

/** Bumped by sign-in and sign-out, so an older /api/me answer can't undo them. */
let authGen = 0;

export async function refreshAccount(): Promise<void> {
  const gen = authGen;
  try {
    const me = await api<{ signedIn: boolean }>('me');
    account.available = true;
    if (gen === authGen) setSignedIn(me.signedIn);
    account.error = '';
  } catch (e) {
    // Offline: keep what we knew. Anything else (no /api on this server, no database yet): unavailable.
    if (!(e instanceof ApiError && e.status === 0)) {
      account.available = false;
      account.error = e instanceof Error ? e.message : String(e);
    }
    if (account.signedIn === null) account.signedIn = false;
  }
}

let started = false;
export function startSync(): void {
  if (started) return;
  started = true;
  progress.onWrite(soon);
  void refreshAccount().then(() => syncNow());
  addEventListener('online', () => void refreshAccount().then(() => syncNow()));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
    else if (account.signedIn) {
      // Leaving the app: send what's pending right away.
      clearTimeout(timer);
      void syncNow();
    }
  });
  setInterval(() => void syncNow(), PERIOD_MS);
}

// ---------- account actions ----------

export async function requestCode(email: string): Promise<void> {
  await api('auth/request', { email });
}

export async function verifyCode(email: string, code: string): Promise<void> {
  await api('auth/verify', { email, code });
  authGen++;
  setSignedIn(true);
  account.available = true;
  await syncNow();
}

export async function redeemPairing(code: string): Promise<void> {
  await api('pair/redeem', { code });
  authGen++;
  setSignedIn(true);
  account.available = true;
  await syncNow();
}

export async function createPairing(): Promise<{ code: string; expires: number }> {
  return api('pair/create', {});
}

export async function signOut(everywhere = false): Promise<void> {
  await syncNow().catch(() => {});
  await api(everywhere ? 'auth/logout-all' : 'auth/logout', {});
  authGen++;
  setSignedIn(false);
  // Next sign-in downloads everything again; local events stay and are re-sent (deduplicated by id).
  await progress.db.setMeta(CURSOR, 0);
}
