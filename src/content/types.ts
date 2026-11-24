/**
 * Content model: book → chapter → unit → reading cards / exercises / proof cards.
 * The JSON Schema in schema/unit.schema.json mirrors these types; keep both in sync.
 * docs/CONTENT_GUIDE.md explains how to write each field.
 */
import type { Answer } from '../check/answer';

export type { Answer };

/**
 * Inline rich text. `$…$` is inline math, `$$…$$` is display math (LaTeX, rendered by KaTeX),
 * `**bold**`, `*italic*`. Write a literal dollar sign as `\$`.
 */
export type Inline = string;

export type Block =
  | { type: 'p'; text: Inline }
  | { type: 'math'; tex: string }
  | { type: 'list'; ordered?: boolean; style?: 'a' | 'A' | '1' | 'i'; items: (Inline | Block[])[] }
  | { type: 'figure'; src: string; alt: string; caption?: Inline; width?: number; height?: number }
  | { type: 'table'; header?: Inline[]; rows: Inline[][]; caption?: Inline }
  | { type: 'box'; variant: BoxVariant; title?: Inline; body: Block[] };

export type BoxVariant = 'definition' | 'theorem' | 'rule' | 'strategy' | 'note';

/** Who wrote a solution. 📗 book > ✅ AI verified with SymPy > 🤖 AI. */
export type SolutionLabel = 'book' | 'verified' | 'ai';

export interface Solution {
  label: SolutionLabel;
  body: Block[];
}

export interface TextCard {
  id: string;
  kind: 'text';
  title?: Inline;
  body: Block[];
}

/** A worked example ("try it first") or a checkpoint problem from inside the section. */
export interface TryCard {
  id: string;
  kind: 'example' | 'checkpoint';
  /** "Example 1.12" or "Checkpoint 1.10", as numbered in the book. */
  label: string;
  title?: Inline;
  problem: Block[];
  solution: Solution;
  answer?: Answer;
}

export type ReadingCard = TextCard | TryCard;

export interface VariantParam {
  min: number;
  max: number;
  /** Default 1. */
  step?: number;
  exclude?: number[];
}

/**
 * New-number version of an exercise for "Practice mistakes".
 * `{{a}}` in the prompt and answer is replaced with the drawn value of parameter `a`;
 * `{{2*a + 1}}` with the value of that expression. Example answer: "{{a*b}} x^({{b - 1}})".
 */
export interface Variant {
  params: Record<string, VariantParam | { choices: number[] }>;
  prompt: Block[];
  answer: Answer;
}

export interface Exercise {
  /** Stable id within the unit, "e59" for book exercise 59. */
  id: string;
  /** The book's exercise number (numbered through the chapter). */
  number: number;
  /** A chapter review exercise (the book prints these after the chapter's last section). */
  review?: boolean;
  /** Shared lead-in such as "For the following exercises, find the slope." */
  instructions?: Block[];
  prompt: Block[];
  /** "auto": typed answer checked by the app. "self": reveal, then mark yourself ✓ / ✗. */
  check: 'auto' | 'self';
  /** Required when check is "auto". */
  answer?: Answer;
  solution?: Solution;
  /** Shown after the second wrong try, in order. */
  hints?: Inline[];
  /** Step-by-step solution shown after the last try. */
  steps?: Inline[];
  variant?: Variant;
  /** SymPy expression that must equal the answer, checked by scripts/verify_sympy.py. */
  verify?: { sympy: string; vars?: string[] };
  /** Id of the exercise in the OpenStax source. */
  sourceId?: string;
  /** Free-form notes from the importer or a content chat, not shown in the app. */
  notes?: string;
}

export interface ProofCard {
  id: string;
  title: Inline;
  statement: Block[];
  proof: Block[];
  label: SolutionLabel;
}

export interface UnitSource {
  /** "Calculus Volume 1" */
  book: string;
  module: string;
  url: string;
  license: string;
  licenseUrl: string;
  attribution: string;
}

export interface UnitStatus {
  /** Date the importer last wrote this file. */
  imported: string;
  /** "imported": raw import. "adapted": a K-task chat rewrote the reading. */
  reading: 'imported' | 'adapted';
  /** "imported": machine-converted book answers. "reviewed": a K-task chat checked every exercise. */
  answers: 'imported' | 'reviewed';
}

export interface Unit {
  schema: 1;
  /** "V1.1.2" = Volume 1, chapter 1, section 2. */
  id: string;
  book: 'os-calc';
  volume: number;
  chapter: number;
  section: number;
  title: string;
  chapterTitle: string;
  source: UnitSource;
  status: UnitStatus;
  objectives: Inline[];
  reading: ReadingCard[];
  exercises: Exercise[];
  proofs: ProofCard[];
  glossary?: { term: string; meaning: Inline }[];
}

/** content/os-calc/index.json: the table of contents the app loads first. */
export interface BookIndex {
  book: 'os-calc';
  title: string;
  volumes: {
    volume: number;
    title: string;
    chapters: {
      chapter: number;
      title: string;
      units: { id: string; title: string; exercises: number; auto: number; reading: number }[];
    }[];
  }[];
}
