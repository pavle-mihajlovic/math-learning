import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { BookIndex } from '../content/types';
import { buildSteps } from '../cards/types';
import { ActiveTimer, IDLE_MS } from './activity';
import { memoryStore, openIdb } from './db';
import { courseFraction, derive, firstTry, firstUndoneStep, nextUnitId, unitComplete, unitFraction } from './derive';
import { isEvent, type Event, type NewEvent } from './events';

let n = 0;
const ev = (e: NewEvent, t = 1_700_000_000_000 + n * 1000): Event => ({ ...e, id: `id${n++}`, t, dev: 'test' }) as Event;
const ok = { correct: true, firstTry: true, tries: 1, sawSolution: false, self: false };
const miss = { correct: false, firstTry: false, tries: 3, sawSolution: true, self: false };

const index: BookIndex = {
  book: 'os-calc',
  title: 'T',
  volumes: [
    {
      volume: 1,
      title: 'V1',
      chapters: [
        {
          chapter: 1,
          title: 'C1',
          units: [
            { id: 'V1.1.1', title: 'A', exercises: 2, auto: 2, reading: 1 },
            { id: 'V1.1.2', title: 'B', exercises: 1, auto: 1, reading: 2 },
          ],
        },
      ],
    },
  ],
};
const [u1, u2] = index.volumes[0].chapters[0].units;

describe('derive', () => {
  it('first-try accuracy uses each exercise\'s first main-flow attempt', () => {
    const d = derive([
      ev({ type: 'ex', unit: 'V1.1.1', item: 'e1', ...ok }),
      ev({ type: 'ex', unit: 'V1.1.1', item: 'e2', ...miss }),
      ev({ type: 'ex', unit: 'V1.1.1', item: 'e2', ...ok }), // redo doesn't change it
      ev({ type: 'review', unit: 'V1.1.2', item: 'e1', ...ok, seed: 1, variant: false }), // practice doesn't count
    ]);
    expect(firstTry(d, [u1])).toEqual({ done: 1, total: 2 });
    expect(firstTry(d, [u1, u2])).toEqual({ done: 1, total: 2 });
    expect(firstTry(d, [u2])).toEqual({ done: 0, total: 0 });
  });

  it('counts checkpoints as problems but not toward accuracy', () => {
    const d = derive([
      ev({ type: 'read', unit: 'V1.1.1', item: 'c1', pages: 0.5, solved: true }),
      ev({ type: 'read', unit: 'V1.1.1', item: 'c2', solved: false }),
      ev({ type: 'read', unit: 'V1.1.1', item: 'c1', solved: true }), // redo counts again, pages don't
      ev({ type: 'read', unit: 'V1.1.1', item: 'r1' }), // plain reading card: not a problem
      ev({ type: 'ex', unit: 'V1.1.1', item: 'e1', ...ok }),
    ]);
    expect(d.solved).toBe(3);
    const [day] = [...d.days.values()];
    expect(day.attempted).toBe(4);
    expect(day.solved).toBe(3);
    expect(day.pages).toBe(0.5);
    expect(firstTry(d, [u1])).toEqual({ done: 1, total: 1 });
    expect(d.done.get('V1.1.1')?.has('c1')).toBeFalsy();
    expect(d.read.get('V1.1.1')?.has('c2')).toBe(true);
  });

  it('tracks time and last activity per unit', () => {
    const d = derive([
      ev({ type: 'time', ms: 5000 }, 1000),
      ev({ type: 'time', ms: 3000, unit: 'V1.1.1' }, 2000),
      ev({ type: 'read', unit: 'V1.1.1', item: 'r1' }, 3000),
      ev({ type: 'time', ms: 2000, unit: 'V1.1.1' }, 4000),
    ]);
    expect(d.ms).toBe(10000);
    expect(d.unitMs.get('V1.1.1')).toBe(5000);
    expect(d.unitLast.get('V1.1.1')).toBe(4000);
    expect(d.unitLast.has('V1.1.2')).toBe(false);
  });

  it('counts reading and exercises toward unit and course %', () => {
    const d = derive([
      ev({ type: 'read', unit: 'V1.1.1', item: 'r1' }),
      ev({ type: 'read', unit: 'V1.1.1', item: 'r1' }), // duplicate read counts once
      ev({ type: 'ex', unit: 'V1.1.1', item: 'e1', ...ok }),
      ev({ type: 'ex', unit: 'V1.1.1', item: 'e2', ...miss }), // wrong still counts as done
    ]);
    expect(unitFraction(d, u1)).toEqual({ done: 3, total: 3 });
    expect(unitComplete(d, u1)).toBe(true);
    expect(unitFraction(d, u2)).toEqual({ done: 0, total: 3 });
    expect(courseFraction(d, index)).toEqual({ done: 3, total: 6 });
    expect(nextUnitId(d, index)).toBe('V1.1.2');
  });

  it('counts problems solved all-time, including redos and practice', () => {
    const d = derive([
      ev({ type: 'ex', unit: 'V1.1.1', item: 'e1', ...miss }),
      ev({ type: 'review', unit: 'V1.1.1', item: 'e1', ...ok, seed: 1, variant: true }),
      ev({ type: 'ex', unit: 'V1.1.1', item: 'e1', ...ok }),
    ]);
    expect(d.solved).toBe(2);
    expect(d.first.get('V1.1.1/e1')).toBe(false); // the first attempt decides first-try accuracy
  });

  it('caps counts at the index totals', () => {
    const d = derive(['a', 'b', 'c'].map((item) => ev({ type: 'read', unit: 'V1.1.1', item })));
    expect(unitFraction(d, u1).done).toBe(1);
  });

  it('sums active time per day and overall', () => {
    const d = derive([ev({ type: 'time', ms: 60_000 }), ev({ type: 'time', ms: 30_000 })]);
    expect(d.ms).toBe(90_000);
    expect([...d.days.values()].reduce((a, s) => a + s.ms, 0)).toBe(90_000);
  });

  it('keeps the latest setting', () => {
    const d = derive([
      ev({ type: 'set', key: 'inputMode', value: 'visual' }, 2000),
      ev({ type: 'set', key: 'inputMode', value: 'plain' }, 1000),
    ].sort((a, b) => a.t - b.t));
    expect(d.settings.inputMode).toBe('visual');
  });

  it('returns null when everything is done', () => {
    const all = [
      ev({ type: 'read', unit: 'V1.1.1', item: 'r1' }),
      ev({ type: 'ex', unit: 'V1.1.1', item: 'e1', ...ok }),
      ev({ type: 'ex', unit: 'V1.1.1', item: 'e2', ...ok }),
      ev({ type: 'read', unit: 'V1.1.2', item: 'r1' }),
      ev({ type: 'read', unit: 'V1.1.2', item: 'r2' }),
      ev({ type: 'ex', unit: 'V1.1.2', item: 'e1', ...ok }),
    ];
    expect(nextUnitId(derive(all), index)).toBeNull();
  });
});

