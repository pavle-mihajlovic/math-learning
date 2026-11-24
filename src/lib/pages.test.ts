import { describe, expect, it } from 'vitest';
import { blockWords, cardPages, WORDS_PER_PAGE } from './pages';

describe('page estimate', () => {
  it('counts prose words and weights math and figures', () => {
    expect(blockWords([{ type: 'p', text: 'one two three' }])).toBe(3);
    expect(blockWords([{ type: 'p', text: 'let $x$ be' }])).toBe(3.5);
    expect(blockWords([{ type: 'math', tex: 'x^2' }])).toBe(10);
    expect(blockWords([{ type: 'figure', src: 'a.webp', alt: '' }])).toBe(60);
  });
  it('turns a card into pages', () => {
    const text = Array(WORDS_PER_PAGE).fill('w').join(' ');
    expect(cardPages({ id: 'r1', kind: 'text', body: [{ type: 'p', text }] })).toBe(1);
  });
});
