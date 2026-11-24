"""MathML → LaTeX (for display) and MathML → plain-text answer syntax (for the checker).

Only the MathML subset used by the OpenStax calculus books is handled. The plain-text
converter is deliberately strict: anything it cannot express returns None, and the
exercise becomes a self-check card instead of getting a wrong auto-checked answer.
"""
from __future__ import annotations

import re
from typing import Optional
from xml.etree.ElementTree import Element

M = '{http://www.w3.org/1998/Math/MathML}'


def tag(e: Element) -> str:
    t = e.tag
    return t[len(M):] if t.startswith(M) else t.split('}')[-1]


GREEK = {
    'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'varepsilon', 'ϵ': 'epsilon',
    'ζ': 'zeta', 'η': 'eta', 'θ': 'theta', 'ϑ': 'vartheta', 'ι': 'iota', 'κ': 'kappa',
    'λ': 'lambda', 'μ': 'mu', 'ν': 'nu', 'ξ': 'xi', 'π': 'pi', 'ρ': 'rho', 'σ': 'sigma',
    'ς': 'varsigma', 'τ': 'tau', 'υ': 'upsilon', 'φ': 'varphi', 'ϕ': 'phi', 'χ': 'chi',
    'ψ': 'psi', 'ω': 'omega', 'Γ': 'Gamma', 'Δ': 'Delta', 'Θ': 'Theta', 'Λ': 'Lambda',
    'Ξ': 'Xi', 'Π': 'Pi', 'Σ': 'Sigma', 'Φ': 'Phi', 'Ψ': 'Psi', 'Ω': 'Omega',
}

SYMBOLS = {
    '−': '-', '–': '-', '—': '-', '×': r'\times ', '·': r'\cdot ', '⋅': r'\cdot ', '∙': r'\cdot ',
    '÷': r'\div ', '±': r'\pm ', '∓': r'\mp ', '≤': r'\le ', '≥': r'\ge ', '≠': r'\ne ',
    '≈': r'\approx ', '≡': r'\equiv ', '∼': r'\sim ', '~': r'\sim ', '∞': r'\infty ',
    '→': r'\to ', '←': r'\leftarrow ', '↔': r'\leftrightarrow ', '⇒': r'\Rightarrow ',
    '⇔': r'\Leftrightarrow ', '⟹': r'\implies ', '↦': r'\mapsto ', '↑': r'\uparrow ', '↓': r'\downarrow ',
    '∫': r'\int ', '∬': r'\iint ', '∭': r'\iiint ', '∮': r'\oint ', '∯': r'\oiint ', '∑': r'\sum ', '∏': r'\prod ',
    '∪': r'\cup ', '∩': r'\cap ', '∈': r'\in ', '∉': r'\notin ', '⊂': r'\subset ', '⊆': r'\subseteq ',
    '⊃': r'\supset ', '∅': r'\varnothing ', '∂': r'\partial ', '∇': r'\nabla ', '∀': r'\forall ',
    '∃': r'\exists ', '¬': r'\neg ', '∧': r'\wedge ', '∨': r'\vee ', '∖': r'\setminus ',
    '⟨': r'\langle ', '〈': r'\langle ', '⟩': r'\rangle ', '〉': r'\rangle ', '‖': r'\| ', '∥': r'\parallel ',
    '⊥': r'\perp ', '∘': r'\circ ', '°': r'^\circ ', '′': "'", '″': "''", '‴': "'''", '…': r'\dots ',
    '⋯': r'\cdots ', '⋮': r'\vdots ', '⋱': r'\ddots ', '∠': r'\angle ', '△': r'\triangle ',
    '{': r'\{', '}': r'\}', '%': r'\%', '#': r'\#', '&': r'\&', '$': r'\$', '_': r'\_',
    '\u2061': '', '\u2062': '', '\u2063': '', '\u00a0': '~', '\u2009': r'\,', '\u200a': r'\,',
    'ℝ': r'\mathbb{R} ', 'ℕ': r'\mathbb{N} ', 'ℤ': r'\mathbb{Z} ', 'ℚ': r'\mathbb{Q} ', 'ℂ': r'\mathbb{C} ',
    '∗': '*', '⁄': '/', '∕': '/', '∣': r'\mid ', '|': '|', '^': r'\hat{}', '\\': r'\backslash ',
    'ℓ': r'\ell ', '∝': r'\propto ', '≅': r'\cong ', '⊕': r'\oplus ', '⊗': r'\otimes ', '★': r'\star ',
    '‾': r'\overline{}', '¯': r'\overline{}', '→̂': r'\to ', 'ˆ': r'\hat{}', '˙': r'\dot{}',
}
for k, v in GREEK.items():
    SYMBOLS[k] = '\\' + v + ' '

