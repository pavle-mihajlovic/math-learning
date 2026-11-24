import { describe, expect, it } from 'vitest';
import { check, evaluate, latexToPlain, parseExpr, parseSet, previewLatex, readSpecial, toLatex } from './index';
import type { Answer, SingleAnswer } from './index';

const ok = (a: Answer, input: string | string[]) => check(a, input).correct;
const num = (value: string, extra: Partial<SingleAnswer> = {}): SingleAnswer => ({ kind: 'number', value, ...extra } as SingleAnswer);
const expr = (value: string, extra: Record<string, unknown> = {}): SingleAnswer => ({ kind: 'expression', value, ...extra } as SingleAnswer);
const ev = (s: string, env: Record<string, number> = {}) => evaluate(parseExpr(s), env);

describe('parser and evaluator', () => {
  const cases: [string, number, Record<string, number>?][] = [
    ['1+2*3', 7],
    ['(1+2)*3', 9],
    ['2^3^2', 512],
    ['-2^2', -4],
    ['(-2)^2', 4],
    ['2^-1', 0.5],
    ['2x', 6, { x: 3 }],
    ['2(x+1)', 8, { x: 3 }],
    ['(x+1)(x-1)', 8, { x: 3 }],
    ['x(x+1)', 12, { x: 3 }],
    ['3!', 6],
    ['0!', 1],
    ['sqrt(16)', 4],
    ['sqrt 16', 4],
    ['cbrt(-27)', -3],
    ['root(32, 5)', 2],
    ['(-8)^(1/3)', -2],
    ['|-3|', 3],
    ['abs(-3)', 3],
    ['|x-5|', 2, { x: 3 }],
    ['2|x|', 6, { x: -3 }],
    ['|x||y|', 6, { x: -2, y: 3 }],
    ['pi', Math.PI],
    ['2pi', 2 * Math.PI],
    ['e', Math.E],
    ['e^2', Math.E ** 2],
    ['e^x', Math.E ** 2, { x: 2 }],
    ['exp(1)', Math.E],
    ['ln(e)', 1],
    ['ln e^2', 2],
    ['log(100)', 2],
    ['log_2(8)', 3],
    ['log_2 8', 3],
    ['log(2, 8)', 3],
    ['sin(pi/2)', 1],
    ['sin pi/2', 0],
    ['sin x cos x', Math.sin(1) * Math.cos(1), { x: 1 }],
    ['sin 2x', Math.sin(2), { x: 1 }],
    ['sin^2 x + cos^2 x', 1, { x: 0.7 }],
    ['sin^2(x)', Math.sin(0.7) ** 2, { x: 0.7 }],
    ['sin(x)^2', Math.sin(0.7) ** 2, { x: 0.7 }],
    ['sin^-1(1)', Math.PI / 2],
    ['arcsin(1)', Math.PI / 2],
    ['asin(1)', Math.PI / 2],
    ['tan^-1 1', Math.PI / 4],
    ['sec(0)', 1],
    ['csc(pi/2)', 1],
    ['cot(pi/4)', 1],
    ['sinh(0)', 0],
    ['cosh 0', 1],
    ['xy', 6, { x: 2, y: 3 }],
    ['x y', 6, { x: 2, y: 3 }],
    ['2xy^2', 36, { x: 2, y: 3 }],
    ['theta', 0.5, { theta: 0.5 }],
    ['2theta', 1, { theta: 0.5 }],
    ['sin theta', Math.sin(0.5), { theta: 0.5 }],
    ['x_1 + x_2', 3, { x_1: 1, x_2: 2 }],
    ['1/2x', 1.5, { x: 3 }],
    ['1/(2x)', 1 / 6, { x: 3 }],
    ['.5', 0.5],
    ['3.25', 3.25],
    ['[x+1]^2', 16, { x: 3 }],
    ['{x+1}^2', 16, { x: 3 }],
    ['x**2', 9, { x: 3 }],
  ];
  for (const [src, want, env] of cases) {
    it(`evaluates ${src}`, () => {
      expect(ev(src, env ?? {})).toBeCloseTo(want, 10);
    });
  }

  it('reads Unicode input', () => {
    expect(ev('2·3')).toBe(6);
    expect(ev('6÷3')).toBe(2);
    expect(ev('5 − 2')).toBe(3);
    expect(ev('x²', { x: 3 })).toBe(9);
    expect(ev('x³', { x: 2 })).toBe(8);
    expect(ev('√4')).toBe(2);
    expect(ev('π')).toBeCloseTo(Math.PI);
    expect(ev('2θ', { theta: 1 })).toBe(2);
    expect(ev('x⁻¹', { x: 4 })).toBe(0.25);
  });

  const errors = ['', '(', '1+', '2)', 'x +* 2', 'sin', '3 4', 'log_(2)', '1,2', '#'];
  for (const src of errors) {
    it(`rejects "${src}"`, () => {
      expect(() => parseExpr(src)).toThrow();
    });
  }
});

