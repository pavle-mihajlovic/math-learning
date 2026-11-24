/** Helper keys shown above the iPhone keyboard in plain-text mode. */
export interface HelperKey {
  label: string;
  /** Text to insert. "¦" marks where the cursor goes afterwards. */
  insert: string;
  title?: string;
}

export const HELPER_KEYS: HelperKey[] = [
  { label: 'x^□', insert: '^(¦)', title: 'power' },
  { label: '(', insert: '(' },
  { label: ')', insert: ')' },
  { label: '/', insert: '/' },
  { label: '√', insert: 'sqrt(¦)', title: 'square root' },
  { label: 'π', insert: 'pi' },
  { label: 'x', insert: 'x' },
  { label: 'θ', insert: 'theta' },
  { label: 'e^□', insert: 'e^(¦)' },
  { label: 'ln', insert: 'ln(¦)' },
  { label: 'sin', insert: 'sin(¦)' },
  { label: 'cos', insert: 'cos(¦)' },
  { label: 'tan', insert: 'tan(¦)' },
  { label: '|□|', insert: '|¦|', title: 'absolute value' },
  { label: '∞', insert: 'inf' },
  { label: ',', insert: ', ' },
  { label: '[', insert: '[' },
  { label: ']', insert: ']' },
  { label: '∪', insert: ' U ' },
  { label: '⟨', insert: '<' },
  { label: '⟩', insert: '>' },
  { label: '≤', insert: '<=' },
  { label: '+C', insert: ' + C' },
  { label: 'DNE', insert: 'DNE' },
];

/** Insert at the cursor of an input, returning the new value and cursor position. */
export function insertAt(value: string, start: number, end: number, insert: string): { value: string; cursor: number } {
  const mark = insert.indexOf('¦');
  const text = insert.replace('¦', '');
  const offset = mark >= 0 ? mark : text.length;
  return { value: value.slice(0, start) + text + value.slice(end), cursor: start + offset };
}
