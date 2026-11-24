/**
 * B11: the attempt log. Every piece of progress is an append-only event; everything you see
 * (completion %, problems solved, time spent, the mistakes queue) is derived from the log.
 * Events are never edited or deleted, which is what makes sync (B12) conflict-free: devices
 * only ever exchange events they haven't seen, by id.
 */

/** How an exercise went. Shared by the main flow ("ex") and Practice mistakes ("review"). */
export interface ExerciseResult {
  correct: boolean;
  /** Right on the first typed try (auto) or "I got it" (self-check). */
  firstTry: boolean;
  /** Number of checked tries. */
  tries: number;
  sawSolution: boolean;
  /** Self-check card (you marked it yourself). */
  self: boolean;
}

interface Base {
  /** Random unique id (dedupes across devices). */
  id: string;
  /** Unix ms when it happened. */
  t: number;
  /** Device that recorded it. */
  dev: string;
}

/** A reading card (text, example or checkpoint) finished with "Got it" / next. */
export interface ReadEvent extends Base {
  type: 'read';
  unit: string;
  item: string;
  /** Estimated book pages the card covers (words ÷ 350), for the "pages read" stats. */
  pages?: number;
}

/** An exercise finished in the main flow (first time or a redo). */
export interface ExerciseEvent extends Base, ExerciseResult {
  type: 'ex';
  unit: string;
  item: string;
}

/** An exercise finished in Practice mistakes (B13). */
export interface ReviewEvent extends Base, ExerciseResult {
  type: 'review';
  unit: string;
  item: string;
  /** Seed the variant was drawn with (same seed = same numbers). */
  seed: number;
  /** True when a variant with new numbers was shown, false when it was the original exercise. */
  variant: boolean;
}

/** Active study time (pauses after 60 s idle or in the background). */
export interface TimeEvent extends Base {
  type: 'time';
  ms: number;
}

/** A synced setting. The latest one per key wins. */
export interface SettingEvent extends Base {
  type: 'set';
  key: string;
  value: unknown;
}

export type Event = ReadEvent | ExerciseEvent | ReviewEvent | TimeEvent | SettingEvent;
export type EventType = Event['type'];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewEvent = DistributiveOmit<Event, 'id' | 't' | 'dev'>;

export function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** `V1.2.3/e59`: an exercise or reading card anywhere in the course. */
export const itemKey = (unit: string, item: string): string => `${unit}/${item}`;

const TYPES: ReadonlySet<string> = new Set(['read', 'ex', 'review', 'time', 'set']);

/** Shape check for events coming from a backup file or the server. */
export function isEvent(x: unknown): x is Event {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  if (typeof e.id !== 'string' || !e.id || e.id.length > 64) return false;
  if (typeof e.t !== 'number' || !Number.isFinite(e.t)) return false;
  if (typeof e.dev !== 'string' || typeof e.type !== 'string' || !TYPES.has(e.type)) return false;
  switch (e.type) {
    case 'read':
      return typeof e.unit === 'string' && typeof e.item === 'string';
    case 'ex':
    case 'review':
      return typeof e.unit === 'string' && typeof e.item === 'string' && typeof e.correct === 'boolean';
    case 'time':
      return typeof e.ms === 'number' && e.ms >= 0 && e.ms < 24 * 3600e3;
    case 'set':
      return typeof e.key === 'string';
  }
  return false;
}
