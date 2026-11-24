<script lang="ts">
  import UnitPlayer from './cards/UnitPlayer.svelte';
  import Contents from './lib/Contents.svelte';
  import Home from './lib/Home.svelte';
  import Settings from './lib/Settings.svelte';
  import { startTimer, stopTimer } from './lib/progress.svelte';

  /** Hash routes: #/ (home), #/calc/1 (a calculus unit's sections), #/unit/V1.2.3, #/settings. */
  let hash = $state(location.hash);
  const route = $derived.by(() => {
    const m = /^#\/unit\/(V\d\.\d+\.\d+)$/.exec(hash);
    if (m) return { name: 'unit' as const, id: m[1] };
    const c = /^#\/calc\/([123])$/.exec(hash);
    if (c) return { name: 'calc' as const, volume: Number(c[1]) };
    if (hash === '#/settings') return { name: 'settings' as const };
    return { name: 'home' as const };
  });

  // Time only counts while you're inside a unit.
  $effect(() => {
    if (route.name === 'unit') startTimer();
    else stopTimer();
  });
</script>

<svelte:window onhashchange={() => { hash = location.hash; window.scrollTo(0, 0); }} />

<main class="page">
  {#if route.name === 'unit'}
    {#key route.id}<UnitPlayer unitId={route.id} />{/key}
  {:else if route.name === 'calc'}
    <Contents volume={route.volume} />
  {:else if route.name === 'settings'}
    <Settings />
  {:else}
    <Home />
  {/if}
</main>
