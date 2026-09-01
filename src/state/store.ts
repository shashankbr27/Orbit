'use client';

import { create } from 'zustand';
import {
  deleteConnection,
  deleteObjectCascade,
  deleteUniverseCascade,
  getSettings,
  isBrowser,
  listAllObjects,
  listConnections,
  listObjects,
  listUniverses,
  patchSettings,
  putConnection,
  putObject,
  putObjects,
  putUniverse,
  resetEverything,
} from '@/data/db';
import {
  KIND_SPEC,
  newObject,
  uid,
  type AppSettings,
  type Connection,
  type ObjectKind,
  type OrbitObject,
  type ScrapbookPage,
  type Universe,
} from '@/data/model';
import { blankUniverse, seedMultiverse } from '@/data/seed';
import { importImageFile } from '@/data/images';
import { mediaCache } from '@/engine/objects/mediaCache';

export type BootStatus = 'idle' | 'loading' | 'seeding' | 'ready' | 'error';

interface OrbitState {
  status: BootStatus;
  error: string | null;
  settings: AppSettings;
  universes: Universe[];
  activeId: string | null;
  objects: OrbitObject[];
  connections: Connection[];
  selection: string[];
  /** How many things live in each universe — for the multiverse listing. */
  counts: Record<string, number>;
  /** Timestamp of the last successful write — drives the "saved" whisper. */
  savedAt: number;
  /** True the first time a freshly seeded multiverse is shown. */
  isGift: boolean;

  boot(): Promise<void>;
  openUniverse(id: string): Promise<void>;
  closeUniverse(): void;

  createUniverse(name?: string): Promise<Universe>;
  updateUniverse(id: string, patch: Partial<Universe>): Promise<void>;
  deleteUniverse(id: string): Promise<void>;
  rememberCamera(id: string, cam: { x: number; y: number; zoom: number }): void;

  addObject(kind: ObjectKind, patch?: Partial<OrbitObject>): Promise<OrbitObject | null>;
  updateObject(id: string, patch: Partial<OrbitObject>): Promise<void>;
  moveObject(id: string, x: number, y: number): Promise<void>;
  deleteObject(id: string): Promise<void>;
  duplicateObject(id: string): Promise<OrbitObject | null>;
  saveScrapbook(id: string, page: ScrapbookPage): Promise<void>;

  addPhoto(file: File, at: { x: number; y: number }): Promise<OrbitObject | null>;
  replacePhoto(objectId: string, file: File): Promise<void>;

  connect(a: string, b: string, constellationId?: string | null): Promise<void>;
  disconnect(id: string): Promise<void>;
  createConstellation(memberIds: string[], name: string): Promise<OrbitObject | null>;

  setSelection(ids: string[]): void;
  toggleSelection(id: string): void;

  patchSettings(patch: Partial<AppSettings>): Promise<void>;
  dismissGift(): void;
  reload(): Promise<void>;
  resetAll(): Promise<void>;
}

const DEFAULT_SETTINGS: AppSettings = {
  id: 'app',
  welcomed: false,
  qualityLock: null,
  motion: 1,
  soundEnabled: true,
  lastUniverseId: null,
  createdAt: Date.now(),
  version: 1,
};

/** Position writes are frequent; coalesce them so a drag is one write. */
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();
function debouncedPut(o: OrbitObject, ms = 320) {
  const existing = pendingWrites.get(o.id);
  if (existing) clearTimeout(existing);
  pendingWrites.set(
    o.id,
    setTimeout(() => {
      pendingWrites.delete(o.id);
      void putObject(o);
    }, ms),
  );
}

