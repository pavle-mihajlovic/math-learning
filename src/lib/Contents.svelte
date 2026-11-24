<script lang="ts">
  import type { BookIndex } from '../content/types';
  import { loadIndex } from '../content/load';
  import { CALC } from './subjects';
  import { chapterFraction, nextUnitId, pct, unitComplete, unitFraction, volumeFraction } from '../progress/derive';
  import { progress } from '../progress/store.svelte';

  /**
   * B15 course map, laid out like the book's table of contents: volumes → chapters → sections,
   * a % bar on each, ✓ on finished sections. Tap a section for its stats or to redo it.
   * With `volume` it shows one calculus unit (`#/calc/2`); without, the whole course (`#/map`).
   */
  let { volume }: { volume?: number } = $props();

  let index = $state<BookIndex | null>(null);
  let error = $state('');
  loadIndex().then((i) => (index = i)).catch((e: Error) => (error = e.message));

  const single = $derived(volume ? (CALC.find((c) => c.volume === volume) ?? CALC[0]) : null);
  const vols = $derived(
    (index?.volumes ?? [])
      .filter((v) => !volume || v.volume === volume)
      .map((v) => ({ v, meta: CALC.find((c) => c.volume === v.volume) ?? CALC[0] })),
  );
  const nextId = $derived(index ? nextUnitId(progress.d, index) : null);

  const pc = (f: { done: number; total: number }) => Math.floor(pct(f) * 100);
</script>

<header class="top" style="--c: {single?.color ?? 'var(--text)'}">
  <a href="#/" aria-label="Home">←</a>
  {#if single}
    <h1><span class="numeral">{single.numeral}</span> {single.name}</h1>
  {:else}
    <h1>Course map</h1>
  {/if}
</header>

{#if error}
  <p class="feedback bad">{error}</p>
{:else if !index}
  <p class="muted">Loading…</p>
{:else}
  {#each vols as { v, meta } (v.volume)}
    {@const vf = volumeFraction(progress.d, v)}
    <section class="volume" style="--c: {meta.color}">
      {#if !single}
        <a class="vhead" href="#/calc/{v.volume}">
          <span class="numeral">{meta.numeral}</span>
          <span class="vname">{meta.name}</span>
          <span class="vpct">{pc(vf)}%</span>
        </a>
      {:else}
        <div class="vhead static">
          <span class="vname muted">{v.title}</span>
          <span class="vpct">{pc(vf)}%</span>
        </div>
      {/if}
      <div class="bar thick" aria-hidden="true"><div style="width: {pct(vf) * 100}%"></div></div>

      {#each v.chapters as c (c.chapter)}
        {@const cf = chapterFraction(progress.d, c)}
        {@const allDone = c.units.every((u) => unitComplete(progress.d, u))}
        <div class="chapter">
          <h3>
            <span class="cnum">{c.chapter}</span>
            <span class="ctitle">{c.title}</span>
            <span class="chpct" class:complete={allDone}>{allDone ? '✓' : `${pc(cf)}%`}</span>
          </h3>
          <div class="bar" aria-hidden="true"><div style="width: {pct(cf) * 100}%"></div></div>
          <ol class="units">
            {#each c.units as u (u.id)}
              {@const f = unitFraction(progress.d, u)}
              {@const complete = unitComplete(progress.d, u)}
              <li>
                <a href="#/section/{u.id}" class:current={u.id === nextId}>
                  <span class="num">{c.chapter}.{u.id.split('.')[2]}</span>
                  <span class="title">{u.title}</span>
                  <span class="count" class:complete>
                    {#if complete}✓{:else if f.done}{pc(f)}%{:else if u.id === nextId}next{/if}
                  </span>
                </a>
                <div class="ubar" aria-hidden="true"><div style="width: {pct(f) * 100}%"></div></div>
              </li>
            {/each}
          </ol>
        </div>
      {/each}
    </section>
  {/each}
  {#if single}
    <p class="all"><a href="#/map">Whole course map →</a></p>
  {/if}
{/if}

<style>
  .top { display: flex; gap: 12px; align-items: baseline; padding-top: calc(18px + env(safe-area-inset-top, 0px)); }
  .top a { color: var(--muted); font-size: 1.1rem; }
  h1 { font-family: var(--serif); font-weight: 600; font-size: 1.6rem; margin: 0 0 10px; }
  .numeral { font-family: var(--serif); color: var(--c); margin-right: 4px; font-weight: 700; }
  .volume { margin-bottom: 34px; }
  .vhead { display: flex; align-items: baseline; gap: 10px; color: var(--text); text-decoration: none; margin-top: 8px; }
  .vhead:hover { text-decoration: none; }
  .vhead .numeral { font-size: 1.5rem; min-width: 1.6em; }
  .vname { flex: 1; font-family: var(--serif); font-size: 1.25rem; font-weight: 600; }
  .vhead.static .vname { font-size: 0.95rem; font-weight: 400; }
  .vpct { color: var(--c); font-weight: 650; font-variant-numeric: tabular-nums; }
  .bar { height: 3px; background: var(--surface-2); border-radius: 2px; overflow: hidden; margin: 4px 0 0; }
  .bar.thick { height: 6px; border-radius: 3px; margin: 8px 0 4px; }
  .bar div { height: 100%; background: var(--c); border-radius: inherit; }
  .chapter { margin-top: 20px; }
  h3 { display: flex; gap: 10px; align-items: baseline; font-size: 1rem; font-weight: 600; margin: 0; }
  .cnum { color: var(--c); min-width: 1.4em; font-variant-numeric: tabular-nums; }
  .ctitle { flex: 1; }
  .chpct { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 0.85rem; font-weight: 500; }
  .chpct.complete { color: var(--c); }
  .units { list-style: none; padding: 0; margin: 4px 0 0; }
  .units li { border-bottom: 1px solid var(--surface-2); }
  .units a { display: flex; gap: 12px; padding: 9px 4px 6px; color: var(--text); text-decoration: none; }
  .units a:hover { background: var(--surface); }
  .units a.current .title { color: var(--accent); }
  .num { color: var(--muted); min-width: 2.6em; font-variant-numeric: tabular-nums; }
  .title { flex: 1; }
  .count { color: var(--faint); font-size: 0.85rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .units a.current .count { color: var(--accent); }
  .count.complete { color: var(--c); }
  .ubar { height: 2px; margin: 0 4px 0 calc(2.6em + 16px); }
  .ubar div { height: 100%; background: var(--c); border-radius: 1px; }
  .all { text-align: center; font-size: 0.9rem; }
</style>