FUNCS = {
    'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
    'coth', 'ln', 'log', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'deg', 'gcd', 'arg', 'dim',
    'ker', 'lg', 'Pr',
}
OPNAMES = {'sech', 'csch', 'arcsec', 'arccsc', 'arccot', 'curl', 'div', 'proj', 'comp', 'erf', 'sgn',
           'arcsinh', 'arccosh', 'arctanh', 'Re', 'Im', 'grad'}


def tex_chars(s: str, text_mode: bool = False) -> str:
    out = []
    for ch in s:
        if ch in SYMBOLS:
            out.append(SYMBOLS[ch])
        elif ord(ch) > 127 and not text_mode:
            out.append(ch)
        else:
            out.append(ch)
    return ''.join(out)


def escape_text(s: str) -> str:
    rep = {'\\': r'\textbackslash{}', '{': r'\{', '}': r'\}', '$': r'\$', '&': r'\&', '#': r'\#',
           '%': r'\%', '_': r'\_', '^': r'\textasciicircum{}', '~': r'\textasciitilde{}', '\u00a0': ' '}
    return ''.join(rep.get(c, c) for c in s)


MATHY_TEXT = re.compile(r'^[\s0-9.,;:()\[\]{}+\-−–=<>≤≥/|∞πθ·×⋅′\'!*^…⋯]*$')


def text_of(e: Element) -> str:
    return ''.join(e.itertext())


def _single_token(t: str) -> bool:
    t = t.strip()
    if len(t) == 1:
        return True
    if re.fullmatch(r'\\[a-zA-Z]+\s*', t):
        return True
    if re.fullmatch(r'[0-9.]+', t):
        return True
    if re.fullmatch(r'\\left[\(\[|.].*\\right[\)\]|.]', t, re.S):
        return True
    if t.startswith('{') and t.endswith('}'):
        return True
    return False


def _fence_open(t: str) -> Optional[str]:
    return {'(': '(', '[': '[', '{': r'\{', '|': '|', '⟨': r'\langle', '〈': r'\langle', '‖': r'\|'}.get(t)


def _fence_close(t: str) -> Optional[str]:
    return {')': ')', ']': ']', '}': r'\}', '|': '|', '⟩': r'\rangle', '〉': r'\rangle', '‖': r'\|'}.get(t)


def _is_tall(e: Element) -> bool:
    return any(tag(x) in ('mfrac', 'munderover', 'mtable', 'msubsup') or
               (tag(x) == 'mo' and (x.text or '').strip() in ('∫', '∑'))
               for x in e.iter())


