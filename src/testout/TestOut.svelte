<script lang="ts">
  import ExerciseCard from '../cards/ExerciseCard.svelte';
  import type { Outcome } from '../cards/types';
  import type { BookIndex, Unit } from '../content/types';
  import { loadIndex, loadUnit, sourceLabel } from '../content/load';
  import { CALC } from '../lib/subjects';
  import { trackActiveTime } from '../progress/activity';
  import { progress } from '../progress/store.svelte';
  import { buildTest, newSeed, testSize, type Pick, type Scope } from './pick';

  /**
   * Test out of a section (`V1.2.3`), a chapter (`V1.2`) or a calculus unit (`V1`).
   * An assortment of the harder exercises, one try each; get every one right and the sections
   * count as complete (shown in their own colour). One miss ends the test.
   */
  let { target }: { target: string } = $props();

  const scope: Scope = $derived(/^V\d\.\d+\.\d+$/.test(target) ? 'section' : /^V\d\.\d+$/.test(target) ? 'chapter' : 'volume');

  let index = $state<BookIndex | null>(null);
  let error = $state('');
  loadIndex().then((i) => (index = i)).catch((e: Error) => (error = e.message));

  const info = $derived.by(() => {
    if (!index) return null;
    const [vol, ch] = target.slice(1).split('.').map(Number);
    const v = index.volumes.find((x) => x.volume === vol);
    if (!v) return null;
    const meta = CALC.find((c) => c.volume === vol) ?? CALC[0];
    if (scope === 'volume') return { meta, units: v.chapters.flatMap((c) => c.units), title: meta.name, back: `#/calc/${vol}` };
    const c = v.chapters.find((x) => x.chapter === ch);
    if (!c) return null;
    if (scope === 'chapter') return { meta, units: c.units, title: `Chapter ${c.chapter}: ${c.title}`, back: `#/calc/${vol}` };
    const u = c.units.find((x) => x.id === target);
    if (!u) return null;
    return { meta, units: [u], title: `§${target.slice(3)} ${u.title}`, back: `#/section/${target}` };
  });

  const already = $derived(!!info && info.units.every((u) => progress.d.testedOut.has(u.id)));

  type Phase = 'intro' | 'loading' | 'run' | 'passed' | 'failed';
  let phase = $state<Phase>('intro');
  let problems = $state.raw<Pick[]>([]);
  let at = $state(0);
  let missed = $state<Pick | null>(null);
  let cardRef: { primary?: () => void; key?: (k: string) => boolean } | undefined = $state();

  $effect(() => {
    if (phase === 'run') return trackActiveTime((ms) => progress.recordTime(ms));
  });

  async function start() {
    if (!info) return;
    phase = 'loading';
    error = '';
    try {
      const units: Unit[] = await Promise.all(info.units.map((u) => loadUnit(u.id)));
      problems = buildTest(units, scope, newSeed());
      if (!problems.length) {
        error = 'This has no checkable exercises to test you on yet.';
        phase = 'intro';
        return;
      }
      at = 0;
      missed = null;
      phase = 'run';
      window.scrollTo({ top: 0 });
    } catch (e) {
      error = `${(e as Error).message}. This isn’t available offline yet.`;
      phase = 'intro';
    }
  }

  function record(passed: boolean, score: number) {
    if (!info) return;
    void progress.record({ type: 'testout', scope, target, units: info.units.map((u) => u.id), passed, score, total: problems.length });
  }

  function done(o: Outcome) {
    const p = problems[at];
    window.scrollTo({ top: 0 });
    // Right on the one try, a self-check marked "I got it", or "I was right" when the checker missed it.
    if (!o.correct) {
      missed = p;
      record(false, at);
      phase = 'failed';
      return;
    }
    if (at + 1 >= problems.length) {
      record(true, problems.length);
      phase = 'passed';
      return;
    }
    at++;
  }

  function onkey(e: KeyboardEvent) {
    if (phase !== 'run' || e.metaKey || e.ctrlKey || e.altKey) return;
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

  const n = $derived(info ? testSize(scope, info.units.length) : 0);
  const scopeName = $derived(scope === 'section' ? 'section' : scope === 'chapter' ? 'chapter' : 'unit');
</script>

<svelte:window onkeydown={onkey} />

<header class="top">
  <a href={info?.back ?? '#/'} aria-label="Back">←</a>
  <h1>Test out</h1>
  {#if phase === 'run'}<span class="count">{at + 1} / {problems.length}</span>{/if}
</header>

{#if !index && !error}
  <p class="muted">Loading…</p>
{:else if index && !info}
  <p class="feedback bad">Nothing to test for {target}.</p>
{:else if info}
  <div style="--c: {info.meta.color}">
    {#if phase === 'intro' || phase === 'loading'}
      <article class="card">
        <div class="kicker">{info.meta.name}</div>
        <h2>{info.title}</h2>
        <p>
          About {n} of the harder exercises from {info.units.length === 1 ? 'this section' : `its ${info.units.length} sections`}.
          You get <strong>one try</strong> each, with no hints. Miss one and the test ends.
        </p>
        <p>
          Get them all right and {info.units.length === 1 ? 'the section counts' : `all ${info.units.length} sections count`} as complete,
          marked <span class="tested">◆ tested out</span> so you can tell them apart from ones you worked through.
        </p>
        {#if already}<p class="note"><span class="tested">◆</span> You already tested out of this {scopeName}.</p>{/if}
        {#if error}<p class="feedback bad">{error}</p>{/if}
        <div class="actions">
          <button class="btn primary" disabled={phase === 'loading'} onclick={start}>{phase === 'loading' ? 'Choosing problems…' : 'Start the test'}</button>
          <a class="btn ghost" href={info.back}>Not now</a>
        </div>
      </article>
    {:else if phase === 'run' && problems[at]}
      {@const p = problems[at]}
      <div class="bar" aria-hidden="true"><div style="width: {(at / problems.length) * 100}%"></div></div>
      {#key `${p.unit}/${p.exercise.id}#${at}`}
        <ExerciseCard
          bind:this={cardRef}
          exercise={p.exercise}
          unitId={p.unit}
          kicker={`Test out · ${sourceLabel(p.unit, p.exercise.number)}`}
          oneTry
          ondone={done}
        />
      {/key}
    {:else if phase === 'passed'}
      <article class="card center">
        <div class="big tested">◆</div>
        <h2>Passed</h2>
        <p>All {problems.length} right. {info.units.length === 1 ? 'This section is' : `These ${info.units.length} sections are`} now marked as tested out.</p>
        <div class="actions"><a class="btn primary" href={info.back}>Done</a></div>
      </article>
    {:else if phase === 'failed'}
      <article class="card center">
        <h2>Not this time</h2>
        <p class="muted">
          {at} of {problems.length} right before a miss{#if missed}{' '}on {sourceLabel(missed.unit, missed.exercise.number)}{/if}.
          Work through {info.units.length === 1 ? 'the section' : 'the sections'}, or retake the test. You’ll get a new set of problems.
        </p>
        <div class="actions">
          <button class="btn primary" onclick={start}>Retake</button>
          {#if missed}<a class="btn" href="#/section/{missed.unit}">Go to §{missed.unit.slice(3)}</a>{/if}
          <a class="btn ghost" href={info.back}>Back</a>
        </div>
      </article>
    {/if}
  </div>
{:else if error}
  <p class="feedback bad">{error}</p>
{/if}

<style>
  .top { display: flex; gap: 12px; align-items: baseline; padding-top: calc(18px + env(safe-area-inset-top, 0px)); margin-bottom: 12px; }
  .top a { color: var(--muted); font-size: 1.1rem; }
  h1 { font-family: var(--serif); font-weight: 600; font-size: 1.5rem; margin: 0; flex: 1; }
  h2 { font-family: var(--serif); font-weight: 600; margin: 4px 0 12px; }
  .count { color: var(--muted); font-size: 0.85rem; font-variant-numeric: tabular-nums; }
  .tested { color: var(--tested); font-weight: 600; }
  .big { font-size: 2.4rem; line-height: 1; }
  .note { font-size: 0.9rem; color: var(--muted); }
  .center { text-align: center; }
  .center .actions { justify-content: center; }
  .bar { height: 4px; background: var(--surface-2); border-radius: 2px; overflow: hidden; margin: 0 0 12px; }
  .bar div { height: 100%; background: var(--tested); }
</style>
