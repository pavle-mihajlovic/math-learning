<script lang="ts">
  import type { Unit } from '../content/types';
  import { loadUnit, unitOrder } from '../content/load';
  import { inlineHtml } from '../content/render';
  import { getPosition, setPosition } from '../lib/settings.svelte';
  import { markCompleted, markRead, markSolved } from '../lib/progress.svelte';
  import type { ReadingCard } from '../content/types';
  import ExerciseCard from './ExerciseCard.svelte';
  import ProofCard from './ProofCard.svelte';
  import TextCard from './TextCard.svelte';
  import TryCard from './TryCard.svelte';
  import { buildSteps, type Outcome, type Step } from './types';

  let { unitId }: { unitId: string } = $props();

  let unit = $state<Unit | null>(null);
  let error = $state('');
  let steps = $state<Step[]>([]);
  let at = $state(0);
  let outcomes = $state<Record<string, Outcome>>({});
  let nextUnit = $state<{ id: string; title: string } | null>(null);
  let cardRef: { primary?: () => void; key?: (k: string) => boolean } | undefined = $state();
  let topEl: HTMLElement | undefined = $state();

  $effect(() => {
    const id = unitId;
    unit = null;
    error = '';
    outcomes = {};
    loadUnit(id)
      .then((u) => {
        unit = u;
        steps = buildSteps(u.reading, u.exercises, u.proofs);
        at = Math.min(getPosition(id), steps.length - 1);
      })
      .catch((e: Error) => (error = e.message));
    unitOrder()
      .then((order) => {
        const i = order.findIndex((u) => u.id === id);
        nextUnit = i >= 0 && i + 1 < order.length ? order[i + 1] : null;
      })
      .catch(() => (nextUnit = null));
  });

  const step = $derived(steps[at]);

  function go(i: number) {
    at = Math.max(0, Math.min(steps.length - 1, i));
    setPosition(unitId, at);
    topEl?.scrollIntoView({ block: 'start' });
    window.scrollTo({ top: 0 });
  }

  const next = () => go(at + 1);
  const prev = () => go(at - 1);

  function record(id: string, o: Outcome) {
    outcomes[id] = o;
    if (o.correct) markSolved(unitId, id);
    next();
  }

  function readDone(card: ReadingCard) {
    markRead(unitId, card);
    next();
  }

  $effect(() => {
    if (step?.kind === 'complete') markCompleted(unitId);
  });

  function skipProofs() {
    const i = steps.findIndex((s) => s.kind === 'complete');
    go(i);
  }

  function jumpToExercises() {
    const i = steps.findIndex((s) => s.kind === 'exercise');
    if (i >= 0) go(i);
  }

  // Header text for where you are in the unit.
  const where = $derived.by(() => {
    if (!step) return '';
    switch (step.kind) {
      case 'reading': return `Reading ${step.n} of ${step.of}`;
      case 'exercise': return `Exercises · chunk ${step.chunk} of ${step.chunks} · ${step.pos}/${step.size}`;
      case 'chunk-end': return `Chunk ${step.chunk} of ${step.chunks} done`;
      case 'proofs-intro': return 'Proof cards';
      case 'proof': return `Proof card ${step.n} of ${step.of}`;
      case 'complete': return 'Unit complete';
    }
  });

  const chunkStats = $derived.by(() => {
    if (step?.kind !== 'chunk-end') return null;
    const os = step.ids.map((id) => outcomes[id]).filter(Boolean);
    return { done: os.length, right: os.filter((o) => o.correct).length, total: step.ids.length };
  });

  const unitStats = $derived.by(() => {
    const os = Object.values(outcomes);
    return {
      done: os.length,
      right: os.filter((o) => o.correct).length,
      firstTry: os.filter((o) => o.firstTry && !o.selfChecked).length,
    };
  });

  function isTyping(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'MATH-FIELD' || el.isContentEditable;
  }

  function onkey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || !step) return;
    if (isTyping(e.target)) {
      if (e.key === 'Escape') (e.target as HTMLElement).blur();
      return;
    }
    if (e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) {
      // Let the focused button handle its own activation.
      return;
    }
    const k = e.key.toLowerCase();
    if (cardRef?.key?.(k)) {
      e.preventDefault();
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (cardRef?.primary) cardRef.primary();
      else if (step.kind !== 'exercise') next();
    } else if (e.key === 'ArrowRight' && (step.kind === 'reading' || step.kind === 'proof')) {
      next();
    } else if (e.key === 'ArrowLeft' && at > 0 && steps[at - 1]?.kind !== 'exercise') {
      prev();
    }
  }

  // Swipe between reading cards (left = next, right = back).
  let touch: { x: number; y: number; t: number } | null = null;
  function touchstart(e: TouchEvent) {
    if (e.touches.length !== 1 || isTyping(e.target)) return;
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }
  function touchend(e: TouchEvent) {
    if (!touch || !step) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    const quick = Date.now() - touch.t < 600;
    touch = null;
    if (!quick || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    if ((e.target as HTMLElement).closest('.math-block, .display-math, .table-wrap, .keys, math-field')) return;
    if (dx < 0 && (step.kind === 'reading' && step.card.kind === 'text')) next();
    if (dx > 0 && at > 0 && (step.kind === 'reading' || step.kind === 'proof') && steps[at - 1]?.kind !== 'exercise') prev();
  }
</script>

<svelte:window onkeydown={onkey} />

<div class="player" role="region" aria-label="Unit" bind:this={topEl} ontouchstart={touchstart} ontouchend={touchend}>
  {#if error}
    <p class="feedback bad">{error}</p>
    <a href="#/">Back home</a>
  {:else if !unit || !step}
    <p class="muted">Loading…</p>
  {:else}
    <header class="unit-head">
      <div class="crumbs">
        <a href="#/calc/{unit.volume}" aria-label="Sections">←</a>
        <span class="unit-title">§{unit.chapter}.{unit.section} {unit.title}</span>
      </div>
      <div class="where">
        <span>{where}</span>
        {#if step.kind === 'reading' && steps.some((s) => s.kind === 'exercise')}
          <button class="link" onclick={jumpToExercises}>Skip to exercises</button>
        {/if}
      </div>
      <div class="bar" aria-hidden="true"><div class="fill" style="width: {((at + 1) / steps.length) * 100}%"></div></div>
    </header>

    {#key at}
      {#if step.kind === 'reading'}
        {#if step.card.kind === 'text'}
          {#if step.n === 1 && unit.objectives.length}
            <section class="objectives">
              <div class="kicker">Learning objectives</div>
              <ul>
                {#each unit.objectives as o, i (i)}<li>{@html inlineHtml(o)}</li>{/each}
              </ul>
            </section>
          {/if}
          <TextCard card={step.card} ondone={() => readDone(step.card)} />
        {:else}
          <TryCard bind:this={cardRef} card={step.card} ondone={() => readDone(step.card)} />
        {/if}
        {#if at > 0 && steps[at - 1]?.kind === 'reading'}
          <button class="link back" onclick={prev}>← Previous card</button>
        {/if}
      {:else if step.kind === 'exercise'}
        <ExerciseCard bind:this={cardRef} exercise={step.ex} unitId={unit.id} ondone={(o) => record(step.ex.id, o)} />
      {:else if step.kind === 'chunk-end'}
        <article class="card center">
          <div class="kicker">Chunk {step.chunk} of {step.chunks}</div>
          <h2>Chunk done</h2>
          {#if chunkStats}
            <p class="big">{chunkStats.right} / {chunkStats.total}</p>
            <p class="muted">correct in this chunk</p>
          {/if}
          <div class="actions"><button class="btn primary" onclick={next}>Continue <kbd>Space</kbd></button></div>
        </article>
      {:else if step.kind === 'proofs-intro'}
        <article class="card center">
          <div class="kicker">Optional</div>
          <h2>{step.count} proof card{step.count === 1 ? '' : 's'}</h2>
          <p class="muted">Proofs of this section’s theorems. They don’t count toward progress.</p>
          <div class="actions">
            <button class="btn primary" onclick={next}>Read proofs <kbd>Space</kbd></button>
            <button class="btn" onclick={skipProofs}>Skip</button>
          </div>
        </article>
      {:else if step.kind === 'proof'}
        <ProofCard bind:this={cardRef} card={step.card} ondone={next} />
      {:else if step.kind === 'complete'}
        <article class="card center">
          <div class="kicker">§{unit.chapter}.{unit.section}</div>
          <h2>Unit complete</h2>
          {#if unitStats.done}
            <p class="big">{unitStats.right} / {unitStats.done}</p>
            <p class="muted">exercises correct this session · {unitStats.firstTry} auto-checked on the first try</p>
          {/if}
          <div class="actions">
            {#if nextUnit}<a class="btn primary" href="#/unit/{nextUnit.id}">Next: {nextUnit.title} →</a>{/if}
            <button class="btn" onclick={() => go(0)}>Start this unit again</button>
          </div>
        </article>
      {/if}
    {/key}

    <footer class="attribution">
      {unit.source.attribution}
      <a href={unit.source.url} target="_blank" rel="noopener">Original section</a> ·
      <a href={unit.source.licenseUrl} target="_blank" rel="noopener">{unit.source.license}</a>
    </footer>
  {/if}
</div>

<style>
  .player { padding-bottom: calc(40px + var(--safe-bottom)); }
  .unit-head {
    position: sticky;
    top: 0;
    z-index: 5;
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    padding: calc(10px + env(safe-area-inset-top, 0px)) 0 8px;
    margin-bottom: 14px;
  }
  .crumbs { display: flex; gap: 10px; align-items: baseline; }
  .crumbs a { font-size: 1.1rem; color: var(--muted); padding: 0 4px; }
  .unit-title { font-weight: 600; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .where { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--muted); margin: 4px 0 6px; }
  .bar { height: 3px; background: var(--surface-2); border-radius: 2px; overflow: hidden; }
  .fill { height: 100%; background: var(--text); transition: width 0.2s; }
  .link { background: none; border: none; padding: 0; color: var(--accent); font-size: inherit; }
  .back { margin-top: 12px; font-size: 0.9rem; }
  .objectives { margin-bottom: 18px; color: var(--muted); font-size: 0.92rem; }
  .objectives ul { margin: 0.3em 0 0; padding-left: 1.2em; }
  .center { text-align: center; }
  .center .actions { justify-content: center; }
  .big { font-size: 2.4rem; font-weight: 650; margin: 0.2em 0 0; font-variant-numeric: tabular-nums; }
  .attribution { margin-top: 40px; font-size: 0.75rem; color: var(--faint); line-height: 1.5; }
  .attribution a { color: var(--faint); text-decoration: underline; }
</style>