class Tex:
    """MathML element → LaTeX string."""

    def conv(self, e: Element) -> str:
        t = tag(e)
        fn = getattr(self, 't_' + t, None)
        if fn is None:
            return self.children(e)
        return fn(e)

    def children(self, e: Element) -> str:
        kids = list(e)
        if not kids:
            return ''
        # Fence detection: (... tall ...) → \left( ... \right)
        if len(kids) >= 2 and tag(kids[0]) == 'mo' and tag(kids[-1]) == 'mo':
            o = _fence_open((kids[0].text or '').strip())
            c = _fence_close((kids[-1].text or '').strip())
            if o and c and any(_is_tall(k) for k in kids[1:-1]):
                inner = ''.join(self.conv(k) for k in kids[1:-1])
                return f'\\left{o}{inner}\\right{c}'
        out = []
        for i, k in enumerate(kids):
            s = self.conv(k)
            # Keep letters and commands from gluing together: \pi x, \sin x.
            if out and re.search(r'\\[a-zA-Z]+$', out[-1]) and re.match(r'[a-zA-Z]', s):
                out.append(' ')
            out.append(s)
        return ''.join(out)

    def t_math(self, e):
        return self.children(e).strip()

    def t_semantics(self, e):
        kids = list(e)
        return self.conv(kids[0]) if kids else ''

    def t_mrow(self, e):
        return self.children(e)

    def t_mstyle(self, e):
        inner = self.children(e)
        if e.get('displaystyle') == 'true':
            return '{\\displaystyle ' + inner + '}'
        return inner

    def t_mpadded(self, e):
        return self.children(e)

    def t_mphantom(self, e):
        return '\\phantom{' + self.children(e) + '}'

    def t_menclose(self, e):
        n = e.get('notation', '')
        inner = self.children(e)
        if 'updiagonalstrike' in n or 'downdiagonalstrike' in n:
            return '\\cancel{' + inner + '}'
        if 'box' in n:
            return '\\boxed{' + inner + '}'
        return inner

    def t_mi(self, e):
        s = (e.text or '').strip()
        if not s:
            return ''
        var = e.get('mathvariant')
        if s in FUNCS:
            return '\\' + s + ' '
        if s in OPNAMES:
            return '\\operatorname{' + s + '} '
        if len(s) == 1:
            base = tex_chars(s)
            if var == 'bold':
                return '\\mathbf{' + base.strip() + '}'
            if var == 'normal' and s.isalpha() and s.isascii():
                return '\\mathrm{' + s + '}'
            return base
        if all(c in GREEK or c.isascii() for c in s) and not re.search(r'[a-zA-Z]{2,}', s):
            return tex_chars(s)
        if var == 'bold':
            return '\\mathbf{' + escape_text(s) + '}'
        return '\\mathrm{' + escape_text(s) + '}'

    def t_mn(self, e):
        return tex_chars((e.text or '').strip())

    def t_mo(self, e):
        s = (e.text or '').strip()
        if s in FUNCS:
            return '\\' + s + ' '
        if s == 'lim':
            return '\\lim '
        if s in ('(', ')', '[', ']'):
            return s
        return tex_chars(s)

    def t_mtext(self, e):
        s = e.text or ''
        if not s.strip():
            return '\\ ' if s else ''
        st = s.strip()
        if st in FUNCS:
            return '\\' + st + ' '
        if MATHY_TEXT.match(s):
            return tex_chars(s)
        return '\\text{' + escape_text(s) + '}'

    def t_ms(self, e):
        return '\\text{"' + escape_text(e.text or '') + '"}'

    def t_mspace(self, e):
        if e.get('linebreak') == 'newline':
            return '\\\\ '
        w = e.get('width', '0.2em')
        m = re.match(r'([0-9.]+)\s*em', w)
        em = float(m.group(1)) if m else 0.2
        if em >= 1.8:
            return '\\qquad '
        if em >= 0.9:
            return '\\quad '
        if em >= 0.4:
            return '\\;'
        return '\\,'

    def _base(self, e: Element) -> str:
        b = self.conv(e).strip()
        if not _single_token(b) and not re.search(r'[)\]|]$', b):
            return '{' + b + '}'
        return b

    def t_msup(self, e):
        k = list(e)
        if len(k) != 2:
            return self.children(e)
        sup = self.conv(k[1]).strip()
        if sup in ("'", "''", "'''"):
            return self._base(k[0]) + sup
        return self._base(k[0]) + '^{' + sup + '}'

    def t_msub(self, e):
        k = list(e)
        if len(k) != 2:
            return self.children(e)
        return self._base(k[0]) + '_{' + self.conv(k[1]).strip() + '}'

    def t_msubsup(self, e):
        k = list(e)
        if len(k) != 3:
            return self.children(e)
        return self._base(k[0]) + '_{' + self.conv(k[1]).strip() + '}^{' + self.conv(k[2]).strip() + '}'

    def t_mfrac(self, e):
        k = list(e)
        if len(k) != 2:
            return self.children(e)
        a, b = self.conv(k[0]).strip(), self.conv(k[1]).strip()
        if e.get('linethickness') in ('0', '0px', '0em'):
            return '\\binom{' + a + '}{' + b + '}'
        if e.get('bevelled') == 'true':
            return a + '/' + b
        return '\\frac{' + a + '}{' + b + '}'

    def t_msqrt(self, e):
        return '\\sqrt{' + self.children(e).strip() + '}'

    def t_mroot(self, e):
        k = list(e)
        if len(k) != 2:
            return self.children(e)
        return '\\sqrt[' + self.conv(k[1]).strip() + ']{' + self.conv(k[0]).strip() + '}'

    def _limits_base(self, e: Element) -> Optional[str]:
        s = text_of(e).strip()
        if s in ('lim', 'max', 'min', 'sup', 'inf'):
            return '\\' + s
        if s in ('∑', '∏', '∫', '∬', '∭', '∮', '∯', '⋃', '⋂'):
            return {'∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint',
                    '∮': '\\oint', '∯': '\\oiint', '⋃': '\\bigcup', '⋂': '\\bigcap'}[s]
        if s in ('lim inf', 'lim sup', 'liminf', 'limsup'):
            return '\\' + s.replace(' ', '')
        return None

    def t_munder(self, e):
        k = list(e)
        if len(k) != 2:
            return self.children(e)
        under = self.conv(k[1]).strip()
        lb = self._limits_base(k[0])
        if lb:
            return lb + '_{' + under + '}'
        u = text_of(k[1]).strip()
        if u in ('_', '‾', '¯', '―', '−', '-'):
            return '\\underline{' + self.conv(k[0]).strip() + '}'
        if u == '⏟':
            return '\\underbrace{' + self.conv(k[0]).strip() + '}'
        return '\\underset{' + under + '}{' + self.conv(k[0]).strip() + '}'

    def t_mover(self, e):
        k = list(e)
        if len(k) != 2:
            return self.children(e)
        base = self.conv(k[0]).strip()
        o = text_of(k[1]).strip()
        acc = {'→': '\\vec', '⇀': '\\vec', '⃗': '\\vec', '^': '\\hat', 'ˆ': '\\hat', '˙': '\\dot', '¨': '\\ddot',
               '~': '\\tilde', '˜': '\\tilde', '¯': '\\overline', '‾': '\\overline', '―': '\\overline',
               '_': '\\overline', '−': '\\overline', '-': '\\overline', '⏞': '\\overbrace', '︷': '\\overbrace'}
        if o in acc:
            return acc[o] + '{' + base + '}'
        lb = self._limits_base(k[0])
        if lb:
            return lb + '^{' + self.conv(k[1]).strip() + '}'
        return '\\overset{' + self.conv(k[1]).strip() + '}{' + base + '}'

    def t_munderover(self, e):
        k = list(e)
        if len(k) != 3:
            return self.children(e)
        lb = self._limits_base(k[0]) or self._base(k[0])
        return lb + '_{' + self.conv(k[1]).strip() + '}^{' + self.conv(k[2]).strip() + '}'

    def t_mfenced(self, e):
        o = e.get('open', '(')
        c = e.get('close', ')')
        seps = e.get('separators', ',')
        parts = [self.conv(k) for k in e]
        sep = (seps.strip() or ',')[0] if seps is not None else ','
        inner = (sep + ' ').join(parts) if seps != '' else ''.join(parts)
        lo = _fence_open(o) or ('.' if not o else o)
        lc = _fence_close(c) or ('.' if not c else c)
        return f'\\left{lo}{inner}\\right{lc}'

    def t_mtable(self, e):
        rows = [r for r in e if tag(r) in ('mtr', 'mlabeledtr')]
        ncols = max((len([c for c in r if tag(c) == 'mtd']) for r in rows), default=1)
        align = (e.get('columnalign') or '').split()
        spec = ''.join({'left': 'l', 'right': 'r', 'center': 'c'}.get(align[i] if i < len(align) else (align[-1] if align else 'center'), 'c') for i in range(ncols))
        body = ' \\\\ '.join(' & '.join(self.conv(c).strip() for c in r if tag(c) == 'mtd') for r in rows)
        return '\\begin{array}{' + spec + '}' + body + '\\end{array}'

    def t_mtd(self, e):
        return self.children(e)

    def t_maligngroup(self, e):
        return ''

    def t_malignmark(self, e):
        return ''

    def t_annotation(self, e):
        return ''


