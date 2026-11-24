<script lang="ts">
  import type { TextCard } from '../content/types';
  import { inlineHtml } from '../content/render';
  import Blocks from '../lib/Blocks.svelte';

  let { card, ondone }: { card: TextCard; ondone: () => void } = $props();
</script>

<article class="card">
  {#if card.title}<h2>{@html inlineHtml(card.title)}</h2>{/if}
  <div class="content"><Blocks blocks={card.body} /></div>
  <div class="actions">
    <button class="btn primary" onclick={ondone}>Got it <kbd>Space</kbd></button>
  </div>
</article>