describe('number answers', () => {
  it('accepts equal forms', () => {
    expect(ok(num('1/2'), '0.5')).toBe(true);
    expect(ok(num('1/2'), '2/4')).toBe(true);
    expect(ok(num('sqrt(2)/2'), '1/sqrt(2)')).toBe(true);
    expect(ok(num('-3/5'), '-0.6')).toBe(true);
    expect(ok(num('-3/5'), '- 3/5')).toBe(true);
    expect(ok(num('pi/4'), 'arctan(1)')).toBe(true);
    expect(ok(num('e^2'), 'exp(2)')).toBe(true);
    expect(ok(num('8'), '2^3')).toBe(true);
  });
  it('rejects different numbers', () => {
    expect(ok(num('1/2'), '0.4')).toBe(false);
    expect(ok(num('-3/5'), '3/5')).toBe(false);
    expect(ok(num('pi'), '3')).toBe(false);
    expect(ok(num('1/3'), '0.3')).toBe(false);
    expect(ok(num('1/3'), '0.33')).toBe(false);
  });
  it('accepts rounded decimals with enough digits', () => {
    expect(ok(num('1/3'), '0.333')).toBe(true);
    expect(ok(num('pi'), '3.14')).toBe(true);
    expect(ok(num('pi'), '3.1416')).toBe(true);
    expect(ok(num('pi'), '3.15')).toBe(false);
    expect(ok(num('sqrt(2)'), '1.414')).toBe(true);
    expect(ok(num('sqrt(2)'), '1.413')).toBe(false);
  });
  it('accepts exact values for a rounded book answer', () => {
    expect(ok(num('1.414'), 'sqrt(2)')).toBe(true);
    expect(ok(num('0.785'), 'pi/4')).toBe(true);
    expect(ok(num('2.718'), 'e')).toBe(true);
    expect(ok(num('2.718'), '3')).toBe(false);
  });
  it('honors explicit tolerance', () => {
    expect(ok(num('100', { tolerance: { abs: 1 } } as Partial<SingleAnswer>), '100.9')).toBe(true);
    expect(ok(num('100', { tolerance: { abs: 1 } } as Partial<SingleAnswer>), '101.5')).toBe(false);
    expect(ok(num('100', { tolerance: { rel: 0.05 } } as Partial<SingleAnswer>), '104')).toBe(true);
  });
  it('handles DNE and infinity', () => {
    expect(ok(num('DNE'), 'DNE')).toBe(true);
    expect(ok(num('DNE'), 'dne')).toBe(true);
    expect(ok(num('DNE'), 'does not exist')).toBe(true);
    expect(ok(num('DNE'), 'undefined')).toBe(true);
    expect(ok(num('DNE'), '0')).toBe(false);
    expect(ok(num('DNE'), 'inf')).toBe(false);
    expect(ok(num('inf'), '∞')).toBe(true);
    expect(ok(num('inf'), 'infinity')).toBe(true);
    expect(ok(num('inf'), '+inf')).toBe(true);
    expect(ok(num('inf'), '-inf')).toBe(false);
    expect(ok(num('-inf'), '-∞')).toBe(true);
    expect(ok(num('-inf'), '−∞')).toBe(true);
    expect(ok(num('3'), 'DNE')).toBe(false);
  });
  it('asks for the direction when infinity is answered as DNE', () => {
    expect(check(num('inf'), 'DNE').feedback).toMatch(/∞/);
  });
  it('reports a variable in a number answer as a parse problem', () => {
    const r = check(num('2'), 'x+1');
    expect(r.correct).toBe(false);
    expect(r.parseError).toMatch(/number/);
  });
  it('reports unreadable input without marking it wrong', () => {
    const r = check(num('2'), '2+');
    expect(r.parseError).toBeTruthy();
  });
  it('empty input is a parse error', () => {
    expect(check(num('2'), '  ').parseError).toBeTruthy();
  });
});

