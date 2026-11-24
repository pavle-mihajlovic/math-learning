<script lang="ts">
  import type { BookIndex } from '../content/types';
  import { loadIndex } from '../content/load';
  import { CALC, NEXT } from './subjects';
  import Heatmap from './Heatmap.svelte';
  import { dayStats, fmtPages, fmtTime, solvedIn, streak, sumDays, weekKeys, weekStart } from './progress.svelte';
  import { nextUnitId, unitComplete } from '../progress/derive';
  import { progress } from '../progress/store.svelte';
  import { mistakes } from '../practice/store.svelte';

  let index = $state<BookIndex | null>(null);
  let error = $state('');

  loadIndex().then((i) => (index = i)).catch((e: Error) => (error = e.message));

  const volumes = $derived.by(() => {
    if (!index) return [];
    return CALC.map((meta) => {
      const v = index!.volumes.find((x) => x.volume === meta.volume);
      const chapters = (v?.chapters ?? []).map((c) => {
        const total = c.units.reduce((a, u) => a + u.exercises, 0);
        const solved = c.units.reduce((a, u) => a + Math.min(u.exercises, solvedIn(u.id)), 0);
        const done = c.units.filter((u) => unitComplete(progress.d, u)).length;
        return { chapter: c.chapter, title: c.title, total, solved, done, units: c.units.length };
      });
      const total = chapters.reduce((a, c) => a + c.total, 0);
      const solved = chapters.reduce((a, c) => a + c.solved, 0);
      const sections = chapters.reduce((a, c) => a + c.units, 0);
      const done = chapters.reduce((a, c) => a + c.done, 0);
      const pct = total ? (solved / total) * 100 : 0;
      return { ...meta, chapters, total, solved, sections, done, pct };
    });
  });

  // The first volume that isn't finished is the one you're on.
  const currentVol = $derived(volumes.find((v) => v.pct < 100)?.volume ?? 0);

  function hype(pct: number, solved: number, total: number, isCurrent: boolean): string {
    if (pct >= 100) return 'Conquered.';
    if (!solved) return isCurrent ? 'Day one. Let’s go.' : 'Locked in for later.';
    const left = total - solved;
    if (pct >= 90) return `${left} problems from done. Finish it.`;
    if (pct >= 75) return 'Final stretch.';
    if (pct >= 50) return 'Past halfway. Downhill from here.';
    if (pct >= 25) return 'A quarter down. Keep the streak.';
    return `${left.toLocaleString()} to go. One chunk at a time.`;
  }

  const thisWeek = $derived.by(() => {
    void progress.d;
    const start = weekStart();
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - 7);
    const week = sumDays(weekKeys(start));
    const prev = sumDays(weekKeys(prevStart));
    const days = weekKeys(start).map((k) => dayStats(k)?.problems ?? 0);
    return { week, prev, days };
  });

  const allTime = $derived(sumDays(progress.d.days.keys()));
  const streakDays = $derived.by(() => {
    void progress.d;
    return streak();
  });

  function delta(now: number, before: number, fmt: (n: number) => string): string {
    if (!before && !now) return '';
    if (!before) return 'first week';
    const d = now - before;
    return `${d >= 0 ? '▲' : '▼'} ${fmt(Math.abs(d))} vs last wk`;
  }

  const nextId = $derived(index ? nextUnitId(progress.d, index) : 'V1.1.1');
  const started = $derived(progress.d.read.size > 0 || progress.d.done.size > 0);
  const due = $derived(mistakes.due().length);

  const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const todayIdx = (new Date().getDay() + 6) % 7;
</script>

<header class="top">
  <h1>Road to Rudin</h1>
  <a href="#/settings" class="settings">Settings</a>
</header>

