<script lang="ts">
  import { saveSettings, settings, type InputMode } from './settings.svelte';
  import AnswerInput from '../input/AnswerInput.svelte';
  import { check } from '../check/check';
  import type { Answer } from '../check/answer';
  import { texHtml } from '../content/render';
  import Account from '../sync/Account.svelte';
  import { progress } from '../progress/store.svelte';
  import { clearDownloads, downloadAll, isIos, isStandalone, pwa, storageEstimate } from '../pwa/offline.svelte';
  import { formatBytes } from './format';

  function setMode(m: InputMode) {
    settings.inputMode = m;
    saveSettings();
  }

  // A sample exercise to try each mode on.
  const sample: Answer = { kind: 'expression', value: '(x^2+1)/(2 sqrt(x))' };
  let values = $state<string[]>([]);
  let result = $state('');
  function trySample() {
    const r = check(sample, values);
    result = r.parseError ?? (r.correct ? '✓ Correct' : '✗ Not quite');
  }

  // Offline (B10)
  let usage = $state('');
  let offlineMsg = $state('');
  function refreshUsage() {
    storageEstimate().then((e) => (usage = e ? `${formatBytes(e.usage)} used on this device` : '')).catch(() => {});
  }
  refreshUsage();
  async function getAll() {
    offlineMsg = '';
    try {
      await downloadAll();
      offlineMsg = 'Everything is available offline.';
    } catch (e) {
      offlineMsg = `Download stopped: ${(e as Error).message}`;
    }
    refreshUsage();
  }
  async function clearAll() {
    await clearDownloads();
    offlineMsg = 'Downloads removed. Chapters download again as you open them.';
    refreshUsage();
  }
  const showInstall = typeof window !== 'undefined' && isIos() && !isStandalone();

  // Backup (B12)
  let backupMsg = $state('');
  function exportBackup() {
    const blob = new Blob([progress.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `road-to-rudin-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    backupMsg = `Saved ${progress.events.length.toLocaleString()} events.`;
  }
  async function importBackup(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const n = await progress.importJson(await file.text());
      backupMsg = n ? `Restored ${n.toLocaleString()} events.` : 'Nothing new in that file.';
    } catch (err) {
      backupMsg = (err as Error).message;
    }
    input.value = '';
  }
</script>

<header class="top">
  <a href="#/" aria-label="Back">←</a>
  <h1>Settings</h1>
</header>

<section>
  <h2>Answer input</h2>
  <p class="muted">Both modes go through the same checker. Switch any time.</p>
  <div class="modes" role="radiogroup" aria-label="Answer input mode">
    <button class="mode" role="radio" aria-checked={settings.inputMode === 'plain'} class:on={settings.inputMode === 'plain'} onclick={() => setMode('plain')}>
      <strong>1 · Plain text</strong>
      <span>Type <code>x^2/(2sqrt(x))</code> on the normal keyboard, with a live preview and a row of math keys.</span>
    </button>
    <button class="mode" role="radio" aria-checked={settings.inputMode === 'visual'} class:on={settings.inputMode === 'visual'} onclick={() => setMode('visual')}>
      <strong>2 · Visual editor</strong>
      <span>Build the formula as it looks, with an on-screen math keyboard (MathLive).</span>
    </button>
  </div>

  <div class="try">
    <p>Try it: enter {@html texHtml('\\frac{x^2+1}{2\\sqrt{x}}')}</p>
    {#key settings.inputMode}
      <AnswerInput answer={sample} bind:values onsubmit={trySample} />
    {/key}
    <div class="actions">
      <button class="btn" onclick={trySample}>Check</button>
      {#if result}<span class="muted">{result}</span>{/if}
    </div>
  </div>
</section>

<section>
  <h2>Account and sync</h2>
  <Account />
</section>

<section>
  <h2>Offline</h2>
  {#if showInstall}
    <p class="note">
      <strong>Install on iPhone:</strong> tap <strong>Share</strong> → <strong>Add to Home Screen</strong>. The Home
      Screen app opens full screen, works offline, and iOS keeps its downloads.
    </p>
  {/if}
  <p class="muted">
    The chapter you’re in and the next one download automatically. {pwa.chapters.length} chapter{pwa.chapters.length === 1 ? '' : 's'}
    on this device{usage ? ` · ${usage}` : ''}.
  </p>
  <div class="actions">
    <button class="btn" disabled={pwa.allProgress >= 0 || !pwa.online} onclick={getAll}>
      {pwa.allProgress >= 0 ? `Downloading… ${Math.round(pwa.allProgress * 100)}%` : 'Download everything (about 27 MB)'}
    </button>
    <button class="btn ghost small" disabled={pwa.allProgress >= 0} onclick={clearAll}>Remove downloads</button>
  </div>
  {#if !pwa.online}<p class="muted">You’re offline.</p>{/if}
  {#if offlineMsg}<p class="muted">{offlineMsg}</p>{/if}
</section>

<section>
  <h2>Backup</h2>
  <p class="muted">Your whole attempt log as one file. Restoring merges it with what’s here; nothing is overwritten.</p>
  <div class="actions">
    <button class="btn" onclick={exportBackup}>Export backup</button>
    <label class="btn">Restore from file<input type="file" accept="application/json,.json" hidden onchange={importBackup} /></label>
  </div>
  {#if backupMsg}<p class="muted">{backupMsg}</p>{/if}
</section>

<section>
  <h2>Keyboard shortcuts (computer)</h2>
  <ul class="keys">
    <li><kbd>Enter</kbd> check your answer</li>
    <li><kbd>Space</kbd> next card, reveal answer</li>
    <li><kbd>H</kbd> hint (after a wrong try)</li>
    <li><kbd>Y</kbd> / <kbd>N</kbd> self-check: got it / missed it</li>
    <li><kbd>←</kbd> <kbd>→</kbd> previous / next reading card</li>
    <li><kbd>Esc</kbd> leave the answer box</li>
  </ul>
</section>

<section>
  <h2>Answer syntax</h2>
  <ul class="syntax muted">
    <li><code>x^2</code>, <code>x^(1/3)</code>, <code>sqrt(x)</code>, <code>root(x, 3)</code>, <code>|x|</code></li>
    <li><code>2x</code> means 2·x; <code>sin 2x</code> is sin(2x); <code>sin^2 x</code> is (sin x)²</li>
    <li><code>pi</code>, <code>e</code>, <code>inf</code>, <code>DNE</code>, <code>ln</code>, <code>log</code> (base 10), <code>log_2(x)</code></li>
    <li>Intervals <code>(-inf, 2] U (3, inf)</code>, sets <code>{'{'}1, 2{'}'}</code>, vectors <code>&lt;1, 2, 3&gt;</code> or <code>i + 2j</code></li>
    <li>Antiderivatives need <code>+ C</code></li>
  </ul>
</section>

<style>
  .top { display: flex; gap: 12px; align-items: baseline; padding-top: calc(18px + env(safe-area-inset-top, 0px)); }
  .top a { color: var(--muted); font-size: 1.1rem; }
  h1 { font-family: var(--serif); font-weight: 600; font-size: 1.5rem; margin: 0 0 10px; }
  h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 28px 0 8px; }
  .modes { display: grid; gap: 10px; }
  @media (min-width: 640px) { .modes { grid-template-columns: 1fr 1fr; } }
  .mode {
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--surface);
  }
  .mode span { color: var(--muted); font-size: 0.88rem; }
  .mode.on { border-color: var(--accent); background: #1a2233; }
  .try { margin-top: 16px; }
  .keys, .syntax { padding-left: 1.1em; }
  .keys li, .syntax li { margin: 0.35em 0; }
  code { font-family: var(--mono); font-size: 0.88em; }
  .note { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
  label.btn { cursor: pointer; }
</style>
