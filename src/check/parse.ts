import { FUNCTIONS, FUNCTION_ALIASES, GREEK, INVERTIBLE, type Node } from './ast';

export class ParseError extends Error {
  constructor(message: string, public pos = -1) {
    super(message);
    this.name = 'ParseError';
  }
}

const GREEK_CHARS: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ϵ: 'epsilon', ζ: 'zeta', η: 'eta',
  θ: 'theta', ϑ: 'theta', ι: 'iota', κ: 'kappa', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', ρ: 'rho',
  σ: 'sigma', τ: 'tau', υ: 'upsilon', φ: 'phi', ϕ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega',
  Γ: 'Gamma', Δ: 'Delta', Θ: 'Theta', Λ: 'Lambda', Σ: 'Sigma', Φ: 'Phi', Ψ: 'Psi', Ω: 'Omega',
};

const SUPERSCRIPTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-',
};

/** Map the Unicode a phone keyboard or a copy-paste can produce onto plain ASCII syntax. */
export function normalize(input: string): string {
  // NFKC would turn ² into a plain 2 and lose the exponent, so superscripts are rewritten first.
  let s = input
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => '^(' + [...m].map((c) => SUPERSCRIPTS[c]).join('') + ')')
    .normalize('NFKC');
  s = s
    .replace(/[−–—‐‑]/g, '-')
    .replace(/[×·⋅∙•∗]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[∕⁄]/g, '/')
    .replace(/π/g, ' pi ')
    .replace(/∞/g, ' inf ')
    .replace(/√/g, ' sqrt ')
    .replace(/∛/g, ' cbrt ')
    .replace(/≤|⩽/g, '<=')
    .replace(/≥|⩾/g, '>=')
    .replace(/≠/g, '!=')
    .replace(/[⟨〈]/g, '<')
    .replace(/[⟩〉]/g, '>')
    .replace(/[∪⋃]/g, ' U ')
    .replace(/[∅Ø]/g, ' {} ')
    .replace(/[’′‘`]/g, "'")
    .replace(/\*\*/g, '^')
    .replace(/[    ]/g, ' ');
  s = s.replace(/[α-ωΑ-Ωϵϑϕ]/g, (c) => (GREEK_CHARS[c] ? ` ${GREEK_CHARS[c]} ` : c));
  return s.trim();
}

type Tok =
  | { t: 'num'; v: string; pos: number }
  | { t: 'id'; v: string; pos: number }
  | { t: 'op'; v: string; pos: number };

const NAMES = [
  ...Object.keys(FUNCTIONS),
  ...Object.keys(FUNCTION_ALIASES),
  ...GREEK,
  'pi', 'inf', 'infinity', 'oo',
].sort((a, b) => b.length - a.length);

/** Split a run of letters into known names and single-letter variables: "xsinx" → x, sin, x. */
function splitLetters(run: string, extraNames: string[]): string[] {
  const names = extraNames.length ? [...extraNames, ...NAMES].sort((a, b) => b.length - a.length) : NAMES;
  const out: string[] = [];
  let i = 0;
  while (i < run.length) {
    const hit = names.find((n) => run.startsWith(n, i));
    if (hit) {
      out.push(hit);
      i += hit.length;
    } else {
      out.push(run[i]);
      i += 1;
    }
  }
  return out;
}

function tokenize(src: string, extraNames: string[]): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
      if (!m) throw new ParseError(`Unexpected "${c}"`, i);
      toks.push({ t: 'num', v: m[1], pos: i });
      i += m[1].length;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      const m = /^[A-Za-z]+/.exec(src.slice(i))!;
      let parts = splitLetters(m[0], extraNames);
      let pos = i;
      i += m[0].length;
      // Subscripts belong to the last name: x_1, a_n, log_2, x_{12}.
      if (src[i] === '_') {
        const sub = /^_(\{[A-Za-z0-9]+\}|[A-Za-z0-9]+)/.exec(src.slice(i));
        if (sub) {
          const last = parts.pop()!;
          const raw = sub[1].replace(/[{}]/g, '');
          if (last === 'log') {
            parts.forEach((p) => { toks.push({ t: 'id', v: p, pos }); pos += p.length; });
            toks.push({ t: 'id', v: 'log', pos });
            toks.push({ t: 'op', v: '_', pos: i });
            toks.push(/^\d/.test(raw) ? { t: 'num', v: raw, pos: i + 1 } : { t: 'id', v: raw, pos: i + 1 });
            i += sub[0].length;
            continue;
          }
          parts = [...parts, `${last}_${raw}`];
          i += sub[0].length;
        }
      }
      for (const p of parts) {
        toks.push({ t: 'id', v: p, pos });
        pos += p.length;
      }
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '!='].includes(two)) {
      toks.push({ t: 'op', v: two, pos: i });
      i += 2;
      continue;
    }
    if ('+-*/^!()[]{},|=<>;\''.includes(c)) {
      toks.push({ t: 'op', v: c, pos: i });
      i++;
      continue;
    }
    throw new ParseError(`I don't recognize "${c}"`, i);
  }
  return toks;
}

const CLOSERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

export interface ParseOptions {
  /** Extra multi-letter variable names to keep whole, e.g. ["xy"] is unusual but possible. */
  names?: string[];
}

class Parser {
  i = 0;
  absDepth = 0;
  constructor(public toks: Tok[]) {}

  peek(): Tok | undefined { return this.toks[this.i]; }
  next(): Tok | undefined { return this.toks[this.i++]; }
  isOp(v: string, tok = this.peek()): boolean { return !!tok && tok.t === 'op' && tok.v === v; }
  expect(v: string): void {
    const t = this.next();
    if (!t || t.t !== 'op' || t.v !== v) {
      throw new ParseError(t ? `Expected "${v}" but found "${t.v}"` : `Missing "${v}"`, t?.pos ?? -1);
    }
  }

  parseExpression(): Node {
    let left = this.parseTerm();
    for (;;) {
      const t = this.peek();
      if (t && t.t === 'op' && (t.v === '+' || t.v === '-')) {
        this.next();
        const right = this.parseTerm();
        left = { type: 'bin', op: t.v, left, right };
      } else return left;
    }
  }

  /** Can the token start an operand that is multiplied implicitly? */
  startsAtom(t: Tok | undefined): boolean {
    if (!t) return false;
    if (t.t === 'num' || t.t === 'id') return true;
    if (t.t === 'op' && (t.v === '(' || t.v === '[')) return true;
    if (t.t === 'op' && t.v === '|' && this.absDepth === 0) return true;
    return false;
  }

  parseTerm(stopAtFunction = false): Node {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (!stopAtFunction && t && t.t === 'op' && (t.v === '*' || t.v === '/')) {
        this.next();
        const right = this.parseUnary();
        left = { type: 'bin', op: t.v, left, right };
      } else if (this.startsAtom(t)) {
        if (stopAtFunction && t!.t === 'id' && isFunctionName(t!.v)) return left;
        if (left.type === 'num' && t!.t === 'num') throw new ParseError('Two numbers in a row: add an operator', t!.pos);
        const right = this.parsePower();
        left = { type: 'bin', op: '*', left, right, implicit: true };
      } else return left;
    }
  }

  parseUnary(): Node {
    if (this.isOp('-')) {
      this.next();
      return { type: 'neg', arg: this.parseUnary() };
    }
    if (this.isOp('+')) {
      this.next();
      return this.parseUnary();
    }
    return this.parsePower();
  }

  parsePower(): Node {
    const base = this.parsePostfix();
    if (this.isOp('^')) {
      this.next();
      // Exponents bind right-to-left and may carry a sign: x^-2, 2^3^2.
      const exp = this.parseUnaryPower();
      return { type: 'bin', op: '^', left: base, right: exp };
    }
    return base;
  }

  parseUnaryPower(): Node {
    if (this.isOp('-')) {
      this.next();
      return { type: 'neg', arg: this.parseUnaryPower() };
    }
    if (this.isOp('+')) { this.next(); return this.parseUnaryPower(); }
    return this.parsePower();
  }

  parsePostfix(): Node {
    let n = this.parseAtom();
    while (this.isOp('!')) {
      this.next();
      n = { type: 'fact', arg: n };
    }
    return n;
  }

  parseGroup(open: string): Node {
    const close = CLOSERS[open];
    const saved = this.absDepth;
    this.absDepth = 0;
    const inner = this.parseExpression();
    this.absDepth = saved;
    if (this.isOp(',')) throw new ParseError('A comma here is only allowed in points, vectors, intervals and lists');
    this.expect(close);
    return { ...inner, paren: true };
  }

  parseAtom(): Node {
    const t = this.next();
    if (!t) throw new ParseError('The expression ends too early');
    if (t.t === 'num') {
      const value = Number(t.v);
      if (Number.isNaN(value)) throw new ParseError(`Bad number "${t.v}"`, t.pos);
      return { type: 'num', value, raw: t.v };
    }
    if (t.t === 'id') return this.parseIdentifier(t);
    if (t.v === '(' || t.v === '[' || t.v === '{') return this.parseGroup(t.v);
    if (t.v === '|') {
      this.absDepth++;
      const saved = this.absDepth;
      const inner = this.parseExpression();
      this.absDepth = saved - 1;
      this.expect('|');
      return { type: 'abs', arg: inner };
    }
    if (t.v === ')' || t.v === ']' || t.v === '}') throw new ParseError(`Unmatched "${t.v}"`, t.pos);
    throw new ParseError(`Unexpected "${t.v}"`, t.pos);
  }

  parseIdentifier(t: Tok): Node {
    const raw = t.v;
    if (raw === 'pi') return { type: 'sym', name: 'pi' };
    if (raw === 'inf' || raw === 'infinity' || raw === 'oo') return { type: 'sym', name: 'inf' };
    if (!isFunctionName(raw)) {
      // Prime notation: f'(x) is read as a name like "f'".
      let name = raw;
      while (this.isOp("'")) { this.next(); name += "'"; }
      return { type: 'sym', name };
    }
    let fn = FUNCTION_ALIASES[raw] ?? raw;
    let base: Node | undefined;
    let power: Node | undefined;
    if (fn === 'log' && this.isOp('_')) {
      this.next();
      const b = this.next();
      if (!b || b.t === 'op') throw new ParseError('log_ needs a base, like log_2(x)');
      base = b.t === 'num' ? { type: 'num', value: Number(b.v), raw: b.v } : { type: 'sym', name: b.v };
    }
    if (this.isOp('^')) {
      // sin^2 x means (sin x)^2; sin^-1 x means arcsin x.
      this.next();
      const exp = this.parseUnaryPowerAtom();
      if (isMinusOne(exp) && INVERTIBLE.has(fn)) fn = 'arc' + fn;
      else power = exp;
    }
    let args: Node[];
    if (this.isOp('(')) {
      this.next();
      args = [];
      const saved = this.absDepth;
      this.absDepth = 0;
      if (!this.isOp(')')) {
        args.push(this.parseExpression());
        while (this.isOp(',')) {
          this.next();
          args.push(this.parseExpression());
        }
      }
      this.absDepth = saved;
      this.expect(')');
      // sin(x)^2 should square the function value, not x.
      if (!power && this.isOp('^')) {
        this.next();
        power = this.parseUnaryPower();
      }
    } else {
      if (!this.peek()) throw new ParseError(`"${raw}" needs an argument`);
      const neg = this.isOp('-');
      if (neg) this.next();
      const arg = this.parseTerm(true);
      args = [neg ? { type: 'neg', arg } : arg];
    }
    if (base) args = [base, ...args];
    const arity = FUNCTIONS[fn];
    if (fn === 'log') {
      if (args.length < 1 || args.length > 2) throw new ParseError('log takes one argument, or a base and an argument');
    } else if (args.length !== arity) {
      throw new ParseError(`${fn} takes ${arity} argument${arity === 1 ? '' : 's'}`);
    }
    let node: Node = { type: 'call', fn, args };
    if (power) node = { type: 'bin', op: '^', left: node, right: power };
    return node;
  }

  /** The exponent right after a function name: sin^2, sin^-1, sin^(1/2). */
  parseUnaryPowerAtom(): Node {
    if (this.isOp('-')) {
      this.next();
      return { type: 'neg', arg: this.parseUnaryPowerAtom() };
    }
    return this.parseAtom();
  }
}