describe('expression answers', () => {
  const same: [string, string][] = [
    ['x^2 + 2x + 1', '(x+1)^2'],
    ['2x', 'x + x'],
    ['2x', 'x*2'],
    ['1/x', 'x^-1'],
    ['sqrt(x)', 'x^(1/2)'],
    ['sin(2x)', '2 sin x cos x'],
    ['cos(2x)', '1 - 2sin^2 x'],
    ['ln(x^2)', '2 ln(x)'],
    ['e^(2x)', '(e^x)^2'],
    ['(x^2-1)/(x-1)', 'x + 1'],
    ['3x^2 - 4x + 1', '1 - 4x + 3x^2'],
    ['1/(1+x^2)', '(1+x^2)^(-1)'],
    ['tan x', 'sin x / cos x'],
    ['sec^2 x', '1 + tan^2 x'],
    ['x e^x', 'e^x x'],
    ['-6x + 9', '9 - 6x'],
    ['(1/3)x + 4', 'x/3 + 4'],
    ['x^3/3', '1/3 x^3'],
    ['2 sqrt(x)', 'sqrt(4x)'],
    ['|x|', 'sqrt(x^2)'],
    ['arctan(x)', 'tan^-1(x)'],
    ['log_2(x)', 'ln(x)/ln(2)'],
    ['x y^2', 'y^2 x'],
    ['3t^2 - 2', '3 t^2 - 2'],
    ['cosh^2 x - sinh^2 x', '1'],
  ];
  for (const [a, b] of same) {
    it(`${a} ≡ ${b}`, () => expect(ok(expr(a), b)).toBe(true));
  }
  const diff: [string, string][] = [
    ['x^2', '2x'],
    ['sin x', 'cos x'],
    ['x + 1', 'x - 1'],
    ['2x', '2y'],
    ['1/(2x)', '1/2x'],
    ['e^x', 'x^e'],
    ['ln x', 'log x'],
    ['x^3/3', 'x^3/3 + 1'],
    ['sqrt(x+1)', 'sqrt(x) + 1'],
    ['(x+1)^2', 'x^2 + 1'],
  ];
  for (const [a, b] of diff) {
    it(`${a} ≢ ${b}`, () => expect(ok(expr(a), b)).toBe(false));
  }
  it('strips "f(x) =" and "y =" from the input', () => {
    expect(ok(expr('2x'), 'f(x) = 2x')).toBe(true);
    expect(ok(expr('2x'), "f'(x) = 2x")).toBe(true);
    expect(ok(expr('2x'), 'y = x + x')).toBe(true);
    expect(ok(expr('2x'), 'dy/dx = 2x')).toBe(true);
  });
  it('uses the domain hint for expressions defined on part of the line', () => {
    expect(ok(expr('sqrt(x - 50)', { domain: { x: [50, 100] } }), '(x-50)^(1/2)')).toBe(true);
    expect(ok(expr('sqrt(x - 50)'), '(x-50)^(1/2)')).toBe(true);
  });
  it('points out variables the answer does not use', () => {
    expect(check(expr('2x'), '2t').feedback).toMatch(/t/);
  });
  it('accepts rounded coefficients against a decimal book answer', () => {
    expect(ok(expr('0.333x + 1.25'), 'x/3 + 5/4')).toBe(true);
    expect(ok(expr('0.333x + 1.25'), 'x/2 + 5/4')).toBe(false);
  });
});

describe('antiderivatives (+C)', () => {
  const anti = (v: string) => expr(v, { constant: true });
  it('accepts any constant offset with +C', () => {
    expect(ok(anti('x^3/3 + C'), 'x^3/3 + C')).toBe(true);
    expect(ok(anti('x^3/3 + C'), '1/3 x^3 + 5 + C')).toBe(true);
    expect(ok(anti('x^3/3'), 'x^3/3 + C')).toBe(true);
    expect(ok(anti('-cos x + C'), 'C - cos(x)')).toBe(true);
    expect(ok(anti('sin^2 x / 2 + C'), '-cos^2 x / 2 + C')).toBe(true);
    expect(ok(anti('ln|x| + C'), 'ln(|x|) + K')).toBe(true);
  });
  it('requires the constant', () => {
    const r = check(anti('x^3/3 + C'), 'x^3/3');
    expect(r.correct).toBe(false);
    expect(r.feedback).toMatch(/\+C/);
  });
  it('rejects wrong antiderivatives', () => {
    expect(ok(anti('x^3/3 + C'), 'x^3 + C')).toBe(false);
    expect(ok(anti('-cos x + C'), 'cos x + C')).toBe(false);
  });
});

