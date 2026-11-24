/**
 * B11: the app's progress state. Holds the attempt log in memory (it stays small: one event per
 * card) and derives every number from it. Writes go to IndexedDB first, then into memory.
 */
import type { ExerciseResult, Event, NewEvent } from './events';
import { isEvent, randomId } from './events';
import { memoryStore, openIdb, type EventStore } from './db';
import { derive, type Derived } from './derive';

const DEVICE_KEY = 'rtr.device';

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) localStorage.setItem(DEVICE_KEY, (id = randomId().slice(0, 12)));
    return id;
  } catch {
    return 'anon';
  }
}

type Listener = () => void;

class Progress {
  events = $state.raw<Event[]>([]);
  ready = $state(false);
  d: Derived = $derived(derive(this.events));

  db: EventStore = memoryStore();
  readonly device = deviceId();
  private listeners: Listener[] = [];
  private initing: Promise<void> | null = null;

  init(factory?: IDBFactory): Promise<void> {
    this.initing ??= (async () => {
      try {
        const f = factory ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
        if (f) this.db = await openIdb(f);
      } catch {
        this.db = memoryStore();
      }
      this.events = await this.db.all();
      this.ready = true;
    })();
    return this.initing;
  }

  /** Called after every local write (B12 uses it to schedule a sync). */
  onWrite(fn: Listener): void {
    this.listeners.push(fn);
  }

  async record(e: NewEvent): Promise<Event> {
    const full = { ...e, id: randomId(), t: Date.now(), dev: this.device } as Event;
    try {
      await this.db.add([full], false);
    } catch {
      /* storage failed: keep it in memory for this session */
    }
    this.events = [...this.events, full];
    for (const l of this.listeners) l();
    return full;
  }

  /** Merge events from the server or a backup file. Returns how many were new. */
  async merge(incoming: unknown[], synced: boolean): Promise<number> {
    const valid = incoming.filter(isEvent);
    const fresh = await this.db.add(valid, synced);
    if (fresh.length) {
      this.events = [...this.events, ...fresh].sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
    }
    if (!synced && fresh.length) for (const l of this.listeners) l();
    return fresh.length;
  }

  markRead(unit: string, item: string, pages?: number): void {
    if (this.d.read.get(unit)?.has(item)) return;
    void this.record(pages ? { type: 'read', unit, item, pages: Math.round(pages * 1000) / 1000 } : { type: 'read', unit, item });
  }

  recordExercise(unit: string, item: string, r: ExerciseResult): void {
    void this.record({ type: 'ex', unit, item, ...r });
  }

  recordReview(unit: string, item: string, r: ExerciseResult, seed: number, variant: boolean): void {
    void this.record({ type: 'review', unit, item, seed, variant, ...r });
  }

  recordTime(ms: number): void {
    if (ms >= 1000) void this.record({ type: 'time', ms: Math.round(ms) });
  }

  recordSetting(key: string, value: unknown): void {
    void this.record({ type: 'set', key, value });
  }

  /** Backup file contents (B12 export button). */
  exportJson(): string {
    return JSON.stringify({ app: 'road-to-rudin', format: 1, exported: new Date().toISOString(), events: this.events }, null, 0);
  }

  async importJson(text: string): Promise<number> {
    const data = JSON.parse(text) as { events?: unknown };
    if (!data || !Array.isArray(data.events)) throw new Error('Not a Road to Rudin backup file');
    return this.merge(data.events, false);
  }
}

export const progress = new Progress();
