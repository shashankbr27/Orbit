import type { Connection, ObjectKind, OrbitObject, Universe, UniverseForm } from '@/data/model';
import { objectRadius } from '@/data/model';
import { hash01 } from './math';
import { resolveTheme, type ThemePresetId } from './theme';

/**
 * The renderer never sees an `OrbitObject` or a `Universe` — it sees a `Scene`.
 *
 * That indirection is the seam between the data model and the engine: the
 * multiverse (whose "objects" are universes) and a universe (whose objects are
 * memories) render through exactly the same code path.
 */

export type NodeKind = ObjectKind | 'universe';

export interface SceneNode {
  id: string;
  kind: NodeKind;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  rotation: number;
  /** World-space radius, scale already applied. */
  radius: number;
  color: string;
  variant: number;
  /** 0..1 importance → glow strength and label priority. */
  glow: number;
  mediaId?: string;
  form?: UniverseForm;
  /** 0..1 — timeline / search de-emphasis. 1 = fully present. */
  emphasis: number;
  playing?: boolean;
  hasScrapbook?: boolean;
  /** Note/caption text, shown once the card is big enough to read. */
  text?: string;
  /** Deterministic 0..1 seed for animation phases. */
  seed: number;
}

export interface SceneLink {
  id: string;
  a: string;
  b: string;
  constellationId?: string | null;
  /** 0..1 — line brightness. */
  strength: number;
  color: string;
}

export interface Scene {
  nodes: SceneNode[];
  links: SceneLink[];
  accent: string;
  /** Bumped whenever the scene content changes, so the renderer can diff. */
  version: number;
}

export const EMPTY_SCENE: Scene = { nodes: [], links: [], accent: '#8fb4ff', version: 0 };

let sceneVersion = 1;
export const nextSceneVersion = () => sceneVersion++;

/** World radius a universe occupies in the multiverse. */
export function universeRadius(u: Pick<Universe, 'size' | 'form'>): number {
  const base =
    u.form === 'galaxy'
      ? 320
      : u.form === 'nebula'
        ? 300
        : u.form === 'star'
          ? 125
          : u.form === 'moon'
            ? 110
            : 200;
  return base * (u.size || 1);
}

export function universesToScene(universes: Universe[], accent: string): Scene {
  return {
    accent,
    version: nextSceneVersion(),
    links: [],
    nodes: universes.map((u) => ({
      id: u.id,
      kind: 'universe' as const,
      title: u.name,
      subtitle: u.tagline,
      x: u.x,
      y: u.y,
      rotation: 0,
      radius: universeRadius(u),
      color: u.color,
      variant: Math.abs(u.seed) % 6,
      glow: 0.85,
      form: u.form,
      emphasis: 1,
      seed: hash01(u.id),
    })),
  };
}

export interface EmphasisFn {
  (o: OrbitObject): number;
}

export function objectsToScene(
  objects: OrbitObject[],
  connections: Connection[],
  themePreset: string,
  emphasis?: EmphasisFn,
  playingId?: string | null,
): Scene {
  const theme = resolveTheme({ preset: themePreset as ThemePresetId });
  const accent = theme.accent;
  const nodes: SceneNode[] = objects.map((o) => ({
    id: o.id,
    kind: o.kind,
    title: o.title,
    subtitle: subtitleFor(o),
    x: o.x,
    y: o.y,
    rotation: o.rotation,
    radius: objectRadius(o),
    color: o.color ?? accent,
    variant: o.variant,
    glow: o.glow,
    mediaId: o.mediaId,
    emphasis: emphasis ? emphasis(o) : 1,
    playing: playingId ? o.id === playingId : false,
    hasScrapbook: !!o.scrapbook && o.scrapbook.items.length > 0,
    text: o.kind === 'note' ? o.body : undefined,
    seed: hash01(o.id),
  }));

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links: SceneLink[] = [];

  // Containment draws itself: anything inside a collection or memory keeps a
  // faint tether to it, so a collection visibly holds things rather than just
  // recording that it does.
  for (const o of objects) {
    if (!o.parentId) continue;
    const child = byId.get(o.id);
    const parent = byId.get(o.parentId);
    if (!child || !parent) continue;
    links.push({
      id: `tether:${o.id}`,
      a: o.id,
      b: o.parentId,
      constellationId: null,
      strength: Math.min(child.emphasis, parent.emphasis) * 0.45,
      color: parent.color,
    });
  }

  for (const c of connections) {
    const a = byId.get(c.a);
    const b = byId.get(c.b);
    if (!a || !b) continue;
    const owner = c.constellationId ? byId.get(c.constellationId) : undefined;
    links.push({
      id: c.id,
      a: c.a,
      b: c.b,
      constellationId: c.constellationId ?? null,
      strength: Math.min(a.emphasis, b.emphasis),
      color: owner?.color ?? accent,
    });
  }

  return { nodes, links, accent, version: nextSceneVersion() };
}

function subtitleFor(o: OrbitObject): string | undefined {
  switch (o.kind) {
    case 'memory':
      return o.date ? formatDateShort(o.date) : 'memory';
    case 'song':
      return o.body || 'song';
    case 'place':
      return o.place || 'place';
    case 'event':
      return o.date ? formatDateShort(o.date) : 'event';
    case 'person':
      return o.body || undefined;
    case 'collection':
      return 'collection';
    case 'constellation':
      return `${o.members?.length ?? 0} stars`;
    default:
      return undefined;
  }
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}
