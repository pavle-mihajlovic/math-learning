<script lang="ts">
  import type { Answer, SingleAnswer } from '../check/answer';
  import { inlineHtml } from '../content/render';
  import { settings } from '../lib/settings.svelte';
  import PlainInput from './PlainInput.svelte';
  import VisualInput from './VisualInput.svelte';

  /** One input per answer part; the mode (plain text or visual editor) comes from Settings. */
  let {
    answer,
    values = $bindable([]),
    disabled = false,
    partStates = [],
    onsubmit,
  }: {
    answer: Answer;
    values?: string[];
    disabled?: boolean;
    partStates?: (boolean | undefined)[];
    onsubmit?: () => void;
  } = $props();

  const parts = $derived<{ label: string | null; answer: SingleAnswer }[]>(
    answer.kind === 'multi' ? answer.parts.map((p) => ({ label: p.label, answer: p.answer })) : [{ label: null, answer }],
  );

  /** Bare part letters ("a", "b2") get a period and sit beside the input; longer labels ("domain", "$y$-intercept") sit above it. */
  const isShortLabel = (label: string) => /^[a-z0-9]{1,3}$/i.test(label);

  /** The part whose math keys are shown. It stays put on blur so tapping Check doesn't shift the layout. */
  let active = $state(0);

  $effect(() => {
    if (values.length !== parts.length) values = parts.map((_, i) => values[i] ?? '');
  });

  const PLACEHOLDER: Record<string, string> = {
    number: 'e.g. 3/4, sqrt(2), DNE',
    expression: 'e.g. 3x^2 - 2x + 1',
    equation: 'e.g. y = 2x + 1',
    set: 'e.g. (-inf, 2] U (3, inf)',
    list: 'e.g. -2, 3',
    vector: 'e.g. <1, -2, 3>',
    matrix: 'e.g. [[1, 2], [3, 4]]',
    text: 'type a word',
  };

  function placeholder(a: SingleAnswer): string {
    if (a.kind === 'expression' && a.constant) return 'e.g. x^3/3 + C';
    return PLACEHOLDER[a.kind] ?? '';
  }

  function submitFrom(i: number) {
    // Enter moves to the next empty part before checking.
    const next = values.findIndex((v, j) => j > i && !v.trim());
    if (next >= 0) {
      const el = document.querySelectorAll<HTMLElement>('.answer-part input, .answer-part math-field')[next];
      el?.focus();
      return;
    }
    onsubmit?.();
  }
</script>

<div class="answer-input">
  {#each parts as p, i (i)}
    <div class="answer-part" class:stacked={p.label && !isShortLabel(p.label)} class:right={partStates[i] === true} class:wrong={partStates[i] === false}>
      {#if p.label}<span class="label">{@html inlineHtml(isShortLabel(p.label) ? `${p.label}.` : p.label)}</span>{/if}
      <div class="field">
        {#if p.answer.prompt}<div class="prompt">{@html inlineHtml(p.answer.prompt)}</div>{/if}
        {#if p.answer.kind === 'choice'}
          <div class="choices">
            {#each p.answer.options as opt, j (j)}
              <button
                type="button"
                class="btn choice"
                class:selected={values[i] === String(j)}
                {disabled}
                onclick={() => (values[i] = String(j))}>{@html inlineHtml(opt)}</button
              >
            {/each}
          </div>
        {:else if settings.inputMode === 'visual' && p.answer.kind !== 'text'}
          <VisualInput bind:value={values[i]} {disabled} autofocus={i === 0} onsubmit={() => submitFrom(i)} />
        {:else}
          <PlainInput
            bind:value={values[i]}
            kind={p.answer.kind}
            placeholder={placeholder(p.answer)}
            {disabled}
            autofocus={i === 0}
            onsubmit={() => submitFrom(i)}
            showKeys={active === i}
            onfocus={() => (active = i)}
          />
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .answer-input { display: flex; flex-direction: column; gap: 14px; }
  .answer-part { display: flex; gap: 10px; align-items: flex-start; }
  .label { font-weight: 600; color: var(--muted); padding-top: 12px; min-width: 1.4em; }
  .answer-part.stacked { flex-direction: column; gap: 4px; }
  .answer-part.stacked .label { padding-top: 0; }
  .answer-part.stacked .field { width: 100%; }
  .field { flex: 1; min-width: 0; }
  .prompt { font-size: 0.88rem; color: var(--muted); margin-bottom: 4px; }
  .answer-part.right :global(.field input), .answer-part.right :global(math-field) { border-color: var(--good); }
  .answer-part.wrong :global(.field input), .answer-part.wrong :global(math-field) { border-color: var(--bad); }
  .choices { display: flex; flex-wrap: wrap; gap: 8px; }
  .choice.selected { border-color: var(--accent); background: #1f2a40; }
</style>
