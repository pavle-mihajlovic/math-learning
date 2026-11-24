<script lang="ts">
  import { check } from '../check/check';
  import type { CheckResult } from '../check/answer';
  import type { TryCard } from '../content/types';
  import { inlineHtml } from '../content/render';
  import AnswerInput from '../input/AnswerInput.svelte';
  import Blocks from '../lib/Blocks.svelte';
  import SolutionLabel from './SolutionLabel.svelte';

  /** A worked example or checkpoint: "try it first", then see the book's solution (D23). */
  let { card, ondone }: { card: TryCard; ondone: (solved: boolean) => void } = $props();

  /** Checkpoints count as problems: solved when auto-checked correct, or (no answer to type) worked on paper. */
  const finish = () => ondone(card.answer ? result?.correct === true : true);

  let values = $state<string[]>([]);
  let result = $state<CheckResult | null>(null);
  let revealed = $state(false);

  function submit() {
    if (!card.answer || revealed) return;
    const r = check(card.answer, values);
    result = r;
    if (!r.parseError) revealed = true;
  }

  export function primary() {
    if (!revealed) {
      if (card.answer && values.some((v) => v.trim())) submit();
      else revealed = true;
    } else finish();
  }
</script>

<article class="card">
  <div class="kicker">{card.kind === 'example' ? 'Try it first' : 'Checkpoint'} · {card.label}</div>
  {#if card.title}<h2>{@html inlineHtml(card.title)}</h2>{/if}
  <div class="content"><Blocks blocks={card.problem} /></div>

  {#if card.answer}
    <AnswerInput answer={card.answer} bind:values disabled={revealed} partStates={result?.parts?.map((p) => p.correct) ?? []} onsubmit={submit} />
  {:else if !revealed}
    <p class="muted">Work it out on paper, then compare with the book.</p>
  {/if}

  {#if result?.parseError}<p class="feedback warn">{result.parseError}</p>{/if}
  {#if result && !result.parseError}
    <p class="feedback" class:good={result.correct} class:bad={!result.correct}>{result.correct ? '✓ Correct' : '✗ Not quite. Compare with the book’s solution.'}</p>
  {/if}

  {#if revealed}
    <section class="solution">
      <SolutionLabel label={card.solution.label} />
      <div class="content"><Blocks blocks={card.solution.body} /></div>
    </section>
  {/if}

  <div class="actions">
    {#if !revealed}
      {#if card.answer}<button class="btn primary" onclick={submit}>Check <kbd>Enter</kbd></button>{/if}
      <button class="btn" class:primary={!card.answer} onclick={() => (revealed = true)}>Show solution</button>
    {:else}
      <button class="btn primary" onclick={finish}>Got it <kbd>Space</kbd></button>
    {/if}
  </div>
</article>
