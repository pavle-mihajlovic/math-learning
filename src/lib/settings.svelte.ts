/** User settings, kept in localStorage. B12 moves them into the synced account. */
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

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

/** Last position inside each unit, so a reload resumes where you were. B11 replaces this with the attempt log. */
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
    localStorage.setItem('rtr.lastUnit', unitId);
  } catch {
    /* ignore */
  }
}

export function lastUnit(): string | null {
  try {
    return localStorage.getItem('rtr.lastUnit');
  } catch {
    return null;
  }
}
