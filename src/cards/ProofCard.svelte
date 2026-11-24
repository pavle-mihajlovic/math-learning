<script lang="ts">
  import type { ProofCard } from '../content/types';
  import { inlineHtml } from '../content/render';
  import Blocks from '../lib/Blocks.svelte';
  import SolutionLabel from './SolutionLabel.svelte';

  /** Optional proof card (D16): read the statement, try the proof, then reveal it. */
  let { card, ondone }: { card: ProofCard; ondone: () => void } = $props();
  let shown = $state(false);

  export function primary() {
    if (!shown) shown = true;
    else ondone();
  }
</script>

<article class="card">
  <div class="kicker">Proof card · optional</div>
  <h2>{@html inlineHtml(card.title)}</h2>
  <div class="content statement"><Blocks blocks={card.statement} /></div>
  {#if shown}
    <section class="solution">
      <SolutionLabel label={card.label} />
      <div class="content"><Blocks blocks={card.proof} /></div>
    </section>
  {:else}
    <p class="muted">Try to prove it yourself first.</p>
  {/if}
  <div class="actions">
    {#if !shown}
      <button class="btn primary" onclick={() => (shown = true)}>Show proof <kbd>Space</kbd></button>
    {:else}
      <button class="btn primary" onclick={ondone}>Got it <kbd>Space</kbd></button>
    {/if}
  </div>
</article>
