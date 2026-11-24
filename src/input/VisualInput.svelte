<script lang="ts">
  import { onDestroy } from 'svelte';
  import { latexToPlain } from '../check/fromLatex';

  /**
   * Input mode 2: a visual equation editor (MathLive) with its on-screen math keyboard.
   * `value` is kept in the plain-text answer syntax, so the checker is the same for both modes.
   */
  let {
    value = $bindable(),
    disabled = false,
    autofocus = false,
    onsubmit,
  }: { value?: string | undefined; disabled?: boolean; autofocus?: boolean; onsubmit?: () => void } = $props();

  let host: HTMLDivElement | undefined = $state();
  let field: (HTMLElement & { value: string; disabled?: boolean; readOnly?: boolean }) | null = null;
  let failed = $state(false);
  let ready = $state(false);

  async function setup() {
    try {
      const { MathfieldElement } = await import('mathlive');
      MathfieldElement.fontsDirectory = '/mathlive/fonts';
      MathfieldElement.soundsDirectory = null;
      const mf = new MathfieldElement();
      mf.setAttribute('aria-label', 'Answer');
      mf.setAttribute('math-virtual-keyboard-policy', 'auto');
      mf.addEventListener('input', () => {
        value = latexToPlain(mf.value);
      });
      mf.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onsubmit?.();
        }
      }, { capture: true });
      host?.appendChild(mf);
      // Options that need a mounted field.
      mf.smartFence = true;
      try {
        mf.menuItems = [];
      } catch {
        /* older MathLive: the menu toggle is hidden with CSS instead */
      }
      field = mf;
      ready = true;
      if (autofocus && !disabled) requestAnimationFrame(() => mf.focus());
    } catch (e) {
      console.error(e);
      failed = true;
    }
  }

  $effect(() => {
    if (host && !field) void setup();
  });

  $effect(() => {
    if (field) field.readOnly = disabled;
  });

  // Clearing the value from outside (next exercise) clears the editor too.
  $effect(() => {
    if (field && !value && field.value !== '') field.value = '';
  });

  onDestroy(() => {
    field?.remove();
    // Hide the on-screen keyboard if this field had it open.
    (window as unknown as { mathVirtualKeyboard?: { hide: () => void } }).mathVirtualKeyboard?.hide();
  });
</script>

<div class="visual">
  <div class="host" bind:this={host}></div>
  {#if failed}
    <p class="err">The visual editor could not load. Switch to plain text in Settings.</p>
  {:else if !ready}
    <p class="loading">Loading editor…</p>
  {/if}
</div>

<style>
  .visual :global(math-field) {
    display: block;
    width: 100%;
    font-size: 1.3rem;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--text);
    --caret-color: var(--accent);
    --selection-background-color: #34415c;
    --contains-highlight-background-color: #23262c;
    --primary: var(--accent);
    --text-font-family: var(--font);
  }
  .visual :global(math-field:focus-within) { outline: none; border-color: var(--accent); }
  .visual :global(math-field::part(menu-toggle)) { display: none; }
  .loading, .err { font-size: 0.85rem; color: var(--muted); margin: 6px 0 0; }
  .err { color: var(--warn); }
</style>