describe('equation answers', () => {
  const eq = (value: string): SingleAnswer => ({ kind: 'equation', value });
  it('accepts the same line written differently', () => {
    expect(ok(eq('y = -6x + 9'), 'y = -6x + 9')).toBe(true);
    expect(ok(eq('y = -6x + 9'), 'y = 9 - 6x')).toBe(true);
    expect(ok(eq('y = -6x + 9'), '6x + y = 9')).toBe(true);
    expect(ok(eq('y = -6x + 9'), '2y = -12x + 18')).toBe(true);
    expect(ok(eq('y = -6x + 9'), '-6x + 9')).toBe(true);
    expect(ok(eq('y - 5 = -3/5 (x + 4)'), 'y = -3/5 x + 13/5')).toBe(true);
    expect(ok(eq('x^2 + y^2 = 4'), 'y^2 = 4 - x^2')).toBe(true);
  });
  it('rejects different equations', () => {
    expect(ok(eq('y = -6x + 9'), 'y = -6x + 8')).toBe(false);
    expect(ok(eq('y = -6x + 9'), 'y = 6x + 9')).toBe(false);
    expect(ok(eq('x^2 + y^2 = 4'), 'x^2 + y^2 = 2')).toBe(false);
  });
  it('accepts vertical lines', () => {
    expect(ok(eq('x = 3'), 'x = 3')).toBe(true);
    expect(ok(eq('x = 3'), 'x - 3 = 0')).toBe(true);
    expect(ok(eq('x = 3'), 'x = 4')).toBe(false);
  });
  it('asks for "=" when the left side is not a single name', () => {
    expect(check(eq('x^2 + y^2 = 4'), 'x^2 + y^2').parseError).toBeTruthy();
  });
});

describe('sets and intervals', () => {
  const set = (value: string): SingleAnswer => ({ kind: 'set', value });
  const yes: [string, string][] = [
    ['(-inf, 2]', '(-∞, 2]'],
    ['(-inf, 2]', 'x <= 2'],
    ['(-inf, 2]', 'x ≤ 2'],
    ['(-inf, 2]', '2 >= x'],
    ['[0, inf)', 'x >= 0'],
    ['(-inf, inf)', 'R'],
    ['(-inf, inf)', 'all real numbers'],
    ['(-inf, inf)', '(-∞, ∞)'],
    ['(-inf, 0) U (0, inf)', '(-inf,0)∪(0,inf)'],
    ['(-inf, 0) U (0, inf)', 'x != 0'],
    ['(-inf, 0) U (0, inf)', '(0, inf) U (-inf, 0)'],
    ['[-1, 2)', '-1 <= x < 2'],
    ['[-1, 2)', '[-1, 2)'],
    ['[0, 1] U [1, 2]', '[0, 2]'],
    ['{1, 2, 3}', '{3, 2, 1}'],
    ['{1, 2, 3}', '{1, 2, 3, 3}'],
    ['{}', '∅'],
    ['{}', 'no solution'],
    ['[0, pi]', '[0, 3.1416]'],
    ['(1/2, 3)', '(0.5, 3)'],
    ['{-2, 2}', '{2, -2}'],
  ];
  for (const [a, b] of yes) it(`${a} = ${b}`, () => expect(ok(set(a), b)).toBe(true));
  const no: [string, string][] = [
    ['(-inf, 2]', '(-inf, 2)'],
    ['(-inf, 2]', 'x < 2'],
    ['[0, inf)', '(0, inf)'],
    ['(-inf, 0) U (0, inf)', 'R'],
    ['{1, 2, 3}', '{1, 2}'],
    ['[-1, 2)', '[-1, 3)'],
    ['{}', '{0}'],
  ];
  for (const [a, b] of no) it(`${a} ≠ ${b}`, () => expect(ok(set(a), b)).toBe(false));
  it('hints at bracket type when only closedness differs', () => {
    expect(check(set('[0, 1]'), '(0, 1)').feedback).toMatch(/endpoints/);
  });
  it('merges overlapping intervals', () => {
    expect(parseSet('(0, 2) U (1, 3)')).toHaveLength(1);
    expect(parseSet('(0, 1) U (1, 2)')).toHaveLength(2);
  });
  it('reports reversed intervals', () => {
    expect(check(set('(0, 1)'), '(3, 1)').parseError).toBeTruthy();
  });
});