export const useOrbit = create<OrbitState>((set, get) => ({
  status: 'idle',
  error: null,
  settings: DEFAULT_SETTINGS,
  universes: [],
  activeId: null,
  objects: [],
  connections: [],
  selection: [],
  counts: {},
  savedAt: 0,
  isGift: false,

  async boot() {
    if (!isBrowser()) return;
    if (get().status === 'loading' || get().status === 'ready') return;
    set({ status: 'loading', error: null });
    try {
      const settings = await getSettings();
      let universes = await listUniverses();
      let isGift = false;
      if (universes.length === 0) {
        set({ status: 'seeding' });
        await seedMultiverse();
        universes = await listUniverses();
        isGift = true;
      }
      set({
        settings,
        universes,
        counts: await countByUniverse(),
        isGift: isGift && !settings.welcomed,
        status: 'ready',
      });
    } catch (err) {
      set({
        status: 'error',
        error:
          err instanceof Error
            ? err.message
            : 'Your browser would not let ORBIT store anything locally.',
      });
    }
  },

  async openUniverse(id) {
    const [objects, connections] = await Promise.all([listObjects(id), listConnections(id)]);
    set({ activeId: id, objects, connections, selection: [] });
    void patchSettings({ lastUniverseId: id });
    set((s) => ({ settings: { ...s.settings, lastUniverseId: id } }));
  },

  closeUniverse() {
    set({ activeId: null, objects: [], connections: [], selection: [] });
  },

  async createUniverse(name) {
    const order = get().universes.length;
    const u = blankUniverse(name?.trim() || 'New universe', order);
    await putUniverse(u);
    set((s) => ({ universes: [...s.universes, u], savedAt: Date.now() }));
    return u;
  },

  async updateUniverse(id, patch) {
    const cur = get().universes.find((u) => u.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    set((s) => ({
      universes: s.universes.map((u) => (u.id === id ? next : u)),
      savedAt: Date.now(),
    }));
    await putUniverse(next);
  },

  async deleteUniverse(id) {
    await deleteUniverseCascade(id);
    set((s) => ({
      universes: s.universes.filter((u) => u.id !== id),
      counts: Object.fromEntries(Object.entries(s.counts).filter(([k]) => k !== id)),
      activeId: s.activeId === id ? null : s.activeId,
      objects: s.activeId === id ? [] : s.objects,
      connections: s.activeId === id ? [] : s.connections,
      savedAt: Date.now(),
    }));
  },

  rememberCamera(id, cam) {
    const cur = get().universes.find((u) => u.id === id);
    if (!cur) return;
    const next = { ...cur, lastCamera: cam };
    set((s) => ({ universes: s.universes.map((u) => (u.id === id ? next : u)) }));
    void putUniverse(next);
  },

  async addObject(kind, patch = {}) {
    const universeId = get().activeId;
    if (!universeId) return null;
    const topZ = get().objects.reduce((m, o) => Math.max(m, o.z), 0);
    const o = newObject(universeId, kind, { z: topZ + 1, ...patch });
    if (!o.title) o.title = defaultTitle(kind);
    set((s) => ({
      objects: [...s.objects, o],
      selection: [o.id],
      counts: { ...s.counts, [universeId]: (s.counts[universeId] ?? 0) + 1 },
      savedAt: Date.now(),
    }));
    await putObject(o);
    return o;
  },

  async updateObject(id, patch) {
    const cur = get().objects.find((o) => o.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    set((s) => ({ objects: s.objects.map((o) => (o.id === id ? next : o)), savedAt: Date.now() }));
    await putObject(next);
  },

  async moveObject(id, x, y) {
    const cur = get().objects.find((o) => o.id === id);
    if (!cur) return;
    const next = { ...cur, x, y, updatedAt: Date.now() };
    set((s) => ({ objects: s.objects.map((o) => (o.id === id ? next : o)), savedAt: Date.now() }));
    debouncedPut(next);
  },

  async deleteObject(id) {
    await deleteObjectCascade(id);
    set((s) => ({
      objects: s.objects
        .filter((o) => o.id !== id)
        .map((o) =>
          o.members?.includes(id) ? { ...o, members: o.members.filter((m) => m !== id) } : o,
        ),
      connections: s.connections.filter(
        (c) => c.a !== id && c.b !== id && c.constellationId !== id,
      ),
      selection: s.selection.filter((s2) => s2 !== id),
      counts: s.activeId
        ? { ...s.counts, [s.activeId]: Math.max(0, (s.counts[s.activeId] ?? 1) - 1) }
        : s.counts,
      savedAt: Date.now(),
    }));
  },

  async duplicateObject(id) {
    const cur = get().objects.find((o) => o.id === id);
    if (!cur) return null;
    const copy: OrbitObject = {
      ...cur,
      id: uid(cur.kind.slice(0, 3)),
      x: cur.x + 60,
      y: cur.y + 48,
      z: cur.z + 1,
      members: cur.members ? [...cur.members] : undefined,
      scrapbook: cur.scrapbook
        ? { ...cur.scrapbook, items: cur.scrapbook.items.map((i) => ({ ...i, id: uid('scr') })) }
        : cur.scrapbook,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((s) => ({
      objects: [...s.objects, copy],
      selection: [copy.id],
      counts: s.activeId
        ? { ...s.counts, [s.activeId]: (s.counts[s.activeId] ?? 0) + 1 }
        : s.counts,
      savedAt: Date.now(),
    }));
    await putObject(copy);
    return copy;
  },

  async saveScrapbook(id, page) {
    await get().updateObject(id, { scrapbook: page });
  },

  async addPhoto(file, at) {
    const asset = await importImageFile(file);
    if (!asset) return null;
    return get().addObject('photo', {
      title: cleanFilename(file.name),
      mediaId: asset.id,
      x: at.x,
      y: at.y,
      rotation: (Math.random() - 0.5) * 0.12,
    });
  },

  async replacePhoto(objectId, file) {
    const asset = await importImageFile(file);
    if (!asset) return;
    const cur = get().objects.find((o) => o.id === objectId);
    if (cur?.mediaId) mediaCache().invalidate(cur.mediaId);
    await get().updateObject(objectId, { mediaId: asset.id });
  },

  async connect(a, b, constellationId = null) {
    if (a === b) return;
    const universeId = get().activeId;
    if (!universeId) return;
    const exists = get().connections.some(
      (c) => (c.a === a && c.b === b) || (c.a === b && c.b === a),
    );
    if (exists) return;
    const c: Connection = {
      id: uid('lnk'),
      universeId,
      a,
      b,
      constellationId,
      createdAt: Date.now(),
    };
    set((s) => ({ connections: [...s.connections, c], savedAt: Date.now() }));
    await putConnection(c);
  },

  async disconnect(id) {
    await deleteConnection(id);
    set((s) => ({ connections: s.connections.filter((c) => c.id !== id), savedAt: Date.now() }));
  },

  async createConstellation(memberIds, name) {
    const universeId = get().activeId;
    if (!universeId || memberIds.length < 2) return null;
    const objs = get().objects.filter((o) => memberIds.includes(o.id));
    if (objs.length < 2) return null;
    const cx = objs.reduce((s, o) => s + o.x, 0) / objs.length;
    const cy = objs.reduce((s, o) => s + o.y, 0) / objs.length;
    const con = newObject(universeId, 'constellation', {
      title: name || 'Constellation',
      x: cx,
      y: cy - 140,
      members: objs.map((o) => o.id),
    });
    // Chain the members in the order they were chosen — the drawing order.
    const links: Connection[] = [];
    for (let i = 0; i < memberIds.length - 1; i++) {
      links.push({
        id: uid('lnk'),
        universeId,
        a: memberIds[i],
        b: memberIds[i + 1],
        constellationId: con.id,
        createdAt: Date.now(),
      });
    }
    set((s) => ({
      objects: [...s.objects, con],
      connections: [...s.connections, ...links],
      selection: [con.id],
      savedAt: Date.now(),
    }));
    await putObjects([con]);
    for (const l of links) await putConnection(l);
    return con;
  },

  setSelection(ids) {
    set({ selection: ids });
  },

  toggleSelection(id) {
    set((s) => ({
      selection: s.selection.includes(id)
        ? s.selection.filter((x) => x !== id)
        : [...s.selection, id],
    }));
  },

  async patchSettings(patch) {
    set((s) => ({ settings: { ...s.settings, ...patch } }));
    await patchSettings(patch);
  },

  dismissGift() {
    set({ isGift: false });
    void get().patchSettings({ welcomed: true });
  },

  async reload() {
    const universes = await listUniverses();
    const id = get().activeId;
    const counts = await countByUniverse();
    if (id) {
      const [objects, connections] = await Promise.all([listObjects(id), listConnections(id)]);
      set({ universes, objects, connections, counts });
    } else {
      set({ universes, counts });
    }
  },

  async resetAll() {
    await resetEverything();
    mediaCache().dispose();
    set({
      universes: [],
      objects: [],
      connections: [],
      counts: {},
      activeId: null,
      selection: [],
      status: 'idle',
      isGift: false,
      settings: DEFAULT_SETTINGS,
    });
    await get().boot();
  },
}));

async function countByUniverse(): Promise<Record<string, number>> {
  const all = await listAllObjects();
  const map: Record<string, number> = {};
  for (const o of all) map[o.universeId] = (map[o.universeId] ?? 0) + 1;
  return map;
}

function defaultTitle(kind: ObjectKind) {
  return KIND_SPEC[kind].label;
}

function cleanFilename(name: string) {
  return (
    name
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'Photo'
  );
}

/* ── selectors ──────────────────────────────────────────────────────────── */

export const useActiveUniverse = () =>
  useOrbit((s) => (s.activeId ? s.universes.find((u) => u.id === s.activeId) ?? null : null));

export const useSelectedObject = () =>
  useOrbit((s) =>
    s.selection.length === 1 ? s.objects.find((o) => o.id === s.selection[0]) ?? null : null,
  );
