# Content guide

Every K-task chat (one per book section, see [CURRICULUM.md](CURRICULUM.md)) follows this guide. The format is defined by [`src/content/types.ts`](../src/content/types.ts) and enforced by [`schema/unit.schema.json`](../schema/unit.schema.json) plus `npm run validate`.

## 1. Where things live

| What | Where |
|---|---|
| One unit (book section) | `public/content/os-calc/V1.2.3.json` (Volume 1, chapter 2, section 3) |
| Table of contents | `public/content/os-calc/index.json` (written by the importer) |
| Figures | `public/figures/os-calc/*.webp` (written by the importer) |
| Importer | `scripts/import_openstax.py` (B03) |
| Validator | `npm run validate`, `python3 scripts/verify_sympy.py` (B05) |

Unit ids use the book's own chapter numbers. Volume 2 starts at chapter 3 and Volume 3 at chapter 2, because the repeated chapters are skipped.

## 2. Workflow for a K-task chat

1. Read the unit file and the original section (`source.url`).
2. **Reading.** Rewrite the `reading` cards into a clear, close-to-complete version of the section (D22). Keep every worked example as an `example` card with the book's solution (D23), and keep the checkpoints. Split long cards so each one fits on about two phone screens. Then set `status.reading` to `"adapted"`.
3. **Book answers → checkable answers.** For every exercise with a 📗 book solution, write an `answer` and set `check: "auto"` wherever the answer can be typed. Split "value; domain" answers into a `multi` answer. Leave sketches, proofs and explanations as `check: "self"`.
4. **Exercises without book answers** (the even-numbered ones). Solve them. Write the `answer` and a `solution` with `label: "verified"` plus a `verify` field when SymPy can confirm the result. Use `label: "ai"` only when it can't.
5. **Hints and steps.** Add 1–2 `hints` (nudges, not answers) and `steps` (a short step-by-step solution) to every auto-checked exercise.
6. **Variants.** Add a `variant` template wherever new numbers make sense (most computational exercises).
7. **Proof cards.** Optional. The importer already turns the book's "Proof" subsections into proof cards. Add more for the section's theorems if useful.
8. Set `status.answers` to `"reviewed"`, run the checks (§9), tick the unit in CURRICULUM.md, and open a pull request.

The importer never overwrites a unit whose `status` is not `"imported"` (unless it is given `--force`), so chat edits are safe.

## 3. Unit file

```jsonc
{
  "schema": 1,
  "id": "V1.1.2", "book": "os-calc", "volume": 1, "chapter": 1, "section": 2,
  "title": "Basic Classes of Functions", "chapterTitle": "Functions and Graphs",
  "source": { "book": "Calculus Volume 1", "module": "m53478", "url": "…", "license": "CC BY-NC-SA 4.0",
              "licenseUrl": "…", "attribution": "Adapted from …" },
  "status": { "imported": "2026-11-24", "reading": "imported", "answers": "imported" },
  "objectives": ["Calculate the slope of a linear function and interpret its meaning.", "…"],
  "reading":   [ /* text, example and checkpoint cards, in book order */ ],
  "exercises": [ /* every end-of-section exercise, in book order */ ],
  "proofs":    [ /* optional proof cards */ ],
  "glossary":  [ { "term": "slope", "meaning": "the change in *y* for each unit change in *x*" } ]
}
```

OpenStax Calculus is licensed **CC BY-NC-SA 4.0**. Keep `source.attribution`; the app shows it under every unit.

## 4. Inline text and blocks

**Inline text** (`Inline` in the types) is a string with:

