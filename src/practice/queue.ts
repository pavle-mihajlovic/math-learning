/**
 * B13: the Practice mistakes queue, derived from the attempt log.
 *
 * - An exercise enters the queue the first time you miss it in the main flow
 *   (wrong, or you needed the solution). That miss counts as a first review rated "Again".
 * - Each practice attempt ("review" event) is rated and fed to FSRS (ts-fsrs), which sets the next due date.
 * - Missing it again in the main flow (a redo) also counts as "Again".
 * Fuzz is off, so every device computes the same schedule from the same log.
 */
import { fsrs, generatorParameters, createEmptyCard, Rating, State, type Card, type Grade } from 'ts-fsrs';
import type { Event, ExerciseResult } from '../progress/events';
import { itemKey } from '../progress/events';

const scheduler = fsrs(generatorParameters({ enable_fuzz: false, enable_short_term: true }));

export interface MistakeCard {
  key: string;
  unit: string;
  item: string;
  card: Card;
  /** Practice attempts so far (seeds the next variant, so each review gets new numbers). */
  reviews: number;
  /** When it first went wrong. */
  since: number;
}

export function rate(r: ExerciseResult): Grade {
  if (!r.correct) return Rating.Again;
  if (r.self) return Rating.Good; // self-check cards always show the answer; "I got it" is a pass
  if (r.sawSolution) return Rating.Again;
  return r.firstTry ? Rating.Good : Rating.Hard;
}

/** Wrong, or (for auto-checked exercises) needed the solution. */
const missed = (r: ExerciseResult) => rate(r) === Rating.Again;

/** Events must be sorted by time. */
export function buildQueue(events: readonly Event[]): Map<string, MistakeCard> {
  const cards = new Map<string, MistakeCard>();
  for (const e of events) {
    if (e.type !== 'ex' && e.type !== 'review') continue;
    const key = itemKey(e.unit, e.item);
    let c = cards.get(key);
    const at = new Date(e.t);
    if (!c) {
      // Only a main-flow miss starts a card. (A review without a card can come from a
      // backup of an older schedule; it starts one too, so nothing is lost.)
      if (e.type === 'ex' && !missed(e)) continue;
      c = { key, unit: e.unit, item: e.item, card: createEmptyCard(at), reviews: 0, since: e.t };
      cards.set(key, c);
    } else if (e.type === 'ex' && !missed(e)) {
      continue; // getting it right in a redo doesn't change the practice schedule
    }
    c.card = scheduler.next(c.card, at, e.type === 'ex' ? Rating.Again : rate(e)).card;
    if (e.type === 'review') c.reviews++;
  }
  return cards;
}

/** Cards due at `now`, oldest due first. */
export function dueCards(cards: Map<string, MistakeCard>, now = Date.now()): MistakeCard[] {
  return [...cards.values()].filter((c) => c.card.due.getTime() <= now).sort((a, b) => a.card.due.getTime() - b.card.due.getTime());
}

/** When the next card becomes due (for "next one in 8 min"), or null if the queue is empty. */
export function nextDue(cards: Map<string, MistakeCard>, now = Date.now()): number | null {
  let best: number | null = null;
  for (const c of cards.values()) {
    const t = c.card.due.getTime();
    if (t > now && (best === null || t < best)) best = t;
  }
  return best;
}

export function isLearning(c: MistakeCard): boolean {
  return c.card.state === State.Learning || c.card.state === State.Relearning;
}

/** Deterministic seed for the variant shown at a given review. */
export function variantSeed(key: string, review: number): number {
  let h = 2166136261;
  for (const ch of `${key}#${review}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 1_000_000_007;
}
