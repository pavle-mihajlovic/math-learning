<script lang="ts">
  import { account, redeemPairing } from './client.svelte';

  /** B12: landing page for a scanned pairing QR code (#/pair/ABCD-2345). */
  let { code }: { code: string } = $props();

  let phase = $state<'working' | 'done' | 'error'>('working');
  let msg = $state('');

  $effect(() => {
    const c = code;
    phase = 'working';
    redeemPairing(c)
      .then(() => {
        phase = 'done';
        setTimeout(() => location.replace('#/'), 1200);
      })
      .catch((e: Error) => {
        phase = 'error';
        msg = e.message;
      });
  });
</script>

<article class="card center">
  <h2>Link this device</h2>
  {#if phase === 'working'}
    <p class="muted">Signing in…</p>
  {:else if phase === 'done'}
    <p class="feedback good">✓ Linked. Your progress is syncing{account.syncing ? '…' : '.'}</p>
  {:else}
    <p class="feedback bad">{msg}</p>
  {/if}
  <div class="actions"><a class="btn" href="#/">Go to the app</a></div>
</article>

<style>
  .center { text-align: center; margin-top: calc(24px + env(safe-area-inset-top, 0px)); }
  .center .actions { justify-content: center; }
</style>
