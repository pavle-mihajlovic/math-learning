#!/usr/bin/env python3
"""Check ✅ solutions with SymPy.

Every exercise with a `verify` field must have an answer that equals the SymPy expression in
`verify.sympy`. A content chat writes `verify` when it labels a solution "verified":

    "answer": {"kind": "expression", "value": "3x^2 - 4", ...},
    "verify": {"sympy": "diff(x**3 - 4*x, x)"}

Usage:
    python3 scripts/verify_sympy.py [--unit V1.3.2] [--selftest]

Needs: pip install sympy
"""
from __future__ import annotations

import argparse
import json
import random
import re
import sys
from pathlib import Path

try:
    import sympy as sp
    from sympy.parsing.sympy_parser import (convert_xor, implicit_multiplication_application,
                                            parse_expr, standard_transformations)
    from sympy.calculus.util import continuous_domain, function_range
except ImportError:  # pragma: no cover
    sys.exit('verify_sympy.py needs SymPy: pip install sympy')

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / 'public' / 'content' / 'os-calc'
TRANSFORMS = standard_transformations + (implicit_multiplication_application, convert_xor)

# Plain-text answer syntax → SymPy names (see docs/CONTENT_GUIDE.md "Answer syntax").
LOCALS = {
    'ln': sp.log, 'log': lambda *a: sp.log(a[-1], a[0]) if len(a) == 2 else sp.log(a[0], 10),
    'arcsin': sp.asin, 'arccos': sp.acos, 'arctan': sp.atan, 'arcsec': sp.asec, 'arccsc': sp.acsc,
    'arccot': sp.acot, 'arcsinh': sp.asinh, 'arccosh': sp.acosh, 'arctanh': sp.atanh,
    'asin': sp.asin, 'acos': sp.acos, 'atan': sp.atan, 'sec': sp.sec, 'csc': sp.csc, 'cot': sp.cot,
    'sech': sp.sech, 'csch': sp.csch, 'coth': sp.coth, 'sqrt': sp.sqrt, 'cbrt': sp.cbrt,
    'root': lambda x, n: sp.root(x, n), 'abs': sp.Abs, 'exp': sp.exp, 'pi': sp.pi, 'e': sp.E,
    'inf': sp.oo, 'oo': sp.oo, 'E': sp.E,
}


# Extra names for `verify.sympy` beyond SymPy's top-level namespace (domains and ranges).
TARGET_LOCALS = {'continuous_domain': continuous_domain, 'function_range': function_range}


def to_sympy(s: str):
    """Parse the app's plain-text answer syntax with SymPy."""
    t = s.replace('−', '-').replace('π', 'pi').replace('∞', 'inf').replace('^', '**')
    t = re.sub(r'\blog_(\w+)\s*\(', r'log(\1, ', t)
    t = re.sub(r'\|([^|]+)\|', r' (abs(\1))', t)
    t = re.sub(r'\b(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh)\*\*\(?-1\)?', r'a\1', t)
    return parse_expr(t, local_dict=dict(LOCALS), transformations=TRANSFORMS)


def target_sympy(s: str):
    """Parse `verify.sympy`, which is ordinary SymPy syntax (log is the natural log)."""
    return parse_expr(s, local_dict=dict(TARGET_LOCALS), transformations=standard_transformations)


def equal(a, b, constant: bool = False) -> bool:
    """Symbolic check first, then random numeric points as a fallback."""
    diff = sp.simplify(a - b)
    if diff == 0:
        return True
    free = sorted(diff.free_symbols, key=str)
    if constant:
        return all(sp.simplify(sp.diff(diff, v)) == 0 for v in free)
    rnd = random.Random(1)
    for _ in range(12):
        env = {v: sp.Float(rnd.uniform(0.2, 2.5)) for v in free}
        try:
            val = complex(diff.subs(env).evalf())
        except (TypeError, ValueError):
            continue
        if abs(val) > 1e-8 * max(1.0, abs(complex(a.subs(env).evalf()))):
            return False
    return True


SET_PREFIX = 'set:'


def to_sympy_set(s: str):
    """Parse a `set` answer value: interval notation, unions, finite sets, "R", "{}"."""
    t = s.replace('−', '-').replace('∞', 'inf').replace('∪', 'U').strip()
    out = sp.S.EmptySet
    for piece in re.split(r'\s+U\s+', t):
        piece = piece.strip()
        if piece in ('R', 'ℝ'):
            out = out.union(sp.S.Reals)
        elif piece.startswith('{'):
            inner = piece[1:-1].strip()
            out = out.union(sp.FiniteSet(*[to_sympy(v) for v in inner.split(',')]) if inner else sp.S.EmptySet)
        else:
            m = re.fullmatch(r'([(\[])(.+),(.+)([)\]])', piece)
            if not m:
                raise ValueError(f'cannot read set piece {piece!r}')
            lo, hi = to_sympy(m.group(2)), to_sympy(m.group(3))
            out = out.union(sp.Interval(lo, hi, left_open=m.group(1) == '(', right_open=m.group(4) == ')'))
    return out


