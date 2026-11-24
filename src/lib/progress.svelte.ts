/**
 * Progress log, kept in localStorage: per-day time / pages / problems, plus which exercises
 * are solved, which reading cards are read and which units are finished.
 * B11/B12 can move this into IndexedDB and the synced account; the shape is kept simple for that.
 */
import type { ReadingCard } from '../content/types';
import { cardPages } from './pages';

export interface DayStats {
  /** Active milliseconds inside units. */
  ms: number;
  /** Estimated book pages read. */
  pages: number;
  /** Exercises solved for the first time. */
  problems: number;
}

interface Progress {
  v: 1;
  days: Record<string, DayStats>;
  /** unitId → exercise ids solved at least once. */
  solved: Record<string, string[]>;
  /** unitId → reading card ids read at least once. */
  read: Record<string, string[]>;
  /** unitId → date the unit was first finished. */
  completed: Record<string, string>;
}

const KEY = 'rtr.progress.v1';

function empty(): Progress {
  return { v: 1, days: {}, solved: {}, read: {}, completed: {} };
}

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...empty(), ...JSON.parse(raw) };
  } catch {
    /* private mode or blocked storage */
  }
  return empty();
}

export const progress = $state<Progress>(load());

let saveTimer: ReturnType<typeof setTimeout> | null = null;
export function save(now = false): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const write = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(progress));
    } catch {
      /* ignore */
    }
  };
  if (now) write();
  else saveTimer = setTimeout(write, 1500);
}

/** Local calendar date, YYYY-MM-DD. */
export function dayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function today(): DayStats {
  const k = dayKey();
  return (progress.days[k] ??= { ms: 0, pages: 0, problems: 0 });
}

export function markSolved(unitId: string, exerciseId: string): void {
  const list = (progress.solved[unitId] ??= []);
  if (list.includes(exerciseId)) return;
  list.push(exerciseId);
  today().problems += 1;
  save();
}

export function markRead(unitId: string, card: ReadingCard): void {
  const list = (progress.read[unitId] ??= []);
  if (list.includes(card.id)) return;
  list.push(card.id);
  today().pages += cardPages(card);
  save();
}

export function markCompleted(unitId: string): void {
  if (progress.completed[unitId]) return;
  progress.completed[unitId] = dayKey();
  save();
}

export function solvedCount(unitId: string): number {
  return progress.solved[unitId]?.length ?? 0;
}

// ---------------------------------------------------------------- active time

const IDLE_MS = 3 * 60 * 1000;
let lastInput = Date.now();
let ticker: ReturnType<typeof setInterval> | null = null;
let lastTick = 0;
let sinceSave = 0;

const bump = () => (lastInput = Date.now());
const flush = () => save(true);
const onVisibility = () => {
  if (document.visibilityState === 'hidden') flush();
  else {
    bump();
    lastTick = Date.now();
  }
};

/** Count time while you're in a unit, the tab is visible and you've touched it in the last 3 minutes. */
export function startTimer(): () => void {
  if (ticker) return stopTimer;
  bump();
  lastTick = Date.now();
  ticker = setInterval(() => {
    const now = Date.now();
    // Cap the step so a suspended tab doesn't credit the whole gap.
    const step = Math.min(now - lastTick, 2000);
    lastTick = now;
    if (document.visibilityState !== 'visible' || now - lastInput > IDLE_MS) return;
    today().ms += step;
    sinceSave += step;
    if (sinceSave >= 15000) {
      sinceSave = 0;
      save(true);
    }
  }, 1000);
  for (const e of ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel']) window.addEventListener(e, bump, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flush);
  return stopTimer;
}

export function stopTimer(): void {
  if (!ticker) return;
  clearInterval(ticker);
  ticker = null;
  for (const e of ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel']) window.removeEventListener(e, bump);
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', flush);
  flush();
}

// ---------------------------------------------------------------- summaries

export function sumDays(keys: string[]): DayStats {
  const t: DayStats = { ms: 0, pages: 0, problems: 0 };
  for (const k of keys) {
    const d = progress.days[k];
    if (!d) continue;
    t.ms += d.ms;
    t.pages += d.pages;
    t.problems += d.problems;
  }
  return t;
}

/** Monday of the week containing d. */
export function weekStart(d = new Date()): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

export function weekKeys(start: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
}

export function active(d: DayStats | undefined): boolean {
  return !!d && (d.ms >= 60000 || d.pages > 0 || d.problems > 0);
}

/** Consecutive active days ending today (or yesterday, if today has nothing yet). */
export function streak(): number {
  const d = new Date();
  if (!active(progress.days[dayKey(d)])) d.setDate(d.getDate() - 1);
  let n = 0;
  while (active(progress.days[dayKey(d)])) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function fmtTime(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

export function fmtPages(p: number): string {
  return p < 10 ? p.toFixed(1).replace(/\.0$/, '') : String(Math.round(p));
}
