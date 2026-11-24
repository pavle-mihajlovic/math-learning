<script lang="ts">
  import type { SolutionLabel } from '../content/types';

  let { label }: { label: SolutionLabel } = $props();
  const TEXT: Record<SolutionLabel, string> = {
    book: '📗 Book solution',
    verified: '✅ AI, verified with SymPy',
    ai: '🤖 AI solution',
  };
</script>

<span class="sol-label {label}">{TEXT[label]}</span>

<style>
  .sol-label { font-size: 0.78rem; color: var(--muted); letter-spacing: 0.02em; }
</style>
