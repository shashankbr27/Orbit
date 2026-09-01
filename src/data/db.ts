import Dexie, { type Table } from 'dexie';
import type {
  AppSettings,
  Asset,
  Connection,
  OrbitObject,
  Universe,
} from './model';

/**
 * Local-first persistence.
 *
 * The MVP has no account and no server: IndexedDB is the whole backend. The
 * schema mirrors what a relational cloud store would look like (one table per
 * entity, foreign keys by id) so synchronisation can be added as a layer over
 * these same repositories rather than a migration.
 */
class OrbitDB extends Dexie {
  universes!: Table<Universe, string>;
  objects!: Table<OrbitObject, string>;
  connections!: Table<Connection, string>;
  assets!: Table<Asset, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('orbit');
    this.version(1).stores({
      universes: 'id, order, updatedAt',
      objects: 'id, universeId, [universeId+kind], parentId, date, updatedAt',
      connections: 'id, universeId, a, b, constellationId',
      assets: 'id, createdAt',
      settings: 'id',
    });
  }
}

let _db: OrbitDB | null = null;

/** Lazily constructed so importing this module is safe during SSR. */
export function db(): OrbitDB {
  if (!_db) _db = new OrbitDB();
  return _db;
}

export const isBrowser = () => typeof window !== 'undefined' && 'indexedDB' in window;

/* ── universes ──────────────────────────────────────────────────────────── */

export async function listUniverses(): Promise<Universe[]> {
  const all = await db().universes.toArray();
  return all.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export async function getUniverse(id: string) {
  return db().universes.get(id);
}

export async function putUniverse(u: Universe) {
  await db().universes.put({ ...u, updatedAt: Date.now() });
}

export async function deleteUniverseCascade(id: string) {
  const d = db();
  await d.transaction('rw', d.universes, d.objects, d.connections, async () => {
    const objs = await d.objects.where('universeId').equals(id).toArray();
    const mediaIds = objs.map((o) => o.mediaId).filter(Boolean) as string[];
    await d.objects.where('universeId').equals(id).delete();
    await d.connections.where('universeId').equals(id).delete();
    await d.universes.delete(id);
    // Assets are cleaned up outside the transaction (best effort).
    void pruneAssets(mediaIds);
  });
}

/* ── objects ────────────────────────────────────────────────────────────── */

export async function listObjects(universeId: string): Promise<OrbitObject[]> {
  return db().objects.where('universeId').equals(universeId).toArray();
}

/** Every object in every universe — used for counts and asset pruning. */
export async function listAllObjects(): Promise<OrbitObject[]> {
  return db().objects.toArray();
}

export async function putObject(o: OrbitObject) {
  await db().objects.put(o);
}

export async function putObjects(list: OrbitObject[]) {
  if (list.length) await db().objects.bulkPut(list);
}

export async function deleteObjectCascade(id: string) {
  const d = db();
  const obj = await d.objects.get(id);
  await d.transaction('rw', d.objects, d.connections, async () => {
    await d.objects.delete(id);
    const links = await d.connections.toArray();
    const doomed = links.filter((c) => c.a === id || c.b === id || c.constellationId === id);
    if (doomed.length) await d.connections.bulkDelete(doomed.map((c) => c.id));
    // Children of a deleted collection are released, not destroyed.
    const kids = await d.objects.where('parentId').equals(id).toArray();
    if (kids.length) {
      await d.objects.bulkPut(kids.map((k) => ({ ...k, parentId: null, updatedAt: Date.now() })));
    }
    // Drop it from any constellation membership lists.
    const withMembers = await d.objects.where('universeId').equals(obj?.universeId ?? '').toArray();
    const touched = withMembers
      .filter((o) => o.members?.includes(id))
      .map((o) => ({ ...o, members: o.members!.filter((m) => m !== id), updatedAt: Date.now() }));
    if (touched.length) await d.objects.bulkPut(touched);
  });
  if (obj?.mediaId) void pruneAssets([obj.mediaId]);
}

/* ── connections ────────────────────────────────────────────────────────── */

export async function listConnections(universeId: string): Promise<Connection[]> {
  return db().connections.where('universeId').equals(universeId).toArray();
}

export async function putConnection(c: Connection) {
  await db().connections.put(c);
}

export async function deleteConnection(id: string) {
  await db().connections.delete(id);
}

/* ── assets ─────────────────────────────────────────────────────────────── */

export async function putAsset(a: Asset) {
  await db().assets.put(a);
}

export async function getAsset(id: string) {
  return db().assets.get(id);
}

/** Delete assets that nothing references any more. */
export async function pruneAssets(candidateIds: string[]) {
  if (!candidateIds.length) return;
  const d = db();
  const stillUsed = new Set<string>();
  const all = await d.objects.toArray();
  for (const o of all) if (o.mediaId) stillUsed.add(o.mediaId);
  for (const o of all) {
    for (const it of o.scrapbook?.items ?? []) if (it.mediaId) stillUsed.add(it.mediaId);
  }
  const doomed = candidateIds.filter((id) => !stillUsed.has(id));
  if (doomed.length) await d.assets.bulkDelete(doomed);
}

/* ── settings ───────────────────────────────────────────────────────────── */

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

export async function getSettings(): Promise<AppSettings> {
  const s = await db().settings.get('app');
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function patchSettings(patch: Partial<AppSettings>) {
  const cur = await getSettings();
  await db().settings.put({ ...cur, ...patch, id: 'app' });
}

/* ── wipe ───────────────────────────────────────────────────────────────── */

export async function resetEverything() {
  const d = db();
  await d.transaction(
    'rw',
    d.universes,
    d.objects,
    d.connections,
    d.assets,
    d.settings,
    async () => {
      await Promise.all([
        d.universes.clear(),
        d.objects.clear(),
        d.connections.clear(),
        d.assets.clear(),
        d.settings.clear(),
      ]);
    },
  );
}
