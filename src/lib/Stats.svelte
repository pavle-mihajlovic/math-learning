<script lang="ts">
  import type { BookIndex } from '../content/types';
  import { loadIndex } from '../content/load';
  import { CALC } from './subjects';
  import { dayKey, dayStats, fmtTime, sumDays, weekKeys, weekStart } from './progress.svelte';
  import { firstTry, pct } from '../progress/derive';
  import { progress } from '../progress/store.svelte';
  import { mistakes } from '../practice/store.svelte';
  import { isLearning } from '../practice/queue';

  /** B16: problems solved and time per day and week, first-try accuracy per chapter, pending mistakes. */
  let index = $state<BookIndex | null>(null);
  let error = $state('');
  loadIndex().then((i) => (index = i)).catch((e: Error) => (error = e.message));

  type Metric = 'problems' | 'ms';
  let metric = $state<Metric>('problems');
  const DAYS = 14;
  const WEEKS = 12;

  const val = (s: { problems: number; ms: number } | undefined) => (metric === 'problems' ? (s?.problems ?? 0) : (s?.ms ?? 0));
  const fmt = (v: number) => (metric === 'problems' ? String(v) : fmtTime(v));

  const days = $derived.by(() => {
    void progress.d;
    const today = new Date();
    return Array.from({ length: DAYS }, (_, i) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (DAYS - 1 - i));
      const s = dayStats(dayKey(date));
      return { date, problems: s?.problems ?? 0, ms: s?.ms ?? 0 };
    });
  });

  const weeks = $derived.by(() => {
    void progress.d;
    const start = weekStart();
    return Array.from({ length: WEEKS }, (_, i) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() - (WEEKS - 1 - i) * 7);
      const s = sumDays(weekKeys(date));
      return { date, problems: s.problems, ms: s.ms };
    });
  });

  const dayMax = $derived(Math.max(1, ...days.map(val)));
  const weekMax = $derived(Math.max(1, ...weeks.map(val)));
  const dayTotal = $derived(days.reduce((a, d) => a + val(d), 0));
  const weekTotal = $derived(weeks.reduce((a, d) => a + val(d), 0));
  const weekAvg = $derived(weekTotal / WEEKS);

  const chapters = $derived.by(() => {
    if (!index) return [];
    return index.volumes.map((v) => ({
      meta: CALC.find((c) => c.volume === v.volume) ?? CALC[0],
      chapters: v.chapters.map((c) => ({ chapter: c.chapter, title: c.title, f: firstTry(progress.d, c.units) })),
    }));
  });
  const overall = $derived(index ? firstTry(progress.d, index.volumes.flatMap((v) => v.chapters.flatMap((c) => c.units))) : { done: 0, total: 0 });

  const pending = $derived.by(() => {
    const all = [...mistakes.cards.values()];
    return { total: all.length, due: mistakes.due().length, learning: all.filter(isLearning).length };
  });

  const short = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const wd = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'narrow' });
  const isToday = (d: Date) => dayKey(d) === dayKey();
</script>

<header class="top">
  <a href="#/" aria-label="Home">←</a>
  <h1>Stats</h1>
</header>

<div class="tiles">
  <div class="tile"><div class="label">Problems solved</div><div class="num">{progress.d.solved.toLocaleString()}</div></div>
  <div class="tile"><div class="label">Time spent</div><div class="num">{fmtTime(progress.d.ms)}</div></div>
  <div class="tile">
    <div class="label">First try</div>
    <div class="num">{overall.total ? `${Math.round(pct(overall) * 100)}%` : '–'}</div>
  </div>
</div>

<!-- Pending mistakes -->
<section aria-label="Mistakes">
  <h2 class="caps">Mistakes pending</h2>
  <a class="mistakes" href="#/practice">
    <span class="mnum">{pending.due}</span>
    <span class="mtext">
      due now
      <span class="muted">· {pending.total} in practice, {pending.learning} still being learned</span>
    </span>
    <span class="go">Practice →</span>
  </a>
