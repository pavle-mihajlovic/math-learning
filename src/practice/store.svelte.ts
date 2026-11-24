import { progress } from '../progress/store.svelte';
import { buildQueue, dueCards, type MistakeCard } from './queue';

/** B13: the mistakes queue, kept in step with the attempt log. */
class Mistakes {
  cards: Map<string, MistakeCard> = $derived(buildQueue(progress.events));
  due(now = Date.now()): MistakeCard[] {
    return dueCards(this.cards, now);
  }
}

export const mistakes = new Mistakes();
