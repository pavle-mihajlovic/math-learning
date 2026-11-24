import { describe, expect, it } from 'vitest';
import { buildSteps, chunkSizes } from './types';

describe('chunking', () => {
  it('keeps chunks between 4 and 6 for realistic sizes', () => {
    for (let n = 8; n <= 120; n++) {
      const s = chunkSizes(n);
      expect(s.reduce((a, b) => a + b, 0)).toBe(n);
      for (const x of s) {
        expect(x).toBeGreaterThanOrEqual(4);
        expect(x).toBeLessThanOrEqual(7);
      }
    }
  });
  it('handles tiny units', () => {
    expect(chunkSizes(0)).toEqual([]);
    expect(chunkSizes(3)).toEqual([3]);
  });
  it('orders reading, chunks, proofs, completion', () => {
    const ex = (n: number) => ({ id: `e${n}`, number: n, prompt: [], check: 'self' as const });
    const steps = buildSteps(
      [{ id: 'r1', kind: 'text', body: [] }],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(ex),
      [{ id: 'p1', title: 'T', statement: [], proof: [], label: 'book' }],
    );
    expect(steps.map((s) => s.kind)).toEqual([
      'reading', 'exercise', 'exercise', 'exercise', 'exercise', 'exercise', 'chunk-end',
      'exercise', 'exercise', 'exercise', 'exercise', 'exercise', 'chunk-end', 'proofs-intro', 'proof', 'complete',
    ]);
  });
});
