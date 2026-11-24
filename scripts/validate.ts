/**
 * B05 validator: `npm run validate [-- --unit V1.1.1] [--quiet]`
 *
 * Checks every unit file in public/content/os-calc/ for:
 *   1. the JSON Schema (schema/unit.schema.json),
 *   2. KaTeX rendering of every math segment and math block,
 *   3. inline markup that parses (balanced $, **, *),
 *   4. answers: the checker accepts each stored answer, every `accept` form, and rejects every `reject` form,
 *   5. variant templates: drawn parameters give an answer the checker can read,
 *   6. figures exist, ids are unique, exercise numbers increase, and index.json matches.
 * SymPy verification of ✅ solutions is separate: `python3 scripts/verify_sympy.py`.
 */
import Ajv from 'ajv';
import katex from 'katex';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { check } from '../src/check/index.ts';
import type { Answer } from '../src/check/index.ts';
import { InlineError, mathSegments } from '../src/content/inline.ts';
import type { Block, BookIndex, Unit } from '../src/content/types.ts';
import { selfCheck } from './answers.ts';
import { instantiateVariant } from '../src/content/variant.ts';

const ROOT = resolve(import.meta.dirname, '..');
const CONTENT = join(ROOT, 'public/content/os-calc');
const args = process.argv.slice(2);
const only = args.includes('--unit') ? args[args.indexOf('--unit') + 1] : null;
const quiet = args.includes('--quiet');

const ajv = new Ajv({ allErrors: true, strict: false });
const schema = JSON.parse(readFileSync(join(ROOT, 'schema/unit.schema.json'), 'utf8'));
const validateSchema = ajv.compile(schema);

const errors: string[] = [];
const counts = { units: 0, exercises: 0, auto: 0, math: 0, answers: 0, figures: 0 };

function err(where: string, msg: string) {
  errors.push(`${where}: ${msg}`);
}

const MACROS = {};

function renderTex(where: string, tex: string, display: boolean) {
  counts.math++;
  try {
    katex.renderToString(tex, { throwOnError: true, displayMode: display, strict: 'ignore', macros: { ...MACROS }, trust: false });
  } catch (e) {
    err(where, `KaTeX: ${(e as Error).message.slice(0, 160)} in $${tex.slice(0, 120)}$`);
  }
}

function inline(where: string, text: string | undefined) {
  if (text === undefined) return;
  try {
    for (const seg of mathSegments(text)) renderTex(where, seg.tex, seg.display);
  } catch (e) {
    if (e instanceof InlineError) err(where, e.message);
    else throw e;
  }
}

function blocks(where: string, list: Block[] | undefined) {
  if (!list) return;
  list.forEach((b, i) => {
    const w = `${where}[${i}]`;
    switch (b.type) {
      case 'p': inline(w, b.text); break;
      case 'math': renderTex(w, b.tex, true); break;
      case 'list':
        b.items.forEach((it, j) => (typeof it === 'string' ? inline(`${w}.${j}`, it) : blocks(`${w}.${j}`, it)));
        break;
      case 'figure':
        counts.figures++;
        inline(w, b.caption);
        if (!existsSync(join(ROOT, 'public', b.src))) err(w, `missing figure ${b.src}`);
        if (!b.alt) err(w, 'figure without alt text');
        break;
      case 'table':
        b.header?.forEach((h, j) => inline(`${w}.h${j}`, h));
        b.rows.forEach((r, j) => r.forEach((c, k) => inline(`${w}.${j}.${k}`, c)));
        inline(w, b.caption);
        break;
      case 'box':
        inline(w, b.title);
        blocks(w, b.body);
        break;
    }
  });
}

function answer(where: string, a: Answer) {
  counts.answers++;
  const e = selfCheck(a);
  if (e) err(where, `${e}: ${JSON.stringify(a).slice(0, 160)}`);
  const singles = a.kind === 'multi' ? a.parts.map((p) => p.answer) : [a];
  for (const s of singles) {
    if (s.kind === 'choice') {
      if (s.correct >= s.options.length) err(where, 'choice index out of range');
      s.options.forEach((o, i) => inline(`${where}.option${i}`, o));
    }
    for (const acc of s.accept ?? []) {
      const r = check(s, acc);
      if (!r.correct) err(where, `accept form "${acc}" is rejected${r.parseError ? ` (${r.parseError})` : ''}`);
    }
    for (const rej of s.reject ?? []) {
      if (check(s, rej).correct) err(where, `reject form "${rej}" is accepted`);
    }
  }
}