describe('lists', () => {
  const list = (value: string, ordered = false): SingleAnswer => ({ kind: 'list', value, ordered });
  it('ignores order', () => {
    expect(ok(list('-2, 3'), '3, -2')).toBe(true);
    expect(ok(list('-2, 3'), 'x = 3, x = -2')).toBe(true);
    expect(ok(list('-2, 3'), 'x = 3 or x = -2')).toBe(true);
    expect(ok(list('-2, 3'), '{3, -2}')).toBe(true);
    expect(ok(list('1/2, sqrt(2)'), '1.414, 0.5')).toBe(true);
  });
  it('counts items', () => {
    expect(ok(list('-2, 3'), '3')).toBe(false);
    expect(ok(list('-2, 3'), '3, -2, 4')).toBe(false);
    expect(check(list('-2, 3'), '3').feedback).toMatch(/2 values/);
  });
  it('respects order when asked', () => {
    expect(ok(list('1, 2', true), '1, 2')).toBe(true);
    expect(ok(list('1, 2', true), '2, 1')).toBe(false);
  });
  it('accepts expression items', () => {
    expect(ok(list('pi/6 + 2pi k, 5pi/6 + 2pi k'), '5pi/6 + 2k pi, pi/6 + 2pi k')).toBe(true);
  });
  it('accepts "none" for an empty list', () => {
    expect(ok(list('none'), 'no solution')).toBe(true);
  });
});

describe('vectors and points', () => {
  const vec = (value: string): SingleAnswer => ({ kind: 'vector', value });
  it('compares components', () => {
    expect(ok(vec('(1, 2)'), '(1, 2)')).toBe(true);
    expect(ok(vec('(1, 2)'), '(2, 1)')).toBe(false);
    expect(ok(vec('<1, -2, 3>'), '⟨1, −2, 3⟩')).toBe(true);
    expect(ok(vec('<1, -2, 3>'), '[1, -2, 3]')).toBe(true);
    expect(ok(vec('<1, -2, 3>'), '1, -2, 3')).toBe(true);
    expect(ok(vec('<1/2, sqrt(3)/2>'), '<0.5, 0.866>')).toBe(true);
    expect(ok(vec('<t, t^2>'), '<t, t*t>')).toBe(true);
    expect(ok(vec('<cos t, sin t>'), '<sin t, cos t>')).toBe(false);
  });
  it('accepts i, j, k notation', () => {
    expect(ok(vec('<2, -3, 1>'), '2i - 3j + k')).toBe(true);
    expect(ok(vec('<2, -3, 1>'), '2i + 3j + k')).toBe(false);
    expect(ok(vec('<3, 4>'), '3i + 4j')).toBe(true);
    expect(ok(vec('<t, 2t>'), 't i + 2t j')).toBe(true);
  });
  it('checks dimension', () => {
    expect(ok(vec('<1, 2, 3>'), '<1, 2>')).toBe(false);
  });
});

describe('matrices', () => {
  const mat = (value: string): SingleAnswer => ({ kind: 'matrix', value });
  it('compares entries', () => {
    expect(ok(mat('[[1, 2], [3, 4]]'), '[[1, 2], [3, 4]]')).toBe(true);
    expect(ok(mat('[[1, 2], [3, 4]]'), '[1, 2; 3, 4]')).toBe(true);
    expect(ok(mat('[[1, 2], [3, 4]]'), '[1 2; 3 4]')).toBe(true);
    expect(ok(mat('[[1, 2], [3, 4]]'), '[[1, 2], [4, 3]]')).toBe(false);
    expect(ok(mat('[[1, 2], [3, 4]]'), '[[1, 2, 0], [3, 4, 0]]')).toBe(false);
    expect(ok(mat('[[1/2, 0], [0, 1]]'), '[[0.5, 0], [0, 1]]')).toBe(true);
  });
});