describe('firstUndoneStep', () => {
  const ex = (k: number) => ({ id: `e${k}`, number: k, prompt: [], check: 'self' as const });
  const steps = buildSteps(
    [{ id: 'r1', kind: 'text', body: [] }, { id: 'r2', kind: 'text', body: [] }],
    [1, 2, 3, 4, 5, 6].map(ex),
    [],
  );
  it('finds the first unread card, then the first unfinished exercise', () => {
    expect(firstUndoneStep(steps, undefined, undefined)).toBe(0);
    expect(firstUndoneStep(steps, new Set(['r1']), undefined)).toBe(1);
    const i = firstUndoneStep(steps, new Set(['r1', 'r2']), new Set(['e1', 'e2']));
    expect(steps[i]).toMatchObject({ kind: 'exercise', ex: { id: 'e3' } });
  });
  it('skips chunk-end screens and lands on "complete" when all is done', () => {
    const i = firstUndoneStep(steps, new Set(['r1', 'r2']), new Set(['e1', 'e2', 'e3', 'e4', 'e5', 'e6']));
    expect(steps[i].kind).toBe('complete');
  });
});

describe('ActiveTimer', () => {
  function setup() {
    let t = 0;
    let visible = true;
    const flushed: number[] = [];
    const timer = new ActiveTimer({ now: () => t, visible: () => visible }, (ms) => flushed.push(ms));
    return {
      timer,
      flushed,
      advance(ms: number, step = 1000) {
        for (let i = 0; i < ms; i += step) {
          t += step;
          timer.tick();
        }
      },
      touch() {
        timer.touch();
      },
      hide() {
        visible = false;
      },
    };
  }
  it('counts while active and stops after 60 s idle', () => {
    const s = setup();
    s.advance(IDLE_MS + 30_000);
    s.timer.flush();
    expect(s.flushed).toEqual([IDLE_MS - 1000]);
  });
  it('does not count in the background', () => {
    const s = setup();
    s.advance(10_000);
    s.hide();
    s.advance(10_000);
    s.timer.flush();
    expect(s.flushed).toEqual([10_000]);
  });
  it('ignores long sleeps between ticks', () => {
    const s = setup();
    s.advance(30_000, 30_000);
    expect(s.timer.pending).toBe(2000);
  });
  it('flushes on its own every 5 minutes', () => {
    const s = setup();
    for (let i = 0; i < 6 * 60; i++) {
      s.touch();
      s.advance(1000);
    }
    expect(s.flushed).toEqual([300_000]);
  });
});

