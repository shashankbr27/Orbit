import { uid, type Asset } from './model';
import { putAsset } from './db';
import { toBlob } from './seedArt';

const MAX_EDGE = 1800;
const THUMB_EDGE = 24;

/**
 * Bring a photo in from the camera roll.
 *
 * Phone photos are 12MP+; storing them raw would blow up IndexedDB and stall
 * texture upload on the first frame they appear. We downscale to something that
 * still looks perfect at any zoom the canvas allows, and keep a 24px blurred
 * thumbnail for instant paint.
 */
export async function importImageFile(file: File): Promise<Asset | null> {
  const bitmap = await loadBitmap(file);
  if (!bitmap) return null;

  const sw = 'width' in bitmap ? bitmap.width : 0;
  const sh = 'height' in bitmap ? bitmap.height : 0;
  if (!sw || !sh) return null;

  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);

  // PNGs may carry transparency worth keeping; everything else becomes JPEG.
  const keepAlpha = file.type === 'image/png' || file.type === 'image/webp';
  const mime = keepAlpha ? 'image/png' : 'image/jpeg';
  const blob = (await toBlob(canvas, mime, 0.88)) ?? file;

  let thumb: string | undefined;
  try {
    const tc = document.createElement('canvas');
    const tw = THUMB_EDGE;
    const th = Math.max(1, Math.round((THUMB_EDGE * h) / w));
    tc.width = tw;
    tc.height = th;
    tc.getContext('2d')?.drawImage(canvas, 0, 0, tw, th);
    thumb = tc.toDataURL('image/jpeg', 0.5);
  } catch {
    /* a thumbnail is a nicety */
  }

  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

  const asset: Asset = {
    id: uid('ast'),
    blob,
    mime,
    width: w,
    height: h,
    thumb,
    createdAt: Date.now(),
  };
  await putAsset(asset);
  return asset;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      // `imageOrientation` makes iPhone portrait photos come in upright.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* older Safari: fall through */
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
