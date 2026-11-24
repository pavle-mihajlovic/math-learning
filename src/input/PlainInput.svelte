<script lang="ts">
  import { previewLatex } from '../check/preview';
  import type { AnswerKind } from '../check/answer';
  import { texHtml } from '../content/render';
  import { HELPER_KEYS, insertAt } from './keys';

  let {
    value = $bindable(),
    kind = 'expression',
    placeholder = '',
    disabled = false,
    autofocus = false,
    onsubmit,
    showKeys = true,
    onfocus,
  }: {
    value?: string | undefined;
    kind?: AnswerKind;
    placeholder?: string;
    disabled?: boolean;
    autofocus?: boolean;
    onsubmit?: () => void;
    showKeys?: boolean;
    onfocus?: () => void;
  } = $props();

  let input: HTMLInputElement | undefined = $state();

  const showPreview = $derived(kind !== 'text' && kind !== 'choice');
  const preview = $derived(showPreview ? previewLatex(value ?? '', kind) : { latex: '' });

  $effect(() => {
    if (autofocus && input && !disabled) input.focus({ preventScroll: true });
  });

  function press(e: PointerEvent, insert: string) {
    // Keep focus (and the iPhone keyboard) on the input.
    e.preventDefault();
    if (!input || disabled) return;
    const cur = value ?? '';
    const start = input.selectionStart ?? cur.length;
    const end = input.selectionEnd ?? cur.length;
    const r = insertAt(cur, start, end, insert);
    value = r.value;
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(r.cursor, r.cursor);
    });
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onsubmit?.();
    }
  }
</script>

<div class="plain">
  <input
    bind:this={input}
    bind:value
    class="field"
    type="text"
    {placeholder}
    {disabled}
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
    enterkeyhint="done"
    aria-label="Answer"
    onkeydown={keydown}
    onfocus={() => onfocus?.()}
  />
  {#if showPreview}
    <div class="preview" aria-live="polite">
      {#if 'error' in preview}
        <span class="err">{preview.error}</span>
      {:else if preview.latex}
        {@html texHtml(preview.latex, false)}
      {:else}
        <span class="hint">Preview appears here</span>
      {/if}
    </div>
  {/if}
  {#if !disabled && kind !== 'choice' && kind !== 'text'}
    <div class="keys" class:active={showKeys} role="toolbar" aria-label="Math keys">
      {#each HELPER_KEYS as k (k.label)}
        <button type="button" class="key" title={k.title ?? k.insert} tabindex="-1" onpointerdown={(e) => press(e, k.insert)}>{k.label}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .plain { display: flex; flex-direction: column; gap: 8px; }
  .field {
    width: 100%;
    font: 500 1.05rem/1.4 var(--mono);
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--text);
    outline: none;
  }
  .field:focus { border-color: var(--accent); }
  .field:disabled { opacity: 0.7; }
  .preview {
    min-height: 2.2em;
    padding: 6px 4px;
    overflow-x: auto;
    overflow-y: hidden;
    font-size: 1.05rem;
  }
  .preview .hint { color: var(--faint); font-size: 0.85rem; }
  .preview .err { color: var(--warn); font-size: 0.85rem; }
  .keys {
    display: none;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .keys.active { display: flex; }
  .keys::-webkit-scrollbar { display: none; }
  .key {
    flex: 0 0 auto;
    min-width: 44px;
    height: 40px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--surface-2);
    font-size: 0.95rem;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
  }
  .key:active { background: #2d2f34; }
</style>
