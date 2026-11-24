/** Expression tree produced by the plain-text parser. */
export type Node =
  | { type: 'num'; value: number; raw: string; paren?: boolean }
  | { type: 'sym'; name: string; paren?: boolean }
  | { type: 'neg'; arg: Node; paren?: boolean }
  | { type: 'bin'; op: '+' | '-' | '*' | '/' | '^'; left: Node; right: Node; implicit?: boolean; paren?: boolean }
  | { type: 'call'; fn: string; args: Node[]; paren?: boolean }
  | { type: 'fact'; arg: Node; paren?: boolean }
  | { type: 'abs'; arg: Node; paren?: boolean };

/** Functions the parser knows. Value = number of arguments (-1 = 1 or 2). */
export const FUNCTIONS: Record<string, number> = {
  sin: 1, cos: 1, tan: 1, sec: 1, csc: 1, cot: 1,
  arcsin: 1, arccos: 1, arctan: 1, arcsec: 1, arccsc: 1, arccot: 1,
  sinh: 1, cosh: 1, tanh: 1, sech: 1, csch: 1, coth: 1,
  arcsinh: 1, arccosh: 1, arctanh: 1, arcsech: 1, arccsch: 1, arccoth: 1,
  ln: 1, log: -1, exp: 1, sqrt: 1, cbrt: 1, root: 2, abs: 1,
  floor: 1, ceil: 1, sgn: 1,
};

/** Spellings that map onto a canonical function name. */
export const FUNCTION_ALIASES: Record<string, string> = {
  asin: 'arcsin', acos: 'arccos', atan: 'arctan', asec: 'arcsec', acsc: 'arccsc', acot: 'arccot',
  asinh: 'arcsinh', acosh: 'arccosh', atanh: 'arctanh', asech: 'arcsech', acsch: 'arccsch', acoth: 'arccoth',
  arsinh: 'arcsinh', arcosh: 'arccosh', artanh: 'arctanh',
  cosec: 'csc', tg: 'tan', ctg: 'cot', nthroot: 'root', sign: 'sgn',
};

/** Trig/hyperbolic names whose `^-1` means the inverse function. */
export const INVERTIBLE = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'sech', 'csch', 'coth',
]);

/** Multi-letter symbols that are read as one name. */
export const GREEK = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda',
  'mu', 'nu', 'xi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Sigma', 'Phi', 'Psi', 'Omega',
];

export const CONSTANTS = ['pi', 'e', 'inf'];

export function freeVars(n: Node, out = new Set<string>()): Set<string> {
  switch (n.type) {
    case 'sym':
      if (!CONSTANTS.includes(n.name)) out.add(n.name);
      break;
    case 'neg': case 'fact': case 'abs':
      freeVars(n.arg, out);
      break;
    case 'bin':
      freeVars(n.left, out);
      freeVars(n.right, out);
      break;
    case 'call':
      n.args.forEach((a) => freeVars(a, out));
      break;
  }
  return out;
}

export function containsSym(n: Node, name: string): boolean {
  switch (n.type) {
    case 'sym': return n.name === name;
    case 'num': return false;
    case 'neg': case 'fact': case 'abs': return containsSym(n.arg, name);
    case 'bin': return containsSym(n.left, name) || containsSym(n.right, name);
    case 'call': return n.args.some((a) => containsSym(a, name));
  }
}
