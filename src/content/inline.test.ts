import { describe, expect, it } from 'vitest';
import { parseInline, mathSegments } from './inline';
import { instantiateVariant } from './variant';
import { check } from '../check';

describe('inline format', () => {
  it('parses math, bold, italic and escapes', () => {
    expect(parseInline('a $x^2$ **b** *c* \\$5')).toEqual([
      { t: 'text', v: 'a ' },
      { t: 'math', v: 'x^2', display: false },
      { t: 'text', v: ' ' },
      { t: 'bold', v: [{ t: 'text', v: 'b' }] },
      { t: 'text', v: ' ' },
      { t: 'italic', v: [{ t: 'text', v: 'c' }] },
      { t: 'text', v: ' $5' },
    ]);
  });
  it('handles display math and newlines', () => {
    expect(parseInline('$$\\int f$$\nx')).toEqual([
      { t: 'math', v: '\\int f', display: true },
      { t: 'br' },
      { t: 'text', v: 'x' },
    ]);
  });
  it('closes italic before an adjacent bold run', () => {
    const toks = parseInline('*d***r**');
    expect(toks.map((t) => t.t)).toEqual(['italic', 'bold']);
  });
  it('keeps escaped dollars inside math', () => {
    expect(mathSegments('$a\\$b$')).toEqual([{ tex: 'a\\$b', display: false }]);
  });
  it('throws on unclosed markup', () => {
    expect(() => parseInline('$x')).toThrow();
    expect(() => parseInline('**x')).toThrow();
  });
});

describe('variants', () => {
  const v = {
    params: { a: { min: 2, max: 9 }, b: { choices: [2, 3, 4] } },
    prompt: [{ type: 'p' as const, text: 'Differentiate $f(x) = {{a}}x^{ {{b}} }$.' }],
    answer: { kind: 'expression' as const, value: '{{a*b}} x^({{b-1}})' },
  };
  it('fills prompt and answer consistently', () => {
    for (let seed = 1; seed < 20; seed++) {
      const inst = instantiateVariant(v, seed);
      const { a, b } = inst.params;
      expect(inst.prompt[0]).toEqual({ type: 'p', text: `Differentiate $f(x) = ${a}x^{ ${b} }$.` });
      expect(check(inst.answer, `${a * b}x^${b - 1}`).correct).toBe(true);
    }
  });
  it('is deterministic per seed', () => {
    expect(instantiateVariant(v, 7).params).toEqual(instantiateVariant(v, 7).params);
  });
  it('wraps negative values in answers', () => {
    const w = { params: { a: { choices: [-3] } }, prompt: [], answer: { kind: 'expression' as const, value: 'x^2 - {{a}}x' } };
    expect(instantiateVariant(w, 1).answer).toEqual({ kind: 'expression', value: 'x^2 - (-3)x' });
  });
});
