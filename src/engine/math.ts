/**
 * Small, allocation-free math helpers used by the render loop.
 * Everything here runs up to 60x/second — keep it branch-light and pure.
 */

export const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Frame-rate independent exponential smoothing.
 * `smoothing` is the fraction of the remaining distance left after 1 second.
 * Lower = snappier. This is the correct way to do "lerp toward target" when dt
 * varies (which it always does on mobile).
 */
export const damp = (current: number, target: number, smoothing: number, dt: number) =>
  lerp(target, current, Math.pow(smoothing, dt));

export const mix2 = (ax: number, ay: number, bx: number, by: number, t: number) =>
  [ax + (bx - ax) * t, ay + (by - ay) * t] as const;

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
/** Cinematic: slow out, fast middle, very soft landing. */
export const easeInOutQuint = (t: number) =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export const dist = (ax: number, ay: number, bx: number, by: number) =>
  Math.hypot(bx - ax, by - ay);

/** Deterministic 32-bit hash → [0,1). Used for stable per-object randomness. */
export function hash01(seedStr: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** A few decorrelated deterministic randoms from one seed. */
export function hashN(seedStr: string, n: number): number {
  return hash01(seedStr + '#' + n);
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** hex `#rrggbb` → [r,g,b] in 0..1 */
export function hexToRgb01(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function hexToInt(hex: string): number {
  const h = hex.replace('#', '').trim();
  const n = parseInt(h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h, 16);
  return Number.isNaN(n) ? 0xffffff : n;
}