function isMinusOne(n: Node): boolean {
  return n.type === 'neg' && n.arg.type === 'num' && n.arg.value === 1;
}

export function isFunctionName(v: string): boolean {
  return v in FUNCTIONS || v in FUNCTION_ALIASES;
}

/** Parse one expression (no commas, no "="). Throws ParseError. */
export function parseExpr(input: string, opts: ParseOptions = {}): Node {
  const src = normalize(input);
  if (!src) throw new ParseError('Empty answer');
  const toks = tokenize(src, opts.names ?? []);
  const p = new Parser(toks);
  const node = p.parseExpression();
  const rest = p.peek();
  if (rest) {
    if (rest.t === 'op' && [')', ']', '}'].includes(rest.v)) throw new ParseError(`Unmatched "${rest.v}"`, rest.pos);
    if (rest.t === 'op' && rest.v === ',') throw new ParseError('Unexpected comma');
    if (rest.t === 'op' && ['=', '<', '>', '<=', '>=', '!='].includes(rest.v)) {
      throw new ParseError(`Unexpected "${rest.v}" here`, rest.pos);
    }
    throw new ParseError(`Unexpected "${rest.v}"`, rest.pos);
  }
  return node;
}

/**
 * Split at top-level separators (outside any brackets). Used for commas in tuples and sets,
 * "=" in equations and "U" in unions.
 */
export function splitTopLevel(input: string, sep: string | RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (depth === 0) {
      if (typeof sep === 'string') {
        if (input.startsWith(sep, i)) {
          parts.push(cur);
          cur = '';
          i += sep.length;
          continue;
        }
      } else {
        const m = new RegExp('^(?:' + sep.source + ')', sep.flags.replace('g', '')).exec(input.slice(i));
        if (m && m[0].length) {
          parts.push(cur);
          cur = '';
          i += m[0].length;
          continue;
        }
      }
    }
    cur += c;
    i++;
  }
  parts.push(cur);
  return parts;
}
