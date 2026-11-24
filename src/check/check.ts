import type { Node } from './ast';
import { containsSym, freeVars } from './ast';
import type {
  Answer, CheckResult, EquationAnswer, ExpressionAnswer, ListAnswer, MatrixAnswer, NumberAnswer,
  SetAnswer, SingleAnswer, TextAnswer, Tolerance, VectorAnswer, ChoiceAnswer,
} from './answer';
import { close, equalUpToConstant, equivalent, proportional } from './equiv';
import { evaluate } from './evaluate';
import { normalize, ParseError, parseExpr, splitTopLevel } from './parse';

// ---------------------------------------------------------------------------
// Special values
// ---------------------------------------------------------------------------

export type Special = 'DNE' | 'inf' | '-inf';

export function readSpecial(input: string): Special | null {
  const s = normalize(input).toLowerCase().replace(/\s+/g, ' ').replace(/[.!]$/, '').trim();
  if (/^(dne|does not exist|doesn't exist|undefined|no limit|d\.n\.e)$/.test(s)) return 'DNE';
  if (/^\+?\s*(inf|infinity|oo)$/.test(s)) return 'inf';
  if (/^-\s*(inf|infinity|oo)$/.test(s)) return '-inf';
  return null;
}

// ---------------------------------------------------------------------------
// Decimal tolerance: "0.333" is a fine answer for 1/3, "0.3" is not.
// ---------------------------------------------------------------------------

function decimals(raw: string): { places: number; sig: number }[] {
  const out: { places: number; sig: number }[] = [];
  for (const m of raw.matchAll(/(\d*)\.(\d+)/g)) {
    const digits = (m[1] + m[2]).replace(/^0+/, '');
    out.push({ places: m[2].length, sig: digits.length });
  }
  return out;
}

/** Absolute tolerance implied by a typed decimal, or 0 if it has none or too few digits. */
function decimalTolerance(raw: string): number {
  const d = decimals(raw);
  if (!d.length) return 0;
  const minPlaces = Math.min(...d.map((x) => x.places));
  const minSig = Math.min(...d.map((x) => x.sig));
  if (minSig < 3) return 0;
  return 0.5 * Math.pow(10, -minPlaces) * 1.0001;
}

/** Relative tolerance for expressions whose coefficients were rounded (e.g. book answer "1.25x + 3.7"). */
function decimalRel(raw: string): number {
  const d = decimals(raw);
  if (!d.length) return 0;
  const minSig = Math.min(...d.map((x) => x.sig));
  return 0.5 * Math.pow(10, -(minSig - 1)) * 1.0001;
}

function numbersClose(expected: number, got: number, expRaw: string, gotRaw: string, tol?: Tolerance): boolean {
  if (expected === got) return true;
  const abs = Math.max(tol?.abs ?? 0, decimalTolerance(expRaw), decimalTolerance(gotRaw), 1e-10);
  const rel = tol?.rel ?? 1e-9;
  return close(expected, got, rel, abs);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tryParse(input: string): Node | CheckResult {
  try {
    return parseExpr(input);
  } catch (e) {
    if (e instanceof ParseError) return { correct: false, parseError: e.message };
    throw e;
  }
}

function isResult(x: unknown): x is CheckResult {
  return typeof x === 'object' && x !== null && 'correct' in x;
}

/** Top-level "lhs = rhs" split. Returns null without exactly one "=". */
function splitEquation(input: string): [string, string] | null {
  const parts = splitTopLevel(normalize(input), /(?<![<>!])=(?!=)/);
  if (parts.length !== 2) return null;
  return [parts[0].trim(), parts[1].trim()];
}

function wrong(feedback?: string): CheckResult {
  return feedback ? { correct: false, feedback } : { correct: false };
}

function extraVarsFeedback(expected: Node, got: Node): string | undefined {
  const exp = freeVars(expected);
  const extra = [...freeVars(got)].filter((v) => !exp.has(v) && v !== 'C' && v !== 'K');
  if (extra.length) return `Your answer uses ${extra.join(', ')}, which the answer doesn't.`;
  return undefined;
}

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

function checkNumber(a: NumberAnswer, input: string): CheckResult {
  const expSpecial = readSpecial(a.value);
  const gotSpecial = readSpecial(input);
  if (expSpecial || gotSpecial) {
    if (expSpecial === gotSpecial) return { correct: true };
    if (expSpecial === 'DNE' && gotSpecial) return wrong();
    if (expSpecial && expSpecial !== 'DNE' && gotSpecial === 'DNE') {
      return wrong('Be more specific: does it go to ∞ or −∞?');
    }
    if (!expSpecial && gotSpecial) return wrong();
  }
  const got = tryParse(input);
  if (isResult(got)) return got;
  const vars = freeVars(got);
  if (vars.size) return { correct: false, parseError: `Expected a number, but your answer contains ${[...vars].join(', ')}` };
  const vg = evaluate(got);
  if (!expSpecial) {
    const exp = parseExpr(a.value);
    const ve = evaluate(exp);
    if (Number.isNaN(vg)) return wrong("Your answer isn't a real number.");
    return { correct: numbersClose(ve, vg, a.value, input, a.tolerance) };
  }
  if (expSpecial === 'inf') return { correct: vg === Infinity };
  if (expSpecial === '-inf') return { correct: vg === -Infinity };
  return wrong();
}

function checkExpression(a: ExpressionAnswer, input: string): CheckResult {
  let src = input;
  const eq = splitEquation(input);
  if (eq) src = eq[1];
  const got = tryParse(src);
  if (isResult(got)) return got;
  const exp = parseExpr(a.value);
  const rel = Math.max(1e-6, decimalRel(a.value), decimalRel(src));
  if (a.constant) {
    const fixed = { C: 0, K: 0 };
    const res = equalUpToConstant(exp, got, { fixed, domain: a.domain });
    if (!res.equal) return wrong(extraVarsFeedback(exp, got));
    if (!containsSym(got, 'C') && !containsSym(got, 'K')) {
      return wrong('Add the constant of integration (+C).');
    }
    return { correct: true };
  }
  const res = equivalent(exp, got, { domain: a.domain, rel });
  if (res.equal) return { correct: true };
  if (res.undecided) return wrong("I couldn't evaluate your answer where it should be defined.");
  return wrong(extraVarsFeedback(exp, got));
}

function checkEquation(a: EquationAnswer, input: string): CheckResult {
  const expEq = splitEquation(a.value);
  if (!expEq) throw new Error(`Equation answer without "=": ${a.value}`);
  const [el, er] = expEq.map((s) => parseExpr(s));
  const rel = Math.max(1e-6, decimalRel(a.value), decimalRel(input));
  const gotEq = splitEquation(input);
  if (!gotEq) {
    // "y = 2x + 1" may be answered with just "2x + 1".
    if (el.type === 'sym') {
      const got = tryParse(input);
      if (isResult(got)) return got;
      return { correct: equivalent(er, got, { domain: a.domain, rel }).equal };
    }
    return { correct: false, parseError: 'Write an equation with "="' };
  }
  const gl = tryParse(gotEq[0]);
  if (isResult(gl)) return gl;
  const gr = tryParse(gotEq[1]);
  if (isResult(gr)) return gr;
  const expDiff: Node = { type: 'bin', op: '-', left: el, right: er };
  const gotDiff: Node = { type: 'bin', op: '-', left: gl, right: gr };
  // Same left side: compare right sides directly (keeps rounding tolerance meaningful).
  if (el.type === 'sym' && gl.type === 'sym' && el.name === gl.name) {
    return { correct: equivalent(er, gr, { domain: a.domain, rel }).equal };
  }
  return { correct: proportional(gotDiff, expDiff, { domain: a.domain }).equal };
}

// ----- sets -----------------------------------------------------------------

interface Interval { lo: number; hi: number; loClosed: boolean; hiClosed: boolean; loRaw: string; hiRaw: string }

function evalEndpoint(s: string): { v: number; raw: string } {
  const sp = readSpecial(s);
  if (sp === 'inf') return { v: Infinity, raw: s };
  if (sp === '-inf') return { v: -Infinity, raw: s };
  const n = parseExpr(s);
  const vars = freeVars(n);
  if (vars.size) throw new ParseError(`Interval endpoints must be numbers (found ${[...vars].join(', ')})`);
  return { v: evaluate(n), raw: s };
}

const UNION = /\s*(?:\bU\b|\bunion\b|\s[uU]\s|\bor\b)\s*/;

/** Parse set notation into a sorted, merged list of intervals (points are closed zero-length intervals). */
export function parseSet(input: string): Interval[] {
  const src = normalize(input);
  const pieces = splitTopLevel(src, UNION).map((p) => p.trim()).filter(Boolean);
  const out: Interval[] = [];
  for (const piece of pieces) out.push(...parseSetPiece(piece));
  return mergeIntervals(out);
}

function point(v: number, raw: string): Interval {
  return { lo: v, hi: v, loClosed: true, hiClosed: true, loRaw: raw, hiRaw: raw };
}

function parseSetPiece(p: string): Interval[] {
  const low = p.toLowerCase().replace(/\s+/g, ' ');
  if (/^(r|ℝ|all real numbers|reals|\(-inf, ?inf\)|all reals)$/.test(low)) {
    return [{ lo: -Infinity, hi: Infinity, loClosed: false, hiClosed: false, loRaw: '-inf', hiRaw: 'inf' }];
  }
  if (/^(\{\s*\}|empty|empty set|none|no solution|no solutions)$/.test(low)) return [];
  const m = /^([([])(.*)([)\]])$/.exec(p);
  if (m && splitTopLevel(m[2], ',').length === 2) {
    const [a, b] = splitTopLevel(m[2], ',').map((s) => evalEndpoint(s.trim()));
    if (a.v > b.v) throw new ParseError('The left end of an interval must be smaller than the right end');
    return [{
      lo: a.v, hi: b.v,
      loClosed: m[1] === '[' && Number.isFinite(a.v),
      hiClosed: m[3] === ']' && Number.isFinite(b.v),
      loRaw: a.raw, hiRaw: b.raw,
    }];
  }
  const braces = /^\{(.*)\}$/.exec(p);
  if (braces) {
    return splitTopLevel(braces[1], ',').map((s) => {
      const e = evalEndpoint(s.trim());
      return point(e.v, e.raw);
    });
  }
  // Inequalities in one variable: x < 3, -1 <= x < 2, x != 0.
  const ineq = parseInequality(p);
  if (ineq) return ineq;
  const parts = splitTopLevel(p, ',');
  return parts.map((s) => {
    const e = evalEndpoint(s.trim());
    return point(e.v, e.raw);
  });
}

function parseInequality(p: string): Interval[] | null {
  const tokens = p.split(/(<=|>=|!=|<|>)/).map((s) => s.trim());
  if (tokens.length < 3) return null;
  const isVar = (s: string) => /^[a-zA-Z]+$/.test(s) && !readSpecial(s);
  if (tokens.length === 3) {
    const [l, op, r] = tokens;
    if (isVar(l) || isVar(r)) {
      const varLeft = isVar(l);
      const e = evalEndpoint(varLeft ? r : l);
      let o = op;
      if (!varLeft) o = ({ '<': '>', '>': '<', '<=': '>=', '>=': '<=', '!=': '!=' } as Record<string, string>)[op];
      const all = { loRaw: '-inf', hiRaw: 'inf' };
      switch (o) {
        case '<': return [{ lo: -Infinity, hi: e.v, loClosed: false, hiClosed: false, ...all }];
        case '<=': return [{ lo: -Infinity, hi: e.v, loClosed: false, hiClosed: true, ...all }];
        case '>': return [{ lo: e.v, hi: Infinity, loClosed: false, hiClosed: false, ...all }];
        case '>=': return [{ lo: e.v, hi: Infinity, loClosed: true, hiClosed: false, ...all }];
        case '!=': return [
          { lo: -Infinity, hi: e.v, loClosed: false, hiClosed: false, ...all },
          { lo: e.v, hi: Infinity, loClosed: false, hiClosed: false, ...all },
        ];
      }
    }
    return null;
  }
  if (tokens.length === 5 && isVar(tokens[2])) {
    const [a, op1, , op2, b] = tokens;
    const ea = evalEndpoint(a);
    const eb = evalEndpoint(b);
    if ((op1 === '<' || op1 === '<=') && (op2 === '<' || op2 === '<=')) {
      return [{ lo: ea.v, hi: eb.v, loClosed: op1 === '<=', hiClosed: op2 === '<=', loRaw: a, hiRaw: b }];
    }
    if ((op1 === '>' || op1 === '>=') && (op2 === '>' || op2 === '>=')) {
      return [{ lo: eb.v, hi: ea.v, loClosed: op2 === '>=', hiClosed: op1 === '>=', loRaw: b, hiRaw: a }];
    }
  }
  return null;
}

function mergeIntervals(list: Interval[]): Interval[] {
  const valid = list.filter((i) => i.lo < i.hi || (i.lo === i.hi && i.loClosed && i.hiClosed));
  valid.sort((a, b) => a.lo - b.lo || (a.loClosed === b.loClosed ? 0 : a.loClosed ? -1 : 1));
  const out: Interval[] = [];
  for (const iv of valid) {
    const last = out[out.length - 1];
    if (last && (iv.lo < last.hi || (iv.lo === last.hi && (last.hiClosed || iv.loClosed)))) {
      if (iv.hi > last.hi || (iv.hi === last.hi && iv.hiClosed)) {
        last.hi = iv.hi;
        last.hiClosed = iv.hiClosed || (iv.hi === last.hi && last.hiClosed);
        last.hiRaw = iv.hiRaw;
      }
      if (iv.lo === last.lo) last.loClosed = last.loClosed || iv.loClosed;
    } else out.push({ ...iv });
  }
  return out;
}

function checkSet(a: SetAnswer, input: string): CheckResult {
  const exp = parseSet(a.value);
  let got: Interval[];
  try {
    got = parseSet(input);
  } catch (e) {
    if (e instanceof ParseError) return { correct: false, parseError: e.message };
    throw e;
  }
  if (exp.length !== got.length) return wrong();
  const same = exp.every((e, i) => {
    const g = got[i];
    return numbersClose(e.lo, g.lo, e.loRaw, g.loRaw) && numbersClose(e.hi, g.hi, e.hiRaw, g.hiRaw)
      && e.loClosed === g.loClosed && e.hiClosed === g.hiClosed;
  });
  if (same) return { correct: true };
  const endsMatch = exp.every((e, i) => numbersClose(e.lo, got[i].lo, e.loRaw, got[i].loRaw)
    && numbersClose(e.hi, got[i].hi, e.hiRaw, got[i].hiRaw));
  return wrong(endsMatch ? 'Check which endpoints are included: ( ) vs [ ].' : undefined);
}

// ----- lists, vectors, matrices --------------------------------------------

function stripOuter(s: string, pairs: [string, string][]): string | null {
  const t = s.trim();
  for (const [o, c] of pairs) {
    if (t.startsWith(o) && t.endsWith(c)) {
      // Make sure the outer brackets enclose everything: "(1)(2)" is not wrapped.
      const inner = t.slice(o.length, t.length - c.length);
      if (splitTopLevel(inner, '|||').length === 1 && balanced(inner)) return inner;
    }
  }
  return null;
}

function balanced(s: string): boolean {
  let d = 0;
  for (const c of s) {
    if ('([{'.includes(c)) d++;
    if (')]}'.includes(c)) d--;
    if (d < 0) return false;
  }
  return d === 0;
}

function componentsEqual(exp: string[], got: string[], ordered: boolean): CheckResult {
  if (exp.length !== got.length) {
    return wrong(`Expected ${exp.length} value${exp.length === 1 ? '' : 's'}, you gave ${got.length}.`);
  }
  const en = exp.map((s) => s.trim());
  const gn: Node[] = [];
  for (const g of got) {
    const r = tryParse(g.trim());
    if (isResult(r)) return r;
    gn.push(r);
  }
  const same = (e: string, g: Node, graw: string): boolean => {
    const sp = readSpecial(e);
    if (sp) return readSpecial(graw) === sp;
    const n = parseExpr(e);
    if (freeVars(n).size === 0 && freeVars(g).size === 0) return numbersClose(evaluate(n), evaluate(g), e, graw);
    const rel = Math.max(1e-6, decimalRel(e), decimalRel(graw));
    return equivalent(n, g, { rel }).equal;
  };
  if (ordered) return { correct: en.every((e, i) => same(e, gn[i], got[i])) };
  const used = new Set<number>();
  for (const e of en) {
    const idx = gn.findIndex((g, i) => !used.has(i) && same(e, g, got[i]));
    if (idx < 0) return wrong();
    used.add(idx);
  }
  return { correct: true };
}

function listItems(input: string): string[] {
  const src = normalize(input);
  const inner = stripOuter(src, [['{', '}'], ['(', ')'], ['[', ']']]) ?? src;
  // "x = 1, x = -2" or "x = 1 or x = -2".
  return splitTopLevel(inner, /\s*(?:,|\bor\b|\band\b)\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^[a-zA-Z]\s*=\s*/, ''));
}

function checkList(a: ListAnswer, input: string): CheckResult {
  if (/^(none|no solution|no solutions|\{\s*\})$/i.test(input.trim())) {
    return { correct: listItems(a.value).length === 0 || /^(none|\{\s*\})$/i.test(a.value.trim()) };
  }
  return componentsEqual(listItems(a.value), listItems(input), !!a.ordered);
}

/** Number of i/j/k unit vectors used in "2i - 3j + k" style input, or 0 if none. */
function ijkDims(n: Node): number {
  const vars = freeVars(n);
  if (vars.has('k')) return 3;
  if (vars.has('i') || vars.has('j')) return 2;
  return 0;
}

function vectorItems(input: string): string[] | null {
  const src = normalize(input);
  const inner = stripOuter(src, [['<', '>'], ['(', ')'], ['[', ']']]);
  if (inner !== null && splitTopLevel(inner, ',').length > 1) return splitTopLevel(inner, ',');
  if (splitTopLevel(src, ',').length > 1) return splitTopLevel(src, ',');
  return null;
}

/** Components of "<1, 2, 3>", "(1, 2)", "1, 2" or "i + 2j + 3k". Throws ParseError. */
function vectorComponents(input: string): { comps: Node[]; ijk: boolean } {
  const items = vectorItems(input);
  if (items) return { comps: items.map((s) => parseExpr(s.trim())), ijk: false };
  const n = parseExpr(input);
  const dims = ijkDims(n);
  if (!dims) throw new ParseError('Write a vector like <1, 2, 3> or i + 2j + 3k');
  // The expression is linear in i, j, k, so component d = value(d = 1, others 0) - value(all 0).
  const names = ['i', 'j', 'k'].slice(0, dims);
  const zero = Object.fromEntries(names.map((d) => [d, 0]));
  const comps = names.map((d): Node => ({
    type: 'bin', op: '-', left: substitute(n, { ...zero, [d]: 1 }), right: substitute(n, zero),
  }));
  return { comps, ijk: true };
}

function checkVector(a: VectorAnswer, input: string): CheckResult {
  const exp = vectorComponents(a.value);
  let got: { comps: Node[]; ijk: boolean };
  try {
    got = vectorComponents(input);
  } catch (e) {
    if (e instanceof ParseError) return { correct: false, parseError: e.message };
    throw e;
  }
  // "3i + 4j" is <3, 4, 0> when the answer lives in space.
  const zero: Node = { type: 'num', value: 0, raw: '0' };
  const n = Math.max(exp.comps.length, got.comps.length);
  if (exp.comps.length !== got.comps.length && !(exp.ijk || got.ijk)) {
    return wrong(`Expected ${exp.comps.length} components, you gave ${got.comps.length}.`);
  }
  const pad = (c: Node[]) => [...c, ...Array(n - c.length).fill(zero)];
  const ec = pad(exp.comps);
  const gc = pad(got.comps);
  const rel = Math.max(1e-6, decimalRel(a.value), decimalRel(input));
  const abs = Math.max(decimalTolerance(a.value), decimalTolerance(input), 1e-10);
  const correct = ec.every((e, i) => {
    const g = gc[i];
    if (freeVars(e).size === 0 && freeVars(g).size === 0) return close(evaluate(e), evaluate(g), rel, abs);
    return equivalent(e, g, { rel }).equal;
  });
  return { correct };
}

function substitute(n: Node, values: Record<string, number>): Node {
  switch (n.type) {
    case 'sym':
      return n.name in values ? { type: 'num', value: values[n.name], raw: String(values[n.name]) } : n;
    case 'num': return n;
    case 'neg': case 'fact': case 'abs': return { ...n, arg: substitute(n.arg, values) };
    case 'bin': return { ...n, left: substitute(n.left, values), right: substitute(n.right, values) };
    case 'call': return { ...n, args: n.args.map((x) => substitute(x, values)) };
  }
}

function matrixRows(input: string): string[][] | null {
  const src = normalize(input).trim();
  const inner = stripOuter(src, [['[', ']'], ['(', ')']]);
  if (inner === null) return null;
  if (inner.includes(';')) return inner.split(';').map((r) => splitTopLevel(r.trim(), /\s*,\s*|\s+/).filter(Boolean));
  const rows = splitTopLevel(inner, ',').map((r) => stripOuter(r.trim(), [['[', ']'], ['(', ')']]));
  if (rows.some((r) => r === null)) return null;
  return rows.map((r) => splitTopLevel(r!, ','));
}

function checkMatrix(a: MatrixAnswer, input: string): CheckResult {
  const exp = matrixRows(a.value);
  if (!exp) throw new Error(`Bad matrix answer: ${a.value}`);
  const got = matrixRows(input);
  if (!got) return { correct: false, parseError: 'Write a matrix like [[1, 2], [3, 4]]' };
  if (got.length !== exp.length || got.some((r, i) => r.length !== exp[i].length)) {
    return wrong(`Expected a ${exp.length}×${exp[0].length} matrix.`);
  }
  for (let i = 0; i < exp.length; i++) {
    const r = componentsEqual(exp[i], got[i], true);
    if (!r.correct) return r.parseError ? r : wrong();
  }
  return { correct: true };
}

function normText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function checkText(a: TextAnswer, input: string): CheckResult {
  const accepted = a.value.split('|').map(normText);
  return { correct: accepted.includes(normText(input)) };
}

function checkChoice(a: ChoiceAnswer, input: string): CheckResult {
  const idx = Number(input);
  return { correct: Number.isInteger(idx) && idx === a.correct };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function checkSingle(a: SingleAnswer, input: string): CheckResult {
  if (!input.trim()) return { correct: false, parseError: 'Type an answer first' };
  try {
    switch (a.kind) {
      case 'number': return checkNumber(a, input);
      case 'expression': return checkExpression(a, input);
      case 'equation': return checkEquation(a, input);
      case 'set': return checkSet(a, input);
      case 'list': return checkList(a, input);
      case 'vector': return checkVector(a, input);
      case 'matrix': return checkMatrix(a, input);
      case 'text': return checkText(a, input);
      case 'choice': return checkChoice(a, input);
    }
  } catch (e) {
    if (e instanceof ParseError) return { correct: false, parseError: e.message };
    throw e;
  }
}

/**
 * Check a student's input against an answer spec.
 * Multi-part answers take one input string per part.
 */
export function check(a: Answer, input: string | string[]): CheckResult {
  if (a.kind === 'multi') {
    const inputs = Array.isArray(input) ? input : [input];
    const parts = a.parts.map((p, i) => checkSingle(p.answer, inputs[i] ?? ''));
    const parseError = parts.find((p) => p.parseError)?.parseError;
    return { correct: parts.every((p) => p.correct), parts, ...(parseError ? { parseError } : {}) };
  }
  return checkSingle(a, Array.isArray(input) ? input[0] ?? '' : input);
}
