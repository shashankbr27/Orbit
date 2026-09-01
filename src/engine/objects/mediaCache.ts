import { Texture } from 'pixi.js';
import { getAsset } from '@/data/db';

/**
 * Photos live in IndexedDB as blobs. This turns them into GPU textures once and
 * hands out the same texture (and the same object URL for HTML surfaces)
 * afterwards, so scrolling a universe never re-decodes an image.
 */
export class MediaCache {
  private textures = new Map<string, Texture>();
  private pending = new Map<string, Promise<Texture | null>>();
  private urls = new Map<string, string>();
  private urlPending = new Map<string, Promise<string | null>>();
  private missing = new Set<string>();

  /** Non-blocking: returns a texture if it is already resident. */
  peek(id: string): Texture | null {
    return this.textures.get(id) ?? null;
  }

  has(id: string) {
    return this.textures.has(id);
  }

  failed(id: string) {
    return this.missing.has(id);
  }

  async texture(id: string): Promise<Texture | null> {
    const hit = this.textures.get(id);
    if (hit) return hit;
    if (this.missing.has(id)) return null;
    const inflight = this.pending.get(id);
    if (inflight) return inflight;

    const job = (async () => {
      try {
        const asset = await getAsset(id);
        if (!asset) {
          this.missing.add(id);
          return null;
        }
        const source = await decode(asset.blob);
        if (!source) {
          this.missing.add(id);
          return null;
        }
        const tex = Texture.from(source);
        this.textures.set(id, tex);
        return tex;
      } catch {
        this.missing.add(id);
        return null;
      } finally {
        this.pending.delete(id);
      }
    })();

    this.pending.set(id, job);
    return job;
  }

  /** Object URL for use in HTML (scrapbook, editors, previews). */
  async url(id: string): Promise<string | null> {
    const hit = this.urls.get(id);
    if (hit) return hit;
    const inflight = this.urlPending.get(id);
    if (inflight) return inflight;
    const job = (async () => {
      try {
        const asset = await getAsset(id);
        if (!asset) return null;
        const u = URL.createObjectURL(asset.blob);
        this.urls.set(id, u);
        return u;
      } catch {
        return null;
      } finally {
        this.urlPending.delete(id);
      }
    })();
    this.urlPending.set(id, job);
    return job;
  }

  peekUrl(id: string) {
    return this.urls.get(id) ?? null;
  }

  /** Forget one asset (after an edit replaced it). */
  invalidate(id: string) {
    const t = this.textures.get(id);
    if (t) t.destroy(true);
    this.textures.delete(id);
    const u = this.urls.get(id);
    if (u) URL.revokeObjectURL(u);
    this.urls.delete(id);
    this.missing.delete(id);
  }

  dispose() {
    for (const t of this.textures.values()) t.destroy(true);
    this.textures.clear();
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
    this.pending.clear();
    this.urlPending.clear();
    this.missing.clear();
  }
}

async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* fall through to the <img> path (older Safari, odd mime types) */
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** One cache per session is plenty. */
let shared: MediaCache | null = null;
export function mediaCache(): MediaCache {
  if (!shared) shared = new MediaCache();
  return shared;
}