describe('text, choice and multi-part', () => {
  it('text answers ignore case and punctuation', () => {
    const a: SingleAnswer = { kind: 'text', value: 'increasing|rising' };
    expect(ok(a, 'Increasing')).toBe(true);
    expect(ok(a, 'increasing.')).toBe(true);
    expect(ok(a, 'rising')).toBe(true);
    expect(ok(a, 'decreasing')).toBe(false);
  });
  it('choice answers compare the index', () => {
    const a: SingleAnswer = { kind: 'choice', options: ['even', 'odd', 'neither'], correct: 1 };
    expect(ok(a, '1')).toBe(true);
    expect(ok(a, '0')).toBe(false);
  });
  it('multi-part answers need every part', () => {
    const a: Answer = {
      kind: 'multi',
      parts: [
        { label: 'a', answer: { kind: 'number', value: '-1' } },
        { label: 'b', answer: { kind: 'text', value: 'decreasing' } },
      ],
    };
    expect(ok(a, ['-1', 'decreasing'])).toBe(true);
    expect(ok(a, ['-1', 'increasing'])).toBe(false);
    const r = check(a, ['1', 'decreasing']);
    expect(r.parts?.map((p) => p.correct)).toEqual([false, true]);
    expect(check(a, ['-1', '']).parseError).toBeTruthy();
  });
});

describe('special values', () => {
  it('reads DNE and infinities', () => {
    expect(readSpecial('DNE')).toBe('DNE');
    expect(readSpecial('Does not exist.')).toBe('DNE');
    expect(readSpecial('∞')).toBe('inf');
    expect(readSpecial('- infinity')).toBe('-inf');
    expect(readSpecial('2')).toBeNull();
  });
});

describe('LaTeX preview', () => {
  const tex = (s: string, kind?: Parameters<typeof previewLatex>[1]) => {
    const p = previewLatex(s, kind);
    if ('error' in p) throw new Error(p.error);
    return p.latex;
  };
  it('renders fractions, powers and roots', () => {
    expect(tex('1/2')).toBe('\\frac{1}{2}');
    expect(tex('x^2')).toBe('x^{2}');
    expect(tex('sqrt(x+1)')).toBe('\\sqrt{x+1}');
    expect(tex('(x+1)/(x-1)')).toBe('\\frac{x+1}{x-1}');
    expect(tex('root(x, 3)')).toBe('\\sqrt[3]{x}');
  });
  it('renders functions', () => {
    expect(tex('sin x')).toBe('\\sin\\left(x\\right)');
    expect(tex('sin^2 x')).toBe('\\sin^{2}\\left(x\\right)');
    expect(tex('arctan x')).toBe('\\tan^{-1}\\left(x\\right)');
    expect(tex('log_2(x)')).toBe('\\log_{2}\\left(x\\right)');
  });
  it('renders products and signs', () => {
    expect(tex('2x')).toBe('2x');
    expect(tex('2*3')).toBe('2 \\cdot 3');
    expect(tex('-(x+1)')).toBe('-\\left(x+1\\right)');
    expect(tex('x - (y - z)')).toBe('x-\\left(y-z\\right)');
    expect(tex('(x+1)(x-1)')).toBe('\\left(x+1\\right)\\left(x-1\\right)');
    expect(tex('pi theta')).toBe('\\pi\\theta');
  });
  it('renders relations, sets and vectors', () => {
    expect(tex('y = 2x')).toBe('y = 2x');
    expect(tex('x <= 2')).toBe('x \\le 2');
    expect(tex('(-inf, 2] U (3, inf)', 'set')).toBe('\\left(-\\infty, 2\\right] \\cup \\left(3, \\infty\\right)');
    expect(tex('<1, 2>', 'vector')).toBe('\\left\\langle 1, 2\\right\\rangle');
    expect(tex('DNE', 'number')).toBe('\\text{DNE}');
    expect(tex('[[1,2],[3,4]]', 'matrix')).toBe('\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}');
  });
  it('returns an error for unreadable input', () => {
    expect('error' in previewLatex('(x+')).toBe(true);
  });
  it('toLatex keeps nested exponents readable', () => {
    expect(toLatex(parseExpr('e^(x^2)'))).toBe('e^{x^{2}}');
    expect(toLatex(parseExpr('(x+1)^2'))).toBe('\\left(x+1\\right)^{2}');
  });
});

