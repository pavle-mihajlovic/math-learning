/**
 * User settings. Kept in localStorage for a fast start, and written to the attempt log as
 * `set` events so they sync between devices (B12). The latest change wins.
 */
import { progress } from '../progress/store.svelte';

export type InputMode = 'plain' | 'visual';

interface Settings {
  inputMode: InputMode;
}

const KEY = 'rtr.settings.v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { inputMode: 'plain', ...JSON.parse(raw) };
  } catch {
    /* private mode or blocked storage: use defaults */
  }
  return { inputMode: 'plain' };
}

export const settings = $state<Settings>(load());

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

/** Save after the user changes a setting; the change syncs to other devices. */
export function saveSettings(): void {
  persist();
  progress.recordSetting('inputMode', settings.inputMode);
}

/** Apply settings that arrived from another device. */
export function applySyncedSettings(): void {
  const m = progress.d.settings.inputMode;
  if ((m === 'plain' || m === 'visual') && m !== settings.inputMode) {
    settings.inputMode = m;
    persist();
  }
}

/** Last position inside each unit. B11's attempt log decides where an unfinished unit resumes; this covers finished ones. */
export function getPosition(unitId: string): number {
  try {
    return Number(localStorage.getItem(`rtr.pos.${unitId}`) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function setPosition(unitId: string, i: number): void {
  try {
    localStorage.setItem(`rtr.pos.${unitId}`, String(i));
  } catch {
    /* ignore */
  }
}