TEX = Tex()


def mathml_to_tex(e: Element) -> str:
    s = TEX.conv(e)
    s = re.sub(r'[ \t\n]+', ' ', s).strip()
    s = re.sub(r'\s+([_^}])', r'\1', s)
    return s


# ---------------------------------------------------------------------------
# Plain-text answer syntax
# ---------------------------------------------------------------------------

class Fail(Exception):
    pass


PLAIN_OPS = {
    '−': '-', '–': '-', '-': '-', '+': '+', '×': '*', '·': '*', '⋅': '*', '∙': '*', '*': '*', '÷': '/',
    '/': '/', '=': '=', '<': '<', '>': '>', '≤': '<=', '≥': '>=', '≠': '!=', '(': '(', ')': ')',
    '[': '[', ']': ']', '{': '{', '}': '}', ',': ',', '|': '|', '∞': 'inf', '∪': ' U ', '!': '!',
    '⟨': '<', '〈': '<', '⟩': '>', '〉': '>', '′': "'", '\u2061': '', '\u2062': '', '\u2063': '',
    '^': '^', '.': '.', ';': ';', ':': ':', '∅': '{}', '≈': '=', '±': '±',
}
PLAIN_FUNCS = {
    'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'arcsec', 'arccsc', 'arccot',
    'sinh', 'cosh', 'tanh', 'sech', 'csch', 'coth', 'ln', 'log', 'exp',
}
PLAIN_GREEK = {k: v.replace('var', '') for k, v in GREEK.items()}


