/**
 * B11: everything the app shows about progress, computed from the attempt log.
 * Pure functions, so they are easy to test and identical on every device.
 */
import type { BookIndex } from '../content/types';
import type { Step } from '../cards/types';
import type { Event } from './events';
import { itemKey } from './events';

type IndexUnit = BookIndex['volumes'][number]['chapters'][number]['units'][number];

export interface DayStats {
  solved: number;
  attempted: number;
  ms: number;
  /** Estimated book pages read (first read of each card only). */
  pages: number;
}

export interface Derived {
  /** Reading cards finished, per unit. */
  read: Map<string, Set<string>>;
  /** Exercises finished in the main flow (right or wrong), per unit. */
  done: Map<string, Set<string>>;
  /** Exercises solved correctly at least once in the main flow, per unit. */
  correct: Map<string, Set<string>>;
  /** Result of the very first main-flow attempt at each exercise (`V1.2.3/e59` → right on the first try?). */
  first: Map<string, boolean>;
  /** All-time count of exercises finished correctly, main flow and practice, redos included. */
  solved: number;
  /** Total active study time in ms. */
  ms: number;
  /** Per local calendar day (YYYY-MM-DD). */
  days: Map<string, DayStats>;
  /** Latest value of each synced setting. */
  settings: Record<string, unknown>;
}

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function add<K>(m: Map<K, Set<string>>, k: K, v: string) {
  let s = m.get(k);
  if (!s) m.set(k, (s = new Set()));
  s.add(v);
}

/** Events must be sorted by time (the store keeps them that way). */
export function derive(events: readonly Event[]): Derived {
  const d: Derived = { read: new Map(), done: new Map(), correct: new Map(), first: new Map(), solved: 0, ms: 0, days: new Map(), settings: {} };
  const settingAt: Record<string, number> = {};
  const day = (t: number) => {
    const k = dayKey(t);
    let s = d.days.get(k);
    if (!s) d.days.set(k, (s = { solved: 0, attempted: 0, ms: 0, pages: 0 }));
    return s;
  };
  for (const e of events) {
    switch (e.type) {
      case 'read': {
        const seen = d.read.get(e.unit)?.has(e.item);
        add(d.read, e.unit, e.item);
        if (!seen && e.pages) day(e.t).pages += e.pages;
        break;
      }
      case 'ex':
      case 'review': {
        if (e.type === 'ex') {
          add(d.done, e.unit, e.item);
          const k = itemKey(e.unit, e.item);
          if (!d.first.has(k)) d.first.set(k, e.correct && e.firstTry);
          if (e.correct) add(d.correct, e.unit, e.item);
        }
        const s = day(e.t);
        s.attempted++;
        if (e.correct) {
          d.solved++;
          s.solved++;
        }
        break;
      }
      case 'time':
        d.ms += e.ms;
        day(e.t).ms += e.ms;
        break;
      case 'set':
        if ((settingAt[e.key] ?? -Infinity) <= e.t) {
          settingAt[e.key] = e.t;
          d.settings[e.key] = e.value;
        }
        break;
    }
  }
  return d;
}

export interface Fraction {
  done: number;
  total: number;
}

export const pct = (f: Fraction): number => (f.total ? f.done / f.total : 0);

/**
 * Progress through a unit: reading cards plus exercises (proof cards are optional and don't count).
 * Counts are capped at the index totals in case a content update renamed cards.
 */
export function unitFraction(d: Derived, u: IndexUnit): Fraction {
  const r = Math.min(d.read.get(u.id)?.size ?? 0, u.reading);
  const x = Math.min(d.done.get(u.id)?.size ?? 0, u.exercises);
  return { done: r + x, total: u.reading + u.exercises };
}

export const unitComplete = (d: Derived, u: IndexUnit): boolean => {
  const f = unitFraction(d, u);
  return f.done >= f.total;
};

function sum(fs: Fraction[]): Fraction {
  return fs.reduce((a, f) => ({ done: a.done + f.done, total: a.total + f.total }), { done: 0, total: 0 });
}

export function chapterFraction(d: Derived, c: { units: IndexUnit[] }): Fraction {
  return sum(c.units.map((u) => unitFraction(d, u)));
}

export function volumeFraction(d: Derived, v: BookIndex['volumes'][number]): Fraction {
  return sum(v.chapters.map((c) => chapterFraction(d, c)));
}

export function courseFraction(d: Derived, index: BookIndex): Fraction {
  return sum(index.volumes.map((v) => volumeFraction(d, v)));
}

/** Strict book order: the first unit that isn't complete, or null when the whole course is done. */
export function nextUnitId(d: Derived, index: BookIndex): string | null {
  for (const v of index.volumes)
    for (const c of v.chapters) for (const u of c.units) if (!unitComplete(d, u)) return u.id;
  return null;
}

/**
 * The first step of a unit you haven't done: an unread reading card or an unfinished exercise.
 * Returns the "complete" step when everything is done, or -1 when the unit has no steps.
 */
export function firstUndoneStep(steps: Step[], read: Set<string> | undefined, done: Set<string> | undefined): number {
  const i = steps.findIndex(
    (s) => (s.kind === 'reading' && !read?.has(s.card.id)) || (s.kind === 'exercise' && !done?.has(s.ex.id)),
  );
  return i >= 0 ? i : steps.findIndex((s) => s.kind === 'complete');
}
