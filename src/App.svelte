<script lang="ts">
  import UnitPlayer from './cards/UnitPlayer.svelte';
  import Contents from './lib/Contents.svelte';
  import Home from './lib/Home.svelte';
  import Settings from './lib/Settings.svelte';
  import Practice from './practice/Practice.svelte';
  import Pair from './sync/Pair.svelte';
  import { loadIndex } from './content/load';
  import { nextUnitId } from './progress/derive';
  import { progress } from './progress/store.svelte';
  import { applyUpdate, pwa } from './pwa/offline.svelte';

  /**
   * Hash routes (no server rewrites needed):
   *   #/              home
   *   #/calc/1        a calculus unit's sections (1–3)
   *   #/continue      next card in strict book order (B11)
   *   #/unit/V1.2.3   a unit
   *   #/practice      Practice mistakes (B13)
   *   #/settings      settings, account, offline, backup
   *   #/pair/CODE     sign in this device with a pairing code from another device (B12)
   */
  let hash = $state(location.hash);
  const route = $derived.by(() => {
    const m = /^#\/unit\/(V\d\.\d+\.\d+)$/.exec(hash);
    if (m) return { name: 'unit' as const, id: m[1] };
    const p = /^#\/pair\/([A-Za-z0-9-]+)$/.exec(hash);
    if (p) return { name: 'pair' as const, code: p[1] };
    if (hash === '#/settings') return { name: 'settings' as const };
    if (hash === '#/practice') return { name: 'practice' as const };
    if (hash === '#/continue') return { name: 'continue' as const };
    const c = /^#\/calc\/([123])$/.exec(hash);
    if (c) return { name: 'calc' as const, volume: Number(c[1]) };
    return { name: 'home' as const };
  });

  let continueError = $state('');
  $effect(() => {
    if (route.name !== 'continue' || !progress.ready) return;
    loadIndex()
      .then((idx) => {
        const id = nextUnitId(progress.d, idx);
        location.replace(id ? `#/unit/${id}` : '#/');
      })
      .catch((e: Error) => (continueError = e.message));
  });
</script>

<svelte:window onhashchange={() => { hash = location.hash; window.scrollTo(0, 0); }} />

{#if pwa.updateReady}
  <div class="update" role="status">
    A new version is ready.
    <button class="link" onclick={applyUpdate}>Reload</button>
  </div>
{/if}

<main class="page">
  {#if !progress.ready}
    <p class="muted">Loading…</p>
  {:else if route.name === 'unit'}
    {#key route.id}<UnitPlayer unitId={route.id} />{/key}
  {:else if route.name === 'calc'}
    <Contents volume={route.volume} />
  {:else if route.name === 'settings'}
    <Settings />
  {:else if route.name === 'practice'}
    <Practice />
  {:else if route.name === 'pair'}
    <Pair code={route.code} />
  {:else if route.name === 'continue'}
    {#if continueError}<p class="feedback bad">{continueError}</p>{:else}<p class="muted">Loading…</p>{/if}
  {:else}
    <Home />
  {/if}
</main>

<style>
  .update {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    z-index: 20;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 14px;
    font-size: 0.9rem;
    display: flex;
    gap: 12px;
    align-items: center;
    white-space: nowrap;
  }
  .link { background: none; border: none; padding: 0; color: var(--accent); font-size: inherit; }
</style>
