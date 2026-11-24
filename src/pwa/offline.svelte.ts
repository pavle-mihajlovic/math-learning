/**
 * B10: service worker registration, app updates, and chapter-by-chapter offline downloads.
 *
 * The service worker (src/pwa/sw.js) serves the app shell from its precache and unit JSON / figures
 * from the `rtr-content` cache. This module fills `rtr-content`: opening a unit downloads its chapter
 * and the next one in the background, and Settings can download everything.
 */
import type { Block, BookIndex, Unit } from '../content/types';
import { loadIndex } from '../content/load';

const CONTENT = 'rtr-content';
const DONE_KEY = 'rtr.offline.chapters.v1';

export const pwa = $state({
  /** A new version is installed and waiting; reload to use it. */
  updateReady: false,
  /** Chapter keys ("V1.2") fully stored for offline use. */
  chapters: readDone(),
  /** Chapter key being downloaded right now, or ''. */
  busy: '',
  /** Progress of a "download everything" run, 0..1, or -1 when idle. */
  allProgress: -1,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
});

function readDone(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function markDone(key: string): void {
  if (!pwa.chapters.includes(key)) pwa.chapters = [...pwa.chapters, key];
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify(pwa.chapters));
  } catch {
    /* ignore */
  }
}

export const isStandalone = (): boolean =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export const isIos = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let waiting: ServiceWorker | null = null;

export function registerServiceWorker(): void {
  addEventListener('online', () => (pwa.online = true));
  addEventListener('offline', () => (pwa.online = false));
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      const watch = (w: ServiceWorker | null) => {
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = w;
            pwa.updateReady = true;
          }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) {
        waiting = reg.waiting;
        pwa.updateReady = true;
      }
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      // Look for a new deploy when the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  // Ask the browser not to evict the offline content under storage pressure.
  navigator.storage?.persist?.().catch(() => false);
  // Keep the table of contents available offline.
  if (typeof caches !== 'undefined') store(['/content/os-calc/index.json'], true).catch(() => {});
}

/** Activate the waiting service worker; the page reloads on `controllerchange`. */
export function applyUpdate(): void {
  if (waiting) waiting.postMessage('skip-waiting');
  else location.reload();
}

/** Put URLs into the content cache. Already-cached ones are skipped unless `refresh`. */
async function store(urls: string[], refresh = false): Promise<void> {
  const cache = await caches.open(CONTENT);
  const queue = [...urls];
  const worker = async () => {
    for (let u = queue.shift(); u; u = queue.shift()) {
      if (!refresh && (await cache.match(u))) continue;
      const res = await fetch(u, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`${u}: ${res.status}`);
      await cache.put(u, res);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

/** Figure URLs used anywhere in a unit. */
export function figureUrls(unit: Unit): string[] {
  const out = new Set<string>();
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') {
      const b = x as Block;
      if (b.type === 'figure' && typeof b.src === 'string') out.add(b.src.startsWith('/') ? b.src : `/${b.src}`);
      Object.values(x).forEach(walk);
    }
  };
  walk(unit);
  return [...out];
}

export function chapterKey(unitId: string): string {
  return unitId.split('.').slice(0, 2).join('.');
}

function chapterUnits(index: BookIndex, key: string): string[] {
  for (const v of index.volumes)
    for (const c of v.chapters) if (`V${v.volume}.${c.chapter}` === key) return c.units.map((u) => u.id);
  return [];
}

export function chapterKeys(index: BookIndex): string[] {
  return index.volumes.flatMap((v) => v.chapters.map((c) => `V${v.volume}.${c.chapter}`));
}

/** Download every unit of a chapter and all of their figures. */
export async function downloadChapter(key: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  const index = await loadIndex();
  const ids = chapterUnits(index, key);
  if (!ids.length) return;
  pwa.busy = key;
  try {
    const urls = ids.map((id) => `/content/os-calc/${id}.json`);
    await store(urls);
    const cache = await caches.open(CONTENT);
    const figs: string[] = [];
    for (const u of urls) {
      const res = await cache.match(u);
      if (res) figs.push(...figureUrls((await res.json()) as Unit));
    }
    await store(figs);
    markDone(key);
  } finally {
    pwa.busy = '';
  }
}

/** Called when a unit opens: keep this chapter and the next one ready for offline use. */
export async function prefetchAround(unitId: string): Promise<void> {
  if (typeof caches === 'undefined' || !navigator.onLine || import.meta.env.DEV) return;
  const keys = chapterKeys(await loadIndex());
  const i = keys.indexOf(chapterKey(unitId));
  for (const k of keys.slice(Math.max(0, i), i + 2)) {
    if (pwa.chapters.includes(k)) continue;
    try {
      await downloadChapter(k);
    } catch {
      return; // offline or flaky: try again next time
    }
  }
}

export async function downloadAll(): Promise<void> {
  const keys = chapterKeys(await loadIndex());
  pwa.allProgress = 0;
  try {
    for (let i = 0; i < keys.length; i++) {
      if (!pwa.chapters.includes(keys[i])) await downloadChapter(keys[i]);
      pwa.allProgress = (i + 1) / keys.length;
    }
  } finally {
    pwa.allProgress = -1;
  }
}

export async function clearDownloads(): Promise<void> {
  if (typeof caches !== 'undefined') await caches.delete(CONTENT);
  pwa.chapters = [];
  try {
    localStorage.removeItem(DONE_KEY);
  } catch {
    /* ignore */
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  const e = await navigator.storage?.estimate?.();
  return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
}
