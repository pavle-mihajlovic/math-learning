<script lang="ts">
  import { dayKey, dayStats, fmtPages, fmtTime, weekStart, type DayStats } from './progress.svelte';

  type Metric = 'problems' | 'pages' | 'ms';
  let metric = $state<Metric>('problems');
  const WEEKS = 53;

  const labels: Record<Metric, string> = { problems: 'Problems', pages: 'Pages', ms: 'Time' };

  /** Thresholds for levels 1–4 (anything > 0 is at least level 1). */
  const steps: Record<Metric, number[]> = {
    problems: [1, 6, 16, 31],
    pages: [0.01, 2, 5, 10],
    ms: [60000, 15 * 60000, 30 * 60000, 60 * 60000],
  };

  function level(v: number): number {
    const s = steps[metric];
    let l = 0;
    for (let i = 0; i < s.length; i++) if (v >= s[i]) l = i + 1;
    return l;
  }

  function fmt(m: Metric, d: DayStats | undefined): string {
    if (m === 'problems') return `${d?.problems ?? 0} problems`;
    if (m === 'pages') return `${fmtPages(d?.pages ?? 0)} pages`;
    return fmtTime(d?.ms ?? 0);
  }

  const todayKey = dayKey();
  const grid = $derived.by(() => {
    const start = weekStart();
    start.setDate(start.getDate() - (WEEKS - 1) * 7);
    const weeks: { key: string; date: Date; future: boolean }[][] = [];
    const months: { col: number; label: string }[] = [];
    let lastMonth = -1;
    for (let w = 0; w < WEEKS; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
        const key = dayKey(date);
        col.push({ key, date, future: key > todayKey });
      }
      const m = col[0].date.getMonth();
      if (m !== lastMonth) {
        if (w < WEEKS - 2) months.push({ col: w, label: col[0].date.toLocaleString(undefined, { month: 'short' }) });
        lastMonth = m;
      }
      weeks.push(col);
    }
    return { weeks, months };
  });

  let picked = $state<string>(todayKey);
  const pickedDate = $derived(new Date(picked + 'T12:00:00'));
  const pickedStats = $derived(dayStats(picked));

  let scroller: HTMLDivElement | undefined = $state();
  $effect(() => {
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  });
</script>

<div class="heatmap">
  <div class="toggle" role="tablist" aria-label="Metric">
    {#each ['problems', 'pages', 'ms'] as const as m (m)}
      <button role="tab" aria-selected={metric === m} class:on={metric === m} onclick={() => (metric = m)}>{labels[m]}</button>
    {/each}
  </div>

  <div class="scroll" bind:this={scroller}>
    <div class="months" style="grid-template-columns: repeat({WEEKS}, var(--cell));">
      {#each grid.months as mo (mo.col)}<span style="grid-column: {mo.col + 1}; grid-row: 1">{mo.label}</span>{/each}
    </div>
    <div class="grid" style="grid-template-columns: repeat({WEEKS}, var(--cell));">
      {#each grid.weeks as col, w (w)}
        {#each col as c (c.key)}
          {#if c.future}
            <span class="cell future" aria-hidden="true"></span>
          {:else}
            {@const d = dayStats(c.key)}
            {@const v = metric === 'ms' ? (d?.ms ?? 0) : metric === 'pages' ? (d?.pages ?? 0) : (d?.problems ?? 0)}
            <button
              class="cell l{level(v)}"
              class:today={c.key === todayKey}
              class:picked={c.key === picked}
              aria-label="{c.date.toDateString()}: {fmt(metric, d)}"
              onmouseenter={() => (picked = c.key)}
              onfocus={() => (picked = c.key)}
              onclick={() => (picked = c.key)}
            ></button>
          {/if}
        {/each}
      {/each}
    </div>
  </div>

  <div class="foot">
    <span class="readout">
      <strong>{pickedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
      · {fmt('problems', pickedStats)} · {fmt('pages', pickedStats)} · {fmt('ms', pickedStats)}
    </span>
    <span class="legend" aria-hidden="true">
      Less <i class="cell l0"></i><i class="cell l1"></i><i class="cell l2"></i><i class="cell l3"></i><i class="cell l4"></i> More
    </span>
  </div>
</div>

<style>
  .heatmap {
    --cell: 12px;
    --gap: 3px;
    /* Sequential blue, dark (little) → light (a lot) on the dark surface. */
    --l0: var(--surface-2);
    --l1: #184f95;
    --l2: #2a78d6;
    --l3: #6da7ec;
    --l4: #b7d3f6;
  }
  .toggle { display: inline-flex; border: 1px solid var(--line); border-radius: 9px; padding: 2px; margin-bottom: 12px; }
  .toggle button {
    background: none;
    border: none;
    padding: 4px 12px;
    border-radius: 7px;
    font-size: 0.85rem;
    color: var(--muted);
    min-height: 30px;
  }
  .toggle button.on { background: var(--surface-2); color: var(--text); }
  .scroll { overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
  .months, .grid { display: grid; column-gap: var(--gap); width: max-content; }
  .months { font-size: 0.68rem; line-height: 1.3; color: var(--faint); grid-template-rows: 1.3em; margin-bottom: 3px; }
  .months span { white-space: nowrap; overflow: visible; width: 0; }
  .grid { grid-template-rows: repeat(7, var(--cell)); grid-auto-flow: column; row-gap: var(--gap); }
  .cell {
    display: block;
    width: var(--cell);
    height: var(--cell);
    border-radius: 3px;
    border: none;
    padding: 0;
    background: var(--l0);
  }
  .cell.future { background: transparent; }
  .l1 { background: var(--l1); }
  .l2 { background: var(--l2); }
  .l3 { background: var(--l3); }
  .l4 { background: var(--l4); }
  .cell.today { box-shadow: inset 0 0 0 1px var(--muted); }
  .cell.picked { outline: 1.5px solid var(--text); outline-offset: 1px; }
  .cell:focus-visible { outline: 2px solid var(--accent); }
  .foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 14px; margin-top: 10px; font-size: 0.8rem; color: var(--muted); }
  .readout strong { color: var(--text); font-weight: 600; }
  .legend { display: inline-flex; align-items: center; gap: 3px; color: var(--faint); }
  .legend .cell { display: inline-block; width: 10px; height: 10px; }
</style>
