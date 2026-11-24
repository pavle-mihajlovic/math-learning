/** Home-screen route to Rudin. Calculus I–III have content; the rest are placeholders until planned. */

export interface CalcMeta {
  volume: number;
  name: string;
  numeral: string;
  tagline: string;
  /** Identity colour for the volume's card. */
  color: string;
}

export const CALC: CalcMeta[] = [
  { volume: 1, name: 'Calculus I', numeral: 'I', tagline: 'Limits, derivatives, the first integrals', color: '#e7c46b' },
  { volume: 2, name: 'Calculus II', numeral: 'II', tagline: 'Integration, differential equations, series', color: '#6fd3c7' },
  { volume: 3, name: 'Calculus III', numeral: 'III', tagline: 'Vectors, multivariable and vector calculus', color: '#c49bff' },
];

export interface NextSubject {
  name: string;
  note: string;
  /** Whether it is on the direct path to Rudin PMA. */
  core: boolean;
}

export const NEXT: NextSubject[] = [
  { name: 'Linear Algebra', note: 'Vector spaces and linear maps. Rudin uses it in ch. 9.', core: true },
  { name: 'Proofs', note: 'Logic, sets, induction, writing proofs. The real prerequisite for Rudin.', core: true },
  { name: 'Spivak', note: 'Calculus done rigorously. The bridge from computing to proving.', core: true },
  { name: 'Differential Equations', note: 'Optional for Rudin. Useful on its own.', core: false },
  { name: 'Partial Differential Equations', note: 'Optional for Rudin. Usually taken after analysis.', core: false },
];