describe('LaTeX from the visual editor', () => {
  const cases: [string, string, Record<string, number>?][] = [
    ['\\frac{1}{2}', '0.5'],
    ['x^{2}', '9', { x: 3 }],
    ['\\sqrt{16}', '4'],
    ['\\sqrt[3]{27}', '3'],
    ['\\sin\\left(\\frac{\\pi}{2}\\right)', '1'],
    ['2\\cdot3', '6'],
    ['3\\times4', '12'],
    ['\\left|-5\\right|', '5'],
    ['e^{x}', String(Math.E), { x: 1 }],
    ['\\exponentialE^{x}', String(Math.E), { x: 1 }],
    ['\\ln\\left(e\\right)', '1'],
    ['\\log_{2}\\left(8\\right)', '3'],
    ['\\frac{x^2-1}{x-1}', '3', { x: 2 }],
    ['\\theta\\cdot2', '2', { theta: 1 }],
    ['x_{1}+x_2', '3', { x_1: 1, x_2: 2 }],
    ['\\sin^{-1}\\left(1\\right)', String(Math.PI / 2)],
    ['\\operatorname{sech}\\left(0\\right)', '1'],
    ['\\dfrac{3}{4}', '0.75'],
  ];
  for (const [latex, want, env] of cases) {
    it(`converts ${latex}`, () => {
      expect(ev(latexToPlain(latex), env ?? {})).toBeCloseTo(Number(want), 10);
    });
  }
  it('converts symbols used in sets, vectors and special answers', () => {
    expect(latexToPlain('\\infty')).toBe('inf');
    expect(latexToPlain('-\\infty')).toBe('- inf');
    expect(latexToPlain('\\left(-\\infty,2\\right]\\cup\\left(3,\\infty\\right)')).toBe('(- inf ,2] U (3, inf)');
    expect(latexToPlain('\\langle1,2\\rangle')).toBe('<1,2>');
    expect(latexToPlain('x\\le2')).toBe('x<=2');
    expect(latexToPlain('\\mathrm{DNE}')).toBe('DNE');
    expect(latexToPlain('\\text{DNE}')).toBe('DNE');
    expect(latexToPlain('\\emptyset')).toBe('{}');
    expect(latexToPlain('\\begin{pmatrix}1 & 2\\\\ 3 & 4\\end{pmatrix}')).toBe('[[1, 2], [3, 4]]');
  });
  it('round-trips through the checker', () => {
    expect(ok({ kind: 'set', value: '(-inf, 2] U (3, inf)' }, latexToPlain('\\left(-\\infty,2\\right]\\cup\\left(3,\\infty\\right)'))).toBe(true);
    expect(ok({ kind: 'expression', value: 'x^3/3', constant: true }, latexToPlain('\\frac{x^3}{3}+C'))).toBe(true);
    expect(ok({ kind: 'matrix', value: '[[1, 2], [3, 4]]' }, latexToPlain('\\begin{bmatrix}1 & 2\\\\ 3 & 4\\end{bmatrix}'))).toBe(true);
  });
});

describe('vectors written with unit vectors in the answer', () => {
  const vec = (value: string): SingleAnswer => ({ kind: 'vector', value });
  it('compares ijk answers with bracket input and back', () => {
    expect(ok(vec('3/4 i + ln(2) j + (1 - 1/e) k'), '<0.75, ln 2, 1 - e^-1>')).toBe(true);
    expect(ok(vec('-k'), '<0, 0, -1>')).toBe(true);
    expect(ok(vec('-k'), '-k')).toBe(true);
    expect(ok(vec('<3, 4, 0>'), '3i + 4j')).toBe(true);
    expect(ok(vec('-12/13 sin(4t) i + 12/13 cos(4t) j + 5/13 k'), '<-12/13 sin 4t, 12/13 cos 4t, 5/13>')).toBe(true);
    expect(ok(vec('-12/13 sin(4t) i + 12/13 cos(4t) j + 5/13 k'), '<12/13 sin 4t, 12/13 cos 4t, 5/13>')).toBe(false);
  });
  it('still rejects a wrong dimension for bracket vectors', () => {
    expect(ok(vec('<1, 2, 3>'), '<1, 2>')).toBe(false);
  });
});
