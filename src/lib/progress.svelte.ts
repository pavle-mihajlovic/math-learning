/**
 * Day/week summaries for the home screen and activity map, read from the B11 attempt log
 * (`src/progress/`). Also imports the older localStorage log (`rtr.progress.v1`) once.
 */
import type { Event } from '../progress/events';
import { randomId } from '../progress/events';
import { dayKey as dayKeyAt } from '../progress/derive';
import { progress } from '../progress/store.svelte';

export interface DayStats {
  /** Active milliseconds. */
  ms: number;
  /** Estimated book pages read. */
  pages: number;
  /** Exercises solved (main flow and Practice mistakes). */
  problems: number;
}

/** Local calendar date, YYYY-MM-DD. */
export function dayKey(d = new Date()): string {
  return dayKeyAt(d.getTime());
}

export function dayStats(key: string): DayStats | undefined {
  const s = progress.d.days.get(key);
  return s && { ms: s.ms, pages: s.pages, problems: s.solved };
}

/** Exercises of a unit solved correctly at least once. */
export function solvedIn(unitId: string): number {
  return progress.d.correct.get(unitId)?.size ?? 0;
}

export function sumDays(keys: Iterable<string>): DayStats {
  const t: DayStats = { ms: 0, pages: 0, problems: 0 };
  for (const k of keys) {
    const d = dayStats(k);
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
  if (!active(dayStats(dayKey(d)))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (active(dayStats(dayKey(d)))) {
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

// ---------------------------------------------------------------- one-time import

const LEGACY_KEY = 'rtr.progress.v1';

interface Legacy {
  days?: Record<string, { ms?: number; pages?: number; problems?: number }>;
  solved?: Record<string, string[]>;
  read?: Record<string, string[]>;
  completed?: Record<string, string>;
}

/**
 * Turn the pre-B11 localStorage log into attempt-log events. Time and pages keep their days;
 * solved exercises and read cards are dated to the day the unit was finished, or else the
 * last active day, since the old log didn't record when each one happened.
 */
export function legacyEvents(old: Legacy, dev: string): Event[] {
  const noon = (k: string) => new Date(k + 'T12:00:00').getTime();
  const days = Object.keys(old.days ?? {}).filter((k) => /^\d{4}-\d\d-\d\d$/.test(k)).sort();
  const fallback = days.length ? noon(days[days.length - 1]) : Date.now();
  const when = (unit: string) => {
    const c = old.completed?.[unit];
    return c && /^\d{4}-\d\d-\d\d$/.test(c) ? noon(c) : fallback;
  };
  const out: Event[] = [];
  const base = (t: number) => ({ id: randomId(), t, dev });
  for (const k of days) {
    const d = old.days![k];
    if (d.ms && d.ms >= 1000 && d.ms < 24 * 3600e3) out.push({ ...base(noon(k)), type: 'time', ms: Math.round(d.ms) });
  }
  // The old log kept pages per day, not per card: each day's pages ride on one read event dated
  // that day, and the remaining cards carry no pages.
  const reads: [string, string][] = [];
  for (const [unit, ids] of Object.entries(old.read ?? {})) for (const id of ids) reads.push([unit, id]);
  const pageDays = days.filter((k) => (old.days![k].pages ?? 0) > 0);
  reads.forEach(([unit, item], i) => {
    const pd = pageDays[i];
    const pages = pd ? old.days![pd].pages : undefined;
    out.push({ ...base(pd ? noon(pd) : when(unit)), type: 'read', unit, item, ...(pages ? { pages } : {}) });
  });
  for (const [unit, ids] of Object.entries(old.solved ?? {}))
    for (const item of ids)
      out.push({ ...base(when(unit)), type: 'ex', unit, item, correct: true, firstTry: true, tries: 1, sawSolution: false, self: false });
  return out;
}

/** Run once after `progress.init()`. Safe to call again: the old log is removed after import. */
export async function importLegacyProgress(): Promise<number> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return 0;
  }
  if (!raw) return 0;
  let n = 0;
  try {
    n = await progress.merge(legacyEvents(JSON.parse(raw) as Legacy, progress.device), false);
  } catch {
    return 0;
  }
  try {
    localStorage.setItem(LEGACY_KEY + '.imported', raw);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
  return n;
}
