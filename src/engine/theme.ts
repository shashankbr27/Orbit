/**
 * A theme describes the *look* of a universe: how its sky is coloured, how
 * dense its stars are, how much nebula there is, how alive it feels.
 *
 * Themes are plain data so they can be stored per-universe, exported, and
 * later synced to the cloud without touching the renderer.
 */

export interface ThemeSpec {
  /** Centre of the deep-space radial gradient. */
  bgInner: string;
  /** Outer edge of the gradient. */
  bgOuter: string;
  nebA: string;
  nebB: string;
  nebC: string;
  starWarm: string;
  starCool: string;
  /** UI + object accent. */
  accent: string;
  /** 0..1.6 */
  starDensity: number;
  /** 0..1.4 - how much of the sky the clouds cover. */
  nebulaAmount: number;
  /** 0..2 - how brightly the clouds render. */
  nebulaGain: number;
  /** 0..1.6 */
  dustDensity: number;
  /** 0..1 */
  vignette: number;
  /** 0..1.5 - global multiplier on every continuous animation. */
  animation: number;
  /** Extra film grain on top of the tier default. */
  grain: number;
}

export type ThemePresetId =
  | 'night'
  | 'dream'
  | 'sunset'
  | 'aurora'
  | 'vintage'
  | 'minimal'
  | 'cosmic';

export interface ThemePreset {
  id: ThemePresetId;
  name: string;
  blurb: string;
  spec: ThemeSpec;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'night',
    name: 'Night',
    blurb: 'Cold, quiet, almost empty. The default sky.',
    spec: {
      bgInner: '#070a14',
      bgOuter: '#020309',
      nebA: '#1b2c4e',
      nebB: '#26224d',
      nebC: '#123044',
      starWarm: '#ffe9c8',
      starCool: '#cfe3ff',
      accent: '#8fb4ff',
      starDensity: 1.0,
      nebulaAmount: 0.85,
      nebulaGain: 0.58,
      dustDensity: 0.9,
      vignette: 0.4,
      animation: 1.0,
      grain: 0,
    },
  },
  {
    id: 'dream',
    name: 'Dream',
    blurb: 'Lavender haze, soft focus, unhurried.',
    spec: {
      bgInner: '#0d0a17',
      bgOuter: '#05040d',
      nebA: '#3b2554',
      nebB: '#57294c',
      nebC: '#242b5e',
      starWarm: '#ffe2e8',
      starCool: '#dcd4ff',
      accent: '#d7b3ff',
      starDensity: 0.95,
      nebulaAmount: 1.1,
      nebulaGain: 0.66,
      dustDensity: 1.15,
      vignette: 0.46,
      animation: 0.85,
      grain: 0.004,
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    blurb: 'The last warm light before the dark.',
    spec: {
      bgInner: '#150a0f',
      bgOuter: '#07030a',
      nebA: '#5d2c28',
      nebB: '#6d3c1d',
      nebC: '#2b1a3c',
      starWarm: '#ffd9a0',
      starCool: '#ffcfc0',
      accent: '#ff9e7a',
      starDensity: 0.9,
      nebulaAmount: 1.0,
      nebulaGain: 0.62,
      dustDensity: 1.0,
      vignette: 0.5,
      animation: 0.9,
      grain: 0.003,
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    blurb: 'Green light moving over a cold horizon.',
    spec: {
      bgInner: '#04110f',
      bgOuter: '#010709',
      nebA: '#0f4b45',
      nebB: '#17603f',
      nebC: '#123c5e',
      starWarm: '#e8ffe4',
      starCool: '#c4f4ff',
      accent: '#6ff0c0',
      starDensity: 1.05,
      nebulaAmount: 1.0,
      nebulaGain: 0.64,
      dustDensity: 0.95,
      vignette: 0.42,
      animation: 1.15,
      grain: 0,
    },
  },
  {
    id: 'vintage',
    name: 'Vintage',
    blurb: 'Sepia, dust, the smell of old paper.',
    spec: {
      bgInner: '#12100b',
      bgOuter: '#070604',
      nebA: '#4b3a25',
      nebB: '#3b2f20',
      nebC: '#2a2622',
      starWarm: '#ffe3b0',
      starCool: '#eadcc2',
      accent: '#d8b26a',
      starDensity: 0.85,
      nebulaAmount: 0.8,
      nebulaGain: 0.52,
      dustDensity: 1.3,
      vignette: 0.62,
      animation: 0.75,
      grain: 0.014,
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    blurb: 'Almost nothing. Just you and the dark.',
    spec: {
      bgInner: '#0a0a0c',
      bgOuter: '#050506',
      nebA: '#1c1c22',
      nebB: '#17171d',
      nebC: '#212129',
      starWarm: '#fff6e8',
      starCool: '#e8eefc',
      accent: '#ffffff',
      starDensity: 0.6,
      nebulaAmount: 0.35,
      nebulaGain: 0.36,
      dustDensity: 0.35,
      vignette: 0.3,
      animation: 0.6,
      grain: 0,
    },
  },
  {
    id: 'cosmic',
    name: 'Cosmic',
    blurb: 'Deep violet, heavy clouds, loud stars.',
    spec: {
      bgInner: '#0a0719',
      bgOuter: '#030209',
      nebA: '#2c1b60',
      nebB: '#4b206c',
      nebC: '#10355f',
      starWarm: '#ffe7d0',
      starCool: '#cdd8ff',
      accent: '#b08cff',
      starDensity: 1.3,
      nebulaAmount: 1.25,
      nebulaGain: 0.74,
      dustDensity: 1.2,
      vignette: 0.38,
      animation: 1.1,
      grain: 0,
    },
  },
];

export const THEME_BY_ID: Record<ThemePresetId, ThemePreset> = THEME_PRESETS.reduce(
  (acc, p) => {
    acc[p.id] = p;
    return acc;
  },
  {} as Record<ThemePresetId, ThemePreset>,
);

export const DEFAULT_THEME_ID: ThemePresetId = 'night';

/** A universe stores a preset id plus any per-universe overrides. */
export interface ThemeRef {
  preset: ThemePresetId;
  overrides?: Partial<ThemeSpec>;
}

export function resolveTheme(ref: ThemeRef | undefined | null): ThemeSpec {
  const preset = THEME_BY_ID[ref?.preset ?? DEFAULT_THEME_ID] ?? THEME_BY_ID.night;
  return { ...preset.spec, ...(ref?.overrides ?? {}) };
}
