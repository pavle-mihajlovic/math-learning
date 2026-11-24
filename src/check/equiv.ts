import { containsSym, freeVars, type Node } from './ast';
import { evaluate, type Env } from './evaluate';

/** Small deterministic PRNG so a given check always samples the same points. */
export function rng(seed = 0x9e3779b9): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function close(a: number, b: number, rel = 1e-7, abs = 1e-9): boolean {
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= Math.max(abs, rel * Math.max(Math.abs(a), Math.abs(b)));
}

// Ranges to sample from, tried in order until enough points evaluate to real numbers on both sides.
const RANGES: [number, number][] = [
  [-3, 3], [0.05, 4], [-10, 10], [1.05, 20], [-0.95, 0.95], [20, 200], [-200, -20],
];

export interface SampleOptions {
  /** Fixed values for some symbols (e.g. C = 0). */
  fixed?: Env;
  /** Sampling interval per variable. */
  domain?: Record<string, [number, number]>;
  points?: number;
}

/** Sample points where both trees evaluate to finite reals. Returns pairs of values. */
export function samplePairs(a: Node, b: Node, opts: SampleOptions = {}): { env: Env; va: number; vb: number }[] {
  const vars = [...new Set([...freeVars(a), ...freeVars(b)])].filter((v) => !(opts.fixed && v in opts.fixed));
  const want = opts.points ?? 24;
  const out: { env: Env; va: number; vb: number }[] = [];
  const rand = rng(vars.length * 7919 + 17);
  if (vars.length === 0) {
    const env = { ...opts.fixed };
    const va = evaluate(a, env);
    const vb = evaluate(b, env);
    return [{ env, va, vb }];
  }
  for (const [lo, hi] of RANGES) {
    for (let tries = 0; tries < want * 4 && out.length < want; tries++) {
      const env: Env = { ...opts.fixed };
      for (const v of vars) {
        const [l, h] = opts.domain?.[v] ?? [lo, hi];
        env[v] = l + (h - l) * rand();
      }
      const va = evaluate(a, env);
      const vb = evaluate(b, env);
      if (Number.isFinite(va) && Number.isFinite(vb)) out.push({ env, va, vb });
    }
    if (out.length >= want) break;
  }
  return out;
}

export interface EquivResult {
  equal: boolean;
  /** Too few points where both sides are defined to decide. */
  undecided?: boolean;
}

/** Are the two expressions equal as functions of their variables? */
export function equivalent(a: Node, b: Node, opts: SampleOptions & { rel?: number } = {}): EquivResult {
  const pairs = samplePairs(a, b, opts);
  if (freeVars(a).size === 0 && freeVars(b).size === 0) {
    const { va, vb } = pairs[0];
    if (Number.isNaN(va) || Number.isNaN(vb)) return { equal: false, undecided: true };
    return { equal: close(va, vb, opts.rel ?? 1e-9) };
  }
  if (pairs.length < 6) {
    // Fall back on domain agreement: if neither side is ever defined they cannot be told apart.
    return { equal: false, undecided: true };
  }
  return { equal: pairs.every(({ va, vb }) => close(va, vb, opts.rel ?? 1e-6, 1e-8)) };
}

/** Equal up to an additive constant (for antiderivatives). */
export function equalUpToConstant(a: Node, b: Node, opts: SampleOptions = {}): EquivResult {
  const pairs = samplePairs(a, b, opts);
  if (pairs.length < 6) return { equal: false, undecided: true };
  const d0 = pairs[0].va - pairs[0].vb;
  const scale = Math.max(1, ...pairs.map((p) => Math.abs(p.va) + Math.abs(p.vb)));
  return { equal: pairs.every(({ va, vb }) => Math.abs(va - vb - d0) <= 1e-6 * scale) };
}

/** a = k·b for one nonzero constant k (for equations moved around: 2y = 4x ⇔ y = 2x). */
export function proportional(a: Node, b: Node, opts: SampleOptions = {}): EquivResult {
  const pairs = samplePairs(a, b, opts).filter((p) => Math.abs(p.vb) > 1e-9 || Math.abs(p.va) > 1e-9);
  if (pairs.length < 6) return { equal: false, undecided: true };
  if (pairs.some((p) => Math.abs(p.vb) <= 1e-12 || Math.abs(p.va) <= 1e-12)) {
    return { equal: pairs.every((p) => close(p.va, 0) === close(p.vb, 0)) && proportional_ratio(pairs) };
  }
  return { equal: proportional_ratio(pairs) };
}

function proportional_ratio(pairs: { va: number; vb: number }[]): boolean {
  const ratios = pairs.filter((p) => Math.abs(p.vb) > 1e-9).map((p) => p.va / p.vb);
  if (!ratios.length) return false;
  const k = ratios[0];
  if (Math.abs(k) < 1e-12) return false;
  return ratios.every((r) => close(r, k, 1e-6));
}

export { containsSym };