def answer_values(ans: dict) -> list[str]:
    if ans['kind'] == 'multi':
        # Choice and text parts (yes/no, even/odd, "increasing") are words, not values: not SymPy-checked.
        return [v for p in ans['parts'] if p['answer']['kind'] not in ('choice', 'text') for v in answer_values(p['answer'])]
    if ans['kind'] in ('number', 'expression'):
        return [ans['value']]
    if ans['kind'] == 'equation':
        lhs, rhs = ans['value'].split('=', 1)
        return [f'({rhs}) - ({lhs})']
    if ans['kind'] == 'list':
        return [v.strip() for v in ans['value'].split(',')]
    if ans['kind'] == 'set':
        return [SET_PREFIX + ans['value']]
    raise ValueError(f'cannot verify answer kind {ans["kind"]}')


def verify_exercise(ex: dict) -> str | None:
    target = target_sympy(ex['verify']['sympy'])
    values = answer_values(ex['answer'])
    constant = bool(ex['answer'].get('constant'))
    targets = list(target) if isinstance(target, (list, tuple, sp.Tuple)) else [target]
    if len(targets) != len(values):
        return f'{len(values)} answer values but SymPy gives {len(targets)}'
    for v, t in zip(values, targets):
        if v.startswith(SET_PREFIX):
            got = to_sympy_set(v[len(SET_PREFIX):])
            if not isinstance(t, sp.Set) or got.symmetric_difference(t).simplify() != sp.S.EmptySet:
                return f'set {v[len(SET_PREFIX):]!r} ≠ SymPy {t}'
            continue
        got = to_sympy(v.replace('+ C', '').replace('+C', '') if constant else v)
        if not equal(got, t, constant):
            return f'answer {v!r} ≠ SymPy {t}'
    return None


def selftest() -> None:
    ex = {'answer': {'kind': 'expression', 'value': '3x^2 - 4'}, 'verify': {'sympy': 'diff(x**3 - 4*x, x)'}}
    assert verify_exercise(ex) is None
    ex = {'answer': {'kind': 'expression', 'value': 'x^3/3 + C', 'constant': True}, 'verify': {'sympy': 'integrate(x**2, x) + 5'}}
    assert verify_exercise(ex) is None
    ex = {'answer': {'kind': 'number', 'value': 'sqrt(2)/2'}, 'verify': {'sympy': 'sin(pi/4)'}}
    assert verify_exercise(ex) is None
    ex = {'answer': {'kind': 'number', 'value': '1/3'}, 'verify': {'sympy': 'integrate(x**2, (x, 0, 1))'}}
    assert verify_exercise(ex) is None
    ex = {'answer': {'kind': 'list', 'value': '-2, 3'}, 'verify': {'sympy': '(-2, 3)'}}
    assert verify_exercise(ex) is None
    ex = {'answer': {'kind': 'expression', 'value': '2x'}, 'verify': {'sympy': 'diff(x**3, x)'}}
    assert verify_exercise(ex) is not None
    ex = {'answer': {'kind': 'set', 'value': '(-inf, 2) U (2, inf)'}, 'verify': {'sympy': 'continuous_domain(1/(x - 2), x, S.Reals)'}}
    assert verify_exercise(ex) is None
    ex = {'answer': {'kind': 'set', 'value': '[1/8, inf)'}, 'verify': {'sympy': 'Interval(0, oo)'}}
    assert verify_exercise(ex) is not None
    ex = {'answer': {'kind': 'multi', 'parts': [{'label': 'a', 'answer': {'kind': 'number', 'value': '2'}},
          {'label': 'b', 'answer': {'kind': 'set', 'value': '{-1, 1}'}}]}, 'verify': {'sympy': '(2, solveset(x**2 - 1, x, S.Reals))'}}
    assert verify_exercise(ex) is None
    ex = {'answer': {'kind': 'expression', 'value': 'ln|x| + arctan x'}, 'verify': {'sympy': 'log(x) + atan(x)'}}
    assert verify_exercise(ex) is None
    print('selftest passed')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--unit')
    ap.add_argument('--selftest', action='store_true')
    args = ap.parse_args()
    if args.selftest:
        selftest()
        return
    failures = checked = 0
    for f in sorted(CONTENT.glob('V*.json')):
        if args.unit and f.stem != args.unit:
            continue
        unit = json.loads(f.read_text())
        for ex in unit['exercises']:
            if 'verify' not in ex:
                continue
            checked += 1
            try:
                err = verify_exercise(ex)
            except Exception as e:  # noqa: BLE001 – report any SymPy failure as a validation error
                err = f'SymPy error: {e}'
            if err:
                failures += 1
                print(f'✗ {unit["id"]}#{ex["number"]}: {err}')
    print(f'{checked} verified solutions checked, {failures} failed.')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
