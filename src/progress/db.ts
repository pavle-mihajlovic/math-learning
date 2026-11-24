/**
 * B11: IndexedDB storage for the attempt log.
 *
 *   events  keyPath "id"; each record is an Event plus `_s` (1 = already on the server, 0 = not yet).
 *   meta    small key/value pairs (sync cursor, device id).
 *
 * When IndexedDB is unavailable (some private-browsing modes), everything falls back to memory
 * for the session, so the app still works.
 */
import type { Event } from './events';

type Stored = Event & { _s: 0 | 1 };

const DB_NAME = 'rtr';
const VERSION = 1;

export interface EventStore {
  all(): Promise<Event[]>;
  /** Adds events whose id isn't stored yet. Returns the ones that were new. */
  add(events: Event[], synced: boolean): Promise<Event[]>;
  unsynced(limit: number): Promise<Event[]>;
  markSynced(ids: string[]): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
  /** Deletes everything (used by tests and "sign out and erase"). */
  clear(): Promise<void>;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });
}

const strip = ({ _s, ...e }: Stored): Event => {
  void _s;
  return e as Event;
};

export async function openIdb(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<EventStore> {
  const open = factory.open(name, VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('events')) {
      const s = db.createObjectStore('events', { keyPath: 'id' });
      s.createIndex('synced', '_s');
    }
    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
  };
  const db = await req(open);

  return {
    async all() {
      const tx = db.transaction('events', 'readonly');
      const rows = (await req(tx.objectStore('events').getAll())) as Stored[];
      return rows.map(strip).sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
    },
    async add(events, synced) {
      if (!events.length) return [];
      const tx = db.transaction('events', 'readwrite');
      const store = tx.objectStore('events');
      const fresh: Event[] = [];
      const batch = new Map(events.map((e) => [e.id, e]));
      for (const e of batch.values()) {
        const r = store.get(e.id);
        r.onsuccess = () => {
          const row = r.result as Stored | undefined;
          if (!row) {
            store.put({ ...e, _s: synced ? 1 : 0 });
            fresh.push(e);
          } else if (synced && row._s === 0) {
            store.put({ ...row, _s: 1 });
          }
        };
      }
      await done(tx);
      return fresh;
    },
    async unsynced(limit) {
      const tx = db.transaction('events', 'readonly');
      const rows = (await req(tx.objectStore('events').index('synced').getAll(0, limit))) as Stored[];
      return rows.map(strip);
    },
    async markSynced(ids) {
      if (!ids.length) return;
      const tx = db.transaction('events', 'readwrite');
      const store = tx.objectStore('events');
      for (const id of ids) {
        const r = store.get(id);
        r.onsuccess = () => {
          const row = r.result as Stored | undefined;
          if (row && row._s === 0) store.put({ ...row, _s: 1 });
        };
      }
      await done(tx);
    },
    async getMeta<T>(key: string) {
      const tx = db.transaction('meta', 'readonly');
      return (await req(tx.objectStore('meta').get(key))) as T | undefined;
    },
    async setMeta(key, value) {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put(value, key);
      await done(tx);
    },
    async clear() {
      const tx = db.transaction(['events', 'meta'], 'readwrite');
      tx.objectStore('events').clear();
      tx.objectStore('meta').clear();
      await done(tx);
    },
  };
}

export function memoryStore(): EventStore {
  const rows = new Map<string, Stored>();
  const meta = new Map<string, unknown>();
  return {
    async all() {
      return [...rows.values()].map(strip).sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
    },
    async add(events, synced) {
      const fresh: Event[] = [];
      for (const e of events) {
        const row = rows.get(e.id);
        if (row) {
          if (synced) row._s = 1;
          continue;
        }
        rows.set(e.id, { ...e, _s: synced ? 1 : 0 });
        fresh.push(e);
      }
      return fresh;
    },
    async unsynced(limit) {
      return [...rows.values()].filter((r) => r._s === 0).slice(0, limit).map(strip);
    },
    async markSynced(ids) {
      for (const id of ids) {
        const r = rows.get(id);
        if (r) r._s = 1;
      }
    },
    async getMeta<T>(key: string) {
      return meta.get(key) as T | undefined;
    },
    async setMeta(key, value) {
      meta.set(key, value);
    },
    async clear() {
      rows.clear();
      meta.clear();
    },
  };
}
