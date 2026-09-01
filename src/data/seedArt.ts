import { mulberry32 } from '@/engine/math';

/**
 * The gift universe ships with photographs.
 *
 * Rather than bundling stock images (which would feel like someone else's
 * memories) or leaving empty frames, we generate abstract ones: soft light,
 * bloom, grain — the look of an out-of-focus film photograph. They read as
 * placeholders you might actually want to keep, and they cost no bytes.
 */

const PALETTES: [string, string, string][] = [
  ['#1b2b4a', '#6a4f7a', '#e8a37a'],
  ['#12303a', '#2f7a6a', '#d8e0b0'],
  ['#2a1830', '#7a3550', '#f0b090'],
  ['#101a2e', '#3a5a8a', '#c8d8ff'],
  ['#2e1e12', '#8a5a30', '#f0d0a0'],
  ['#0e1e1a', '#3a6a5a', '#a8d8c8'],
  ['#241428', '#5a3a7a', '#c8a8e8'],
];

export async function generateAbstractPhoto(
  seed: number,
  w = 900,
  h = 640,
): Promise<{ blob: Blob; width: number; height: number; thumb: string } | null> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const rnd = mulberry32(seed * 2654435761 + 7);
  const [a, b, c] = PALETTES[Math.floor(rnd() * PALETTES.length)];

  // Ground: a diagonal wash.
  const g = ctx.createLinearGradient(0, 0, w * (0.3 + rnd()), h * (0.6 + rnd() * 0.8));
  g.addColorStop(0, a);
  g.addColorStop(0.55, b);
  g.addColorStop(1, a);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Out-of-focus highlights (bokeh).
  ctx.globalCompositeOperation = 'screen';
  const blobs = 7 + Math.floor(rnd() * 7);
  for (let i = 0; i < blobs; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = Math.min(w, h) * (0.09 + rnd() * 0.34);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tint = rnd() > 0.45 ? c : b;
    rg.addColorStop(0, hexA(tint, 0.42 + rnd() * 0.3));
    rg.addColorStop(0.45, hexA(tint, 0.14));
    rg.addColorStop(1, hexA(tint, 0));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // A light leak from one edge — the thing that makes it feel photographed.
  const side = Math.floor(rnd() * 4);
  const leak = ctx.createLinearGradient(
    side === 0 ? 0 : side === 1 ? w : 0,
    side === 2 ? 0 : side === 3 ? h : 0,
    side === 0 ? w * 0.7 : side === 1 ? w * 0.3 : w * 0.5,
    side === 2 ? h * 0.7 : side === 3 ? h * 0.3 : h * 0.5,
  );
  leak.addColorStop(0, hexA(c, 0.34));
  leak.addColorStop(1, hexA(c, 0));
  ctx.fillStyle = leak;
  ctx.fillRect(0, 0, w, h);

  // Vignette + grain.
  ctx.globalCompositeOperation = 'source-over';
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.46)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  const grain = ctx.getImageData(0, 0, w, h);
  const d = grain.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 20;
    d[i] = clamp8(d[i] + n);
    d[i + 1] = clamp8(d[i + 1] + n);
    d[i + 2] = clamp8(d[i + 2] + n);
  }
  ctx.putImageData(grain, 0, 0);

  const blob = await toBlob(canvas, 'image/jpeg', 0.82);
  if (!blob) return null;

  // Tiny blurred stand-in for instant paint.
  const tc = document.createElement('canvas');
  tc.width = 24;
  tc.height = Math.round((24 * h) / w);
  const tctx = tc.getContext('2d');
  let thumb = '';
  if (tctx) {
    tctx.drawImage(canvas, 0, 0, tc.width, tc.height);
    thumb = tc.toDataURL('image/jpeg', 0.5);
  }

  return { blob, width: w, height: h, thumb };
}

function clamp8(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function hexA(hex: string, alpha: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function toBlob(
  canvas: HTMLCanvasElement,
  mime = 'image/jpeg',
  quality = 0.85,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (canvas.toBlob) canvas.toBlob((b) => resolve(b), mime, quality);
    else resolve(null);
  });
}
