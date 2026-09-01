/**
 * The object model.
 *
 * Everything here is plain, serialisable data with stable ids and timestamps —
 * the shape a row would take in Postgres later. Nothing in the model depends on
 * the renderer, the store, or IndexedDB, which is what will let a cloud layer
 * slot in behind it without a rewrite.
 */

export const OBJECT_KINDS = [
  'person',
  'photo',
  'note',
  'memory',
  'song',
  'place',
  'collection',
  'artwork',
  'event',
  'constellation',
] as const;

export type ObjectKind = (typeof OBJECT_KINDS)[number];

export interface OrbitObject {
  id: string;
  universeId: string;
  kind: ObjectKind;

  title: string;
  /** Note body, photo caption, song artist, place description… */
  body?: string;
  /** ISO `YYYY-MM-DD`. Drives the timeline. */
  date?: string;

  // ── spatial ──
  x: number;
  y: number;
  /** Multiplier on the kind's base size. */
  scale: number;
  /** Radians. */
  rotation: number;
  /** Paint order within the universe. */
  z: number;

  // ── appearance ──
  /** Overrides the theme accent for this object. */
  color?: string;
  /** Deterministic style variant (surface pattern, frame style, …). */
  variant: number;
  /** 0..1 — how much this object matters. Drives glow and label priority. */
  glow: number;

  // ── content links ──
  /** Asset id for photo / artwork. */
  mediaId?: string;
  /** Streaming/preview url for a song. */
  audioUrl?: string;
  /** Free-text place name. */
  place?: string;
  /** Containing memory or collection. */
  parentId?: string | null;
  /** Constellation membership (constellation objects only). */
  members?: string[];
  /** Scrapbook contents (memory objects). */
  scrapbook?: ScrapbookPage | null;

  createdAt: number;
  updatedAt: number;
}

export interface Connection {
  id: string;
  universeId: string;
  a: string;
  b: string;
  /** Optional owning constellation. */
  constellationId?: string | null;
  label?: string;
  createdAt: number;
}

/** How a universe presents itself in the multiverse. */
export const UNIVERSE_FORMS = ['planet', 'star', 'galaxy', 'nebula', 'ringed', 'moon'] as const;
export type UniverseForm = (typeof UNIVERSE_FORMS)[number];

export interface Universe {
  id: string;
  name: string;
  /** One line, shown on approach. */
  tagline?: string;
  form: UniverseForm;
  /** Position in multiverse space. */
  x: number;
  y: number;
  /** Size multiplier in the multiverse. */
  size: number;
  color: string;
  /** Theme preset id + per-universe overrides. */
  theme: { preset: string; overrides?: Record<string, number | string> };
  /** Seeds the procedural sky so each universe's stars are its own. */
  seed: number;
  /** Where the camera was left, so returning feels continuous. */
  lastCamera?: { x: number; y: number; zoom: number };
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Asset {
  id: string;
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  /** Small blurred placeholder as a data url, for instant paint. */
  thumb?: string;
  createdAt: number;
}

/* ── scrapbook ──────────────────────────────────────────────────────────── */

export const SCRAP_STYLES = [
  'notebook',
  'film',
  'vintage',
  'paper',
  'dreamy',
  'minimal',
] as const;
export type ScrapStyle = (typeof SCRAP_STYLES)[number];

export type ScrapItemType = 'photo' | 'text' | 'note' | 'sticker' | 'tape' | 'doodle' | 'polaroid';

export interface ScrapItem {
  id: string;
  type: ScrapItemType;
  /** Fractions of the page (0..1) so pages reflow across screen sizes. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  z: number;
  mediaId?: string;
  text?: string;
  /** Handwriting vs printed, sticker glyph, tape tint… */
  font?: 'hand' | 'serif' | 'sans';
  color?: string;
  glyph?: string;
  /** Normalised polyline points for doodles: [x0,y0,x1,y1,…]. */
  points?: number[];
  stroke?: number;
  opacity?: number;
}

export interface ScrapbookPage {
  style: ScrapStyle;
  items: ScrapItem[];
  /** Optional handwritten heading. */
  heading?: string;
  updatedAt: number;
}

/* ── settings ───────────────────────────────────────────────────────────── */

export interface AppSettings {
  id: 'app';
  /** Whether the gift intro has been dismissed. */
  welcomed: boolean;
  /** null = automatic. */
  qualityLock: string | null;
  /** 0..1.5 user-facing motion multiplier. */
  motion: number;
  soundEnabled: boolean;
  lastUniverseId: string | null;
  createdAt: number;
  version: number;
}

/* ── defaults per kind ──────────────────────────────────────────────────── */

export interface KindSpec {
  label: string;
  /** Base world radius. */
  radius: number;
  /** Short description used in the add sheet. */
  hint: string;
  /** Whether resizing/rotating makes sense. */
  resizable: boolean;
  rotatable: boolean;
  /** Default glow importance. */
  glow: number;
}

export const KIND_SPEC: Record<ObjectKind, KindSpec> = {
  person: { label: 'Person', radius: 48, hint: 'Someone who matters', resizable: true, rotatable: false, glow: 0.55 },
  photo: { label: 'Photo', radius: 160, hint: 'A picture worth keeping', resizable: true, rotatable: true, glow: 0.3 },
  note: { label: 'Note', radius: 130, hint: 'A thought, a line, a reminder', resizable: true, rotatable: true, glow: 0.25 },
  memory: { label: 'Memory', radius: 140, hint: 'A whole moment — opens as a scrapbook', resizable: true, rotatable: false, glow: 0.8 },
  song: { label: 'Song', radius: 56, hint: 'Something you had on repeat', resizable: true, rotatable: false, glow: 0.5 },
  place: { label: 'Place', radius: 84, hint: 'Somewhere you have been', resizable: true, rotatable: false, glow: 0.4 },
  collection: { label: 'Collection', radius: 210, hint: 'A group of things, held together', resizable: true, rotatable: false, glow: 0.35 },
  artwork: { label: 'Artwork', radius: 155, hint: 'Something you made', resizable: true, rotatable: true, glow: 0.4 },
  event: { label: 'Event', radius: 62, hint: 'A day that counted — arrives as a comet', resizable: true, rotatable: false, glow: 0.6 },
  constellation: { label: 'Constellation', radius: 38, hint: 'Draw lines between things', resizable: false, rotatable: false, glow: 0.5 },
};

/* ── helpers ────────────────────────────────────────────────────────────── */

export function uid(prefix = 'o'): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  return `${prefix}_${rnd}`;
}

export function newObject(
  universeId: string,
  kind: ObjectKind,
  patch: Partial<OrbitObject> = {},
): OrbitObject {
  const now = Date.now();
  return {
    id: uid(kind.slice(0, 3)),
    universeId,
    kind,
    title: patch.title ?? '',
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    z: now % 100000,
    variant: Math.floor(Math.random() * 6),
    glow: KIND_SPEC[kind].glow,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

/** World radius of an object, accounting for its scale. */
export function objectRadius(o: Pick<OrbitObject, 'kind' | 'scale'>): number {
  return KIND_SPEC[o.kind].radius * (o.scale || 1);
}
