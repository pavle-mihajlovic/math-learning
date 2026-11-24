<script lang="ts">
  import type { Block } from '../content/types';
  import { inlineHtml, texHtml } from '../content/render';
  import Blocks from './Blocks.svelte';

  let { blocks = [] }: { blocks?: Block[] } = $props();

  const BOX_NAMES: Record<string, string> = {
    definition: 'Definition', theorem: 'Theorem', rule: 'Rule', strategy: 'Problem-solving strategy', note: 'Note',
  };
</script>

{#each blocks as b, i (i)}
  {#if b.type === 'p'}
    <p>{@html inlineHtml(b.text)}</p>
  {:else if b.type === 'math'}
    <div class="math-block">{@html texHtml(b.tex, true)}</div>
  {:else if b.type === 'list'}
    {#if b.ordered}
      <ol class="style-{b.style ?? '1'}">
        {#each b.items as item, j (j)}
          <li>{#if typeof item === 'string'}{@html inlineHtml(item)}{:else}<Blocks blocks={item} />{/if}</li>
        {/each}
      </ol>
    {:else}
      <ul>
        {#each b.items as item, j (j)}
          <li>{#if typeof item === 'string'}{@html inlineHtml(item)}{:else}<Blocks blocks={item} />{/if}</li>
        {/each}
      </ul>
    {/if}
  {:else if b.type === 'figure'}
    <figure>
      <div class="panel">
        <img src={'/' + b.src} alt={b.alt} width={b.width} height={b.height} loading="lazy" decoding="async" />
      </div>
      {#if b.caption}<figcaption>{@html inlineHtml(b.caption)}</figcaption>{/if}
    </figure>
  {:else if b.type === 'table'}
    <div class="table-wrap">
      <table>
        {#if b.caption}<caption>{@html inlineHtml(b.caption)}</caption>{/if}
        {#if b.header}
          <thead><tr>{#each b.header as h, j (j)}<th>{@html inlineHtml(h)}</th>{/each}</tr></thead>
        {/if}
        <tbody>
          {#each b.rows as row, j (j)}
            <tr>{#each row as cell, k (k)}<td>{@html inlineHtml(cell)}</td>{/each}</tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if b.type === 'box'}
    <div class="box {b.variant}">
      <div class="box-title">
        {#if b.variant === 'note' && b.title}{@html inlineHtml(b.title)}{:else}{BOX_NAMES[b.variant]}{#if b.title}: {@html inlineHtml(b.title)}{/if}{/if}
      </div>
      <Blocks blocks={b.body} />
    </div>
  {/if}
{/each}
