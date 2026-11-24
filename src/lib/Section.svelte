<script lang="ts">
  import type { BookIndex } from '../content/types';
  import { loadIndex } from '../content/load';
  import { CALC } from './subjects';
  import { fmtTime } from './progress.svelte';
  import { firstTry, nextUnitId, pct, unitComplete, unitFraction } from '../progress/derive';
  import { progress } from '../progress/store.svelte';
  import { mistakes } from '../practice/store.svelte';

  /** B15: one section's stats, with open / redo. */
  let { unitId }: { unitId: string } = $props();

  let index = $state<BookIndex | null>(null);
  let error = $state('');
  loadIndex().then((i) => (index = i)).catch((e: Error) => (error = e.message));

  const found = $derived.by(() => {
    if (!index) return null;
    const order = index.volumes.flatMap((v) => v.chapters.flatMap((c) => c.units.map((u) => ({ v, c, u }))));
    const i = order.findIndex((x) => x.u.id === unitId);
    if (i < 0) return null;
    return { ...order[i], prev: order[i - 1]?.u, next: order[i + 1]?.u };
  });

  const stats = $derived.by(() => {
    if (!found) return null;
    const d = progress.d;
    const u = found.u;
    const read = Math.min(d.read.get(u.id)?.size ?? 0, u.reading);
    const done = Math.min(d.done.get(u.id)?.size ?? 0, u.exercises);
    const correct = Math.min(d.correct.get(u.id)?.size ?? 0, u.exercises);
    const ft = firstTry(d, [u]);
    const inQueue = [...mistakes.cards.values()].filter((c) => c.unit === u.id);
    const now = Date.now();
    const due = inQueue.filter((c) => c.card.due.getTime() <= now).length;
    return {
      f: unitFraction(d, u),
      complete: unitComplete(d, u),
      tested: d.testedOut.has(u.id),
      read,
      done,
      correct,
      ft,
      ms: d.unitMs.get(u.id) ?? 0,
      last: d.unitLast.get(u.id),
      inQueue: inQueue.length,
      due,
    };
  });

  const isNext = $derived(index ? nextUnitId(progress.d, index) === unitId : false);
  const meta = $derived(CALC.find((c) => c.volume === found?.v.volume) ?? CALC[0]);
  const num = $derived(unitId.slice(3));

  function when(t: number | undefined): string {
    if (!t) return 'Not yet';
    const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86400e3);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
</script>

<header class="top">
  <a href={found ? `#/calc/${found.v.volume}` : '#/map'} aria-label="Course map">←</a>
  <span class="crumb">{meta.name}{#if found} · Ch. {found.c.chapter} {found.c.title}{/if}</span>
</header>

{#if error}
  <p class="feedback bad">{error}</p>
{:else if !index}
  <p class="muted">Loading…</p>
{:else if !found || !stats}
  <p class="feedback bad">No section §{num}.</p>
{:else}
  <div style="--c: {meta.color}">
    <h1><span class="num">§{num}</span> {found.u.title}</h1>

    <div class="headline">
      <span class="big">{Math.floor(pct(stats.f) * 100)}<small>%</small></span>
      {#if stats.tested}<span class="done tested">◆ Tested out</span>{:else if stats.complete}<span class="done">✓ Finished</span>{/if}
    </div>
    <div class="bar" class:tested={stats.tested} aria-hidden="true"><div style="width: {pct(stats.f) * 100}%"></div></div>

    <div class="actions">
      {#if stats.complete}
        <a class="btn primary" href="#/unit/{unitId}/exercises">Redo exercises</a>
        <a class="btn" href="#/unit/{unitId}/start">Redo from the start</a>
        <a class="btn" href="#/unit/{unitId}">Open where I left off</a>
      {:else}
        <a class="btn primary" href="#/unit/{unitId}">{stats.f.done ? 'Continue' : 'Start'} §{num}</a>
        {#if stats.f.done}<a class="btn" href="#/unit/{unitId}/start">Start over</a>{/if}
      {/if}
      {#if !stats.complete}
        <a class="btn test" href="#/test/{unitId}">Test out of §{num}</a>
      {/if}
      {#if !stats.complete && !isNext}
        <p class="note">Not next in book order. You can still do it now.</p>
      {/if}
    </div>

    <dl class="stats">
      <div><dt>Reading</dt><dd>{stats.read} / {found.u.reading} cards</dd></div>
      <div><dt>Exercises done</dt><dd>{stats.done} / {found.u.exercises}</dd></div>
      <div><dt>Solved correctly</dt><dd>{stats.correct} / {found.u.exercises}</dd></div>
      <div>
        <dt>First-try accuracy</dt>
        <dd>{stats.ft.total ? `${Math.round(pct(stats.ft) * 100)}%` : '–'}{#if stats.ft.total}{' '}<span class="muted">({stats.ft.done} of {stats.ft.total})</span>{/if}</dd>
      </div>
      <div><dt>Auto-checked</dt><dd>{found.u.auto} of {found.u.exercises}</dd></div>
      <div><dt>Time in section</dt><dd>{stats.ms ? fmtTime(stats.ms) : '–'}</dd></div>
      <div>
        <dt>Mistakes to practise</dt>
        <dd>{stats.inQueue}{#if stats.due}{' '}<span class="muted">({stats.due} due now)</span>{/if}</dd>
      </div>
      <div><dt>Last studied</dt><dd>{when(stats.last)}</dd></div>
    </dl>

    <nav class="sib">
      {#if found.prev}<a href="#/section/{found.prev.id}">← §{found.prev.id.slice(3)}</a>{:else}<span></span>{/if}
      {#if found.next}<a href="#/section/{found.next.id}">§{found.next.id.slice(3)} →</a>{/if}
    </nav>
  </div>
{/if}

<style>
  .top { display: flex; gap: 12px; align-items: baseline; padding-top: calc(18px + env(safe-area-inset-top, 0px)); }
  .top a { color: var(--muted); font-size: 1.1rem; }
  .crumb { color: var(--muted); font-size: 0.85rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  h1 { font-family: var(--serif); font-weight: 600; font-size: 1.5rem; margin: 12px 0 14px; line-height: 1.25; }
  .num { color: var(--c); }
  .headline { display: flex; align-items: baseline; gap: 12px; }
  .big { font-size: 2.2rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .big small { font-size: 0.5em; color: var(--muted); font-weight: 500; }
  .done { color: var(--c); font-weight: 600; }
  .bar { height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden; margin: 6px 0 18px; }
  .bar div { height: 100%; background: var(--c); border-radius: 3px; }
  .bar.tested div { background: var(--tested); }
  .done.tested { color: var(--tested); }
  .btn.test { border-color: var(--tested); color: var(--tested); }
  .actions { display: flex; flex-direction: column; gap: 8px; margin-bottom: 22px; }
  .actions .btn { width: 100%; }
  .note { font-size: 0.8rem; color: var(--faint); margin: 0; text-align: center; }
  .stats { margin: 0; border-top: 1px solid var(--surface-2); }
  .stats div { display: flex; justify-content: space-between; gap: 12px; padding: 10px 2px; border-bottom: 1px solid var(--surface-2); }
  dt { color: var(--muted); }
  dd { margin: 0; font-variant-numeric: tabular-nums; text-align: right; }
  .sib { display: flex; justify-content: space-between; margin-top: 18px; font-size: 0.9rem; }
</style>