function validateUnit(file: string, unit: Unit) {
  const where = unit.id ?? file;
  if (!validateSchema(unit)) {
    for (const e of (validateSchema.errors ?? []).slice(0, 8)) {
      err(where, `schema ${e.instancePath} ${e.message}`);
    }
    return;
  }
  if (`${unit.id}.json` !== file) err(where, `file name should be ${unit.id}.json`);
  counts.units++;
  unit.objectives.forEach((o, i) => inline(`${where}.objectives[${i}]`, o));
  const ids = new Set<string>();
  const dup = (id: string, w: string) => {
    if (ids.has(id)) err(w, `duplicate id ${id}`);
    ids.add(id);
  };
  unit.reading.forEach((c, i) => {
    const w = `${where}.reading[${i}]`;
    dup(c.id, w);
    inline(w, c.title);
    if (c.kind === 'text') blocks(w, c.body);
    else {
      blocks(`${w}.problem`, c.problem);
      blocks(`${w}.solution`, c.solution.body);
      if (c.answer) answer(`${w}.answer`, c.answer);
    }
  });
  let last = 0;
  for (const ex of unit.exercises) {
    const w = `${where}#${ex.number}`;
    counts.exercises++;
    dup(ex.id, w);
    if (ex.number <= last) err(w, `exercise numbers must increase (after ${last})`);
    last = ex.number;
    if (ex.id !== `e${ex.number}`) err(w, `id should be e${ex.number}`);
    blocks(`${w}.instructions`, ex.instructions);
    blocks(`${w}.prompt`, ex.prompt);
    blocks(`${w}.solution`, ex.solution?.body);
    ex.hints?.forEach((h, i) => inline(`${w}.hints[${i}]`, h));
    ex.steps?.forEach((h, i) => inline(`${w}.steps[${i}]`, h));
    if (ex.check === 'auto') {
      counts.auto++;
      if (!ex.answer) err(w, 'auto exercise without answer');
      else answer(`${w}.answer`, ex.answer);
    }
    if (ex.solution?.label === 'verified' && !ex.verify) err(w, 'a ✅ verified solution needs a "verify" field for SymPy');
    if (ex.variant) {
      blocks(`${w}.variant.prompt`, ex.variant.prompt);
      for (let seed = 1; seed <= 5; seed++) {
        try {
          const v = instantiateVariant(ex.variant, seed);
          blocks(`${w}.variant(${seed})`, v.prompt);
          const e = selfCheck(v.answer);
          if (e) err(`${w}.variant(${seed})`, e);
        } catch (e) {
          err(`${w}.variant`, (e as Error).message);
        }
      }
    }
  }
  unit.proofs.forEach((p, i) => {
    const w = `${where}.proofs[${i}]`;
    dup(p.id, w);
    inline(w, p.title);
    blocks(`${w}.statement`, p.statement);
    blocks(`${w}.proof`, p.proof);
  });
  unit.glossary?.forEach((g, i) => inline(`${where}.glossary[${i}]`, g.meaning));
}

const files = readdirSync(CONTENT).filter((f) => /^V\d+\.\d+\.\d+\.json$/.test(f)).sort();
const index = JSON.parse(readFileSync(join(CONTENT, 'index.json'), 'utf8')) as BookIndex;
const indexed = new Set(index.volumes.flatMap((v) => v.chapters.flatMap((c) => c.units.map((u) => u.id))));
for (const f of files) {
  const id = f.replace(/\.json$/, '');
  if (only && id !== only) continue;
  if (!indexed.has(id)) err(id, 'not listed in index.json');
  let unit: Unit;
  try {
    unit = JSON.parse(readFileSync(join(CONTENT, f), 'utf8'));
  } catch (e) {
    err(f, `invalid JSON: ${(e as Error).message}`);
    continue;
  }
  validateUnit(f, unit);
}
if (!only) for (const id of indexed) if (!files.includes(`${id}.json`)) err(id, 'listed in index.json but missing');

const shown = quiet ? errors.slice(0, 20) : errors;
for (const e of shown) console.log('✗ ' + e);
if (quiet && errors.length > shown.length) console.log(`… and ${errors.length - shown.length} more`);
console.log(
  `\n${counts.units} units, ${counts.exercises} exercises (${counts.auto} auto-checked), ` +
  `${counts.answers} answers, ${counts.math} math segments, ${counts.figures} figures checked.`,
);
if (errors.length) {
  console.log(`${errors.length} problem${errors.length === 1 ? '' : 's'} found.`);
  process.exit(1);
}
console.log('All content valid.');
