export type QualityTier = 'ultra' | 'high' | 'medium' | 'low';

export interface QualitySettings {
  tier: QualityTier;
  /** Device pixel ratio ceiling for the cosmic canvas. */
  maxDpr: number;
  /** Nebula is rendered to an offscreen target 1/N the size, then upsampled. */
  nebulaDivisor: number;
  /** fBm octaves in the nebula pass. */
  nebulaOctaves: number;
  /** Refresh the nebula target every N frames (it evolves very slowly). */
  nebulaEveryNFrames: number;
  /** Number of procedural star depth layers. */
  starLayers: number;
  /** Enable the 3x3-tap bright focal star pass (glow + diffraction spikes). */
  focalStars: boolean;
  /** Dust field layers. */
  dustLayers: number;
  /** Film grain amount. */
  grain: number;
  /** Object-layer soft glow sprites. */
  objectGlow: boolean;
  /** Upper bound on simultaneously animated object sprites. */
  maxAnimatedObjects: number;
}

const TIERS: Record<QualityTier, Omit<QualitySettings, 'tier'>> = {
  ultra: {
    maxDpr: 2,
    nebulaDivisor: 2,
    nebulaOctaves: 6,
    nebulaEveryNFrames: 1,
    starLayers: 5,
    focalStars: true,
    dustLayers: 2,
    grain: 0.016,
    objectGlow: true,
    maxAnimatedObjects: 900,
  },
  high: {
    maxDpr: 2,
    nebulaDivisor: 3,
    nebulaOctaves: 5,
    nebulaEveryNFrames: 2,
    starLayers: 5,
    focalStars: true,
    dustLayers: 2,
    grain: 0.014,
    objectGlow: true,
    maxAnimatedObjects: 600,
  },
  medium: {
    maxDpr: 1.75,
    nebulaDivisor: 4,
    nebulaOctaves: 4,
    nebulaEveryNFrames: 3,
    starLayers: 4,
    focalStars: true,
    dustLayers: 1,
    grain: 0.012,
    objectGlow: true,
    maxAnimatedObjects: 350,
  },
  low: {
    maxDpr: 1.25,
    nebulaDivisor: 6,
    nebulaOctaves: 3,
    nebulaEveryNFrames: 4,
    starLayers: 3,
    focalStars: false,
    dustLayers: 1,
    grain: 0.008,
    objectGlow: false,
    maxAnimatedObjects: 180,
  },
};

const ORDER: QualityTier[] = ['low', 'medium', 'high', 'ultra'];

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Best-effort guess before we have any frame timings. */
export function guessTier(): QualityTier {
  if (typeof window === 'undefined') return 'high';
  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = (nav as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  const dpr = window.devicePixelRatio || 1;
  const px = window.innerWidth * window.innerHeight * dpr * dpr;

  let score = 0;
  score += cores >= 8 ? 2 : cores >= 6 ? 1 : cores >= 4 ? 0 : -2;
  score += mem >= 8 ? 1 : mem >= 4 ? 0 : -1;
  // A huge backing store on a phone is the main cause of fill-rate trouble.
  score += px > 5_000_000 ? -1 : 0;

  const ua = navigator.userAgent;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  if (isMobile) score -= 1;
  // Older Androids are the weakest common target.
  if (/Android [4-8]\./.test(ua)) score -= 2;

  if (score >= 3) return 'ultra';
  if (score >= 1) return 'high';
  if (score >= -1) return 'medium';
  return 'low';
}

/**
 * Watches real frame times and walks the quality tier up or down.
 *
 * Downgrades quickly (a stutter is felt immediately), upgrades slowly and only
 * once - we never want to oscillate visibly.
 */
export class QualityManager {
  settings: QualitySettings;
  reducedMotion: boolean;
  /** 0..1 multiplier applied to every continuous animation. */
  motionScale: number;

  private tier: QualityTier;
  private samples: number[] = [];
  private lastChange = 0;
  private upgradesLeft = 1;
  private listeners = new Set<(s: QualitySettings) => void>();
  private locked = false;

  constructor(tier: QualityTier = guessTier()) {
    this.tier = tier;
    this.settings = { tier, ...TIERS[tier] };
    this.reducedMotion = prefersReducedMotion();
    this.motionScale = this.reducedMotion ? 0 : 1;
  }

  onChange(fn: (s: QualitySettings) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Pin a tier (user override from the settings panel). */
  lock(tier: QualityTier | null) {
    if (tier === null) {
      this.locked = false;
      return;
    }
    this.locked = true;
    this.apply(tier);
  }

  private apply(tier: QualityTier) {
    if (tier === this.tier) return;
    this.tier = tier;
    this.settings = { tier, ...TIERS[tier] };
    this.listeners.forEach((l) => l(this.settings));
  }

  /** Feed one frame duration in milliseconds. */
  sample(ms: number, now: number) {
    if (this.locked) return;
    // Ignore obvious hitches (tab switch, GC pause, first frames).
    if (ms > 400) return;
    this.samples.push(ms);
    if (this.samples.length < 90) return;

    const sorted = this.samples.slice().sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    this.samples.length = 0;

    if (now - this.lastChange < 1800) return;

    const idx = ORDER.indexOf(this.tier);
    // Struggling: p90 worse than ~40fps, or median worse than ~48fps.
    if ((p90 > 25 || p50 > 21) && idx > 0) {
      this.lastChange = now;
      this.upgradesLeft = 0;
      this.apply(ORDER[idx - 1]);
      return;
    }
    // Comfortable headroom: median better than ~90fps for a while.
    if (p50 < 11 && p90 < 15 && idx < ORDER.length - 1 && this.upgradesLeft > 0) {
      this.lastChange = now;
      this.upgradesLeft--;
      this.apply(ORDER[idx + 1]);
    }
  }
}
