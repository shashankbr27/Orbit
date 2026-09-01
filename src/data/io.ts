import { db, listConnections, listObjects, listUniverses } from './db';
import { uid, type Asset, type Connection, type OrbitObject, type Universe } from './model';

/**
 * Export / import.
 *
 * The file is the whole universe: rows plus the photographs inline as data
 * URLs. It is deliberately a single self-contained JSON so someone can email
 * their universe to themselves, or hand it to a future cloud importer.
 */

export const ORBIT_FILE_VERSION = 1;

export interface OrbitFile {
  format: 'orbit';
  version: number;
  exportedAt: string;
  universes: Universe[];
  objects: OrbitObject[];
  connections: Connection[];
  assets: { id: string; mime: string; width: number; height: number; thumb?: string; data: string }[];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  return res.blob();
}

/** `universeId = null` exports everything. */
export async function exportUniverses(universeId: string | null): Promise<OrbitFile> {
  const allUniverses = await listUniverses();
  const universes = universeId ? allUniverses.filter((u) => u.id === universeId) : allUniverses;

  const objects: OrbitObject[] = [];
  const connections: Connection[] = [];
  for (const u of universes) {
    objects.push(...(await listObjects(u.id)));
    connections.push(...(await listConnections(u.id)));
  }

  // Collect every asset the exported objects actually reference.
  const needed = new Set<string>();
  for (const o of objects) {
    if (o.mediaId) needed.add(o.mediaId);
    for (const it of o.scrapbook?.items ?? []) if (it.mediaId) needed.add(it.mediaId);
  }

  const assets: OrbitFile['assets'] = [];
  for (const id of needed) {
    const a = await db().assets.get(id);
    if (!a) continue;
    try {
      assets.push({
        id: a.id,
        mime: a.mime,
        width: a.width,
        height: a.height,
        thumb: a.thumb,
        data: await blobToDataUrl(a.blob),
      });
    } catch {
      /* skip an unreadable asset rather than failing the whole export */
    }
  }

  return {
    format: 'orbit',
    version: ORBIT_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    universes,
    objects,
    connections,
    assets,
  };
}

export interface ImportSummary {
  universes: number;
  objects: number;
  assets: number;
}

/**
 * Import a universe file.
 *
 * Ids are always remapped, so importing your own export twice gives you two
 * universes rather than a silent overwrite.
 */
export async function importFile(text: string): Promise<ImportSummary> {
  const parsed = JSON.parse(text) as OrbitFile;
  if (parsed?.format !== 'orbit' || !Array.isArray(parsed.universes)) {
    throw new Error('That does not look like an ORBIT universe file.');
  }
  if (parsed.version > ORBIT_FILE_VERSION) {
    throw new Error('This file was made by a newer version of ORBIT.');
  }

  const d = db();
  const existing = await listUniverses();
  let order = existing.length;

  const uniMap = new Map<string, string>();
  const objMap = new Map<string, string>();
  const assetMap = new Map<string, string>();

  for (const a of parsed.assets ?? []) {
    const newId = uid('ast');
    assetMap.set(a.id, newId);
    try {
      const blob = await dataUrlToBlob(a.data);
      const asset: Asset = {
        id: newId,
        blob,
        mime: a.mime || blob.type || 'image/jpeg',
        width: a.width,
        height: a.height,
        thumb: a.thumb,
        createdAt: Date.now(),
      };
      await d.assets.put(asset);
    } catch {
      assetMap.delete(a.id);
    }
  }

  for (const u of parsed.universes) {
    const newId = uid('uni');
    uniMap.set(u.id, newId);
    await d.universes.put({
      ...u,
      id: newId,
      order: order++,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  for (const o of parsed.objects ?? []) objMap.set(o.id, uid(o.kind.slice(0, 3)));

  const objects: OrbitObject[] = (parsed.objects ?? [])
    .filter((o) => uniMap.has(o.universeId))
    .map((o) => ({
      ...o,
      id: objMap.get(o.id)!,
      universeId: uniMap.get(o.universeId)!,
      parentId: o.parentId ? objMap.get(o.parentId) ?? null : null,
      mediaId: o.mediaId ? assetMap.get(o.mediaId) : undefined,
      members: o.members?.map((m) => objMap.get(m)).filter(Boolean) as string[] | undefined,
      scrapbook: o.scrapbook
        ? {
            ...o.scrapbook,
            items: o.scrapbook.items.map((it) => ({
              ...it,
              id: uid('scr'),
              mediaId: it.mediaId ? assetMap.get(it.mediaId) : undefined,
            })),
          }
        : o.scrapbook,
      updatedAt: Date.now(),
    }));
  if (objects.length) await d.objects.bulkPut(objects);

  const connections: Connection[] = (parsed.connections ?? [])
    .filter((c) => uniMap.has(c.universeId) && objMap.has(c.a) && objMap.has(c.b))
    .map((c) => ({
      ...c,
      id: uid('lnk'),
      universeId: uniMap.get(c.universeId)!,
      a: objMap.get(c.a)!,
      b: objMap.get(c.b)!,
      constellationId: c.constellationId ? objMap.get(c.constellationId) ?? null : null,
      createdAt: Date.now(),
    }));
  if (connections.length) await d.connections.bulkPut(connections);

  return { universes: uniMap.size, objects: objects.length, assets: assetMap.size };
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give Safari a moment before the URL disappears.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'universe'
  );
}
