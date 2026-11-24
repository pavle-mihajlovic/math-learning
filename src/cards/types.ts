import type { Exercise, ProofCard, ReadingCard } from '../content/types';

export interface Outcome {
  correct: boolean;
  firstTry: boolean;
  attempts: number;
  sawSolution: boolean;
  selfChecked: boolean;
}

export type Step =
  | { kind: 'reading'; card: ReadingCard; n: number; of: number }
  | { kind: 'exercise'; ex: Exercise; chunk: number; chunks: number; pos: number; size: number }
  | { kind: 'chunk-end'; chunk: number; chunks: number; ids: string[] }
  | { kind: 'proofs-intro'; count: number }
  | { kind: 'proof'; card: ProofCard; n: number; of: number }
  | { kind: 'complete' };

/** Split n exercises into chunks of 4–6 (about two minutes each), keeping book order. */
export function chunkSizes(n: number, target = 5): number[] {
  if (n <= 0) return [];
  const k = Math.max(1, Math.round(n / target));
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

export function buildSteps(reading: ReadingCard[], exercises: Exercise[], proofs: ProofCard[]): Step[] {
  const steps: Step[] = reading.map((card, i) => ({ kind: 'reading', card, n: i + 1, of: reading.length }));
  const sizes = chunkSizes(exercises.length);
  let at = 0;
  sizes.forEach((size, c) => {
    const slice = exercises.slice(at, at + size);
    slice.forEach((ex, pos) => steps.push({ kind: 'exercise', ex, chunk: c + 1, chunks: sizes.length, pos: pos + 1, size }));
    steps.push({ kind: 'chunk-end', chunk: c + 1, chunks: sizes.length, ids: slice.map((e) => e.id) });
    at += size;
  });
  if (proofs.length) {
    steps.push({ kind: 'proofs-intro', count: proofs.length });
    proofs.forEach((card, i) => steps.push({ kind: 'proof', card, n: i + 1, of: proofs.length }));
  }
  steps.push({ kind: 'complete' });
  return steps;
}
