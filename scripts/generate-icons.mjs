/**
 * Generates the PWA icon set.
 *
 * Written as a tiny software renderer + hand-rolled PNG encoder so the repo has
 * no binary assets and no image-processing dependency: `npm run icons`
 * reproduces every file exactly.
 *
 * The mark: a lit sphere with a thin ring, on deep space, with a few stars.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OUT = join(dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), '..', 'public', 'icons');

/* ── png encoder ─────────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** rgba: Uint8Array of w*h*4 */
function encodePng(rgba, w, h) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── the mark ────────────────────────────────────────────────────────────── */

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param size    output edge in px
 * @param maskable if true, the mark is inset so Android's safe zone can crop
 */
function render(size, maskable = false) {
  const px = new Uint8Array(size * size * 4);
  const ss = 3; // supersampling
  const rnd = mulberry32(99173);

  // A handful of background stars, in normalised coords.
  const stars = Array.from({ length: 26 }, () => ({
    x: rnd(),
    y: rnd(),
    r: 0.002 + rnd() * 0.006,
    a: 0.25 + rnd() * 0.7,
  }));

  const scale = maskable ? 0.68 : 0.86;
  const cx = 0.5;
  const cy = 0.5;
  const R = 0.28 * scale; // sphere radius
  const ringR = 0.44 * scale;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / size;
          const v = (y + (sy + 0.5) / ss) / size;
          const [cr, cg, cb] = shade(u, v);
          r += cr;
          g += cg;
          b += cb;
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      px[i] = Math.round(clamp(r / n) * 255);
      px[i + 1] = Math.round(clamp(g / n) * 255);
      px[i + 2] = Math.round(clamp(b / n) * 255);
      px[i + 3] = 255;
    }
  }

  function shade(u, v) {
    // deep space ground
    const d0 = Math.hypot(u - 0.5, v - 0.5);
    const k = smooth(0.0, 0.85, d0);
    let r = 0.031 + (0.008 - 0.031) * k;
    let g = 0.039 + (0.012 - 0.039) * k;
    let b = 0.075 + (0.031 - 0.075) * k;

    // stars
    for (const s of stars) {
      const d = Math.hypot(u - s.x, v - s.y);
      const a = Math.exp(-(d * d) / (s.r * s.r)) * s.a;
      r += a * 0.85;
      g += a * 0.9;
      b += a * 1.0;
    }

    // the ring: a thin ellipse, tilted
    const ang = -0.34;
    const rx = (u - cx) * Math.cos(ang) - (v - cy) * Math.sin(ang);
    const ry = (u - cx) * Math.sin(ang) + (v - cy) * Math.cos(ang);
    const e = Math.hypot(rx / ringR, ry / (ringR * 0.34));
    const ringBand = Math.exp(-Math.pow((e - 1) / 0.075, 2));
    // The ring passes behind the sphere on the far side.
    const behind = ry < 0 ? 1 : 0;
    const dSphere = Math.hypot(u - cx, v - cy) / R;
    const ringVisible = behind && dSphere < 1 ? 0 : 1;
    const ring = ringBand * 0.55 * ringVisible;
    r += ring * 0.62;
    g += ring * 0.74;
    b += ring * 1.0;

    // the sphere
    const inside = 1 - smooth(0.96, 1.02, dSphere);
    if (inside > 0) {
      // light from the upper left
      const lx = (u - (cx - R * 0.34)) / R;
      const ly = (v - (cy - R * 0.36)) / R;
      const dl = Math.hypot(lx, ly);
      const lit = Math.exp(-Math.pow(dl / 1.05, 1.6));
      const rim = smooth(0.72, 1.0, dSphere) * 0.5;
      const sr = 0.10 + lit * 0.62 + rim * 0.55;
      const sg = 0.13 + lit * 0.70 + rim * 0.62;
      const sb = 0.24 + lit * 0.95 + rim * 0.85;
      r = r * (1 - inside) + sr * inside;
      g = g * (1 - inside) + sg * inside;
      b = b * (1 - inside) + sb * inside;
    }

    // outer glow
    const glow = Math.exp(-Math.pow(Math.max(0, dSphere - 1) / 0.85, 1.5)) * 0.20;
    r += glow * 0.45;
    g += glow * 0.58;
    b += glow * 0.95;

    return [r, g, b];
  }

  return px;
}

/* ── svg (crisp favicon) ─────────────────────────────────────────────────── */

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="75%">
      <stop offset="0%" stop-color="#080b14"/>
      <stop offset="100%" stop-color="#02030a"/>
    </radialGradient>
    <radialGradient id="orb" cx="36%" cy="34%" r="78%">
      <stop offset="0%" stop-color="#eaf1ff"/>
      <stop offset="45%" stop-color="#9fc0ff"/>
      <stop offset="100%" stop-color="#2b3f74"/>
    </radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#8fb4ff" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#8fb4ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#bg)"/>
  <circle cx="32" cy="32" r="22" fill="url(#halo)"/>
  <g transform="rotate(-20 32 32)">
    <ellipse cx="32" cy="32" rx="25" ry="8.5" fill="none" stroke="#a9c6ff" stroke-opacity="0.5" stroke-width="1.4"/>
  </g>
  <circle cx="32" cy="32" r="11.5" fill="url(#orb)"/>
  <g transform="rotate(-20 32 32)">
    <path d="M 7 32 A 25 8.5 0 0 0 57 32" fill="none" stroke="#c9dbff" stroke-opacity="0.72" stroke-width="1.4"/>
  </g>
  <g fill="#dce8ff">
    <circle cx="12" cy="13" r="0.9" opacity="0.8"/>
    <circle cx="52" cy="16" r="0.7" opacity="0.6"/>
    <circle cx="47" cy="51" r="0.8" opacity="0.5"/>
    <circle cx="15" cy="49" r="0.6" opacity="0.45"/>
  </g>
</svg>
`;

/* ── go ──────────────────────────────────────────────────────────────────── */

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'icon.svg'), SVG);

const jobs = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
];

for (const [name, size, maskable] of jobs) {
  const px = render(size, maskable);
  writeFileSync(join(OUT, name), encodePng(px, size, size));
  console.log('wrote', name, `${size}x${size}`);
}
console.log('wrote icon.svg');
