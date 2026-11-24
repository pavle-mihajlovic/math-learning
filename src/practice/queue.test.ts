import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import type { Event, NewEvent } from '../progress/events';
import { instantiateVariant } from '../content/variant';
import { check } from '../check/check';
import type { Variant } from '../content/types';
import { answerText } from './answerText';
import { buildQueue, dueCards, nextDue, rate, variantSeed } from './queue';

const T0 = Date.UTC(2026, 0, 1);
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
let n = 0;
const ev = (e: NewEvent, t: number): Event => ({ ...e, id: `q${n++}`, t, dev: 'test' }) as Event;
const ok = { correct: true, firstTry: true, tries: 1, sawSolution: false, self: false };
const miss = { correct: false, firstTry: false, tries: 3, sawSolution: true, self: false };

describe('rating', () => {
  it('maps results to FSRS grades', () => {
    expect(rate(ok)).toBe(Rating.Good);
    expect(rate({ ...ok, firstTry: false, tries: 2 })).toBe(Rating.Hard);
    expect(rate(miss)).toBe(Rating.Again);
    expect(rate({ ...ok, sawSolution: true })).toBe(Rating.Again);
    expect(rate({ ...ok, self: true, sawSolution: true })).toBe(Rating.Good);
    expect(rate({ ...miss, self: true })).toBe(Rating.Again);
  });
});

describe('mistakes queue', () => {
  it('only main-flow misses start a card', () => {
    const q = buildQueue([
      ev({ type: 'ex', unit: 'V1.1.1', item: 'e1', ...ok }, T0),
      ev({ type: 'ex', unit: 'V1.1.1', item: 'e2', ...miss }, T0),
      ev({ type: 'ex', unit: 'V1.1.1', item: 'e3', ...ok, self: true, sawSolution: true }, T0),
    ]);
    expect([...q.keys()]).toEqual(['V1.1.1/e2']);
  });

  it('schedules a miss soon, and pushes it out after good reviews', () => {
    const events = [ev({ type: 'ex', unit: 'V1.1.1', item: 'e2', ...miss }, T0)];
    let q = buildQueue(events);
    expect(dueCards(q, T0)).toHaveLength(0);
    expect(dueCards(q, T0 + 15 * MIN)).toHaveLength(1);

    let t = T0 + 15 * MIN;
    for (let i = 0; i < 4; i++) {
      events.push(ev({ type: 'review', unit: 'V1.1.1', item: 'e2', ...ok, seed: 0, variant: true }, t));
      q = buildQueue(events);
      t = q.get('V1.1.1/e2')!.card.due.getTime();
    }
    const c = q.get('V1.1.1/e2')!;
    expect(c.reviews).toBe(4);
    expect(c.card.due.getTime() - T0).toBeGreaterThan(7 * DAY);
    expect(nextDue(q, T0 + 15 * MIN)).toBe(c.card.due.getTime());
  });

  it('a miss in review or in a redo brings it back soon', () => {
    const events = [
      ev({ type: 'ex', unit: 'V1.1.1', item: 'e2', ...miss }, T0),
      ev({ type: 'review', unit: 'V1.1.1', item: 'e2', ...ok, seed: 0, variant: true }, T0 + 20 * MIN),
      ev({ type: 'review', unit: 'V1.1.1', item: 'e2', ...ok, seed: 0, variant: true }, T0 + 2 * DAY),
    ];
    const far = buildQueue(events).get('V1.1.1/e2')!.card.due.getTime();
    const redo = buildQueue([...events, ev({ type: 'ex', unit: 'V1.1.1', item: 'e2', ...miss }, T0 + 3 * DAY)]);
    expect(redo.get('V1.1.1/e2')!.card.due.getTime()).toBeLessThan(far);
    expect(redo.get('V1.1.1/e2')!.card.due.getTime() - (T0 + 3 * DAY)).toBeLessThan(DAY);
  });

  it('is the same on every device (no fuzz)', () => {
    const events = [
      ev({ type: 'ex', unit: 'V1.1.1', item: 'e2', ...miss }, T0),
      ev({ type: 'review', unit: 'V1.1.1', item: 'e2', ...ok, seed: 0, variant: true }, T0 + 20 * MIN),
    ];
    expect(buildQueue(events).get('V1.1.1/e2')!.card.due).toEqual(buildQueue(events).get('V1.1.1/e2')!.card.due);
  });
});

describe('variants in practice', () => {
  const v: Variant = {
    params: { a: { min: 2, max: 9 }, b: { choices: [2, 3, 4] } },
    prompt: [{ type: 'p', text: 'Differentiate $f(x) = {{a}}x^{ {{b}} }$.' }],
    answer: { kind: 'expression', value: '{{a*b}} x^({{b-1}})' },
  };
  it('gives new numbers per review and computes the answer per variant', () => {
    const seen = new Set<string>();
    for (let r = 0; r < 6; r++) {
      const inst = instantiateVariant(v, variantSeed('V1.1.1/e2', r));
      const { a, b } = inst.params;
      seen.add(`${a},${b}`);
      expect(check(inst.answer, `${a * b}x^${b - 1}`).correct).toBe(true);
      expect(check(inst.answer, `${a}x^${b}`).correct).toBe(false);
      expect(answerText(inst.answer)).toContain('$');
    }
    expect(seen.size).toBeGreaterThan(1);
  });
  it('seeds are deterministic', () => {
    expect(variantSeed('V1.1.1/e2', 3)).toBe(variantSeed('V1.1.1/e2', 3));
    expect(variantSeed('V1.1.1/e2', 3)).not.toBe(variantSeed('V1.1.1/e2', 4));
  });
});
