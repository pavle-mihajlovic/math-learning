/** Shared helpers for scripts that work with stored answers. */
import { check } from '../src/check/index.ts';
import type { Answer, SingleAnswer } from '../src/check/index.ts';

/** The input a student would type to give exactly the stored answer. */
export function canonicalInput(a: Answer): string | string[] {
  if (a.kind === 'multi') return a.parts.map((p) => canonicalSingle(p.answer));
  return canonicalSingle(a);
}

function canonicalSingle(a: SingleAnswer): string {
  if (a.kind === 'choice') return String(a.correct);
  if (a.kind === 'text') return a.value.split('|')[0];
  return a.value;
}

/** Does the checker accept the answer's own value? Returns an error message or null. */
export function selfCheck(a: Answer): string | null {
  try {
    const r = check(a, canonicalInput(a));
    if (r.parseError) return `checker cannot read the answer: ${r.parseError}`;
    if (!r.correct) return 'checker rejects the answer itself';
    return null;
  } catch (e) {
    return `checker crashed: ${(e as Error).message}`;
  }
}
