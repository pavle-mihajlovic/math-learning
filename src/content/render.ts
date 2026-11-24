import katex from 'katex';
import { parseInline, type InlineToken } from './inline';

const cache = new Map<string, string>();

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** KaTeX HTML for one formula. Errors render as the raw TeX instead of breaking the card. */
export function texHtml(tex: string, display = false): string {
  const key = (display ? 'D' : 'I') + tex;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let html: string;
  try {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'html' });
  } catch {
    html = `<code>${escapeHtml(tex)}</code>`;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(key, html);
  return html;
}

function tokensHtml(toks: InlineToken[]): string {
  return toks
    .map((t) => {
      switch (t.t) {
        case 'text': return escapeHtml(t.v);
        case 'math': return t.display ? `<span class="display-math">${texHtml(t.v, true)}</span>` : texHtml(t.v, false);
        case 'bold': return `<strong>${tokensHtml(t.v)}</strong>`;
        case 'italic': return `<em>${tokensHtml(t.v)}</em>`;
        case 'br': return '<br>';
      }
    })
    .join('');
}

/** HTML for an Inline string ($math$, **bold**, *italic*). */
export function inlineHtml(src: string | undefined): string {
  if (!src) return '';
  try {
    return tokensHtml(parseInline(src));
  } catch {
    return escapeHtml(src);
  }
}
