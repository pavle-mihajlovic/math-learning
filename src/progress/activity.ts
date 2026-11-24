/**
 * B11: active-time tracking. Time counts only while a study screen is open, the app is in the
 * foreground, and you touched, typed or scrolled in the last 60 seconds.
 * Accumulated time is written to the log every 5 minutes and whenever the app goes to the background.
 */
export const IDLE_MS = 60_000;
const FLUSH_MS = 5 * 60_000;
const TICK_MS = 1000;

export interface Clock {
  now(): number;
  visible(): boolean;
}

/** The counting logic, separate from the DOM so it can be tested. */
export class ActiveTimer {
  private last: number;
  private lastTick: number;
  private acc = 0;

  constructor(private clock: Clock, private flushTo: (ms: number) => void) {
    this.last = clock.now();
    this.lastTick = clock.now();
  }

  touch(): void {
    this.last = this.clock.now();
  }

  tick(): void {
    const now = this.clock.now();
    // A long gap between ticks means the device slept or the tab was frozen: count at most one tick.
    const dt = Math.min(now - this.lastTick, TICK_MS * 2);
    this.lastTick = now;
    if (this.clock.visible() && now - this.last < IDLE_MS) this.acc += Math.max(0, dt);
    if (this.acc >= FLUSH_MS) this.flush();
  }

  flush(): void {
    if (this.acc > 0) this.flushTo(this.acc);
    this.acc = 0;
  }

  /** Not yet written to the log. */
  get pending(): number {
    return this.acc;
  }
}

const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'input'] as const;

/** Start counting; returns a function that stops and writes what's left. */
export function trackActiveTime(flushTo: (ms: number) => void): () => void {
  const timer = new ActiveTimer({ now: () => Date.now(), visible: () => document.visibilityState === 'visible' }, flushTo);
  const touch = () => timer.touch();
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') timer.flush();
    else timer.touch();
  };
  const onHide = () => timer.flush();
  for (const ev of ACTIVITY) addEventListener(ev, touch, { passive: true, capture: true });
  document.addEventListener('visibilitychange', onVisibility);
  addEventListener('pagehide', onHide);
  const id = setInterval(() => timer.tick(), TICK_MS);
  return () => {
    clearInterval(id);
    timer.tick();
    timer.flush();
    for (const ev of ACTIVITY) removeEventListener(ev, touch, { capture: true });
    document.removeEventListener('visibilitychange', onVisibility);
    removeEventListener('pagehide', onHide);
  };
}
