import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Unit } from '../content/types';
import { derive, unitFraction, continueTarget } from '../progress/derive';
import type { Event } from '../progress/events';
import { isEvent } from '../progress/events';
import { buildTest, exerciseSets, pickFromUnit, usable } from './pick';
import { rng } from '../check/equiv';

const load = (id: string) => JSON.parse(readFileSync(`public/content/os-calc/${id}.json`, 'utf8')) as Unit;

describe('test out: picking problems', () => {
  const u = load('V1.1.1');

  it('groups exercises into sets by instructions', () => {
    const sets = exerciseSets(u.exercises);
    expect(sets.length).toBeGreaterThan(1);
    expect(sets.flat().length).toBe(u.exercises.length);
  });

  it('picks usable problems from the harder half of their sets, in book order', () => {
    const picks = pickFromUnit(u, 6, rng(1));
    expect(picks.length).toBe(6);
    expect(picks.every((p) => usable(p.exercise))).toBe(true);
    const sets = exerciseSets(u.exercises.filter((e) => !e.review));
    for (const p of picks) {
      const set = sets.find((s) => s.includes(p.exercise))!;
      expect(set.indexOf(p.exercise)).toBeGreaterThanOrEqual(Math.floor(set.length / 2));
    }
    const nums = picks.map((p) => p.exercise.number);
    expect([...nums].sort((a, b) => a - b)).toEqual(nums);
    // An assortment: spread over several sets.
    expect(new Set(picks.map((p) => sets.findIndex((s) => s.includes(p.exercise)))).size).toBeGreaterThanOrEqual(4);
  });

  it('is deterministic per seed and varies between seeds', () => {
    const a = buildTest([u], 'section', 7).map((p) => p.exercise.id);
    expect(buildTest([u], 'section', 7).map((p) => p.exercise.id)).toEqual(a);
    const others = [8, 9, 10, 11, 12].map((s) => buildTest([u], 'section', s).map((p) => p.exercise.id).join());
    expect(others.some((o) => o !== a.join())).toBe(true);
  });

  it('spreads a chapter test over its sections', () => {
    const units = ['V1.1.1', 'V1.1.2', 'V1.1.3'].map(load);
    const picks = buildTest(units, 'chapter', 3);
    expect(picks.length).toBe(6);
    expect(new Set(picks.map((p) => p.unit)).size).toBe(3);
  });
});

describe('test out: progress', () => {
  const base = { dev: 'd' };
  const idx = { id: 'V1.1.1', title: 'x', exercises: 10, auto: 5, reading: 4 };
  const pass: Event = { ...base, id: 'a', t: 1, type: 'testout', scope: 'section', target: 'V1.1.1', units: ['V1.1.1'], passed: true, score: 6, total: 6 };
  const fail: Event = { ...pass, id: 'b', passed: false, score: 2 };

  it('validates the event', () => {
    expect(isEvent(pass)).toBe(true);
    expect(isEvent({ ...pass, units: 'V1.1.1' })).toBe(false);
  });

  it('a pass completes the section; a fail does nothing', () => {
    expect(unitFraction(derive([fail]), idx)).toEqual({ done: 0, total: 14 });
    const d = derive([fail, pass]);
    expect(unitFraction(d, idx)).toEqual({ done: 14, total: 14 });
    expect(d.testedOut.has('V1.1.1')).toBe(true);
  });

  it('continue skips tested-out sections', () => {
    const index = { book: 'os-calc' as const, title: '', volumes: [{ volume: 1, title: '', chapters: [{ chapter: 1, title: '', units: [idx, { ...idx, id: 'V1.1.2' }] }] }] };
    expect(continueTarget('reading', derive([pass]), index, null)?.unit).toBe('V1.1.2');
  });
});
