import type { AnswerKind } from './answer';
import { readSpecial } from './check';
import { toLatex } from './latex';
import { normalize, ParseError, parseExpr, splitTopLevel } from './parse';

export type Preview = { latex: string } | { error: string };

const REL: Record<string, string> = { '<=': '\\le', '>=': '\\ge', '!=': '\\ne', '<': '<', '>': '>', '=': '=' };

function exprTex(s: string): string {
  const t = s.trim();
  const sp = readSpecial(t);
  if (sp === 'DNE') return '\\text{DNE}';
  if (sp === 'inf') return '\\infty';
  if (sp === '-inf') return '-\\infty';
  return toLatex(parseExpr(t));
}

/** "a = b", "x < 3", "-1 <= x < 2", or a plain expression. */
function relationTex(s: string): string {
  const parts = s.split(/(<=|>=|!=|(?<![<>!])=|<|>)/);
  if (parts.length === 1) return exprTex(s);
  return parts.map((p, i) => (i % 2 ? ` ${REL[p]} ` : exprTex(p))).join('');
}

function tupleTex(inner: string, open: string, close: string): string {
  return `${open}${splitTopLevel(inner, ',').map(exprTex).join(', ')}${close}`;
}

function setPieceTex(p: string): string {
  const t = p.trim();
  const low = t.toLowerCase();
  if (/^(r|reals|all real numbers|all reals)$/.test(low)) return '\\mathbb{R}';
  if (/^(\{\s*\}|empty|empty set|none|no solutions?)$/.test(low)) return '\\varnothing';
  const m = /^([([])(.*)([)\]])$/.exec(t);
  if (m) return tupleTex(m[2], m[1] === '(' ? '\\left(' : '\\left[', m[3] === ')' ? '\\right)' : '\\right]');
  const b = /^\{(.*)\}$/.exec(t);
  if (b) return tupleTex(b[1], '\\{', '\\}');
  return relationTex(t);
}

/** LaTeX shown live under the input box, so the student sees how their typing was read. */
export function previewLatex(input: string, kind: AnswerKind = 'expression'): Preview {
  const src = normalize(input);
  if (!src) return { latex: '' };
  try {
    switch (kind) {
      case 'set':
        return {
          latex: splitTopLevel(src, /\s*(?:\bU\b|\bunion\b|\s[uU]\s|\bor\b)\s*/).map(setPieceTex).join(' \\cup '),
        };
      case 'vector': {
        const m = /^\s*<(.*)>\s*$/.exec(src);
        if (m) return { latex: tupleTex(m[1], '\\left\\langle ', '\\right\\rangle') };
        const p = /^\s*\((.*)\)\s*$/.exec(src);
        if (p && splitTopLevel(p[1], ',').length > 1) return { latex: tupleTex(p[1], '\\left(', '\\right)') };
        if (splitTopLevel(src, ',').length > 1) return { latex: tupleTex(src, '\\left\\langle ', '\\right\\rangle') };
        return { latex: exprTex(src) };
      }
      case 'list':
        return { latex: splitTopLevel(src, ',').map(relationTex).join(',\\ ') };
      case 'matrix': {
        const inner = src.replace(/^\[\s*/, '').replace(/\s*\]$/, '');
        const rows = inner.includes(';')
          ? inner.split(';').map((r) => r.trim().split(/\s*,\s*|\s+/))
          : splitTopLevel(inner, ',').map((r) => splitTopLevel(r.trim().replace(/^\[|\]$/g, ''), ','));
        return { latex: `\\begin{bmatrix}${rows.map((r) => r.map(exprTex).join(' & ')).join(' \\\\ ')}\\end{bmatrix}` };
      }
      case 'text':
      case 'choice':
        return { latex: '' };
      default: {
        if (splitTopLevel(src, ',').length > 1) return { latex: splitTopLevel(src, ',').map(relationTex).join(',\\ ') };
        return { latex: relationTex(src) };
      }
    }
  } catch (e) {
    if (e instanceof ParseError) return { error: e.message };
    throw e;
  }
}
