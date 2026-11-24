#!/usr/bin/env python3
"""B03 OpenStax importer: CNXML source files → public/content/os-calc/<unit>.json.

Usage:
    python3 scripts/import_openstax.py --src PATH/TO/osbooks-calculus-bundle [--only V1.1.1] [--no-figures]

Get the source with:
    git clone --depth 1 https://github.com/openstax/osbooks-calculus-bundle openstax-src

What it does, per section (unit):
  * converts the section text into reading cards (MathML → LaTeX for KaTeX),
  * turns worked examples and checkpoints into "try it first" cards,
  * turns theorem + "Proof" pairs into proof cards,
  * imports every end-of-section exercise with the book's answer where one exists,
  * converts a book answer into a checkable answer when that can be done safely, otherwise
    marks the exercise as self-check,
  * copies figures as resized WebP files to public/figures/os-calc/.

Afterwards it runs scripts/import_postpass.ts, which parses every generated answer with the
app's own checker and downgrades anything it cannot read to self-check.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path
from typing import Any, Optional
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).parent))
from mathml import M, mathml_final_value, mathml_to_plain, mathml_to_tex  # noqa: E402

C = '{http://cnx.rice.edu/cnxml}'
MD = '{http://cnx.rice.edu/mdml}'
COL = '{http://cnx.rice.edu/collxml}'
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'content' / 'os-calc'
FIG_OUT = ROOT / 'public' / 'figures' / 'os-calc'
FIG_MAX_WIDTH = 900

BOOKS = {
    1: ('calculus-volume-1', 'Calculus Volume 1', set()),
    2: ('calculus-volume-2', 'Calculus Volume 2', {1, 2}),   # = Vol 1 ch. 5–6
    3: ('calculus-volume-3', 'Calculus Volume 3', {1}),      # = Vol 2 ch. 7
}
AUTHORS = 'Gilbert Strang and Edwin “Jed” Herman (OpenStax)'

# Text cards are split when they grow past this many characters of source text.
CARD_CHARS = 1800


def ctag(e: ET.Element) -> str:
    t = e.tag
    if t.startswith(C):
        return t[len(C):]
    if t.startswith(M):
        return 'm:' + t[len(M):]
    return t.split('}')[-1]


def slugify(s: str) -> str:
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    s = re.sub(r"['’]", '', s.lower())
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s


def esc_inline(s: str) -> str:
    """Escape characters that mean something in the Inline format."""
    return s.replace('\\', '\\\\').replace('$', '\\$').replace('*', '\\*')


class Ctx:
    """Per-chapter numbering and per-module lookups."""

    def __init__(self, chapter: int):
        self.chapter = chapter
        self.figures = 0
        self.examples = 0
        self.checkpoints = 0
        self.tables = 0
        self.exercise_no = 0
        self.labels: dict[str, str] = {}
        self.figure_files: list[tuple[str, str]] = []  # (source path, out name)
        self.src_dir: Path = Path('.')


# ---------------------------------------------------------------------------
# Inline and block conversion
# ---------------------------------------------------------------------------

def math_inline(e: ET.Element) -> str:
    tex = mathml_to_tex(e)
    return f'${tex}$' if tex else ''


def inline(e: ET.Element, ctx: Ctx, skip_title: bool = True, styled: bool = False) -> str:
    """Convert mixed content (text, math, emphasis, links) into an Inline string.

    `styled` is set inside bold/italic runs, where nested emphasis is dropped (the format does not nest).
    """
    out = [esc_inline(e.text or '')]
    for k in e:
        t = ctag(k)
        if t == 'm:math':
            out.append(math_inline(k))
        elif t in ('emphasis', 'term'):
            inner = inline(k, ctx, styled=True)
            eff = 'bold' if t == 'term' else k.get('effect', 'bold')
            if styled or not inner.strip():
                out.append(inner)
            else:
                # Keep surrounding spaces outside the markers: "a *b* c", not "a* b *c".
                lead = inner[:len(inner) - len(inner.lstrip())]
                trail = inner[len(inner.rstrip()):]
                mark = '*' if eff == 'italics' else '**'
                out.append(f'{lead}{mark}{inner.strip()}{mark}{trail}')
        elif t == 'link':
            label = ctx.labels.get(k.get('target-id', ''), '')
            txt = inline(k, ctx).strip()
            if txt:
                out.append(txt)
            elif label:
                out.append(label)
            elif k.get('url'):
                out.append('')
            else:
                out.append('(see above)')
        elif t == 'newline':
            out.append('\n')
        elif t == 'space':
            out.append(' ')
        elif t == 'sup':
            out.append(f'$^{{\\text{{{"".join(k.itertext()).strip()}}}}}$')
        elif t == 'sub':
            out.append(f'$_{{\\text{{{"".join(k.itertext()).strip()}}}}}$')
        elif t == 'footnote':
            pass
        elif t == 'title' and skip_title:
            pass
        elif t == 'equation':
            out.append(math_inline_from_equation(k))
        elif t in ('label',):
            pass
        else:
            out.append(inline(k, ctx, styled=styled))
        out.append(esc_inline(k.tail or ''))
    s = ''.join(out)
    s = re.sub(r'[ \t\r\f\v]+', ' ', s)
    s = re.sub(r' *\n *', '\n', s)
    return s.strip(' ')


def math_inline_from_equation(e: ET.Element) -> str:
    parts = [mathml_to_tex(m) for m in e.iter(M + 'math')]
    return ' '.join(f'${p}$' for p in parts if p)


def equation_block(e: ET.Element) -> list[dict]:
    out = []
    for m in e.iter(M + 'math'):
        tex = mathml_to_tex(m)
        if tex:
            out.append({'type': 'math', 'tex': tex})
    return out


def has_block_children(e: ET.Element) -> bool:
    return any(ctag(k) in ('equation', 'list', 'figure', 'table', 'para', 'media', 'note') for k in e)


def para_blocks(e: ET.Element, ctx: Ctx) -> list[dict]:
    """A <para> may contain display equations, lists and figures; split it into blocks."""
    if not has_block_children(e):
        txt = inline(e, ctx).strip()
        return [{'type': 'p', 'text': txt}] if txt else []
    blocks: list[dict] = []
    buf = ET.Element('para')
    buf.text = e.text

    def flush():
        nonlocal buf
        txt = inline(buf, ctx).strip()
        if txt:
            blocks.append({'type': 'p', 'text': txt})
        buf = ET.Element('para')

    for k in e:
        t = ctag(k)
        if t in ('equation', 'list', 'figure', 'table', 'para', 'media', 'note'):
            flush()
            blocks.extend(convert_block(k, ctx))
            buf.text = k.tail
        else:
            kk = ET.SubElement(buf, k.tag, k.attrib)
            kk.text = k.text
            kk.extend(list(k))
            kk.tail = k.tail
    flush()
    return blocks


def figure_block(e: ET.Element, ctx: Ctx, numbered: bool) -> list[dict]:
    img = e.find(f'.//{C}image')
    media = e.find(f'.//{C}media') if ctag(e) != 'media' else e
    if img is None:
        return []
    src = img.get('src', '')
    name = Path(src).name
    out_name = Path(name).stem + '.webp'
    ctx.figure_files.append((str((ctx.src_dir / src).resolve()), out_name))
    block: dict[str, Any] = {
        'type': 'figure',
        'src': f'figures/os-calc/{out_name}',
        'alt': (media.get('alt') if media is not None else '') or '',
    }
    cap = e.find(f'{C}caption')
    caption = inline(cap, ctx).strip() if cap is not None else ''
    label = ctx.labels.get(e.get('id', ''), '') if numbered else ''
    if label and caption:
        caption = f'**{label}** {caption}'
    elif label:
        caption = f'**{label}**'
    if caption:
        block['caption'] = caption
    return [block]


def list_block(e: ET.Element, ctx: Ctx) -> list[dict]:
    items: list[Any] = []
    for it in e.findall(f'{C}item'):
        if has_block_children(it):
            items.append(para_blocks(it, ctx))
        else:
            items.append(inline(it, ctx).strip())
    ordered = e.get('list-type') == 'enumerated'
    block: dict[str, Any] = {'type': 'list', 'items': items}
    if ordered:
        block['ordered'] = True
        style = {'lower-alpha': 'a', 'upper-alpha': 'A', 'arabic': '1', 'lower-roman': 'i'}.get(e.get('number-style', 'arabic'), '1')
        block['style'] = style
    title = e.find(f'{C}title')
    out = []
    if title is not None:
        out.append({'type': 'p', 'text': f'**{inline(title, ctx, skip_title=False).strip()}**'})
    out.append(block)
    return out


def cell_inline(entry: ET.Element, ctx: Ctx) -> str:
    parts = []
    if entry.text and entry.text.strip():
        parts.append(esc_inline(entry.text.strip()))
    if not has_block_children(entry):
        return inline(entry, ctx).strip()
    for k in entry:
        t = ctag(k)
        if t == 'equation':
            parts.append(math_inline_from_equation(k))
        elif t == 'para':
            parts.append(inline(k, ctx).strip())
        elif t == 'm:math':
            parts.append(math_inline(k))
        elif t == 'list':
            parts.append('; '.join(inline(i, ctx).strip() for i in k.findall(f'{C}item')))
        elif t in ('figure', 'media'):
            parts.append('[figure]')
        else:
            parts.append(inline(k, ctx).strip())
        if k.tail and k.tail.strip():
            parts.append(esc_inline(k.tail.strip()))
    return ' '.join(p for p in parts if p)


def table_block(e: ET.Element, ctx: Ctx) -> list[dict]:
    header = None
    rows = []
    thead = e.find(f'.//{C}thead')
    if thead is not None:
        hr = thead.findall(f'{C}row')
        if hr:
            header = [cell_inline(c, ctx) for c in hr[-1].findall(f'{C}entry')]
    tbody = e.find(f'.//{C}tbody')
    if tbody is not None:
        for r in tbody.findall(f'{C}row'):
            rows.append([cell_inline(c, ctx) for c in r.findall(f'{C}entry')])
    block: dict[str, Any] = {'type': 'table', 'rows': rows}
    if header:
        block['header'] = header
    label = ctx.labels.get(e.get('id', ''), '')
    title = e.find(f'{C}title')
    cap = e.find(f'{C}caption')
    caption = ' '.join(x for x in [
        f'**{label}**' if label else '',
        inline(title, ctx, skip_title=False).strip() if title is not None else '',
        inline(cap, ctx).strip() if cap is not None else '',
    ] if x)
    if caption:
        block['caption'] = caption
    return [block]


NOTE_VARIANTS = {'theorem': 'theorem', 'problem-solving': 'strategy'}


def note_block(e: ET.Element, ctx: Ctx) -> list[dict]:
    cls = e.get('class', '')
    if cls in ('media-2', 'project', 'checkpoint'):
        return []
    title_el = e.find(f'{C}title')
    title = inline(title_el, ctx, skip_title=False).strip() if title_el is not None else ''
    variant = NOTE_VARIANTS.get(cls)
    if not variant:
        if title.lower().startswith('definition'):
            variant = 'definition'
        elif title.lower().startswith('rule'):
            variant = 'rule'
        else:
            variant = 'note'
    if variant == 'rule' and title.lower().startswith('rule:'):
        title = title[5:].strip()
    body = blocks_of(e, ctx)
    block: dict[str, Any] = {'type': 'box', 'variant': variant, 'body': body}
    if title and title.lower() != 'definition':
        block['title'] = title
    return [block]


def convert_block(k: ET.Element, ctx: Ctx, numbered_figures: bool = True) -> list[dict]:
    t = ctag(k)
    if t == 'para':
        title = k.find(f'{C}title')
        out = []
        if title is not None:
            out.append({'type': 'p', 'text': f'**{inline(title, ctx, skip_title=False).strip()}**'})
        return out + para_blocks(k, ctx)
    if t == 'equation':
        return equation_block(k)
    if t == 'm:math':
        tex = mathml_to_tex(k)
        return [{'type': 'math', 'tex': tex}] if tex else []
    if t == 'list':
        return list_block(k, ctx)
    if t in ('figure', 'media'):
        return figure_block(k, ctx, numbered_figures)
    if t == 'table':
        return table_block(k, ctx)
    if t == 'note':
        return note_block(k, ctx)
    if t in ('title', 'label', 'metadata'):
        return []
    if t in ('section', 'example', 'exercise', 'problem', 'solution', 'commentary', 'item', 'quote', 'div'):
        return blocks_of(k, ctx)
    if t == 'newline':
        return []
    txt = inline(k, ctx).strip()
    return [{'type': 'p', 'text': txt}] if txt else []


def blocks_of(e: ET.Element, ctx: Ctx, numbered_figures: bool = True) -> list[dict]:
    out: list[dict] = []
    if e.text and e.text.strip():
        out.append({'type': 'p', 'text': esc_inline(e.text.strip())})
    for k in e:
        if ctag(k) == 'title':
            continue
        out.extend(convert_block(k, ctx, numbered_figures))
        if k.tail and k.tail.strip():
            out.append({'type': 'p', 'text': esc_inline(k.tail.strip())})
    return out


def block_chars(blocks: list[dict]) -> int:
    return len(json.dumps(blocks, ensure_ascii=False))


# ---------------------------------------------------------------------------
# Numbering pass: give figures, examples, checkpoints and tables their book labels
# ---------------------------------------------------------------------------

def number_module(content: ET.Element, ctx: Ctx) -> None:
    def walk(e: ET.Element, in_exercises: bool):
        for k in e:
            t = ctag(k)
            cls = k.get('class', '') or ''
            ex = in_exercises or (t == 'section' and cls in ('section-exercises', 'review-exercises'))
            if t == 'figure' and not ex and 'splash' not in cls and 'unnumbered' not in cls:
                ctx.figures += 1
                ctx.labels[k.get('id', '')] = f'Figure {ctx.chapter}.{ctx.figures}'
            elif t == 'table' and not ex and 'unnumbered' not in cls:
                ctx.tables += 1
                ctx.labels[k.get('id', '')] = f'Table {ctx.chapter}.{ctx.tables}'
            elif t == 'example':
                ctx.examples += 1
                ctx.labels[k.get('id', '')] = f'Example {ctx.chapter}.{ctx.examples}'
            elif t == 'note' and cls == 'checkpoint':
                ctx.checkpoints += 1
                ctx.labels[k.get('id', '')] = f'Checkpoint {ctx.chapter}.{ctx.checkpoints}'
                for x in k.iter(f'{C}exercise'):
                    ctx.labels[x.get('id', '')] = ctx.labels[k.get('id', '')]
            elif t == 'equation' and 'unnumbered' not in cls and k.get('id'):
                pass
            walk(k, ex)
    walk(content, False)


# ---------------------------------------------------------------------------
# Book answers → checkable answers
# ---------------------------------------------------------------------------

SELF_WORDS = re.compile(
    r'\b(sketch|graph the|graph each|graph and|draw|explain|prove|show that|show why|describe|why\b|justify|'
    r'interpret|discuss|verify that|state whether|what do you notice|compare|use a graphing|'
    r'construct|create|estimate the|make a table|write a|identify)\b', re.I)
SET_WORDS = re.compile(r'\b(domain|range|interval|inequalit|increasing|decreasing|concave|converg|where .* (positive|negative)|solution set|continuous on)', re.I)
POINT_WORDS = re.compile(r'\b(point|vertex|vertices|center|coordinates|intercepts?|vector|critical point|extrem|maxim|minim|inflection)', re.I)
ANTI_WORDS = re.compile(r'(antiderivative|indefinite integral|∫|\\int|evaluate the integral|integrate)', re.I)
TEXT_ANSWERS = {
    'increasing', 'decreasing', 'horizontal', 'vertical', 'even', 'odd', 'neither', 'yes', 'no',
    'true', 'false', 'converges', 'diverges', 'convergent', 'divergent', 'continuous', 'discontinuous',
    'one-to-one', 'not one-to-one', 'linear', 'quadratic', 'cubic', 'constant', 'exponential growth',
    'exponential decay', 'absolutely convergent', 'conditionally convergent', 'converges absolutely',
    'converges conditionally', 'parallel', 'perpendicular', 'orthogonal', 'neither parallel nor perpendicular',
}


def plain_text(s: str) -> str:
    return re.sub(r'\s+', ' ', s).strip()


def normalize_text_answer(s: str) -> str:
    """Lower-case a prose answer and tidy numbers: "−1." → "-1", "\\$30,337.50" → "30337.50"."""
    t = strip_trailing_punct(plain_text(s.replace('−', '-').replace('\\$', '').replace('$', ''))).lower()
    if re.fullmatch(r'-?[\d,]+(\.\d+)?', t):
        t = t.replace(',', '')
    return t


def strip_trailing_punct(s: str) -> str:
    return re.sub(r'[\s.,;:]+$', '', s).strip()


def solution_pieces(sol: ET.Element) -> Optional[list[tuple[str, Any]]]:
    """Flatten a solution into a sequence of ('text', str) and ('math', Element) pieces.

    Returns None if the solution has figures or tables (then it is not auto-checkable).
    """
    pieces: list[tuple[str, Any]] = []

    def walk(e: ET.Element):
        if e.text:
            pieces.append(('text', e.text))
        for k in e:
            t = ctag(k)
            if t == 'm:math':
                pieces.append(('math', k))
            elif t in ('figure', 'media', 'table', 'image'):
                raise ValueError('figure')
            elif t in ('newline', 'space'):
                pieces.append(('text', ' '))
            else:
                walk(k)
                if t in ('para', 'item'):
                    pieces.append(('text', '\n'))
            if k.tail:
                pieces.append(('text', k.tail))
    try:
        walk(sol)
    except ValueError:
        return None
    return pieces


# Left sides that only name the answer: f(x) =, f'(x) =, y_p(x) =, R_4 =, dy/dx =, ∂z/∂x =.
NAME_LHS = re.compile(
    r"[A-Za-z]'*(_[A-Za-z0-9]+)?'*\s*\([^()]*\)"
    r"|[A-Za-z]'+"
    r"|[A-Za-z]_[A-Za-z0-9]+"
    r"|\(\(d(\^\(?\d\)?)?\s*[a-z]\)/\(d\s*[a-z](\^\(?\d\)?)?\)\)"
    r"|d\s*[a-z]\s*/\s*d\s*[a-z]"
    r"|\(\s*[a-z]\s*∘\s*[a-z]\s*\)\s*\([^()]*\)")


def classify_value(plain: str, problem_text: str) -> Optional[dict]:
    """Decide the answer kind for one plain-text value."""
    v = strip_trailing_punct(plain)
    if not v:
        return None
    low = v.lower().strip()
    if low in TEXT_ANSWERS:
        return {'kind': 'text', 'value': low}
    if low in ('dne', 'does not exist'):
        return {'kind': 'number', 'value': 'DNE'}
    if re.fullmatch(r'-?\s*inf', low):
        return {'kind': 'number', 'value': '-inf' if low.startswith('-') else 'inf'}
    if '…' in v or '...' in v:
        return None
    if '±' in v:
        return expand_pm(v, problem_text)
    # Equations.
    eq_parts = split_top(v, '=')
    if len(eq_parts) > 2:
        # "f(x) = 2x = ..." – keep the last value if the left side is a function name.
        return None
    if len(eq_parts) == 2:
        lhs, rhs = eq_parts[0].strip(), eq_parts[1].strip()
        if not lhs or not rhs:
            return None
        if NAME_LHS.fullmatch(lhs):
            return classify_value(rhs, problem_text)
        if re.fullmatch(r'[a-z]', lhs) and ',' not in rhs and not re.search(r'[a-zA-Z]', rhs.replace('pi', '').replace('sqrt', '').replace('inf', '').replace('ln', '').replace('e', '')) and not re.search(r'\b(line|equation|plane|tangent)\b', problem_text, re.I):
            # "x = 3" as the solution of an equation.
            return {'kind': 'list', 'value': rhs}
        if ',' in v:
            return None
        return {'kind': 'equation', 'value': v}
    # Sets, intervals, points, vectors.
    if v.startswith('<') and v.endswith('>'):
        return {'kind': 'vector', 'value': v}
    top_commas = len(split_top(v, ',')) > 1
    bracketed = re.fullmatch(r'[(\[].*[)\]]', v) is not None and len(split_top(v[1:-1], ',')) > 1 and _wrapped(v)
    if ' U ' in v or (bracketed and 'inf' in v):
        return {'kind': 'set', 'value': v}
    if bracketed:
        if SET_WORDS.search(problem_text) and not POINT_WORDS.search(problem_text):
            return {'kind': 'set', 'value': v}
        if POINT_WORDS.search(problem_text) or v.startswith('('):
            return {'kind': 'vector', 'value': v}
        return None
    if v.startswith('{') and v.endswith('}'):
        return {'kind': 'set', 'value': v}
    if top_commas:
        if re.search(r'[()]\s*,\s*[()]', v):
            return None  # list of points – leave for a content chat
        return {'kind': 'list', 'value': v}
    if re.search(r'[<>]', v):
        return {'kind': 'set', 'value': v}
    # Vectors written with unit vectors: "3/4 i + ln(2) j - k".
    units = set(re.findall(r'(?<![A-Za-z_])([ijk])(?![A-Za-z_(])', v))
    if units and (len(units) >= 2 or re.search(r'vector|curl|gradient|velocity|acceleration|tangent|normal|field|\bF\b', problem_text, re.I)):
        return {'kind': 'vector', 'value': v}
    # Expressions vs numbers.
    letters = re.sub(r'\b(pi|inf|sqrt|root|sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|e|DNE)\b', '', v)
    letters = re.sub(r'log_\w+', '', letters)
    if re.search(r'[A-Za-z]', letters):
        ans: dict[str, Any] = {'kind': 'expression', 'value': v}
        if re.search(r'\bC\b', v) and ANTI_WORDS.search(problem_text):
            ans['constant'] = True
        elif re.search(r'\bC\b', v):
            return None
        return ans
    return {'kind': 'number', 'value': v}


def expand_pm(v: str, problem_text: str) -> Optional[dict]:
    """"±sqrt(2)" → list "sqrt(2), -sqrt(2)"; "x = 1 ± sqrt(3)" → list "1+sqrt(3), 1-sqrt(3)"."""
    if v.count('±') != 1:
        return None
    m = re.fullmatch(r'(?:[a-z]\s*=\s*)?(.*?)±(.*)', v)
    if not m:
        return None
    a, b = m.group(1).strip(), m.group(2).strip()
    if not b or ',' in b or '=' in b or ',' in a:
        return None
    if re.search(r'[a-zA-Z]', re.sub(r'\b(pi|sqrt|e|ln|log)\b', '', a + b)):
        return None
    if a:
        return {'kind': 'list', 'value': f'{a}+({b}), {a}-({b})'}
    return {'kind': 'list', 'value': f'{b}, -({b})'}


def convergence_answer(text: str) -> Optional[dict]:
    """Series answers: "Converges by the ratio test." → text answer "converges"."""
    t = text.lower()
    conv = re.search(r'\bconverg', t)
    div = re.search(r'\bdiverg', t)
    if conv and div or not (conv or div):
        return None
    if div:
        return {'kind': 'text', 'value': 'diverges|divergent|diverge'}
    if 'absolut' in t:
        return {'kind': 'text', 'value': 'converges absolutely|absolutely convergent|absolutely|converges absolutely'}
    if 'conditional' in t:
        return {'kind': 'text', 'value': 'converges conditionally|conditionally convergent|conditionally'}
    return {'kind': 'text', 'value': 'converges|convergent|converge'}


def _wrapped(v: str) -> bool:
    d = 0
    for i, ch in enumerate(v):
        if ch in '([{':
            d += 1
        elif ch in ')]}':
            d -= 1
            if d == 0 and i != len(v) - 1:
                return False
    return True


def split_top(s: str, sep: str) -> list[str]:
    out, cur, d = [], '', 0
    i = 0
    while i < len(s):
        ch = s[i]
        if ch in '([{':
            d += 1
        elif ch in ')]}':
            d -= 1
        if d == 0 and s.startswith(sep, i) and not (sep == '=' and (s[i - 1:i] in '<>!' or s[i + 1:i + 2] == '=')):
            out.append(cur)
            cur = ''
            i += len(sep)
            continue
        cur += ch
        i += 1
    out.append(cur)
    return out


UNIT_WORDS = re.compile(
    r'^(units?(\^?\d)?|square units|cubic units|sq units|ft|feet|foot|in|inches|mi|miles|m|meters|cm|mm|km|'
    r'kg|g|lb|lbs|pounds|N|J|joules|ft-lb|ft·lb|newtons|s|sec|seconds|min|minutes|hr|hours|days|years|'
    r'mph|ft/s|ft/sec|m/s|m/sec|km/h|degrees|°|radians|rad|people|dollars|cents|liters|L|gallons|'
    r'cm\^?\d|m\^?\d|ft\^?\d|in\^?\d)\.?$', re.I)


def pieces_to_plain(pieces: list[tuple[str, Any]]) -> Optional[str]:
    """Join pieces when they are all math (plus punctuation, "and"/"or" and a trailing unit); else None."""
    out = []
    maths = [v for k, v in pieces if k == 'math']
    for i, (kind, val) in enumerate(pieces):
        if kind == 'text':
            t = val.strip()
            if not t:
                out.append(' ')
                continue
            if re.fullmatch(r'[.,;]+', t):
                out.append(t)
                continue
            if t.lower() in ('and', 'or'):
                out.append(', ')
                continue
            if UNIT_WORDS.match(t) and all(k == 'text' and not v.strip() for k, v in pieces[i + 1:]) and len(maths) == 1:
                continue
            return None
        p = mathml_to_plain(val)
        if p is None and len(maths) == 1:
            p = mathml_final_value(val)
        if p is None:
            return None
        out.append(p)
    return plain_text(''.join(out))


PART_LABEL = re.compile(r'(?:^|\s)([a-h])\.\s')


def answer_from_solution(sol: ET.Element, problem_text: str, problem_parts: int) -> tuple[Optional[dict], str]:
    """Return (answer, note). answer is None when the exercise should be self-checked."""
    pieces = solution_pieces(sol)
    if pieces is None:
        return None, 'solution has a figure or table'
    # Words-only answers ("Decreasing", "Even").
    text_only = ''.join(v for k, v in pieces if k == 'text')
    has_math = any(k == 'math' for k, _ in pieces)
    # Multi-part: "a. ... b. ..." in text pieces.
    joined_text = ''.join(v if k == 'text' else ' \u0000 ' for k, v in pieces)
    labels = PART_LABEL.findall(' ' + joined_text)
    if len(labels) >= 2 and labels == [chr(ord('a') + i) for i in range(len(labels))]:
        parts = split_parts(pieces)
        if parts is None:
            return None, 'multi-part answer could not be split'
        out_parts = []
        for label, ps in parts:
            if all(k == 'text' for k, _ in ps):
                txt = normalize_text_answer(''.join(v for _, v in ps))
                if txt in TEXT_ANSWERS:
                    out_parts.append({'label': label, 'answer': {'kind': 'text', 'value': txt}})
                    continue
                if re.fullmatch(r'-?\d+(\.\d+)?(/\d+)?', txt):
                    out_parts.append({'label': label, 'answer': {'kind': 'number', 'value': txt}})
                    continue
                if txt in ('dne', 'does not exist', 'undefined'):
                    out_parts.append({'label': label, 'answer': {'kind': 'number', 'value': 'DNE'}})
                    continue
                return None, f'part {label} is prose'
            p = pieces_to_plain(ps)
            if p is None:
                return None, f'part {label} is not plain math'
            a = classify_value(p, problem_text)
            if a is None or a['kind'] == 'multi':
                return None, f'part {label} has an unclear kind'
            out_parts.append({'label': label, 'answer': a})
        return {'kind': 'multi', 'parts': out_parts}, ''
    if not has_math:
        t = normalize_text_answer(text_only)
        tl = t
        tf = re.match(r'(true|false)\b', tl)
        if tf and re.search(r'true or false', problem_text, re.I):
            return {'kind': 'text', 'value': tf.group(1)}, ''
        if tl in TEXT_ANSWERS:
            return {'kind': 'text', 'value': tl}, ''
        if re.fullmatch(r'-?\d+(\.\d+)?(/\d+)?', t):
            return {'kind': 'number', 'value': t}, ''
        if tl in ('dne', 'does not exist', 'the limit does not exist', 'undefined'):
            return {'kind': 'number', 'value': 'DNE'}, ''
        if re.search(r'converge|diverge', problem_text, re.I) and not re.search(r'interval|radius|sum|value', problem_text, re.I):
            c = convergence_answer(text_only)
            if c:
                return c, ''
        return None, 'answer is prose'
    p = pieces_to_plain(pieces)
    if p is None and re.search(r'converge|diverge', problem_text, re.I) and not re.search(r'interval|radius|sum|value', problem_text, re.I):
        c = convergence_answer(text_only)
        if c:
            return c, ''
    if p is None:
        return None, 'answer mixes prose and math'
    a = classify_value(p, problem_text)
    if a is None:
        return None, f'could not classify "{p}"'
    return a, ''


def split_parts(pieces: list[tuple[str, Any]]) -> Optional[list[tuple[str, list]]]:
    parts: list[tuple[str, list]] = []
    cur_label = None
    cur: list = []
    for kind, val in pieces:
        if kind == 'math':
            if cur_label is None:
                return None
            cur.append((kind, val))
            continue
        s = val
        while True:
            m = PART_LABEL.search(' ' + s)
            if not m:
                break
            before = (' ' + s)[:m.start(1)]
            if cur_label is not None and before.strip():
                cur.append(('text', before))
            elif cur_label is None and before.strip():
                return None
            if cur_label is not None:
                parts.append((cur_label, cur))
            cur_label = m.group(1)
            cur = []
            s = (' ' + s)[m.end():]
        if s.strip() and cur_label is not None:
            cur.append(('text', s))
    if cur_label is not None:
        parts.append((cur_label, cur))
    return parts


# ---------------------------------------------------------------------------
# Unit building
# ---------------------------------------------------------------------------

def problem_plain_text(e: ET.Element) -> str:
    return plain_text(''.join(e.itertext()))


def make_try_card(kind: str, holder: ET.Element, ex: ET.Element, ctx: Ctx, card_id: str) -> dict:
    problem = ex.find(f'{C}problem')
    solution = ex.find(f'{C}solution')
    commentary = ex.findall(f'{C}commentary')
    title_el = problem.find(f'{C}title') if problem is not None else None
    lead = [k for k in holder if ctag(k) not in ('exercise', 'title')] if holder is not ex else []
    prob_blocks: list[dict] = []
    for k in lead:
        prob_blocks.extend(convert_block(k, ctx))
    if problem is not None:
        prob_blocks.extend(blocks_of(problem, ctx))
    sol_blocks = blocks_of(solution, ctx) if solution is not None else []
    for c in commentary:
        body = blocks_of(c, ctx)
        if body:
            sol_blocks.append({'type': 'box', 'variant': 'note', 'title': 'Hint' if kind == 'checkpoint' else 'Analysis', 'body': body})
    card: dict[str, Any] = {
        'id': card_id,
        'kind': kind,
        'label': ctx.labels.get(holder.get('id', ''), ctx.labels.get(ex.get('id', ''), kind.title())),
        'problem': prob_blocks or [{'type': 'p', 'text': '(no problem text)'}],
        'solution': {'label': 'book', 'body': sol_blocks or [{'type': 'p', 'text': '(no solution in the book)'}]},
    }
    if title_el is not None:
        card['title'] = inline(title_el, ctx, skip_title=False).strip()
    if kind == 'checkpoint' and solution is not None:
        a, _ = answer_from_solution(solution, problem_plain_text(problem) if problem is not None else '', 0)
        if a:
            card['answer'] = a
    return card


class UnitBuilder:
    def __init__(self, ctx: Ctx, unit_id: str):
        self.ctx = ctx
        self.unit_id = unit_id
        self.cards: list[dict] = []
        self.proofs: list[dict] = []
        self.buf: list[dict] = []
        self.buf_title: Optional[str] = None
        self.part = 0
        self.n = 0
        self.last_theorem: Optional[dict] = None

    def next_id(self, prefix: str) -> str:
        self.n += 1
        return f'{prefix}{self.n}'

    def flush(self):
        if self.buf:
            card: dict[str, Any] = {'id': self.next_id('r'), 'kind': 'text', 'body': self.buf}
            if self.buf_title:
                card['title'] = self.buf_title + (' (continued)' if self.part > 0 else '')
            self.cards.append(card)
            self.part += 1
            self.buf = []

    def add_blocks(self, blocks: list[dict]):
        for b in blocks:
            if self.buf and block_chars(self.buf) + block_chars([b]) > CARD_CHARS:
                self.flush()
            self.buf.append(b)

    def walk(self, e: ET.Element, title: Optional[str]):
        for k in e:
            t = ctag(k)
            cls = k.get('class', '') or ''
            if t == 'title':
                continue
            if t == 'section':
                if cls in ('section-exercises', 'review-exercises', 'key-concepts', 'key-equations', 'contrib-auth', 'sr-contrib-auth'):
                    continue
                sec_title_el = k.find(f'{C}title')
                sec_title = inline(sec_title_el, self.ctx, skip_title=False).strip() if sec_title_el is not None else (title or '')
                if sec_title == 'Proof' and self.last_theorem is not None:
                    self.proofs.append({
                        'id': f'p{len(self.proofs) + 1}',
                        'title': self.last_theorem.get('title') or 'Theorem',
                        'statement': self.last_theorem['body'],
                        'proof': blocks_of(k, self.ctx),
                        'label': 'book',
                    })
                    self.add_blocks([{'type': 'p', 'text': f'*A proof of {self.last_theorem.get("title") or "this theorem"} is on a proof card at the end of the unit.*'}])
                    self.last_theorem = None
                    continue
                self.flush()
                self.buf_title = sec_title
                self.part = 0
                self.walk(k, sec_title)
                self.flush()
                continue
            if t == 'example':
                ex = k.find(f'.//{C}exercise')
                if ex is None:
                    self.add_blocks(blocks_of(k, self.ctx))
                    continue
                self.flush()
                self.cards.append(make_try_card('example', k, ex, self.ctx, self.next_id('x')))
                self.part += 1
                continue
            if t == 'note' and cls == 'checkpoint':
                ex = k.find(f'.//{C}exercise')
                if ex is None:
                    continue
                self.flush()
                self.cards.append(make_try_card('checkpoint', k, ex, self.ctx, self.next_id('c')))
                self.part += 1
                continue
            blocks = convert_block(k, self.ctx)
            if t == 'note' and blocks and blocks[0].get('variant') == 'theorem':
                self.last_theorem = blocks[0]
            self.add_blocks(blocks)


def build_exercises(sec: ET.Element, ctx: Ctx, unit_id: str, stats: dict, review: bool = False) -> list[dict]:
    exercises = []
    instructions: list[dict] = []
    fresh = True
    for k in sec:
        t = ctag(k)
        if t == 'title':
            continue
        if t != 'exercise':
            if not fresh:
                instructions = []
                fresh = True
            instructions.extend(convert_block(k, ctx, numbered_figures=False))
            continue
        fresh = False
        ctx.exercise_no += 1
        num = ctx.exercise_no
        problem = k.find(f'{C}problem')
        solution = k.find(f'{C}solution')
        prompt = blocks_of(problem, ctx, numbered_figures=False) if problem is not None else []
        ex: dict[str, Any] = {
            'id': f'e{num}',
            'number': num,
            'prompt': prompt or [{'type': 'p', 'text': '(see the instructions above)'}],
            'check': 'self',
            'sourceId': k.get('id', ''),
        }
        if instructions:
            ex['instructions'] = instructions
        if review:
            ex['review'] = True
        if solution is not None:
            ex['solution'] = {'label': 'book', 'body': blocks_of(solution, ctx, numbered_figures=False)}
            prob = problem_plain_text(problem) if problem is not None else ''
            ptext = plain_text(json.dumps(instructions, ensure_ascii=False)) + ' ' + prob
            asks_work = re.search(r'\b(sketch|graph the|draw|prove|show that|explain)\b', prob, re.I)
            asks_find = re.search(r'\b(find|evaluate|compute|calculate|determine|solve|simplify)\b', prob, re.I)
            if asks_work or (SELF_WORDS.search(ptext) and not asks_find):
                ex['notes'] = 'self-check: the problem asks for a sketch, proof or explanation'
            else:
                ans, note = answer_from_solution(solution, ptext, 0)
                if ans is not None:
                    ex['answer'] = ans
                    ex['check'] = 'auto'
                elif note:
                    ex['notes'] = 'self-check: ' + note
            stats['with_answers'] += 1
        else:
            ex['notes'] = 'no book answer yet (even-numbered); a content chat adds one'
        stats['exercises'] += 1
        if ex['check'] == 'auto':
            stats['auto'] += 1
        exercises.append(ex)
    return exercises


def build_unit(mod_path: Path, vol: int, chapter: int, section: int, chapter_title: str, ctx: Ctx, book: tuple, stats: dict) -> dict:
    tree = ET.parse(mod_path)
    root = tree.getroot()
    ctx.src_dir = mod_path.parent
    content = root.find(f'{C}content')
    title = root.find(f'{C}title').text.strip()
    number_module(content, ctx)
    unit_id = f'V{vol}.{chapter}.{section}'

    objectives = []
    abstract = root.find(f'.//{MD}abstract')
    if abstract is not None:
        for it in abstract.iter(f'{C}item'):
            objectives.append(inline(it, ctx).strip())
        if not objectives:
            for it in abstract.iter():
                if it.tag.endswith('item'):
                    objectives.append(inline(it, ctx).strip())

    ub = UnitBuilder(ctx, unit_id)
    ub.buf_title = title
    ub.walk(content, title)
    ub.flush()

    key_concepts = None
    exercises: list[dict] = []
    for sec in content.iter(f'{C}section'):
        cls = sec.get('class', '')
        if cls == 'section-exercises':
            exercises.extend(build_exercises(sec, ctx, unit_id, stats))
        elif cls == 'review-exercises':
            # The chapter's review exercises sit in its last section; they are part of that unit.
            exercises.extend(build_exercises(sec, ctx, unit_id, stats, review=True))
        elif cls in ('key-concepts', 'key-equations'):
            body = blocks_of(sec, ctx)
            if body:
                ub.cards.append({'id': ub.next_id('r'), 'kind': 'text',
                                 'title': 'Key Concepts' if cls == 'key-concepts' else 'Key Equations', 'body': body})

    glossary = []
    g = root.find(f'{C}glossary')
    if g is not None:
        for d in g.findall(f'{C}definition'):
            term = d.find(f'{C}term')
            meaning = d.find(f'{C}meaning')
            if term is not None and meaning is not None:
                glossary.append({'term': plain_text(''.join(term.itertext())), 'meaning': inline(meaning, ctx).strip()})

    slug, book_title, _ = book
    unit: dict[str, Any] = {
        'schema': 1,
        'id': unit_id,
        'book': 'os-calc',
        'volume': vol,
        'chapter': chapter,
        'section': section,
        'title': title,
        'chapterTitle': chapter_title,
        'source': {
            'book': book_title,
            'module': root.find(f'.//{MD}content-id').text.strip(),
            'url': f'https://openstax.org/books/{slug}/pages/{chapter}-{section}-{slugify(title)}',
            'license': LICENSE[0],
            'licenseUrl': LICENSE[1],
            'attribution': f'Adapted from {book_title}, §{chapter}.{section} “{title}”, by {AUTHORS}, licensed under {LICENSE[0]}.',
        },
        'status': {'imported': dt.date.today().isoformat(), 'reading': 'imported', 'answers': 'imported'},
        'objectives': objectives,
        'reading': ub.cards,
        'exercises': exercises,
        'proofs': ub.proofs,
    }
    if glossary:
        unit['glossary'] = glossary
    return unit


LICENSE = ('CC BY-NC-SA 4.0', 'https://creativecommons.org/licenses/by-nc-sa/4.0/')


def convert_figures(files: list[tuple[str, str]]) -> dict[str, tuple[int, int]]:
    from PIL import Image  # Pillow
    FIG_OUT.mkdir(parents=True, exist_ok=True)
    sizes = {}
    for src, name in files:
        out = FIG_OUT / name
        if not Path(src).exists():
            print(f'  missing figure {src}', file=sys.stderr)
            continue
        if out.exists() and out.stat().st_mtime > Path(src).stat().st_mtime:
            with Image.open(out) as im:
                sizes[name] = im.size
            continue
        with Image.open(src) as im:
            im = im.convert('RGB')
            if im.width > FIG_MAX_WIDTH:
                im = im.resize((FIG_MAX_WIDTH, round(im.height * FIG_MAX_WIDTH / im.width)), Image.LANCZOS)
            im.save(out, 'WEBP', quality=78, method=6)
            sizes[name] = im.size
    return sizes


def set_figure_sizes(obj: Any, sizes: dict[str, tuple[int, int]]):
    if isinstance(obj, dict):
        if obj.get('type') == 'figure':
            name = obj['src'].split('/')[-1]
            if name in sizes:
                obj['width'], obj['height'] = sizes[name]
        for v in obj.values():
            set_figure_sizes(v, sizes)
    elif isinstance(obj, list):
        for v in obj:
            set_figure_sizes(v, sizes)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--src', default=str(ROOT / 'openstax-src'), help='path to osbooks-calculus-bundle')
    ap.add_argument('--only', help='import one unit, e.g. V1.1.1')
    ap.add_argument('--no-figures', action='store_true', help='skip figure conversion')
    ap.add_argument('--no-postpass', action='store_true', help='skip the checker post-pass')
    ap.add_argument('--force', action='store_true', help='overwrite units a content chat has already edited')
    args = ap.parse_args()
    src = Path(args.src)
    if not (src / 'collections').exists():
        sys.exit(f'OpenStax source not found at {src}. Clone it with:\n'
                 f'  git clone --depth 1 https://github.com/openstax/osbooks-calculus-bundle {src}')

    OUT.mkdir(parents=True, exist_ok=True)
    index = {'book': 'os-calc', 'title': 'OpenStax Calculus', 'volumes': []}
    written = []
    totals = {'exercises': 0, 'with_answers': 0, 'auto': 0, 'units': 0}
    for vol, book in BOOKS.items():
        slug, book_title, skip = book
        col = ET.parse(src / 'collections' / f'{slug}.collection.xml').getroot()
        lic = col.find(f'.//{MD}license')
        if lic is not None and 'by-nc-sa' not in (lic.get('url') or ''):
            print(f'warning: {slug} license is {lic.get("url")}', file=sys.stderr)
        vol_entry = {'volume': vol, 'title': book_title, 'chapters': []}
        chapters = col.find(f'{COL}content').findall(f'{COL}subcollection')
        for ch_i, sub in enumerate(chapters, start=1):
            if ch_i in skip:
                continue
            ch_title = sub.find(f'{MD}title').text.strip()
            modules = [m.get('document') for m in sub.find(f'{COL}content').findall(f'{COL}module')]
            ctx = Ctx(ch_i)
            ch_entry = {'chapter': ch_i, 'title': ch_title, 'units': []}
            # The first module of each chapter is its introduction, not a numbered section.
            intro, sections = modules[0], modules[1:]
            number_module(ET.parse(src / 'modules' / intro / 'index.cnxml').getroot().find(f'{C}content'), ctx)
            for s_i, mod in enumerate(sections, start=1):
                unit_id = f'V{vol}.{ch_i}.{s_i}'
                stats = {'exercises': 0, 'with_answers': 0, 'auto': 0}
                unit = build_unit(src / 'modules' / mod / 'index.cnxml', vol, ch_i, s_i, ch_title, ctx, book, stats)
                ch_entry['units'].append({'id': unit_id, 'title': unit['title'], 'exercises': stats['exercises'],
                                          'auto': stats['auto'], 'reading': len(unit['reading'])})
                if args.only and unit_id != args.only:
                    continue
                if not args.no_figures:
                    sizes = convert_figures(ctx.figure_files)
                    set_figure_sizes(unit, sizes)
                ctx.figure_files = []
                path = OUT / f'{unit_id}.json'
                if path.exists() and not args.force:
                    old = json.loads(path.read_text())
                    st = old.get('status', {})
                    if st.get('reading') != 'imported' or st.get('answers') != 'imported':
                        # A content chat has worked on this unit; never overwrite its edits.
                        print(f'{unit_id:8} kept (status {st}); use --force to overwrite')
                        continue
                path.write_text(json.dumps(unit, ensure_ascii=False, indent=1) + '\n')
                written.append(str(path))
                for k in ('exercises', 'with_answers', 'auto'):
                    totals[k] += stats[k]
                totals['units'] += 1
                print(f'{unit_id:8} {unit["title"][:48]:48} {stats["exercises"]:4} ex  {stats["with_answers"]:3} answers  {stats["auto"]:3} auto  {len(unit["reading"]):3} cards')
            vol_entry['chapters'].append(ch_entry)
        index['volumes'].append(vol_entry)
    if not args.only:
        (OUT / 'index.json').write_text(json.dumps(index, ensure_ascii=False, indent=1) + '\n')
    print(f"\n{totals['units']} units, {totals['exercises']} exercises, {totals['with_answers']} with book answers, {totals['auto']} auto-checkable before post-pass")
    if not args.no_postpass and written:
        subprocess.run(['npx', 'tsx', str(ROOT / 'scripts' / 'import_postpass.ts'), *written], check=True, cwd=ROOT)


if __name__ == '__main__':
    main()
