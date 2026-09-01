import { Texture } from 'pixi.js';
import { mulberry32 } from '../math';

/**
 * Every celestial body is built from a handful of tintable greyscale textures
 * generated once on the CPU. This keeps the object layer fully batched — a few
 * hundred objects cost a few draw calls, not a few hundred.
 */

type Ctx = CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return { canvas, ctx };
}

/**
 * Radial falloff with an exponential tail — reads as light, not as a disc.
 *
 * The last few percent are tapered to exactly zero. Without that, the residual
 * alpha at the sprite's edge draws a faint but very visible circle, and a glow
 * with a visible rim stops being a glow.
 */
function radialGlow(size: number, power: number, inner: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let a = Math.exp(-Math.pow(t / inner, power));
    if (t > 0.86) a *= Math.max(0, 1 - (t - 0.86) / 0.14);
    if (t >= 1) a = 0;
    g.addColorStop(t, `rgba(255,255,255,${a.toFixed(4)})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function starCore(size = 96): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** Four-point diffraction flare. */
function flare(size = 256): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  ctx.translate(c, c);
  const spike = (len: number, thick: number, alpha: number) => {
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, `rgba(255,255,255,${alpha})`);
    g.addColorStop(0.35, `rgba(255,255,255,${alpha * 0.28})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -thick);
    ctx.lineTo(len, 0);
    ctx.lineTo(0, thick);
    ctx.closePath();
    ctx.fill();
  };
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 2);
    spike(c * 0.96, c * 0.028, 0.85);
    ctx.restore();
  }
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 2 + Math.PI / 4);
    spike(c * 0.42, c * 0.016, 0.4);
    ctx.restore();
  }
  return canvas;
}

/**
 * A lit sphere. `variant` changes the surface character.
 *
 * Two rules learned the hard way:
 *   1. Shade by *luminance* at full alpha, never by alpha — the sprite gets
 *      tinted at draw time, and an alpha gradient makes the planet translucent
 *      so stars and constellation lines show through it.
 *   2. Only concentric radial gradients. A gradient whose two circles are
 *      offset is a cone gradient, and Canvas renders it with visible straight
 *      facets radiating from the focus. The light offset comes from a separate
 *      additive highlight instead.
 */
