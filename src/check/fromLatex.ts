/**
 * Convert the LaTeX a visual editor (MathLive) produces into the plain-text answer syntax,
 * so both input modes go through the same checker.
 */

type Tok = { t: 'cmd'; v: string } | { t: 'ch'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
      if (!m) { i++; continue; }
      out.push({ t: 'cmd', v: m[1] });
      i += m[0].length;
      continue;
    }
    out.push({ t: 'ch', v: c });
    i++;
  }
  return out;
}

const SIMPLE: Record<string, string> = {
  cdot: '*', times: '*', ast: '*', div: '/',
  pi: ' pi ', infty: ' inf ', infin: ' inf ',
  le: '<=', leq: '<=', ge: '>=', geq: '>=', ne: '!=', neq: '!=', lt: '<', gt: '>',
  cup: ' U ', emptyset: '{}', varnothing: '{}',
  langle: '<', rangle: '>', lbrack: '[', rbrack: ']', lbrace: '{', rbrace: '}',
  vert: '|', lvert: '|', rvert: '|', mid: '|',
  '{': '{', '}': '}', '|': '|',
  ',': ' ', ';': ' ', ':': ' ', '!': '', ' ': ' ', quad: ' ', qquad: ' ',
  exponentialE: 'e', imaginaryI: 'i', differentialD: 'd', prime: "'",
  to: '->', rightarrow: '->',
};

const FUNCS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'arcsec', 'arccsc', 'arccot',
  'sinh', 'cosh', 'tanh', 'coth', 'sech', 'csch', 'ln', 'log', 'exp', 'lg',
]);

const GREEK = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota',
  'kappa', 'lambda', 'mu', 'nu', 'xi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi',
  'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Sigma', 'Phi', 'Psi', 'Omega',
]);

class Conv {
  i = 0;
  constructor(public toks: Tok[]) {}

  peek(): Tok | undefined { return this.toks[this.i]; }

  /** Read one argument: a {group} or a single token. */
  arg(): string {
    const t = this.toks[this.i];
    if (!t) return '';
    if (t.t === 'ch' && t.v === '{') {
      this.i++;
      return this.seq('}');
    }
    if (t.t === 'ch' && /\s/.test(t.v)) { this.i++; return this.arg(); }
    this.i++;
    return this.one(t);
  }

  /** Read a raw group's text without converting (for \text, \operatorname, \mathrm). */
  rawGroup(): string {
    const t = this.toks[this.i];
    if (!t || t.t !== 'ch' || t.v !== '{') return '';
    this.i++;
    let depth = 1;
    let s = '';
    while (this.i < this.toks.length) {
      const x = this.toks[this.i++];
      if (x.t === 'ch' && x.v === '{') depth++;
      if (x.t === 'ch' && x.v === '}') { depth--; if (depth === 0) break; }
      s += x.t === 'cmd' ? (SIMPLE[x.v] ?? x.v) : x.v;
    }
    return s;
  }

  optional(): string | null {
    const t = this.toks[this.i];
    if (!t || t.t !== 'ch' || t.v !== '[') return null;
    this.i++;
    return this.seq(']');
  }

  seq(end?: string, stopAtEnd = false): string {
    let s = '';
    while (this.i < this.toks.length) {
      const t = this.toks[this.i];
      if (end && t.t === 'ch' && t.v === end) { this.i++; return s; }
      if ((end || stopAtEnd) && t.t === 'cmd' && t.v === 'end') return s;
      this.i++;
      s += this.one(t);
    }
    return s;
  }

  one(t: Tok): string {
    if (t.t === 'ch') {
      if (t.v === '^') {
        const a = this.arg();
        return a === "'" ? "'" : `^(${a})`;
      }
      if (t.v === '_') {
        const a = this.arg().trim();
        return /^[A-Za-z0-9]+$/.test(a) ? `_${a}` : `_{${a}}`;
      }
      if (t.v === '{') return '(' + this.seq('}') + ')';
      if (t.v === '~') return ' ';
      return t.v;
    }
    const v = t.v;
    if (v in SIMPLE) return SIMPLE[v];
    if (FUNCS.has(v)) return ` ${v === 'lg' ? 'log' : v} `;
    if (GREEK.has(v)) return ` ${v.replace(/^var/, '')} `;
    switch (v) {
      case 'frac': case 'dfrac': case 'tfrac': {
        const a = this.arg();
        const b = this.arg();
        return `((${a})/(${b}))`;
      }
      case 'sqrt': {
        const n = this.optional();
        const a = this.arg();
        return n ? `root(${a}, ${n})` : `sqrt(${a})`;
      }
      case 'left': case 'right': case 'bigl': case 'bigr': case 'Bigl': case 'Bigr': case 'big': case 'Big': {
        const d = this.toks[this.i++];
        if (!d) return '';
        if (d.t === 'ch') return d.v === '.' ? '' : d.v;
        return SIMPLE[d.v] ?? '';
      }
      case 'operatorname': case 'mathrm': case 'text': case 'textrm': case 'mathit': case 'mathbf':
      case 'boldsymbol': case 'vec': case 'hat': case 'mathbb': {
        const raw = this.rawGroup();
        if (v === 'mathbb' && raw === 'R') return 'R';
        if (v === 'vec' || v === 'hat' || v === 'mathbf' || v === 'boldsymbol') return raw;
        return ` ${raw} `;
      }
      case 'placeholder': this.rawGroup(); return '';
      case 'begin': {
        const env = this.rawGroup();
        if (/matrix$/.test(env)) {
          const body = this.seq(undefined, true);
          this.i++; // \end
          this.rawGroup();
          const rows = body.split('\\\\').map((r) => r.split('&').map((c) => c.trim()));
          return '[' + rows.map((r) => `[${r.join(', ')}]`).join(', ') + ']';
        }
        return '';
      }
      case '\\': return '\\\\';
      case 'degree': case 'circ': return '';
      default: return ' ';
    }
  }
}

export function latexToPlain(latex: string): string {
  const toks = tokenize(latex);
  // Inside matrix bodies keep the row separator; everywhere else it is meaningless.
  const out = new Conv(toks).seq();
  return out
    .replace(/\s+/g, ' ')
    .replace(/\s+([_^])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}
