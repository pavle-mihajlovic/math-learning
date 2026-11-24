<script lang="ts">
  import type { BookIndex } from '../content/types';
  import { loadIndex } from '../content/load';
  import { lastUnit } from './settings.svelte';

  /** Minimal table of contents. B14/B15 replace it with the home screen and course map. */
  let index = $state<BookIndex | null>(null);
  let error = $state('');
  const last = lastUnit();

  loadIndex().then((i) => (index = i)).catch((e: Error) => (error = e.message));

  const totals = $derived.by(() => {
    if (!index) return null;
    const units = index.volumes.flatMap((v) => v.chapters.flatMap((c) => c.units));
    return {
      units: units.length,
      exercises: units.reduce((a, u) => a + u.exercises, 0),
      auto: units.reduce((a, u) => a + u.auto, 0),
    };
  });
</script>

<header class="top">
  <h1>Road to Rudin</h1>
  <a href="#/settings" class="settings" aria-label="Settings">Settings</a>
</header>

<a class="btn primary continue" href="#/unit/{last ?? 'V1.1.1'}">{last ? 'Continue' : 'Start'} · {last ?? 'V1.1.1'}</a>

{#if error}
  <p class="feedback bad">{error}</p>
{:else if !index}
  <p class="muted">Loading…</p>
{:else}
  {#if totals}
    <p class="muted summary">OpenStax Calculus I–III · {totals.units} sections · {totals.exercises.toLocaleString()} exercises ({totals.auto.toLocaleString()} auto-checked so far)</p>
  {/if}
  {#each index.volumes as v (v.volume)}
    <section class="vol">
      <h2>{v.title}</h2>
      {#each v.chapters as c (c.chapter)}
        <h3>{c.chapter}. {c.title}</h3>
        <ol class="units">
          {#each c.units as u (u.id)}
            <li>
              <a href="#/unit/{u.id}">
                <span class="num">{c.chapter}.{u.id.split('.')[2]}</span>
                <span class="title">{u.title}</span>
                <span class="count">{u.exercises}</span>
              </a>
            </li>
          {/each}
        </ol>
      {/each}
    </section>
  {/each}
{/if}

<style>
  .top { display: flex; justify-content: space-between; align-items: baseline; padding-top: calc(18px + env(safe-area-inset-top, 0px)); }
  h1 { font-family: var(--serif); font-weight: 600; font-size: 1.6rem; margin: 0 0 16px; }
  .settings { font-size: 0.9rem; color: var(--muted); }
  .continue { width: 100%; margin-bottom: 14px; }
  .summary { font-size: 0.85rem; }
  .vol h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 30px 0 4px; }
  h3 { font-size: 1rem; font-weight: 600; margin: 18px 0 6px; }
  .units { list-style: none; padding: 0; margin: 0; }
  .units a {
    display: flex;
    gap: 12px;
    padding: 9px 4px;
    border-bottom: 1px solid var(--surface-2);
    color: var(--text);
    text-decoration: none;
  }
  .units a:hover { background: var(--surface); }
  .num { color: var(--muted); min-width: 2.6em; font-variant-numeric: tabular-nums; }
  .title { flex: 1; }
  .count { color: var(--faint); font-size: 0.85rem; font-variant-numeric: tabular-nums; }
</style>