class Plain:
    def conv(self, e: Element) -> str:
        t = tag(e)
        fn = getattr(self, 'p_' + t, None)
        if fn is None:
            raise Fail(t)
        return fn(e)

    def children(self, e: Element) -> str:
        parts = [self.conv(k) for k in e]
        out = ''
        for p in parts:
            if out and re.search(r'[A-Za-z0-9]$', out) and re.match(r'[A-Za-z0-9]', p):
                out += ' '
            out += p
        return out

    def p_math(self, e):
        return self.children(e)

    def p_semantics(self, e):
        return self.conv(list(e)[0])

    def p_mrow(self, e):
        return self.children(e)

    def p_mstyle(self, e):
        return self.children(e)

    def p_mpadded(self, e):
        return self.children(e)

    def p_mi(self, e):
        s = (e.text or '').strip()
        if s in PLAIN_FUNCS:
            return ' ' + s + ' '
        if s == 'π':
            return ' pi '
        if s in PLAIN_GREEK:
            return ' ' + PLAIN_GREEK[s] + ' '
        if s == '∞':
            return ' inf '
        if len(s) == 1 and s.isascii() and s.isalpha():
            return s
        if s.isascii() and s.isalpha() and s.upper() == 'DNE':
            return 'DNE'
        if s.isascii() and s.isalpha():
            # Multi-letter identifiers are products of letters for the checker; keep them apart.
            return ' '.join(s)
        raise Fail('mi ' + s)

    def p_mn(self, e):
        s = (e.text or '').strip().replace('−', '-').replace(',', '')
        if not re.fullmatch(r'-?[0-9]*\.?[0-9]+', s):
            raise Fail('mn ' + s)
        return s

    def p_mo(self, e):
        s = (e.text or '').strip()
        if s in PLAIN_FUNCS:
            return ' ' + s + ' '
        if s in PLAIN_OPS:
            return PLAIN_OPS[s]
        raise Fail('mo ' + s)

    def p_mtext(self, e):
        s = (e.text or '')
        st = s.strip()
        if not st:
            return ' '
        if st.upper() in ('DNE', 'DOES NOT EXIST'):
            return 'DNE'
        if st in PLAIN_FUNCS:
            return ' ' + st + ' '
        if re.fullmatch(r'[\s0-9.,()\[\]+\-−–=/∞<>]*', s):
            return ''.join(PLAIN_OPS.get(c, c) for c in s.replace('∞', ' inf '))
        if st.lower() in ('and', 'or'):
            return ' , '
        if st in ('i', 'j', 'k'):
            # Unit vectors are set in upright text in the book.
            return ' ' + st + ' '
        if st == '±':
            return '±'
        raise Fail('mtext ' + st)

    def p_mspace(self, e):
        return ' '

    def _atom(self, s: str) -> str:
        s = s.strip()
        if re.fullmatch(r'[A-Za-z0-9.]+|[A-Za-z]+_[A-Za-z0-9]+', s) or re.fullmatch(r'\(.*\)', s) and _balanced(s[1:-1]):
            return s
        return '(' + s + ')'

    def p_msup(self, e):
        k = list(e)
        if len(k) != 2:
            raise Fail('msup')
        base = self.conv(k[0]).strip()
        sup = self.conv(k[1]).strip()
        if sup in ("'", "''"):
            return base + sup
        if base in PLAIN_FUNCS:
            return f' {base}^{self._atom(sup)} '
        return f'{self._atom(base)}^{self._atom(sup)}'

    def p_msub(self, e):
        k = list(e)
        if len(k) != 2:
            raise Fail('msub')
        base = self.conv(k[0]).strip()
        sub = self.conv(k[1]).strip()
        if not re.fullmatch(r'[A-Za-z0-9]+', sub):
            raise Fail('msub complex')
        if base == 'log':
            return f' log_{sub} '
        if not re.fullmatch(r'[A-Za-z]', base):
            raise Fail('msub base')
        return f'{base}_{sub}'

    def p_mfrac(self, e):
        k = list(e)
        if len(k) != 2 or e.get('linethickness') in ('0', '0px'):
            raise Fail('mfrac')
        a = self.conv(k[0]).strip()
        b = self.conv(k[1]).strip()
        return f'({self._atom(a)}/{self._atom(b)})'

    def p_msqrt(self, e):
        return f'sqrt({self.children(e).strip()})'

    def p_mroot(self, e):
        k = list(e)
        if len(k) != 2:
            raise Fail('mroot')
        return f'root({self.conv(k[0]).strip()}, {self.conv(k[1]).strip()})'

    def p_mfenced(self, e):
        o = e.get('open', '(')
        c = e.get('close', ')')
        if o not in ('(', '[', '|', '{', '⟨') or c not in (')', ']', '|', '}', '⟩'):
            raise Fail('mfenced')
        o = PLAIN_OPS.get(o, o)
        c = PLAIN_OPS.get(c, c)
        return o + ', '.join(self.conv(k) for k in e) + c


