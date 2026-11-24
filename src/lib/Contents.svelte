<script lang="ts">
  import type { BookIndex } from '../content/types';
  import { loadIndex } from '../content/load';
  import { courseFraction, nextUnitId, pct, unitFraction } from '../progress/derive';
  import { progress } from '../progress/store.svelte';
  import { mistakes } from '../practice/store.svelte';
  import { formatDuration } from './format';

  /** Minimal table of contents with progress. B14/B15 replace it with the home screen and course map. */
  let index = $state<BookIndex | null>(null);
  let error = $state('');

  loadIndex().then((i) => (index = i)).catch((e: Error) => (error = e.message));

  const d = $derived(progress.d);
  const nextId = $derived(index ? nextUnitId(d, index) : null);
  const nextTitle = $derived.by(() => {
    if (!index || !nextId) return '';
    for (const v of index.volumes) for (const c of v.chapters) for (const u of c.units) if (u.id === nextId) return `§${c.chapter}.${u.id.split('.')[2]} ${u.title}`;
    return '';
  });
  const course = $derived(index ? pct(courseFraction(d, index)) : 0);
  const due = $derived(mistakes.due().length);
  const started = $derived(d.read.size > 0 || d.done.size > 0);

  function percent(x: number): string {
    if (x > 0 && x < 0.001) return '<0.1%';
    return `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
  }
</script>

<header class="top">
  <h1>Road to Rudin</h1>
  <a href="#/settings" class="settings" aria-label="Settings">Settings</a>
</header>

{#if error}
  <p class="feedback bad">{error}</p>
{:else if !index}
  <p class="muted">Loading…</p>
{:else}
  {#if nextId}
    <a class="btn primary continue" href="#/continue">
      {started ? 'Continue' : 'Start'}<span class="next">{nextTitle}</span>
    </a>
  {:else}
    <p class="feedback good">You’ve finished Calculus I–III.</p>
  {/if}
  <a class="btn practice" href="#/practice">Practice mistakes{#if due} <span class="badge">{due}</span>{/if}</a>

  <dl class="stats">
    <div><dt>Complete</dt><dd>{percent(course)}</dd></div>
    <div><dt>Problems solved</dt><dd>{d.solved.toLocaleString()}</dd></div>
    <div><dt>Time spent</dt><dd>{formatDuration(d.ms)}</dd></div>
  </dl>

  {#each index.volumes as v (v.volume)}
    <section class="vol">
      <h2>{v.title}</h2>
      {#each v.chapters as c (c.chapter)}
        <h3>{c.chapter}. {c.title}</h3>
        <ol class="units">
          {#each c.units as u (u.id)}
            {@const f = pct(unitFraction(d, u))}
            <li>
              <a href="#/unit/{u.id}" class:current={u.id === nextId}>
                <span class="num">{c.chapter}.{u.id.split('.')[2]}</span>
                <span class="title">{u.title}</span>
                <span class="count">{f >= 1 ? '✓' : f > 0 ? percent(f) : ''}</span>
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
  .continue { width: 100%; margin-bottom: 10px; display: flex; flex-direction: column; gap: 2px; }
  .next { font-weight: 400; font-size: 0.85rem; opacity: 0.75; }
  .practice { width: 100%; margin-bottom: 18px; }
  .badge { background: var(--text); color: var(--bg); border-radius: 999px; padding: 0 0.55em; font-size: 0.8rem; margin-left: 0.4em; font-variant-numeric: tabular-nums; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0 0 8px; }
  .stats div { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
  .stats dt { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .stats dd { margin: 2px 0 0; font-size: 1.25rem; font-weight: 600; font-variant-numeric: tabular-nums; }
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
  .units a.current .title { color: var(--accent); }
  .num { color: var(--muted); min-width: 2.6em; font-variant-numeric: tabular-nums; }
  .title { flex: 1; }
  .count { color: var(--faint); font-size: 0.85rem; font-variant-numeric: tabular-nums; }
</style>
