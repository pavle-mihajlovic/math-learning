/**
 * Test out: choose an assortment of the harder exercises from one or more sections.
 *
 * OpenStax exercise sets get harder as they go: each run of exercises under the same
 * instructions ("For the following exercises, …") starts with drill and ends with the harder
 * ones, and later sets in a section (applications, word problems) are harder than early ones.
 * So an exercise's difficulty is estimated from where it sits in its set and in its section,
 * with a small bump for long prompts. Each set offers its harder half; the test takes the
 * hardest-looking candidates while spreading over as many sets (topics) as it can.
 */
import { rng } from '../check/equiv';
import type { Exercise, Unit } from '../content/types';

export interface Pick {
  unit: string;
  exercise: Exercise;
  /** Estimated difficulty, 0 (easiest) – 1 (hardest). */
  score: number;
}

/** Usable in a test: an auto-checked exercise with an answer, or a self-check one with a solution. */
export function usable(e: Exercise): boolean {
  if (e.check === 'auto') return !!e.answer;
  return !!e.solution;
}

/** Runs of consecutive exercises with the same instructions, in book order. */
export function exerciseSets(exercises: Exercise[]): Exercise[][] {
  const sets: Exercise[][] = [];
  let key: string | null = null;
  for (const e of exercises) {
    const k = JSON.stringify(e.instructions ?? null) + (e.review ? '#review' : '');
    if (k !== key || !sets.length) {
      sets.push([]);
      key = k;
    }
    sets[sets.length - 1].push(e);
  }
  return sets;
}

interface Scored extends Pick {
  set: number;
  auto: boolean;
}

/** The harder half of every set of a unit, scored. Chapter review exercises are left out unless asked for. */
export function candidates(unit: Unit, includeReview = false): Scored[][] {
  const exs = unit.exercises.filter((e) => includeReview || !e.review);
  const sets = exerciseSets(exs);
  const lengths = exs.map((e) => JSON.stringify(e.prompt).length).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)] ?? 1;
  let at = 0;
  const out: Scored[][] = [];
  sets.forEach((set, si) => {
    const scored: Scored[] = [];
    set.forEach((e, i) => {
      const inSet = set.length > 1 ? i / (set.length - 1) : 1;
      const inUnit = exs.length > 1 ? (at + i) / (exs.length - 1) : 1;
      const long = Math.min(1, JSON.stringify(e.prompt).length / (3 * median));
      const score = 0.5 * inSet + 0.35 * inUnit + 0.15 * long;
      // The harder half of the set (a one- or two-problem set offers its last problem).
      if (usable(e) && i >= Math.floor(set.length / 2)) scored.push({ unit: unit.id, exercise: e, score, set: si, auto: e.check === 'auto' });
    });
    at += set.length;
    if (scored.length) out.push(scored);
  });
  return out;
}

/**
 * Pick `n` hard exercises from one unit: one from each of the hardest-looking sets first
 * (a random one of the set's top candidates, so a retake gets different problems), then more
 * from the sets with the most left. Auto-checked exercises are preferred over self-check ones.
 */
export function pickFromUnit(unit: Unit, n: number, rand: () => number, includeReview = false): Pick[] {
  const sets = candidates(unit, includeReview).map((s) =>
    // Hardest first, auto-checked before self-check, a little shuffle among close scores.
    s
      .map((c) => ({ c, k: c.score + (c.auto ? 0.25 : 0) + rand() * 0.2 }))
      .sort((a, b) => b.k - a.k)
      .map((x) => x.c),
  );
  if (!sets.length || n <= 0) return [];
  // Sets ranked by their best candidate, then spread evenly if there are more sets than picks.
  const ranked = sets
    .map((s, i) => ({ s, i, best: s[0].score + (s[0].auto ? 0.25 : 0) }))
    .sort((a, b) => b.best - a.best);
  const chosen: Scored[] = [];
  const pools = ranked.map((r) => [...r.s]);
  while (chosen.length < n && pools.some((p) => p.length)) {
    for (const p of pools) {
      if (chosen.length >= n) break;
      const c = p.shift();
      if (c) chosen.push(c);
    }
  }
  // Back to book order, so the test reads like the section.
  const order = new Map(unit.exercises.map((e, i) => [e.id, i]));
  return chosen.sort((a, b) => order.get(a.exercise.id)! - order.get(b.exercise.id)!).map(({ unit, exercise, score }) => ({ unit, exercise, score }));
}

export type Scope = 'section' | 'chapter' | 'volume';

/** How many problems a test has. */
export function testSize(scope: Scope, sections: number): number {
  if (scope === 'section') return 6;
  if (scope === 'chapter') return Math.min(14, Math.max(6, sections * 2));
  return Math.min(30, Math.max(12, sections));
}

/**
 * Build a test over some units (in book order). The problems are shared out over the units as
 * evenly as possible, later units first when they don't divide evenly (they build on earlier ones).
 */
export function buildTest(units: Unit[], scope: Scope, seed: number): Pick[] {
  const rand = rng(seed);
  const n = testSize(scope, units.length);
  const includeReview = scope !== 'section';
  const quota = new Map<string, number>();
  const avail = new Map(units.map((u) => [u.id, candidates(u, includeReview).reduce((a, s) => a + s.length, 0)]));
  let left = n;
  // Hand out one problem at a time, round-robin from the last unit back, skipping units that ran out.
  while (left > 0) {
    let gave = false;
    for (let i = units.length - 1; i >= 0 && left > 0; i--) {
      const id = units[i].id;
      const q = quota.get(id) ?? 0;
      if (q < (avail.get(id) ?? 0)) {
        quota.set(id, q + 1);
        left--;
        gave = true;
      }
    }
    if (!gave) break;
  }
  return units.flatMap((u) => pickFromUnit(u, quota.get(u.id) ?? 0, rand, includeReview));
}

/** Random seed for a new attempt. */
export function newSeed(): number {
  return Math.floor(Math.random() * 1_000_000_007);
}
