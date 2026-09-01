/**
 * The frame loop.
 *
 * Deliberately independent of React: `onFrame` is called with a clamped delta
 * and a monotonic scene time. Nothing in here sets state.
 */
export class Loop {
  private raf = 0;
  private last = 0;
  private running = false;
  /** Scene time in seconds — advances only while the loop is active, so the
   *  universe never "jumps forward" after the tab has been hidden. */
  time = 0;
  /** Smoothed frames-per-second, for the debug/quality readout. */
  fps = 60;

  private onFrame: (dt: number, time: number, frameMs: number) => void;
  private visibilityBound = false;

  constructor(onFrame: (dt: number, time: number, frameMs: number) => void) {
    this.onFrame = onFrame;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    if (!this.visibilityBound) {
      document.addEventListener('visibilitychange', this.onVisibility);
      this.visibilityBound = true;
    }
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose() {
    this.stop();
    if (this.visibilityBound) {
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.visibilityBound = false;
    }
  }

  private onVisibility = () => {
    if (document.hidden) {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else if (this.running && !this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  };

  private tick = (now: number) => {
    if (!this.running) return;
    const frameMs = now - this.last;
    this.last = now;
    // Clamp: a 2s hitch must not teleport the simulation.
    const dt = Math.min(0.05, Math.max(0.0005, frameMs / 1000));
    this.time += dt;
    this.fps += (1000 / Math.max(1, frameMs) - this.fps) * 0.08;
    this.onFrame(dt, this.time, frameMs);
    this.raf = requestAnimationFrame(this.tick);
  };
}
