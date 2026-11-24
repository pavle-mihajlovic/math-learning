<script lang="ts">
  import ExerciseCard from '../cards/ExerciseCard.svelte';
  import type { Outcome } from '../cards/types';
  import type { Exercise } from '../content/types';
  import { loadUnit, sourceLabel } from '../content/load';
  import { instantiateVariant } from '../content/variant';
  import { trackActiveTime } from '../progress/activity';
  import { progress } from '../progress/store.svelte';
  import { answerText } from './answerText';
  import { nextDue, variantSeed, type MistakeCard } from './queue';
  import { mistakes } from './store.svelte';

  /**
   * B13: Practice mistakes (D14, D24). Separate from the main flow. Missed exercises come back
   * when FSRS says they're due, with new numbers when the exercise has a variant template.
   */
  interface Prepared {
    card: MistakeCard;
    exercise: Exercise;
    seed: number;
    variant: boolean;
    computed?: string;
  }

  let queue = $state.raw<MistakeCard[]>(mistakes.due());
  let at = $state(0);
  let practiced = $state(0);
  let current = $state.raw<Prepared | null>(null);
  let error = $state('');
  let cardRef: { primary?: () => void; key?: (k: string) => boolean } | undefined = $state();
  let now = $state(Date.now());

  $effect(() => trackActiveTime((ms) => progress.recordTime(ms)));
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 15_000);
    return () => clearInterval(id);
  });

  async function prepare(c: MistakeCard): Promise<Prepared | null> {
    const unit = await loadUnit(c.unit);
    const ex = unit.exercises.find((e) => e.id === c.item);
    if (!ex) return null; // the exercise was removed in a content update
    const seed = variantSeed(c.key, c.reviews);
    if (ex.variant) {
      try {
        const v = instantiateVariant(ex.variant, seed);
        return {
          card: c,
          seed,
          variant: true,
          computed: answerText(v.answer),
          exercise: { ...ex, prompt: v.prompt, answer: v.answer, check: 'auto', solution: undefined, steps: undefined },
        };
      } catch {
        /* a broken template: fall back to the original exercise */
      }
    }
    return { card: c, seed, variant: false, exercise: ex };
  }

  $effect(() => {
    const c = queue[at];
    current = null;
    error = '';
    if (!c) return;
    let cancelled = false;
    prepare(c)
      .then((p) => {
        if (cancelled) return;
        if (p) current = p;
        else at++;
      })
      .catch((e: Error) => {
        if (!cancelled) error = `${e.message}. This unit isn’t available offline yet.`;
      });
    return () => (cancelled = true);
  });

  function done(o: Outcome) {
    if (!current) return;
    const p = current;
    progress.recordReview(
      p.card.unit,
      p.card.item,
      { correct: o.correct, firstTry: o.firstTry, tries: o.attempts, sawSolution: o.sawSolution, self: o.selfChecked },
      p.seed,
      p.variant,
    );
    practiced++;
    at++;
    window.scrollTo({ top: 0 });
  }

  function skip() {
    at++;
  }

  function restart() {
    queue = mistakes.due();
    at = 0;
  }

  const total = $derived(mistakes.cards.size);
  const dueNow = $derived(mistakes.due(now).length);
  const upcoming = $derived(nextDue(mistakes.cards, now));

  function until(t: number): string {
    const m = Math.round((t - now) / 60_000);
    if (m < 1) return 'in under a minute';
    if (m < 60) return `in ${m} min`;
    const h = Math.round(m / 60);
    if (h < 36) return `in ${h} h`;
    return `in ${Math.round(h / 24)} days`;
  }

  function onkey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'MATH-FIELD' || el?.isContentEditable) {
      if (e.key === 'Escape') el?.blur();
      return;
    }
    if (e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) return;
    if (cardRef?.key?.(e.key.toLowerCase())) {
      e.preventDefault();
      return;
    }
    if ((e.key === ' ' || e.key === 'Enter') && cardRef?.primary) {
      e.preventDefault();
      cardRef.primary();
    }
  }
</script>

<svelte:window onkeydown={onkey} />

<header class="top">
  <a href="#/" aria-label="Back">←</a>
  <h1>Practice mistakes</h1>
  {#if queue[at]}<span class="count">{at + 1} / {queue.length}</span>{/if}
</header>

{#if error}
  <p class="feedback bad">{error}</p>
  <div class="actions"><button class="btn" onclick={skip}>Skip it for now</button></div>
{:else if queue[at]}
  {#if current}
    {#key `${current.card.key}#${at}`}
      <ExerciseCard
        bind:this={cardRef}
        exercise={current.exercise}
        unitId={current.card.unit}
        kicker={`${sourceLabel(current.card.unit, current.exercise.number)} · ${current.variant ? 'new numbers' : 'same problem'}`}
        computedAnswer={current.computed}
        ondone={done}
      />
    {/key}
  {:else}
    <p class="muted">Loading…</p>
  {/if}
{:else}
  <article class="card center">
    {#if practiced}
      <h2>Done for now</h2>
      <p class="muted">{practiced} practiced.</p>
    {:else}
      <h2>Nothing due</h2>
    {/if}
    {#if total === 0}
      <p class="muted">Exercises you miss in the main flow show up here, on a spaced-repetition schedule.</p>
    {:else}
      <p class="muted">
        {total} exercise{total === 1 ? '' : 's'} in the queue{#if dueNow} · {dueNow} due now{:else if upcoming} · next one {until(upcoming)}{/if}.
      </p>
    {/if}
    <div class="actions">
      {#if dueNow}<button class="btn primary" onclick={restart}>Practice {dueNow} more</button>{/if}
      <a class="btn" href="#/">Back</a>
    </div>
  </article>
{/if}

<style>
  .top { display: flex; gap: 12px; align-items: baseline; padding-top: calc(18px + env(safe-area-inset-top, 0px)); margin-bottom: 12px; }
  .top a { color: var(--muted); font-size: 1.1rem; }
  h1 { font-family: var(--serif); font-weight: 600; font-size: 1.5rem; margin: 0; flex: 1; }
  .count { color: var(--muted); font-size: 0.85rem; font-variant-numeric: tabular-nums; }
  .center { text-align: center; }
  .center .actions { justify-content: center; }
</style>
