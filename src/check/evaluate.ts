import type { Node } from './ast';

export type Env = Record<string, number>;

/** x^y over the reals, including odd roots of negatives: (-8)^(1/3) = -2. */
export function realPow(a: number, b: number): number {
  if (a >= 0 || Number.isInteger(b)) return Math.pow(a, b);
  for (let q = 3; q <= 15; q += 2) {
    const p = b * q;
    if (Math.abs(p - Math.round(p)) < 1e-9) {
      const r = Math.pow(-a, b);
      return Math.round(p) % 2 === 0 ? r : -r;
    }
  }
  return NaN;
}

function gamma(x: number): number {
  // Lanczos approximation, good enough for factorials of non-integers.
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

function factorial(n: number): number {
  if (n < 0 && Number.isInteger(n)) return NaN;
  if (Number.isInteger(n) && n <= 170) {
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }
  return gamma(n + 1);
}

const F1: Record<string, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x), cot: (x) => 1 / Math.tan(x),
  arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
  arcsec: (x) => Math.acos(1 / x), arccsc: (x) => Math.asin(1 / x),
  arccot: (x) => (x === 0 ? Math.PI / 2 : Math.atan(1 / x) + (x < 0 ? Math.PI : 0)),
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sech: (x) => 1 / Math.cosh(x), csch: (x) => 1 / Math.sinh(x), coth: (x) => 1 / Math.tanh(x),
  arcsinh: Math.asinh, arccosh: Math.acosh, arctanh: Math.atanh,
  arcsech: (x) => Math.acosh(1 / x), arccsch: (x) => Math.asinh(1 / x), arccoth: (x) => Math.atanh(1 / x),
  ln: Math.log, exp: Math.exp,
  sqrt: (x) => (x < 0 ? NaN : Math.sqrt(x)),
  cbrt: Math.cbrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, sgn: Math.sign,
};

export function evaluate(n: Node, env: Env = {}): number {
  switch (n.type) {
    case 'num':
      return n.value;
    case 'sym':
      if (n.name in env) return env[n.name];
      if (n.name === 'pi') return Math.PI;
      if (n.name === 'e') return Math.E;
      if (n.name === 'inf') return Infinity;
      return NaN;
    case 'neg':
      return -evaluate(n.arg, env);
    case 'abs':
      return Math.abs(evaluate(n.arg, env));
    case 'fact':
      return factorial(evaluate(n.arg, env));
    case 'bin': {
      const a = evaluate(n.left, env);
      const b = evaluate(n.right, env);
      switch (n.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '^': return realPow(a, b);
      }
      return NaN;
    }
    case 'call': {
      const args = n.args.map((a) => evaluate(a, env));
      if (n.fn === 'log') {
        if (args.length === 2) return Math.log(args[1]) / Math.log(args[0]);
        return Math.log10(args[0]);
      }
      if (n.fn === 'root') return realPow(args[0], 1 / args[1]);
      const f = F1[n.fn];
      return f ? f(args[0]) : NaN;
    }
  }
}