def _balanced(s: str) -> bool:
    d = 0
    for ch in s:
        if ch in '([{':
            d += 1
        elif ch in ')]}':
            d -= 1
            if d < 0:
                return False
    return d == 0


PLAIN = Plain()


def _flatten_rows(e: Element) -> list[Element]:
    """Children of the math element with single-child mrows unwrapped."""
    kids = list(e)
    while len(kids) == 1 and tag(kids[0]) in ('mrow', 'mstyle', 'semantics'):
        kids = list(kids[0])
    return kids


def mathml_final_value(e: Element) -> Optional[str]:
    """For "∫ F·dr = 24" or "flux = 0": the plain text after the last top-level "=" (or "≈").

    Returns None if the math has top-level commas or the tail cannot be converted.
    """
    kids = _flatten_rows(e)
    eq = [i for i, k in enumerate(kids) if tag(k) == 'mo' and (k.text or '').strip() in ('=', '≈')]
    if not eq:
        return None
    if any(tag(k) == 'mo' and (k.text or '').strip() in (',', ';') for k in kids[:-1]):
        return None
    tail = kids[eq[-1] + 1:]
    if not tail:
        return None
    try:
        parts = [PLAIN.conv(k) for k in tail]
    except Fail:
        return None
    out = ''
    for p in parts:
        if out and re.search(r'[A-Za-z0-9]$', out) and re.match(r'[A-Za-z0-9]', p):
            out += ' '
        out += p
    out = re.sub(r'\s+', ' ', out).strip()
    return re.sub(r'[.,;]+$', '', out).strip() or None


def mathml_to_plain(e: Element) -> Optional[str]:
    try:
        s = PLAIN.conv(e)
    except Fail:
        return None
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'\s*([,])\s*', r'\1 ', s)
    s = re.sub(r'\(\s+', '(', s)
    s = re.sub(r'\s+\)', ')', s)
    return s.strip()
