<script lang="ts">
  import { check } from '../check/check';
  import type { CheckResult } from '../check/answer';
  import type { Exercise } from '../content/types';
  import { inlineHtml } from '../content/render';
  import { sourceLabel } from '../content/load';
  import AnswerInput from '../input/AnswerInput.svelte';
  import Blocks from '../lib/Blocks.svelte';
  import SolutionLabel from './SolutionLabel.svelte';
  import type { Outcome } from './types';

  /**
   * Auto-checked flow (D13): check → ✗ → one retry → ✗ → hint and one more try → ✗ → step-by-step solution.
   * Self-check flow: reveal the answer, then mark ✓ or ✗ yourself.
   */
  let {
    exercise,
    unitId,
    ondone,
    kicker,
    computedAnswer,
  }: {
    exercise: Exercise;
    unitId: string;
    ondone: (o: Outcome) => void;
    /** Replaces the source line at the top (Practice mistakes). */
    kicker?: string;
    /** Answer computed for a variant's numbers, shown instead of the book's solution. */
    computedAnswer?: string;
  } = $props();

  const auto = $derived(exercise.check === 'auto' && !!exercise.answer);
  const hasHints = $derived((exercise.hints?.length ?? 0) > 0);

  let values = $state<string[]>([]);
  let result = $state<CheckResult | null>(null);
  let attempts = $state(0);
  let wrong = $state(0);
  let hintShown = $state(0);
  let solved = $state(false);
  let revealed = $state(false);
  let judged = $state<boolean | null>(null);
  let message = $state('');

  const finished = $derived(solved || (revealed && (auto || judged !== null)));
  const triesLeft = $derived(auto && !solved && !revealed);

  function submit() {
    if (!exercise.answer || !triesLeft) return;
    const r = check(exercise.answer, values);    result = r;
    if (r.parseError) {
      message = r.parseError;
      return;
    }
    attempts++;
    if (r.correct) {
      solved = true;
      message = attempts === 1 ? '✓ Correct' : '✓ Correct on try ' + attempts;
      return;
    }
    wrong++;
    const fb = r.feedback ? ` ${r.feedback}` : '';
    if (wrong === 1) {
      message = `✗ Not quite. Try once more.${fb}`;
    } else if (wrong === 2 && hasHints) {
      hintShown = Math.max(hintShown, 1);
      message = `✗ Still not it. Here is a hint.${fb}`;
    } else {
      revealed = true;
      message = `✗ Here is the solution.${fb}`;
    }
  }

  function showHint() {
    if (hasHints && hintShown < (exercise.hints?.length ?? 0)) hintShown++;
  }

  function giveUp() {
    revealed = true;
    message = '';
  }

  function finish(override?: boolean) {
    if (auto) {
      const correct = override ?? solved;
      ondone({ correct, firstTry: solved && attempts === 1, attempts, sawSolution: revealed, selfChecked: false });
    } else {
      ondone({ correct: !!judged, firstTry: !!judged, attempts: 1, sawSolution: true, selfChecked: true });
    }
  }

  function judge(ok: boolean) {
    judged = ok;
    finish();
  }

  /** Space bar / main button. */
  export function primary() {
    if (auto) {
      if (finished) finish();
      return;
    }
    if (!revealed) revealed = true;
  }

  export function key(k: string): boolean {
    if (k === 'h' && auto && wrong > 0) { showHint(); return true; }
    if (!auto && revealed && judged === null) {
      if (k === 'y' || k === '1') { judge(true); return true; }
      if (k === 'n' || k === '2') { judge(false); return true; }
    }
    return false;
  }
</script>

