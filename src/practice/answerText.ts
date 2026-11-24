import type { Answer, SingleAnswer } from '../check/answer';
import { previewLatex } from '../check/preview';

function single(a: SingleAnswer): string {
  switch (a.kind) {
    case 'choice':
      return a.options[a.correct] ?? '';
    case 'text':
      return a.value.split('|')[0].trim();
    default: {
      const p = previewLatex(a.value, a.kind);
      return 'latex' in p && p.latex ? '$' + p.latex + '$' : a.value;
    }
  }
}

/** The correct answer as inline text (with $…$ math), for showing a variant's computed answer. */
export function answerText(a: Answer): string {
  if (a.kind === 'multi') return a.parts.map((p) => `(${p.label}) ${single(p.answer)}`).join('; ');
  return single(a);
}