</section>

<div class="seg-toggle" role="group" aria-label="Metric">
  <button class:on={metric === 'problems'} aria-pressed={metric === 'problems'} onclick={() => (metric = 'problems')}>Problems solved</button>
  <button class:on={metric === 'ms'} aria-pressed={metric === 'ms'} onclick={() => (metric = 'ms')}>Time spent</button>
</div>

<!-- Per day -->
<section aria-label="Per day">
  <div class="sec-head">
    <h2 class="caps">Per day</h2>
    <span class="sum">{fmt(dayTotal)} in {DAYS} days</span>
  </div>
  <div class="chart" style="--n: {DAYS}">
    {#each days as d (d.date.getTime())}
      {@const v = val(d)}
      <div class="col" title="{short(d.date)}: {fmt(v)}">
        <span class="v">{v ? fmt(v) : ''}</span>
        <div class="track"><div class="fill" style="height: {(v / dayMax) * 100}%"></div></div>
        <span class="x" class:today={isToday(d.date)}>{wd(d.date)}</span>
      </div>
    {/each}
  </div>
  <div class="range"><span>{short(days[0].date)}</span><span>Today</span></div>
</section>

<!-- Per week -->
<section aria-label="Per week">
  <div class="sec-head">
    <h2 class="caps">Per week</h2>
    <span class="sum">avg {fmt(metric === 'problems' ? Math.round(weekAvg) : weekAvg)} / week</span>
  </div>
  <div class="chart" style="--n: {WEEKS}">
    {#each weeks as w, i (w.date.getTime())}
      {@const v = val(w)}
      <div class="col" title="Week of {short(w.date)}: {fmt(v)}">
        <span class="v">{v ? fmt(v) : ''}</span>
        <div class="track"><div class="fill" class:now={i === WEEKS - 1} style="height: {(v / weekMax) * 100}%"></div></div>
        <span class="x">{i % 3 === 0 || i === WEEKS - 1 ? short(w.date) : ''}</span>
      </div>
    {/each}
  </div>
  <details class="table">
    <summary>Show as table</summary>
    <table>
      <thead><tr><th>Week of</th><th>Problems</th><th>Time</th></tr></thead>
      <tbody>
        {#each [...weeks].reverse() as w (w.date.getTime())}
          <tr><td>{short(w.date)}</td><td>{w.problems}</td><td>{fmtTime(w.ms)}</td></tr>
        {/each}
      </tbody>
    </table>
  </details>
</section>

<!-- First-try accuracy per chapter -->
<section aria-label="First-try accuracy per chapter">
  <h2 class="caps">First-try accuracy per chapter</h2>
  {#if error}
    <p class="feedback bad">{error}</p>
  {:else if !index}
    <p class="muted">Loading…</p>
  {:else}
    {#each chapters as v (v.meta.volume)}
      <h3 style="--c: {v.meta.color}"><span class="numeral">{v.meta.numeral}</span> {v.meta.name}</h3>
      <ol class="acc" style="--c: {v.meta.color}">
        {#each v.chapters as c (c.chapter)}
          <li class:empty={!c.f.total}>
            <span class="cnum">{c.chapter}</span>
            <span class="ctitle">{c.title}</span>
            {#if c.f.total}
              <span class="abar" aria-hidden="true"><span style="width: {pct(c.f) * 100}%"></span></span>
              <span class="apct">{Math.round(pct(c.f) * 100)}%</span>
              <span class="an">{c.f.done}/{c.f.total}</span>
            {:else}
              <span class="apct none">–</span>
            {/if}
          </li>
        {/each}
      </ol>
    {/each}
  {/if}
</section>

<style>
  .top { display: flex; gap: 12px; align-items: baseline; padding-top: calc(18px + env(safe-area-inset-top, 0px)); }
  .top a { color: var(--muted); font-size: 1.1rem; }
  h1 { font-family: var(--serif); font-weight: 600; font-size: 1.6rem; margin: 0 0 14px; }
  section { margin-bottom: 28px; }
  .caps { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; margin: 0 0 10px; }
  .sec-head { display: flex; justify-content: space-between; align-items: baseline; }
  .sum { font-size: 0.8rem; color: var(--muted); font-variant-numeric: tabular-nums; }

  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 24px; }
  .tile { background: var(--surface); border: 1px solid var(--surface-2); border-radius: var(--radius); padding: 10px 12px; min-width: 0; }
  .tile .label { font-size: 0.75rem; color: var(--muted); }
  .tile .num { font-size: 1.5rem; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.25; white-space: nowrap; }

  .mistakes { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: var(--surface); border: 1px solid var(--surface-2); border-radius: var(--radius); color: var(--text); text-decoration: none; }
  .mistakes:hover { text-decoration: none; border-color: var(--line); }
  .mnum { font-size: 1.8rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
  .mtext { flex: 1; font-size: 0.9rem; min-width: 0; }
  .mtext .muted { font-size: 0.8rem; }
  .go { color: var(--accent); font-size: 0.9rem; white-space: nowrap; }

  .seg-toggle { display: flex; background: var(--surface); border: 1px solid var(--surface-2); border-radius: 10px; padding: 3px; margin-bottom: 18px; }
  .seg-toggle button { flex: 1; background: none; border: none; border-radius: 8px; padding: 7px 8px; color: var(--muted); font-size: 0.88rem; }
  .seg-toggle button.on { background: var(--surface-2); color: var(--text); font-weight: 600; }

  .chart { display: grid; grid-template-columns: repeat(var(--n), 1fr); gap: 2px; align-items: end; }
  .col { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; }
  .col .v { font-size: 0.6rem; color: var(--muted); font-variant-numeric: tabular-nums; height: 1.2em; white-space: nowrap; opacity: 0; }
  .col:hover .v, .col:focus-within .v { opacity: 1; }
  .track { width: 100%; height: 96px; display: flex; align-items: flex-end; border-bottom: 1px solid var(--line); }
  .fill { width: 100%; background: var(--accent); border-radius: 4px 4px 0 0; min-height: 0; opacity: 0.85; }
  .fill.now { opacity: 1; }
  .col:hover .fill { opacity: 1; }
  .x { font-size: 0.65rem; color: var(--faint); height: 1.2em; white-space: nowrap; overflow: visible; }
  .x.today { color: var(--text); font-weight: 600; }
  .range { display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--faint); margin-top: 2px; }

  .table { margin-top: 10px; font-size: 0.85rem; }
  .table summary { color: var(--muted); cursor: pointer; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-variant-numeric: tabular-nums; }
  th, td { text-align: right; padding: 5px 4px; border-bottom: 1px solid var(--surface-2); }
  th:first-child, td:first-child { text-align: left; }
  th { color: var(--muted); font-weight: 500; }

  h3 { font-family: var(--serif); font-size: 1.05rem; font-weight: 600; margin: 16px 0 4px; }
  .numeral { color: var(--c); margin-right: 2px; }
  .acc { list-style: none; padding: 0; margin: 0; }
  .acc li { display: flex; align-items: center; gap: 10px; padding: 7px 2px; border-bottom: 1px solid var(--surface-2); font-size: 0.9rem; }
  .acc li.empty { color: var(--faint); }
  .cnum { color: var(--c); min-width: 1.4em; font-variant-numeric: tabular-nums; }
  .acc li.empty .cnum { color: var(--faint); }
  .ctitle { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .abar { width: 56px; height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden; flex: none; }
  .abar span { display: block; height: 100%; background: var(--c); border-radius: 3px; }
  .apct { min-width: 2.8em; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .apct.none { font-weight: 400; }
  .an { min-width: 3.6em; text-align: right; color: var(--faint); font-size: 0.75rem; font-variant-numeric: tabular-nums; }
  @media (max-width: 380px) {
    .tile .num { font-size: 1.2rem; }
    .an { display: none; }
  }
</style>