{#if nextId}
  <a class="btn primary continue" href="#/continue">{started ? 'Continue' : 'Start'} · §{nextId.slice(3)}</a>
{:else}
  <p class="feedback good">You’ve finished Calculus I–III.</p>
{/if}
<a class="btn practice" href="#/practice">Practice mistakes{#if due} <span class="badge">{due}</span>{/if}</a>

<!-- This week -->
<section class="week" aria-label="This week">
  <div class="sec-head">
    <h2>This week</h2>
    {#if streakDays}<span class="streak">{streakDays}-day streak</span>{/if}
  </div>
  <div class="tiles">
    <div class="tile">
      <div class="label">Problems</div>
      <div class="num">{thisWeek.week.problems}</div>
      <div class="sub">{delta(thisWeek.week.problems, thisWeek.prev.problems, String)}</div>
    </div>
    <div class="tile">
      <div class="label">Pages</div>
      <div class="num">{fmtPages(thisWeek.week.pages)}</div>
      <div class="sub">{delta(thisWeek.week.pages, thisWeek.prev.pages, fmtPages)}</div>
    </div>
    <div class="tile">
      <div class="label">Time</div>
      <div class="num">{fmtTime(thisWeek.week.ms)}</div>
      <div class="sub">{delta(thisWeek.week.ms, thisWeek.prev.ms, fmtTime)}</div>
    </div>
  </div>
  <div class="days" aria-label="Problems per day this week">
    {#each thisWeek.days as n, i (i)}
      {@const max = Math.max(1, ...thisWeek.days)}
      <div class="day" class:future={i > todayIdx} title="{n} problems">
        <div class="col"><div class="bar" style="height: {(n / max) * 100}%"></div></div>
        <span class:today={i === todayIdx}>{dayNames[i]}</span>
      </div>
    {/each}
  </div>
</section>

<!-- Calculus I–III -->
{#if error}
  <p class="feedback bad">{error}</p>
{:else if !index}
  <p class="muted">Loading…</p>
{:else}
  <section aria-label="Calculus">
    {#each volumes as v (v.volume)}
      <a class="vol" class:current={v.volume === currentVol} class:conquered={v.pct >= 100} href="#/calc/{v.volume}" style="--c: {v.color}">
        <div class="vol-top">
          <span class="numeral" aria-hidden="true">{v.numeral}</span>
          <div class="vol-name">
            <div class="kicker">{v.volume === currentVol ? 'Now' : v.pct >= 100 ? 'Done' : `Unit ${v.volume}`}</div>
            <h2>{v.name}</h2>
            <p class="tagline">{v.tagline}</p>
          </div>
          <div class="pct">{v.pct < 10 && v.pct > 0 ? v.pct.toFixed(1) : Math.floor(v.pct)}<small>%</small></div>
        </div>
        <div class="segments" aria-hidden="true">
          {#each v.chapters as c (c.chapter)}
            <div class="seg" style="flex: {c.total}" title="Ch. {c.chapter} {c.title}">
              <div class="seg-fill" style="width: {c.total ? (c.solved / c.total) * 100 : 0}%"></div>
            </div>
          {/each}
        </div>
        <div class="vol-foot">
          <span>{v.solved.toLocaleString()} / {v.total.toLocaleString()} problems · {v.done}/{v.sections} sections</span>
          <span class="hype">{hype(v.pct, v.solved, v.total, v.volume === currentVol)}</span>
        </div>
      </a>
    {/each}
  </section>
{/if}

<!-- Next units -->
<section class="next" aria-label="Next units">
  <h2 class="caps">Next up</h2>
  <ol>
    {#each NEXT as s, i (s.name)}
      <li class:optional={!s.core}>
        <span class="idx">{i + 4}</span>
        <div>
          <div class="name">{s.name} {#if !s.core}<span class="tag">optional</span>{/if}</div>
          <div class="note">{s.note}</div>
        </div>
        <span class="soon">Soon</span>
      </li>
    {/each}
  </ol>
  <div class="goal">
    <div class="kicker">The goal</div>
    <div class="goal-name">Rudin, <em>Principles of Mathematical Analysis</em></div>
  </div>
</section>

<!-- Activity -->
<section class="activity" aria-label="Activity">
  <h2 class="caps">Activity</h2>
  <Heatmap />
  <p class="all-time">
    All time: <strong>{progress.d.solved.toLocaleString()}</strong> problems ·
    <strong>{fmtPages(allTime.pages)}</strong> pages · <strong>{fmtTime(allTime.ms)}</strong>
  </p>
</section>

<style>
  .top { display: flex; justify-content: space-between; align-items: baseline; padding-top: calc(18px + env(safe-area-inset-top, 0px)); }
  h1 { font-family: var(--serif); font-weight: 600; font-size: 1.6rem; margin: 0 0 16px; }
  .settings { font-size: 0.9rem; color: var(--muted); }
  .continue { width: 100%; margin-bottom: 10px; }
  .practice { width: 100%; margin-bottom: 22px; }
  .badge { background: var(--text); color: var(--bg); border-radius: 999px; padding: 0 0.55em; font-size: 0.8rem; margin-left: 0.4em; font-variant-numeric: tabular-nums; }
  .caps, .sec-head h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; margin: 0; }
  section { margin-bottom: 30px; }

  /* This week */
  .sec-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
  .streak { font-size: 0.8rem; color: var(--warn); font-weight: 600; }
  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .tile { background: var(--surface); border: 1px solid var(--surface-2); border-radius: var(--radius); padding: 10px 12px; min-width: 0; }
  .tile .label { font-size: 0.75rem; color: var(--muted); }
  .tile .num { font-size: 1.6rem; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.2; white-space: nowrap; }
  .tile .sub { font-size: 0.7rem; line-height: 1.3; color: var(--faint); min-height: 1.3em; }
  .days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-top: 10px; }
  .day { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--faint); }
  .day .col { width: 100%; height: 36px; display: flex; align-items: flex-end; background: var(--surface); border-radius: 4px; overflow: hidden; }
  .day .bar { width: 100%; background: var(--accent); border-radius: 4px 4px 0 0; min-height: 0; }
  .day.future .col { opacity: 0.4; }
  .day .today { color: var(--text); font-weight: 600; }

  /* Calculus cards */
  .vol {
    display: block;
    position: relative;
    overflow: hidden;
    color: var(--text);
    text-decoration: none;
    background: linear-gradient(135deg, color-mix(in srgb, var(--c) 14%, var(--surface)) 0%, var(--surface) 60%);
    border: 1px solid color-mix(in srgb, var(--c) 25%, var(--surface-2));
    border-radius: 16px;
    padding: 16px 16px 14px;
    margin-bottom: 12px;
    transition: transform 0.12s, border-color 0.12s;
  }
  .vol:hover { text-decoration: none; border-color: color-mix(in srgb, var(--c) 55%, var(--surface-2)); transform: translateY(-1px); }
  .vol.current { border-color: color-mix(in srgb, var(--c) 60%, var(--surface-2)); box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 30%, transparent), 0 8px 30px -12px color-mix(in srgb, var(--c) 45%, transparent); }
  .vol-top { display: flex; align-items: center; gap: 14px; }
  .numeral {
    font-family: var(--serif);
    font-size: 2.6rem;
    font-weight: 700;
    line-height: 1;
    color: var(--c);
    min-width: 1.6em;
    text-align: center;
  }
  .vol-name { flex: 1; min-width: 0; }
  .vol-name .kicker { margin: 0; color: var(--c); }
  .vol h2 { font-family: var(--serif); font-size: 1.35rem; font-weight: 600; margin: 0; line-height: 1.2; }
  .tagline { margin: 2px 0 0; font-size: 0.82rem; color: var(--muted); }
  .pct { font-size: 1.9rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .pct small { font-size: 0.55em; color: var(--muted); font-weight: 500; }
  .segments { display: flex; gap: 3px; margin: 14px 0 8px; }
  .seg { height: 8px; background: color-mix(in srgb, var(--c) 12%, var(--surface-2)); border-radius: 4px; overflow: hidden; min-width: 4px; }
  .seg-fill { height: 100%; background: var(--c); border-radius: 4px; }
  .vol-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 12px; font-size: 0.78rem; color: var(--muted); }
  .hype { color: var(--text); font-weight: 500; }
  .vol.conquered .numeral::after { content: ' ✓'; font-size: 0.5em; }

  /* Next */
  .next ol { list-style: none; padding: 0; margin: 10px 0 0; }
  .next li { display: flex; gap: 12px; align-items: center; padding: 11px 2px; border-bottom: 1px solid var(--surface-2); }
  .idx { font-family: var(--serif); color: var(--faint); min-width: 1.4em; text-align: center; font-size: 1.05rem; }
  .next li > div { flex: 1; min-width: 0; }
  .name { font-weight: 600; }
  .note { font-size: 0.82rem; color: var(--muted); }
  .tag { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--faint); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; margin-left: 4px; vertical-align: 2px; font-weight: 500; }
  .optional .name { color: var(--muted); }
  .soon { font-size: 0.72rem; color: var(--faint); }
  .goal { margin-top: 14px; padding: 14px 16px; border: 1px dashed var(--line); border-radius: var(--radius); text-align: center; }
  .goal .kicker { margin-bottom: 2px; }
  .goal-name { font-family: var(--serif); font-size: 1.1rem; }

  /* Activity */
  .activity h2 { margin-bottom: 10px; }
  .all-time { font-size: 0.85rem; color: var(--muted); margin-top: 14px; }
  .all-time strong { color: var(--text); }

  @media (max-width: 380px) {
    .tile .num { font-size: 1.3rem; }
    .numeral { font-size: 2.1rem; }
    .pct { font-size: 1.5rem; }
  }
</style>
