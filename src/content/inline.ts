/**
 * Parser for the Inline text format (see src/content/types.ts):
 * `$inline math$`, `$$display math$$`, `**bold**`, `*italic*`, newlines, and the escapes `\$`, `\*`, `\\`.
 */
export type InlineToken =
  | { t: 'text'; v: string }
  | { t: 'math'; v: string; display: boolean }
  | { t: 'bold'; v: InlineToken[] }
  | { t: 'italic'; v: InlineToken[] }
  | { t: 'br' };

export class InlineError extends Error {}

export function parseInline(src: string): InlineToken[] {
  let i = 0;

  function parseUntil(stop: string | null): InlineToken[] {
    const out: InlineToken[] = [];
    let text = '';
    const flush = () => {
      if (text) out.push({ t: 'text', v: text });
      text = '';
    };
    while (i < src.length) {
      const c = src[i];
      if (c === '\\' && i + 1 < src.length && '$*\\'.includes(src[i + 1])) {
        text += src[i + 1];
        i += 2;
        continue;
      }
      if (stop && src.startsWith(stop, i) && !(stop === '*' && src.startsWith('**', i) && !src.startsWith('***', i))) {
        i += stop.length;
        flush();
        return out;
      }
      if (c === '$') {
        const display = src.startsWith('$$', i);
        const delim = display ? '$$' : '$';
        const start = i + delim.length;
        let j = start;
        while (j < src.length) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src.startsWith(delim, j)) break;
          j++;
        }
        if (j >= src.length) throw new InlineError(`Unclosed ${delim} in "${src.slice(i, i + 40)}"`);
        flush();
        out.push({ t: 'math', v: src.slice(start, j), display });
        i = j + delim.length;
        continue;
      }
      if (src.startsWith('**', i)) {
        i += 2;
        flush();
        out.push({ t: 'bold', v: parseUntil('**') });
        continue;
      }
      if (c === '*') {
        i += 1;
        flush();
        out.push({ t: 'italic', v: parseUntil('*') });
        continue;
      }
      if (c === '\n') {
        flush();
        out.push({ t: 'br' });
        i++;
        continue;
      }
      text += c;
      i++;
    }
    if (stop) throw new InlineError(`Unclosed ${stop} in "${src.slice(0, 60)}"`);
    flush();
    return out;
  }

  return parseUntil(null);
}

/** Every math segment in an Inline string, for validation. */
export function mathSegments(src: string): { tex: string; display: boolean }[] {
  const out: { tex: string; display: boolean }[] = [];
  const walk = (toks: InlineToken[]) => {
    for (const t of toks) {
      if (t.t === 'math') out.push({ tex: t.v, display: t.display });
      else if (t.t === 'bold' || t.t === 'italic') walk(t.v);
    }
  };
  walk(parseInline(src));
  return out;
}
