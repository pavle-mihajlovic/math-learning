import type { Node } from './ast';

const FN_TEX: Record<string, string> = {
  sin: '\\sin', cos: '\\cos', tan: '\\tan', sec: '\\sec', csc: '\\csc', cot: '\\cot',
  arcsin: '\\sin^{-1}', arccos: '\\cos^{-1}', arctan: '\\tan^{-1}',
  arcsec: '\\sec^{-1}', arccsc: '\\csc^{-1}', arccot: '\\cot^{-1}',
  sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh', coth: '\\coth',
  sech: '\\operatorname{sech}', csch: '\\operatorname{csch}',
  arcsinh: '\\sinh^{-1}', arccosh: '\\cosh^{-1}', arctanh: '\\tanh^{-1}',
  arcsech: '\\operatorname{sech}^{-1}', arccsch: '\\operatorname{csch}^{-1}', arccoth: '\\coth^{-1}',
  ln: '\\ln', log: '\\log', exp: '\\exp', floor: '\\operatorname{floor}', ceil: '\\operatorname{ceil}',
  sgn: '\\operatorname{sgn}',
};

const GREEK_TEX = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda',
  'mu', 'nu', 'xi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Sigma', 'Phi', 'Psi', 'Omega',
]);

function symTex(name: string): string {
  if (name === 'pi') return '\\pi';
  if (name === 'inf') return '\\infty';
  const primes = (/'+$/.exec(name)?.[0] ?? '');
  let base = name.slice(0, name.length - primes.length);
  let sub = '';
  const u = base.indexOf('_');
  if (u >= 0) {
    sub = base.slice(u + 1);
    base = base.slice(0, u);
  }
  let tex = GREEK_TEX.has(base) ? '\\' + base : base.length > 1 ? `\\mathrm{${base}}` : base;
  if (sub) tex += `_{${GREEK_TEX.has(sub) ? '\\' + sub : sub}}`;
  return tex + primes;
}

// Precedence: higher binds tighter.
function prec(n: Node): number {
  switch (n.type) {
    case 'bin':
      if (n.op === '+' || n.op === '-') return 1;
      if (n.op === '*' || n.op === '/') return 2;
      return 4;
    case 'neg': return 3;
    case 'num': return n.raw.startsWith('-') ? 3 : 6;
    case 'fact': return 5;
    default: return 6;
  }
}

function wrap(tex: string): string {
  return `\\left(${tex}\\right)`;
}

/** Render the tree as LaTeX, keeping the parentheses the user typed where they matter. */
export function toLatex(n: Node): string {
  switch (n.type) {
    case 'num': return n.raw;
    case 'sym': return symTex(n.name);
    case 'neg': {
      const inner = toLatex(n.arg);
      return '-' + (prec(n.arg) <= 3 && n.arg.type !== 'neg' ? wrap(inner) : inner);
    }
    case 'abs': return `\\left|${toLatex(n.arg)}\\right|`;
    case 'fact': return (prec(n.arg) < 6 ? wrap(toLatex(n.arg)) : toLatex(n.arg)) + '!';
    case 'call': {
      if (n.fn === 'sqrt') return `\\sqrt{${toLatex(n.args[0])}}`;
      if (n.fn === 'cbrt') return `\\sqrt[3]{${toLatex(n.args[0])}}`;
      if (n.fn === 'root') return `\\sqrt[${toLatex(n.args[1])}]{${toLatex(n.args[0])}}`;
      if (n.fn === 'abs') return `\\left|${toLatex(n.args[0])}\\right|`;
      if (n.fn === 'log' && n.args.length === 2) {
        return `\\log_{${toLatex(n.args[0])}}${wrap(toLatex(n.args[1]))}`;
      }
      return `${FN_TEX[n.fn] ?? `\\operatorname{${n.fn}}`}${wrap(n.args.map(toLatex).join(', '))}`;
    }
    case 'bin': {
      const { op, left, right } = n;
      if (op === '/') return `\\frac{${toLatex(left)}}{${toLatex(right)}}`;
      if (op === '^') {
        let base = toLatex(left);
        if (prec(left) < 6 || left.type === 'call') {
          // (sin x)^2 reads better as sin^2 x.
          if (left.type === 'call' && FN_TEX[left.fn] && !FN_TEX[left.fn].includes('^')) {
            return `${FN_TEX[left.fn]}^{${toLatex(right)}}${wrap(left.args.map(toLatex).join(', '))}`;
          }
          if (!(left.type === 'call' && ['sqrt', 'cbrt', 'root', 'abs'].includes(left.fn))) base = wrap(base);
        }
        return `${base}^{${toLatex(right)}}`;
      }
      const p = prec(n);
      let l = toLatex(left);
      let r = toLatex(right);
      if (prec(left) < p) l = wrap(l);
      if (op === '-' ? prec(right) <= p : prec(right) < p) r = wrap(r);
      else if (op === '+' && right.type === 'neg') r = wrap(r);
      if (op === '+') return `${l}+${r}`;
      if (op === '-') return `${l}-${r}`;
      // Multiplication: juxtapose unless that would glue two numbers together.
      if (right.type === 'neg') r = wrap(toLatex(right));
      const needsDot = !n.implicit || /^[0-9.]/.test(r) || (right.type === 'num') || r.startsWith('-');
      return needsDot ? `${l} \\cdot ${r}` : `${l}${/^[a-zA-Z]/.test(r) && /\\[a-zA-Z]+$/.test(l) ? ' ' : ''}${r}`;
    }
  }
}
