import { mulberry32 } from '@/engine/math';
import {
  newObject,
  uid,
  type Connection,
  type ObjectKind,
  type OrbitObject,
  type Universe,
  type UniverseForm,
} from './model';
import { putAsset, putConnection, putObjects, putUniverse } from './db';
import { generateAbstractPhoto } from './seedArt';

/**
 * The gift universe.
 *
 * ORBIT is meant to be handed to someone. An empty app would ask them to do
 * work before it earned anything; a full app would feel like someone else's
 * life. So the seed places a handful of stars — enough to show what the place
 * is for — and every single one of them is editable or deletable.
 */

interface SeedUniverse {
  name: string;
  tagline: string;
  form: UniverseForm;
  color: string;
  theme: string;
  size: number;
}

const UNIVERSES: SeedUniverse[] = [
  { name: 'Me', tagline: 'the centre of it', form: 'star', color: '#ffd9a0', theme: 'dream', size: 1.15 },
  { name: 'College', tagline: 'badly documented', form: 'planet', color: '#8fb4ff', theme: 'night', size: 1.0 },
  { name: 'Family', tagline: 'the oldest stories', form: 'ringed', color: '#ffb27a', theme: 'sunset', size: 1.05 },
  { name: 'Friends', tagline: 'small and loud', form: 'galaxy', color: '#6ff0c0', theme: 'aurora', size: 0.95 },
  { name: 'Travel', tagline: 'places that changed you', form: 'planet', color: '#cdd8ff', theme: 'cosmic', size: 0.9 },
  { name: 'Creative', tagline: 'unfinished, still glowing', form: 'nebula', color: '#b08cff', theme: 'cosmic', size: 1.0 },
];

interface SeedObject {
  kind: ObjectKind;
  title: string;
  body?: string;
  date?: string;
  place?: string;
  photo?: number;
  glow?: number;
  scale?: number;
  /** Polar placement around the universe centre. */
  at: [angleTurns: number, radius: number];
}

const CONTENT: Record<string, { objects: SeedObject[]; constellation?: { name: string; members: number[] } }> = {
  Me: {
    objects: [
      { kind: 'memory', title: 'The year it all turned', body: 'Not one big thing. A hundred small ones.', date: '2024-06-01', glow: 0.95, scale: 1.2, at: [0.0, 0] },
      { kind: 'note', title: 'A thing worth keeping', body: 'You are allowed to change your mind about who you are. Repeatedly. That is the whole point.', at: [0.14, 520] },
      { kind: 'song', title: 'On repeat, always', body: 'the one that fixes things', at: [0.36, 430] },
      { kind: 'photo', title: 'Light, somewhere', photo: 0, at: [0.58, 560] },
      { kind: 'person', title: 'You', body: 'the observer', glow: 0.8, at: [0.78, 300] },
      { kind: 'place', title: 'Home', body: 'the default coordinates', at: [0.92, 480] },
    ],
    constellation: { name: 'How it fits together', members: [0, 1, 4, 5] },
  },
  College: {
    objects: [
      { kind: 'memory', title: 'The trip we still talk about', body: 'Three days. One tent. No plan.', date: '2023-12-18', glow: 0.95, scale: 1.15, at: [0.05, 0] },
      { kind: 'photo', title: 'Somebody had a camera', photo: 1, at: [0.22, 480] },
      { kind: 'photo', title: 'The last night', photo: 2, at: [0.42, 560] },
      { kind: 'person', title: 'The one who planned it', at: [0.62, 400] },
      { kind: 'person', title: 'The one who nearly ruined it', at: [0.72, 470] },
      { kind: 'event', title: 'Results day', date: '2024-05-20', at: [0.88, 520] },
      { kind: 'note', title: 'Overheard', body: 'we are never doing that again\n\n(we did it twice more)', at: [0.5, 800] },
    ],
    constellation: { name: 'That weekend', members: [0, 1, 2, 3, 4] },
  },
  Family: {
    objects: [
      { kind: 'person', title: 'Amma', glow: 0.85, at: [0.0, 260] },
      { kind: 'person', title: 'Appa', glow: 0.85, at: [0.5, 260] },
      { kind: 'memory', title: 'Every single Sunday', body: 'Same table. Same argument. Same everyone.', date: '2022-01-09', glow: 0.9, at: [0.25, 560] },
      { kind: 'photo', title: 'Before I remember being there', photo: 3, at: [0.75, 540] },
      { kind: 'place', title: 'The old house', body: 'still standing, mostly', at: [0.62, 820] },
    ],
  },
  Friends: {
    objects: [
      { kind: 'collection', title: 'The group chat', glow: 0.5, scale: 1.1, at: [0.0, 0] },
      { kind: 'person', title: 'The archivist', body: 'has every photo', at: [0.18, 420] },
      { kind: 'person', title: 'The instigator', at: [0.45, 460] },
      { kind: 'person', title: 'The quiet one', at: [0.68, 400] },
      { kind: 'note', title: 'Inside joke #4', body: "you had to be there. you weren't. sorry.", at: [0.86, 560] },
    ],
  },
  Travel: {
    objects: [
      { kind: 'place', title: 'The coast road', body: 'nine hours, no music', glow: 0.6, at: [0.1, 300] },
      { kind: 'place', title: 'A city at 4am', glow: 0.6, at: [0.45, 520] },
      { kind: 'photo', title: 'Out of the window', photo: 4, at: [0.72, 460] },
      { kind: 'memory', title: 'The one that got away', body: 'We nearly went. Next year.', date: '2025-02-14', at: [0.9, 700] },
    ],
  },
  Creative: {
    objects: [
      { kind: 'artwork', title: 'Untitled, unfinished', photo: 5, at: [0.08, 340] },
      { kind: 'note', title: 'Idea, 2am', body: 'what if the memories were the stars\n\n— and you could walk around inside them', at: [0.4, 480] },
      { kind: 'collection', title: 'Half-written things', at: [0.7, 600] },
    ],
  },
};