- `$…$` inline math and `$$…$$` display math (LaTeX rendered by KaTeX)
- `**bold**`, `*italic*`
- a newline for a line break
- `\$`, `\*`, `\\` for literal `$`, `*`, `\` (in JSON these are written `"\\$"`, `"\\*"` and `"\\\\"`)

**Blocks** (`Block[]`) are used for card bodies, prompts and solutions:

| Block | Fields |
|---|---|
| `p` | `text` |
| `math` | `tex` (display math, no `$`) |
| `list` | `items` (Inline or Block[] each), `ordered`, `style`: `a` `A` `1` `i` |
| `figure` | `src` (`figures/os-calc/…`), `alt` (required), `caption`, `width`, `height` |
| `table` | `rows`, optional `header`, `caption` |
| `box` | `variant`: `definition` `theorem` `rule` `strategy` `note`; optional `title`; `body` |

Figures are shown on a light rounded panel, so the book's white-background diagrams read well in dark mode.

## 5. Reading cards

```jsonc
{ "id": "r3", "kind": "text", "title": "Linear Functions and Slope", "body": [ … ] }
{ "id": "x8", "kind": "example", "label": "Example 1.12", "title": "Finding the Slope…",
  "problem": [ … ], "solution": { "label": "book", "body": [ … ] }, "answer": { … } }
{ "id": "c9", "kind": "checkpoint", "label": "Checkpoint 1.10", "problem": [ … ], "solution": { … } }
```

`answer` on an example or checkpoint is optional. With an answer, the card lets you type and check before showing the solution; without one, you try it on paper and then reveal the solution.

## 6. Exercises

```jsonc
{
  "id": "e67", "number": 67,                // the book's number (numbered through the chapter)
  "review": true,                           // only for chapter review exercises
  "instructions": [ … ],                    // shared "For the following exercises…" lead-in
  "prompt": [ … ],
  "check": "auto",                          // or "self"
  "answer": { "kind": "equation", "value": "y = -6x + 9" },
  "solution": { "label": "book", "body": [ … ] },
  "hints": ["Use point-slope form $y - y_1 = m(x - x_1)$."],
  "steps": ["$y - 3 = -6(x - 1)$", "$y = -6x + 9$"],
  "variant": { … },
  "verify": { "sympy": "…" },               // required when solution.label is "verified"
  "sourceId": "fs-id1170573588104",
  "notes": "free text, not shown"
}
```

**Solution labels:** `book` 📗 (written by the book's authors), `verified` ✅ (AI, checked with SymPy via `verify`), `ai` 🤖 (AI, unverified). Prefer book answers whenever one exists.

**`verify.sympy`** is one SymPy expression, or a tuple with one entry per answer value (for a `multi` answer, one per part, in order). `set` parts are compared as SymPy sets, so a domain can be checked with `continuous_domain(f, x, S.Reals)`, a range with `function_range(f, x, domain)` and zeros with `solveset(f, x, S.Reals)`. `choice` and `text` parts (yes/no, even/odd, "increasing") are words, not values, and are skipped.

**Answer flow in the app (D13):** check → ✗ → one retry → ✗ → first hint and one more try → ✗ → steps + solution. Without hints, the solution comes after the second wrong try.

## 7. Answer syntax and kinds

Stored `value`s use the same plain-text syntax a student types:

| Write | Means |
|---|---|
| `2x`, `2(x+1)`, `x y` | implicit multiplication |
| `x^2`, `x^(1/3)`, `x^-1`, `e^(2x)` | powers (`**` also works) |
| `sqrt(x)`, `cbrt(x)`, `root(x, 5)`, `\|x\|` or `abs(x)` | roots and absolute value |
| `sin x`, `sin(2x)`, `sin 2x` | `sin 2x` is sin(2x); `sin x cos x` is sin(x)·cos(x) |
| `sin^2 x`, `sin^-1 x`, `arcsin x` | (sin x)², arcsin |
| `ln x`, `log x` (base 10), `log_2(x)`, `log(2, x)`, `exp(x)` | logarithms |
| `pi`, `e`, `inf`, `theta`, `alpha`, … | constants and Greek letters |
| `x_1`, `a_n`, `f'(x)` | subscripts, primes |
| `1/2x` | (1/2)·x, left to right. Write `1/(2x)` for the other meaning |
| `DNE`, `inf`, `-inf` | limits that don't exist or are infinite |

