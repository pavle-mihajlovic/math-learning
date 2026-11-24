<script lang="ts">
  import UnitPlayer from './cards/UnitPlayer.svelte';
  import Contents from './lib/Contents.svelte';
  import Settings from './lib/Settings.svelte';

  /** Hash routes: #/ (contents), #/unit/V1.2.3, #/settings. Hash routing needs no server rewrites. */
  let hash = $state(location.hash);
  const route = $derived.by(() => {
    const m = /^#\/unit\/(V\d\.\d+\.\d+)$/.exec(hash);
    if (m) return { name: 'unit' as const, id: m[1] };
    if (hash === '#/settings') return { name: 'settings' as const };
    return { name: 'contents' as const };
  });
</script>

<svelte:window onhashchange={() => { hash = location.hash; window.scrollTo(0, 0); }} />

<main class="page">
  {#if route.name === 'unit'}
    {#key route.id}<UnitPlayer unitId={route.id} />{/key}
  {:else if route.name === 'settings'}
    <Settings />
  {:else}
    <Contents />
  {/if}
</main>