describe('event stores', () => {
  for (const [name, make] of [
    ['memory', async () => memoryStore()],
    ['indexeddb', async () => openIdb(new IDBFactory(), 'test')],
  ] as const) {
    it(`${name}: dedupes by id, tracks what is synced, keeps meta`, async () => {
      const db = await make();
      const a = ev({ type: 'read', unit: 'V1.1.1', item: 'r1' }, 2000);
      const b = ev({ type: 'read', unit: 'V1.1.1', item: 'r2' }, 1000);
      expect(await db.add([a, b, a], false)).toHaveLength(2);
      expect(await db.add([a], false)).toHaveLength(0);
      expect((await db.all()).map((e) => e.id)).toEqual([b.id, a.id]); // sorted by time
      expect(await db.unsynced(10)).toHaveLength(2);
      await db.markSynced([a.id]);
      expect((await db.unsynced(10)).map((e) => e.id)).toEqual([b.id]);
      // Receiving an event from the server marks the local copy synced.
      await db.add([b], true);
      expect(await db.unsynced(10)).toHaveLength(0);
      expect((await db.all())[0]).not.toHaveProperty('_s');
      await db.setMeta('cursor', 42);
      expect(await db.getMeta('cursor')).toBe(42);
    });
  }
});

describe('isEvent', () => {
  it('accepts real events and rejects junk', () => {
    expect(isEvent(ev({ type: 'ex', unit: 'V1.1.1', item: 'e1', ...ok }))).toBe(true);
    expect(isEvent({ id: 'x', t: 1, dev: 'd', type: 'nope' })).toBe(false);
    expect(isEvent({ id: 'x', t: 1, dev: 'd', type: 'time', ms: -5 })).toBe(false);
    expect(isEvent(null)).toBe(false);
  });
});

describe('pages read and correct exercises', () => {
  it('counts pages on the first read of a card only, and tracks correct exercises per unit', () => {
    const t = new Date('2026-03-02T10:00:00').getTime();
    const d = derive([
      ev({ type: 'read', unit: 'V1.1.1', item: 'r1', pages: 0.5 }, t),
      ev({ type: 'read', unit: 'V1.1.1', item: 'r1', pages: 0.5 }, t + 1),
      ev({ type: 'ex', unit: 'V1.1.1', item: 'e1', ...miss }, t + 2),
      ev({ type: 'ex', unit: 'V1.1.1', item: 'e2', ...ok }, t + 3),
    ]);
    expect(d.days.get('2026-03-02')?.pages).toBe(0.5);
    expect([...(d.correct.get('V1.1.1') ?? [])]).toEqual(['e2']);
  });
});

describe('legacy localStorage import', () => {
  it('turns the old log into valid events', async () => {
    const { legacyEvents } = await import('../lib/progress.svelte');
    const evs = legacyEvents(
      {
        days: { '2026-11-23': { ms: 600000, pages: 1.2, problems: 2 } },
        solved: { 'V1.1.1': ['e1', 'e3'] },
        read: { 'V1.1.1': ['r1', 'r2'] },
        completed: {},
      },
      'dev',
    );
    expect(evs.every(isEvent)).toBe(true);
    const d = derive([...evs].sort((a, b) => a.t - b.t));
    expect(d.ms).toBe(600000);
    expect(d.correct.get('V1.1.1')?.size).toBe(2);
    expect(d.read.get('V1.1.1')?.size).toBe(2);
    expect(d.days.get('2026-11-23')).toMatchObject({ ms: 600000, pages: 1.2, solved: 2 });
  });
});
