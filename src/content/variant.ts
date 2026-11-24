import type { Answer } from '../check/answer';
import { rng } from '../check/equiv';
import { evaluate } from '../check/evaluate';
import { parseExpr } from '../check/parse';
import type { Block, Variant } from './types';

/**
 * Draw parameters for a variant and fill its template.
 * `{{a}}` is replaced by the value of a; `{{2*a + 1}}` by the value of that expression.
 */
export function drawParams(v: Variant, seed: number): Record<string, number> {
  const rand = rng(seed * 2654435761);
  const out: Record<string, number> = {};
  for (const [name, p] of Object.entries(v.params)) {
    if ('choices' in p) {
      out[name] = p.choices[Math.floor(rand() * p.choices.length)];
      continue;
    }
    const step = p.step ?? 1;
    const n = Math.floor((p.max - p.min) / step) + 1;
    const options: number[] = [];
    for (let i = 0; i < n; i++) {
      const val = Number((p.min + i * step).toFixed(10));
      if (!p.exclude?.includes(val)) options.push(val);
    }
    if (!options.length) throw new Error(`variant parameter ${name} has no allowed values`);
    out[name] = options[Math.floor(rand() * options.length)];
  }
  return out;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(12)));
}

export function fillTemplate(s: string, params: Record<string, number>, forAnswer: boolean): string {
  return s.replace(/\{\{([^{}]+)\}\}/g, (_, expr: string) => {
    const value = evaluate(parseExpr(expr), params);
    if (!Number.isFinite(value)) throw new Error(`variant expression {{${expr}}} is not a number`);
    const text = fmt(value);
    return forAnswer && value < 0 ? `(${text})` : text;
  });
}

function mapStrings<T>(x: T, f: (s: string) => string): T {
  if (typeof x === 'string') return f(x) as T;
  if (Array.isArray(x)) return x.map((y) => mapStrings(y, f)) as T;
  if (x && typeof x === 'object') {
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === 'type' || k === 'kind' ? v : mapStrings(v, f)])) as T;
  }
  return x;
}

export function instantiateVariant(v: Variant, seed: number): { params: Record<string, number>; prompt: Block[]; answer: Answer } {
  const params = drawParams(v, seed);
  return {
    params,
    prompt: mapStrings(v.prompt, (s) => fillTemplate(s, params, false)),
    answer: mapStrings(v.answer, (s) => fillTemplate(s, params, true)),
  };
}