Unicode from the phone keyboard (−, ×, ·, ², π, θ, √, ∞, ≤, ⟨⟩, ∪) is accepted too.

| `kind` | `value` example | Notes |
|---|---|---|
| `number` | `sqrt(2)/2`, `DNE`, `-inf` | Decimals typed with ≥ 3 significant digits are accepted when they round to the value. Rounded book decimals accept exact forms. `tolerance: {abs, rel}` overrides. |
| `expression` | `3x^2 - 2x` | Compared at random points. `constant: true` for antiderivatives: any constant offset is fine, and `+ C` is required. `domain: {"x": [1, 5]}` when it is only defined on part of the line. |
| `equation` | `y = -6x + 9` | Any equivalent equation (rearranged or scaled). If the left side is one variable, typing only the right side is accepted. |
| `set` | `(-inf, 2] U (3, inf)`, `{1, 2}`, `R`, `{}` | Also accepts `x <= 2`, `-1 < x <= 3`, `x != 0`. |
| `list` | `-2, 3` | Order ignored unless `ordered: true`. Accepts `x = 3, x = -2`, `x = 3 or x = -2`. |
| `vector` | `<1, -2, 3>`, `(1, 2)`, `3/4 i + j - k` | Points too. Students may type either bracket or i/j/k form. |
| `matrix` | `[[1, 2], [3, 4]]` | Students may also type `[1 2; 3 4]`. |
| `choice` | `options: ["even", "odd", "neither"], correct: 1` | Shown as buttons. |
| `text` | `increasing`, `converges\|convergent` | `\|` separates accepted words. Case and punctuation are ignored. |
| `multi` | `parts: [{label: "a", answer: …}, …]` | One input per part, all must be right. |

Every answer may also have `accept` (forms that must be accepted), `reject` (wrong answers that must be rejected) and `prompt` (a short note under the box, such as "Round to 3 decimals"). The validator checks all three. Add a `reject` entry for the most common mistake when you know it.

## 8. Variants (Practice mistakes)

```jsonc
"variant": {
  "params": { "a": { "min": 2, "max": 9 }, "b": { "choices": [2, 3, 4] }, "c": { "min": -5, "max": 5, "exclude": [0] } },
  "prompt": [{ "type": "p", "text": "Differentiate $f(x) = {{a}}x^{ {{b}} }$." }],
  "answer": { "kind": "expression", "value": "{{a*b}} x^({{b-1}})" }
}
```

`{{…}}` is replaced by the value of a parameter or of an arithmetic expression in the parameters. Inside LaTeX, put a space between braces: `x^{ {{b}} }`. Negative values are wrapped in parentheses inside answers automatically.

Practice mistakes (B13) shows the variant's prompt, the exercise's `instructions` and `hints`, and on a miss the answer computed for the drawn numbers. It doesn't show `steps` or the book's `solution`, which belong to the original numbers, so keep hints free of specific numbers. A variant must be auto-checkable; exercises without one come back unchanged.

## 9. Checks before a pull request

```bash
npm run validate -- --unit V1.2.3
```

```bash
python3 scripts/verify_sympy.py --unit V1.2.3
```

```bash
npm test
```

`npm run validate` checks the schema, renders every formula with KaTeX, runs every stored answer (and its `accept`/`reject` forms and variants) through the checker, and checks figures, ids and numbering.

## 10. Re-importing

```bash
git clone --depth 1 https://github.com/openstax/osbooks-calculus-bundle openstax-src
```

```bash
python3 scripts/import_openstax.py --only V1.2.3
```

The importer needs Python 3.10+ with Pillow (figures) and runs `scripts/import_postpass.ts` (Node) at the end. That pass parses every imported answer with the app's checker and turns anything it can't read into a self-check exercise.