/**
 * Where a universe sits in the multiverse.
 *
 * A golden-angle spiral so nothing lines up on a grid, biased tall because
 * phones are tall: this way the neighbours are reachable with a vertical drag
 * rather than stranded off the sides of a narrow screen.
 */
export function multiverseSlot(order: number): { x: number; y: number } {
  if (order <= 0) return { x: 0, y: 0 };
  const golden = 2.399963;
  const a = order * golden + 0.7;
  const r = 520 + (order - 1) * 185;
  return { x: Math.cos(a) * r * 0.8, y: Math.sin(a) * r * 1.05 };
}

/** Golden-angle-ish placement so nothing lines up on a grid. */
function place(angleTurns: number, radius: number, rnd: () => number) {
  const a = angleTurns * Math.PI * 2 + (rnd() - 0.5) * 0.5;
  const r = radius * 1.05 * (0.88 + rnd() * 0.24);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.86 };
}

export interface SeedResult {
  universes: Universe[];
  firstUniverseId: string;
}

export async function seedMultiverse(): Promise<SeedResult> {
  const now = Date.now();
  const rnd = mulberry32(20260901);

  // Photographs first, so the objects that reference them are never broken.
  const photoIds: string[] = [];
  for (let i = 0; i < 6; i++) {
    try {
      const art = await generateAbstractPhoto(i + 3, 880, i % 3 === 0 ? 880 : 620);
      if (!art) continue;
      const id = uid('ast');
      await putAsset({
        id,
        blob: art.blob,
        mime: 'image/jpeg',
        width: art.width,
        height: art.height,
        thumb: art.thumb,
        createdAt: now,
      });
      photoIds[i] = id;
    } catch {
      /* A universe without its photographs is still a universe. */
    }
  }

  const universes: Universe[] = [];

  // Universes sit on a loose spiral: close enough to see two or three at once,
  // far enough that arriving somewhere feels like arriving.
  UNIVERSES.forEach((u, i) => {
    const slot = multiverseSlot(i);
    universes.push({
      id: uid('uni'),
      name: u.name,
      tagline: u.tagline,
      form: u.form,
      x: slot.x + (rnd() - 0.5) * 90,
      y: slot.y + (rnd() - 0.5) * 90,
      size: u.size,
      color: u.color,
      theme: { preset: u.theme },
      seed: Math.floor(rnd() * 10000),
      order: i,
      createdAt: now + i,
      updatedAt: now + i,
    });
  });

  for (const u of universes) await putUniverse(u);

  for (const u of universes) {
    const content = CONTENT[u.name];
    if (!content) continue;
    const objects: OrbitObject[] = [];
    content.objects.forEach((s, i) => {
      const p = place(s.at[0], s.at[1], rnd);
      const o = newObject(u.id, s.kind, {
        title: s.title,
        body: s.body,
        date: s.date,
        place: s.place,
        x: p.x,
        y: p.y,
        z: i,
        rotation: s.kind === 'photo' || s.kind === 'note' || s.kind === 'artwork'
          ? (rnd() - 0.5) * 0.14
          : 0,
        scale: s.scale ?? 1,
        variant: Math.floor(rnd() * 6),
        mediaId: s.photo !== undefined ? photoIds[s.photo] : undefined,
      });
      if (s.glow !== undefined) o.glow = s.glow;
      objects.push(o);
    });

    const links: Connection[] = [];
    if (content.constellation) {
      const members = content.constellation.members.map((i) => objects[i]).filter(Boolean);
      if (members.length > 1) {
        // The constellation marker sits at the centroid of its stars.
        const cx = members.reduce((s, m) => s + m.x, 0) / members.length;
        const cy = members.reduce((s, m) => s + m.y, 0) / members.length;
        const con = newObject(u.id, 'constellation', {
          title: content.constellation.name,
          x: cx,
          y: cy - 120,
          members: members.map((m) => m.id),
          color: u.color,
        });
        objects.push(con);
        for (let i = 0; i < members.length - 1; i++) {
          links.push({
            id: uid('lnk'),
            universeId: u.id,
            a: members[i].id,
            b: members[i + 1].id,
            constellationId: con.id,
            createdAt: now,
          });
        }
      }
    }

    await putObjects(objects);
    for (const l of links) await putConnection(l);
  }

  return { universes, firstUniverseId: universes[0].id };
}

/** A single blank universe, for people who would rather start from nothing. */
export function blankUniverse(name = 'New universe', order = 0): Universe {
  const now = Date.now();
  const forms: UniverseForm[] = ['planet', 'star', 'galaxy', 'nebula', 'ringed', 'moon'];
  const palette = ['#8fb4ff', '#ffd9a0', '#6ff0c0', '#b08cff', '#ff9e7a', '#cdd8ff'];
  const slot = multiverseSlot(order);
  return {
    id: uid('uni'),
    name,
    tagline: '',
    form: forms[order % forms.length],
    x: slot.x,
    y: slot.y,
    size: 1,
    color: palette[order % palette.length],
    theme: { preset: 'night' },
    seed: Math.floor(Math.random() * 10000),
    order,
    createdAt: now,
    updatedAt: now,
  };
}