<article class="card">
  <div class="kicker">
    {kicker ?? sourceLabel(unitId, exercise.number)}{#if exercise.review && !kicker} · Chapter review{/if}
  </div>
  {#if exercise.instructions?.length}
    <div class="content instructions"><Blocks blocks={exercise.instructions} /></div>
  {/if}
  <div class="content prompt"><Blocks blocks={exercise.prompt} /></div>

  {#if auto && exercise.answer}
    <AnswerInput
      answer={exercise.answer}
      bind:values
      disabled={!triesLeft}
      partStates={result && !result.parseError ? (result.parts?.map((p) => p.correct) ?? []) : []}
      onsubmit={submit}
    />
  {/if}

  {#if message}
    <p class="feedback" class:good={solved} class:bad={!solved && !result?.parseError} class:warn={!!result?.parseError && !solved}>
      {message}
    </p>
  {/if}

  {#if hintShown > 0 && exercise.hints}
    <div class="hints">
      {#each exercise.hints.slice(0, hintShown) as h, i (i)}
        <div class="hint"><span class="tag">Hint{exercise.hints.length > 1 ? ` ${i + 1}` : ''}</span> {@html inlineHtml(h)}</div>
      {/each}
    </div>
  {/if}

  {#if revealed || (solved && exercise.solution)}
    <section class="solution" class:collapsed={solved && !revealed}>
      {#if solved && !revealed}
        <button class="btn ghost small" onclick={() => (revealed = true)}>Show the book’s solution</button>
      {:else}
        {#if exercise.steps?.length}
          <div class="steps">
            <div class="tag">Step by step</div>
            <ol>
              {#each exercise.steps as s, i (i)}<li>{@html inlineHtml(s)}</li>{/each}
            </ol>
          </div>
        {/if}
        {#if computedAnswer}
          <div class="tag">Answer for these numbers</div>
          <p class="content">{@html inlineHtml(computedAnswer)}</p>
        {:else if exercise.solution}
          <SolutionLabel label={exercise.solution.label} />
          <div class="content"><Blocks blocks={exercise.solution.body} /></div>
        {:else}
          <p class="muted">No answer for this exercise yet. The book only answers odd-numbered exercises; a content chat will add one.</p>
        {/if}
      {/if}
    </section>
  {/if}

  <div class="actions">
    {#if auto}
      {#if triesLeft}
        <button class="btn primary" onclick={submit}>Check <kbd>Enter</kbd></button>
        {#if wrong > 0 && hasHints && hintShown < (exercise.hints?.length ?? 0)}
          <button class="btn" onclick={showHint}>Hint <kbd>H</kbd></button>
        {/if}
        {#if wrong > 0}<button class="btn ghost" onclick={giveUp}>Show solution</button>{/if}
      {:else}
        <button class="btn primary" onclick={() => finish()}>Next <kbd>Space</kbd></button>
        {#if !solved}
          <button class="btn ghost small" title="Use this if your answer was right but the checker missed it" onclick={() => finish(true)}>I was right</button>
        {/if}
      {/if}
    {:else if !revealed}
      <p class="muted self-note">Work it out, then check yourself.</p>
      <button class="btn primary" onclick={() => (revealed = true)}>Reveal answer <kbd>Space</kbd></button>
    {:else}
      <button class="btn good" onclick={() => judge(true)}>✓ I got it <kbd>Y</kbd></button>
      <button class="btn bad" onclick={() => judge(false)}>✗ I missed it <kbd>N</kbd></button>
    {/if}
  </div>
</article>

<style>
  .instructions { color: var(--muted); font-size: 0.95rem; }
  .instructions :global(p:last-child) { margin-bottom: 0.5em; }
  .prompt { font-size: 1.05rem; }
  .hints { display: flex; flex-direction: column; gap: 8px; margin: 10px 0; }
  .hint { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 0.6em 0.9em; }
  .tag { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-right: 0.4em; }
  .steps ol { padding-left: 1.3em; margin: 0.4em 0 1em; }
  .steps li { margin: 0.3em 0; }
  .self-note { margin: 0 auto 0 0; align-self: center; }
  .btn.good { border-color: #2f5a3d; }
  .btn.bad { border-color: #5a2f2f; }
  .collapsed { border-top: none; padding-top: 0; }
</style>
