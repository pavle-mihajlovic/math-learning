/**
 * Stop points for "Continue reading" and "Continue exercises". Each is cached in localStorage on
 * every move (so it survives reloads and offline use) and written to the attempt log as a `set`
 * event when you leave a unit or the app goes to the background, so it syncs between devices.
 * The most recent copy wins.
 */
import { isStop, latestStop, type Stop, type StopKind } from './derive';
import { progress } from './store.svelte';

const key = (kind: StopKind) => `rtr.stop.${kind}`;

function loadLocal(kind: StopKind): Stop | null {
  try {
    const raw = localStorage.getItem(key(kind));
    const s: unknown = raw ? JSON.parse(raw) : null;
    return isStop(s) ? s : null;
  } catch {
    return null;
  }
}

const local = $state<Record<StopKind, Stop | null>>({ reading: loadLocal('reading'), exercises: loadLocal('exercises') });
const dirty = new Set<StopKind>();

/** The current stop point of a kind (reactive): the later of this device's and the synced one. */
export function getStop(kind: StopKind): Stop | null {
  const synced = progress.d.settings[`stop.${kind}`];
  return latestStop(local[kind], isStop(synced) ? synced : null);
}

export function setStop(kind: StopKind, unit: string, item: string | null): void {
  const cur = local[kind];
  if (cur && cur.unit === unit && cur.item === item) return;
  const s: Stop = { unit, item, t: Date.now() };
  local[kind] = s;
  dirty.add(kind);
  try {
    localStorage.setItem(key(kind), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Write changed stop points to the attempt log (one event per kind, not one per card). */
export function flushStops(): void {
  for (const kind of dirty) {
    const s = local[kind];
    if (s) progress.recordSetting(`stop.${kind}`, { ...s });
  }
  dirty.clear();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushStops();
  });
  window.addEventListener('pagehide', flushStops);
}
