import type { BookIndex, Unit } from './types';

const units = new Map<string, Promise<Unit>>();
let index: Promise<BookIndex> | null = null;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.json() as Promise<T>;
}

export function loadIndex(): Promise<BookIndex> {
  index ??= getJson<BookIndex>('/content/os-calc/index.json').catch((e) => {
    index = null;
    throw e;
  });
  return index;
}

export function loadUnit(id: string): Promise<Unit> {
  if (!/^V\d\.\d+\.\d+$/.test(id)) return Promise.reject(new Error(`Unknown unit ${id}`));
  let p = units.get(id);
  if (!p) {
    p = getJson<Unit>(`/content/os-calc/${id}.json`);
    p.catch(() => units.delete(id));
    units.set(id, p);
  }
  return p;
}

/** Units in strict book order. */
export async function unitOrder(): Promise<{ id: string; title: string }[]> {
  const idx = await loadIndex();
  return idx.volumes.flatMap((v) => v.chapters.flatMap((c) => c.units.map((u) => ({ id: u.id, title: u.title }))));
}

export function sourceLabel(unitId: string, number?: number): string {
  const [vol, ch, sec] = unitId.slice(1).split('.');
  return `OpenStax Calc Vol ${vol} §${ch}.${sec}${number ? ` #${number}` : ''}`;
}
