import type { Block, ReadingCard } from '../content/types';

/** Words on a typical printed textbook page with math. Used to turn reading cards into "pages read". */
export const WORDS_PER_PAGE = 350;

/** Word-equivalents for things that take page space but are not prose. */
const MATH_BLOCK = 10;
const INLINE_MATH = 1.5;
const FIGURE = 60;
const TABLE_CELL = 3;

function inlineWords(s: string | undefined): number {
  if (!s) return 0;
  let words = 0;
  const rest = s
    .replace(/\$\$[\s\S]*?\$\$/g, () => {
      words += MATH_BLOCK;
      return ' ';
    })
    .replace(/\$[^$]*\$/g, () => {
      words += INLINE_MATH;
      return ' ';
    });
  const m = rest.match(/\S+/g);
  return words + (m ? m.length : 0);
}

export function blockWords(blocks: Block[]): number {
  let w = 0;
  for (const b of blocks) {
    switch (b.type) {
      case 'p': w += inlineWords(b.text); break;
      case 'math': w += MATH_BLOCK; break;
      case 'list':
        for (const it of b.items) w += typeof it === 'string' ? inlineWords(it) : blockWords(it);
        break;
      case 'figure': w += FIGURE + inlineWords(b.caption); break;
      case 'table':
        w += (b.header?.length ?? 0) * TABLE_CELL + b.rows.reduce((a, r) => a + r.length * TABLE_CELL, 0);
        w += inlineWords(b.caption);
        break;
      case 'box': w += inlineWords(b.title) + blockWords(b.body); break;
    }
  }
  return w;
}

/** Estimated book pages for one reading card. */
export function cardPages(card: ReadingCard): number {
  const words =
    card.kind === 'text'
      ? inlineWords(card.title) + blockWords(card.body)
      : inlineWords(card.title) + blockWords(card.problem) + blockWords(card.solution.body);
  return words / WORDS_PER_PAGE;
}
