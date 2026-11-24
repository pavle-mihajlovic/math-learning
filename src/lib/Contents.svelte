<script lang="ts">
  import type { BookIndex } from '../content/types';
  import { loadIndex } from '../content/load';
  import { CALC } from './subjects';
  import { nextUnitId, unitComplete } from '../progress/derive';
  import { progress } from '../progress/store.svelte';
  import { solvedIn } from './progress.svelte';

  /** One calculus unit's sections, with progress per chapter and section. */
  let { volume }: { volume: number } = $props();

  let index = $state<BookIndex | null>(null);
  let error = $state('');
  loadIndex().then((i) => (index = i)).catch((e: Error) => (error = e.message));

  const meta = $derived(CALC.find((c) => c.volume === volume) ?? CALC[0]);
  const vol = $derived(index?.volumes.find((v) => v.volume === volume));
  const solved = (id: string, total: number) => Math.min(total, solvedIn(id));
  const nextId = $derived(index ? nextUnitId(progress.d, index) : null);
</script>

<header class="top" style="--c: {meta.color}">
  <a href="#/" aria-label="Home">←</a>
  <h1><span class="numeral">{meta.numeral}</span> {meta.name}</h1>
</header>

{#if error}
  <p class="feedback bad">{error}</p>
{:else if !vol}
  <p class="muted">Loading…</p>
{:else}
  {#each vol.chapters as c (c.chapter)}
    {@const total = c.units.reduce((a, u) => a + u.exercises, 0)}
    {@const done = c.units.reduce((a, u) => a + solved(u.id, u.exercises), 0)}
    <section style="--c: {meta.color}">
      <h3>
        <span>{c.chapter}. {c.title}</span>
        <span class="chpct">{total ? Math.floor((done / total) * 100) : 0}%</span>
      </h3>
      <ol class="units">
        {#each c.units as u (u.id)}
          {@const s = solved(u.id, u.exercises)}
          {@const complete = unitComplete(progress.d, u)}
          <li>
            <a href="#/unit/{u.id}" class:current={u.id === nextId}>
              <span class="num">{c.chapter}.{u.id.split('.')[2]}</span>
              <span class="title">{u.title}</span>
              <span class="count" class:complete>{complete ? '✓' : ''} {s}/{u.exercises}</span>
            </a>
            <div class="ubar" aria-hidden="true"><div style="width: {u.exercises ? (s / u.exercises) * 100 : 0}%"></div></div>
          </li>
        {/each}
      </ol>
    </section>
  {/each}
{/if}

<style>
  .top { display: flex; gap: 12px; align-items: baseline; padding-top: calc(18px + env(safe-area-inset-top, 0px)); }
  .top a { color: var(--muted); font-size: 1.1rem; }
  h1 { font-family: var(--serif); font-weight: 600; font-size: 1.6rem; margin: 0 0 10px; }
  .numeral { color: var(--c); margin-right: 4px; }
  h3 { display: flex; justify-content: space-between; gap: 12px; font-size: 1rem; font-weight: 600; margin: 22px 0 6px; }
  .chpct { color: var(--c); font-variant-numeric: tabular-nums; font-size: 0.9rem; }
  .units { list-style: none; padding: 0; margin: 0; }
  .units li { border-bottom: 1px solid var(--surface-2); }
  .units a { display: flex; gap: 12px; padding: 9px 4px 6px; color: var(--text); text-decoration: none; }
  .units a:hover { background: var(--surface); }
  .units a.current .title { color: var(--accent); }
  .num { color: var(--muted); min-width: 2.6em; font-variant-numeric: tabular-nums; }
  .title { flex: 1; }
  .count { color: var(--faint); font-size: 0.85rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .count.complete { color: var(--c); }
  .ubar { height: 2px; margin: 0 4px 0 calc(2.6em + 16px); background: transparent; }
  .ubar div { height: 100%; background: var(--c); border-radius: 1px; }
</style>
