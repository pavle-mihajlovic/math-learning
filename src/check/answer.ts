/**
 * Answer specifications stored with each exercise. Every `value` is written in the same
 * plain-text math syntax a student types (see docs/CONTENT_GUIDE.md, "Answer syntax").
 */
export interface Tolerance {
  /** Absolute tolerance. */
  abs?: number;
  /** Relative tolerance. */
  rel?: number;
}

interface AnswerBase {
  /** Other forms that must be accepted. The validator checks each one. */
  accept?: string[];
  /** Known wrong answers that must be rejected. The validator checks each one. */
  reject?: string[];
  /** Short text shown next to the input box, e.g. "Round to 3 decimals". */
  prompt?: string;
}

export interface NumberAnswer extends AnswerBase {
  kind: 'number';
  /** A closed-form number ("sqrt(2)/2"), or "DNE", "inf", "-inf". */
  value: string;
  tolerance?: Tolerance;
}

export interface ExpressionAnswer extends AnswerBase {
  kind: 'expression';
  value: string;
  /** Answer is an antiderivative: the student must add +C, and any constant offset is fine. */
  constant?: boolean;
  /** Sampling range per variable, for expressions defined only on part of the line. */
  domain?: Record<string, [number, number]>;
}

export interface EquationAnswer extends AnswerBase {
  kind: 'equation';
  /** "y = -6x + 9". If the left side is a single name, typing only the right side is accepted. */
  value: string;
  domain?: Record<string, [number, number]>;
}

export interface SetAnswer extends AnswerBase {
  kind: 'set';
  /** Interval notation, unions, finite sets, "R", "{}": "(-inf, 2] U (3, inf)". */
  value: string;
}

export interface ListAnswer extends AnswerBase {
  kind: 'list';
  /** Comma-separated values, order ignored unless `ordered`: "-2, 3". */
  value: string;
  ordered?: boolean;
}

export interface VectorAnswer extends AnswerBase {
  kind: 'vector';
  /** "(1, 2)", "<1, -2, t^2>". Components may be expressions. Also accepts "i + 2j" from students. */
  value: string;
}

export interface MatrixAnswer extends AnswerBase {
  kind: 'matrix';
  /** "[[1, 2], [3, 4]]" */
  value: string;
}

export interface ChoiceAnswer extends AnswerBase {
  kind: 'choice';
  /** Options in display order, as inline text (may contain $math$). */
  options: string[];
  /** Index of the correct option. */
  correct: number;
}

export interface TextAnswer extends AnswerBase {
  kind: 'text';
  /** Accepted words or short phrases, compared case-insensitively. */
  value: string;
}

export interface MultiAnswer {
  kind: 'multi';
  parts: { label: string; answer: SingleAnswer }[];
}

export type SingleAnswer =
  | NumberAnswer | ExpressionAnswer | EquationAnswer | SetAnswer | ListAnswer
  | VectorAnswer | MatrixAnswer | ChoiceAnswer | TextAnswer;

export type Answer = SingleAnswer | MultiAnswer;

export type AnswerKind = Answer['kind'];

export interface CheckResult {
  correct: boolean;
  /** Short message for the student: "Add the constant of integration (+C)". */
  feedback?: string;
  /** The input could not be read; this is not counted as an attempt. */
  parseError?: string;
  parts?: CheckResult[];
}