function sphere(size: number, variant: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const r = c - 1;
  const rnd = mulberry32(variant * 9271 + 17);

  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.clip();

  // Limb darkening: concentric, bright centre falling to a dark edge.
  const base = ctx.createRadialGradient(c, c, 0, c, c, r);
  base.addColorStop(0, 'rgb(132,132,132)');
  base.addColorStop(0.55, 'rgb(112,112,112)');
  base.addColorStop(0.85, 'rgb(74,74,74)');
  base.addColorStop(1, 'rgb(46,46,46)');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // The lit side: a soft highlight offset toward the upper left.
  const lx = c - r * 0.3;
  const ly = c - r * 0.32;
  ctx.globalCompositeOperation = 'lighter';
  const lit = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 1.35);
  lit.addColorStop(0, 'rgb(122,122,122)');
  lit.addColorStop(0.35, 'rgb(78,78,78)');
  lit.addColorStop(0.7, 'rgb(24,24,24)');
  lit.addColorStop(1, 'rgb(0,0,0)');
  ctx.fillStyle = lit;
  ctx.fillRect(0, 0, size, size);

  // Terminator: darken the far side so the form turns away from the light.
  ctx.globalCompositeOperation = 'multiply';
  const dx = c + r * 0.5;
  const dy = c + r * 0.52;
  const dark = ctx.createRadialGradient(dx, dy, r * 0.1, dx, dy, r * 1.5);
  dark.addColorStop(0, 'rgb(96,96,96)');
  dark.addColorStop(0.5, 'rgb(190,190,190)');
  dark.addColorStop(1, 'rgb(255,255,255)');
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  // Surface character.
  const kind = variant % 3;
  ctx.globalCompositeOperation = 'overlay';
  if (kind === 0) {
    // Banded gas giant.
    const bands = 7 + Math.floor(rnd() * 5);
    for (let i = 0; i < bands; i++) {
      const y = (i / bands) * size + rnd() * 6;
      const h = (size / bands) * (0.7 + rnd() * 0.9);
      const a = 0.05 + rnd() * 0.09;
      // Feathered across the band, so there is no hard edge anywhere.
      const bg = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
      bg.addColorStop(0, 'rgba(255,255,255,0)');
      bg.addColorStop(0.5, `rgba(255,255,255,${a.toFixed(3)})`);
      bg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, y - h / 2, size, h);
    }
  } else if (kind === 1) {
    // Cratered / rocky.
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * r * 0.94;
      const x = c + Math.cos(a) * rr;
      const y = c + Math.sin(a) * rr;
      const s = r * (0.04 + rnd() * 0.13);
      const gg = ctx.createRadialGradient(x, y, 0, x, y, s);
      gg.addColorStop(0, `rgba(0,0,0,${(0.10 + rnd() * 0.14).toFixed(3)})`);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Cloudy / oceanic swirls.
    for (let i = 0; i < 20; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * r * 0.85;
      const x = c + Math.cos(a) * rr;
      const y = c + Math.sin(a) * rr;
      const w = r * (0.2 + rnd() * 0.55);
      const h = w * (0.3 + rnd() * 0.4);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rnd() * Math.PI);
      // Squash the whole context rather than clipping a circular gradient with
      // an elliptical path: that clip leaves a hard edge, which reads as a
      // straight streak across the planet.
      ctx.scale(1, h / w);
      const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
      gg.addColorStop(0, `rgba(255,255,255,${(0.07 + rnd() * 0.1).toFixed(3)})`);
      gg.addColorStop(0.55, `rgba(255,255,255,${(0.03 + rnd() * 0.04).toFixed(3)})`);
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(0, 0, w, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // A whisper of rim light on the dark limb — the detail that sells roundness.
  // Kept faint: any more and the planet reads as a ring.
  ctx.globalCompositeOperation = 'lighter';
  const rim = ctx.createRadialGradient(c, c, r * 0.88, c, c, r);
  rim.addColorStop(0, 'rgb(0,0,0)');
  rim.addColorStop(0.7, 'rgb(20,20,20)');
  rim.addColorStop(1, 'rgb(34,34,34)');
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  ctx.restore();
  return canvas;
}

/** Circular noise field, rotated slowly to imply spin. */
function surfaceDetail(size: number, variant: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const r = c - 1;
  const rnd = mulberry32(variant * 7717 + 3);
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd()) * r * 0.9;
    const x = c + Math.cos(a) * rr;
    const y = c + Math.sin(a) * rr;
    const s = r * (0.08 + rnd() * 0.26);
    const g = ctx.createRadialGradient(x, y, 0, x, y, s);
    g.addColorStop(0, `rgba(255,255,255,${(0.06 + rnd() * 0.1).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  // Feather the edge so the rotation never shows a hard circle.
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createRadialGradient(c, c, r * 0.55, c, c, r);
  fade.addColorStop(0, 'rgba(255,255,255,1)');
  fade.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
  return canvas;
}

/** Planetary ring, viewed near edge-on. */
function ring(w = 512, h = 176): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const rnd = mulberry32(4242);
  ctx.save();
  ctx.translate(cx, cy);
  const bands = 22;
  for (let i = 0; i < bands; i++) {
    const t = i / bands;
    const rx = w * (0.24 + t * 0.25);
    const ry = rx * 0.32;
    const alpha = (0.03 + rnd() * 0.1) * (1 - Math.abs(t - 0.45) * 1.1);
    if (alpha <= 0) continue;
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.lineWidth = Math.max(1, (w / bands) * (0.25 + rnd() * 0.5));
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  return canvas;
}

/** Soft-edged rounded rectangle, used for cards and paper. */
function panel(size = 256, radius = 0.08): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const r = size * radius;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();
  return canvas;
}

/** Thin circle outline (selection / orbit rings). */
function circleOutline(size = 256, thickness = 0.008): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, size * thickness);
  ctx.beginPath();
  ctx.arc(c, c, c - ctx.lineWidth, 0, Math.PI * 2);
  ctx.stroke();
  return canvas;
}

/** Comet tail: a soft wedge fading away from the head. */
function tail(w = 384, h = 128): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  const g = ctx.createLinearGradient(w, 0, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.30)');
  g.addColorStop(0.65, 'rgba(255,255,255,0.07)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(w, h / 2 - h * 0.055);
  ctx.lineTo(w, h / 2 + h * 0.055);
  ctx.quadraticCurveTo(w * 0.4, h / 2 + h * 0.45, 0, h / 2 + h * 0.02);
  ctx.quadraticCurveTo(w * 0.4, h / 2 - h * 0.45, w, h / 2 - h * 0.055);
  ctx.closePath();
  ctx.fill();
  // Feather vertically.
  ctx.globalCompositeOperation = 'destination-in';
  const f = ctx.createLinearGradient(0, 0, 0, h);
  f.addColorStop(0, 'rgba(255,255,255,0)');
  f.addColorStop(0.5, 'rgba(255,255,255,1)');
  f.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = f;
  ctx.fillRect(0, 0, w, h);
  return canvas;
}

/** A loose cluster of motes — the visual for a collection. */
function cluster(size = 512, variant = 0): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const rnd = mulberry32(variant * 5171 + 91);
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = Math.pow(rnd(), 0.62) * c * 0.92;
    const x = c + Math.cos(a) * rr;
    const y = c + Math.sin(a) * rr * 0.82;
    const s = size * (0.004 + rnd() * 0.014);
    const al = (1 - rr / (c * 0.95)) * (0.25 + rnd() * 0.7);
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * 4);
    g.addColorStop(0, `rgba(255,255,255,${(al * 0.9).toFixed(3)})`);
    g.addColorStop(0.4, `rgba(255,255,255,${(al * 0.18).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, s * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

/**
 * Handwriting seen from across the room: wavy ink lines that read as text
 * without being text. Notes wear this until you get close enough to read them.
 */
function scribble(w = 256, h = 256, variant = 0): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  const rnd = mulberry32(variant * 3313 + 7);
  const pad = w * 0.12;
  const lines = 7;
  const lh = (h - pad * 2) / lines;
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  for (let i = 0; i < lines; i++) {
    const y = pad + lh * (i + 0.6);
    // Last line of a paragraph is short, like real writing.
    const len = (w - pad * 2) * (i === lines - 1 ? 0.35 + rnd() * 0.3 : 0.82 + rnd() * 0.18);
    ctx.lineWidth = Math.max(1, h * (0.0075 + rnd() * 0.004));
    ctx.globalAlpha = 0.30 + rnd() * 0.25;
    ctx.beginPath();
    let x = pad;
    ctx.moveTo(x, y);
    while (x < pad + len) {
      const step = w * (0.02 + rnd() * 0.045);
      const wob = lh * (rnd() - 0.5) * 0.30;
      ctx.quadraticCurveTo(x + step * 0.5, y + wob, Math.min(x + step, pad + len), y);
      x += step;
    }
    ctx.stroke();
  }
  return canvas;
}

export interface TextureSet {
  glow: Texture;
  glowTight: Texture;
  core: Texture;
  flare: Texture;
  spheres: Texture[];
  details: Texture[];
  ring: Texture;
  panel: Texture;
  panelSharp: Texture;
  outline: Texture;
  outlineThick: Texture;
  tail: Texture;
  clusters: Texture[];
  scribbles: Texture[];
}

let cached: TextureSet | null = null;

/** Built once per session and shared by every universe. */
export function getTextures(): TextureSet {
  if (cached) return cached;
  const variants = 6;
  cached = {
    glow: Texture.from(radialGlow(256, 1.9, 0.34)),
    glowTight: Texture.from(radialGlow(256, 2.5, 0.22)),
    core: Texture.from(starCore(96)),
    flare: Texture.from(flare(256)),
    // 384px keeps a planet crisp even at the deepest zoom.
    spheres: Array.from({ length: variants }, (_, i) => Texture.from(sphere(384, i))),
    details: Array.from({ length: variants }, (_, i) => Texture.from(surfaceDetail(384, i))),
    ring: Texture.from(ring()),
    panel: Texture.from(panel(256, 0.06)),
    panelSharp: Texture.from(panel(256, 0.012)),
    outline: Texture.from(circleOutline(256, 0.006)),
    outlineThick: Texture.from(circleOutline(256, 0.016)),
    tail: Texture.from(tail()),
    clusters: Array.from({ length: 3 }, (_, i) => Texture.from(cluster(512, i))),
    scribbles: Array.from({ length: 4 }, (_, i) => Texture.from(scribble(256, 256, i))),
  };
  return cached;
}
