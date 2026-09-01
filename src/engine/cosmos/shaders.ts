/**
 * GLSL for the cosmic environment.
 *
 * Everything is procedural and evaluated per pixel, which means:
 *   - unlimited stars with zero per-object cost
 *   - true infinite parallax scrolling (no re-seeding, no pop-in)
 *   - a single fullscreen quad per pass
 *
 * Two passes:
 *   1. NEBULA  -> a small offscreen target (1/N res). Domain-warped fBm with a
 *      differential galactic rotation. Blurry by nature, so low res is free.
 *   2. COMPOSITE -> screen. Deep-space gradient, the upsampled nebula, several
 *      star depth layers, dust, a rare meteor, vignette and grain.
 *
 * Written against GLSL ES 1.00 so it runs on WebGL1 (i.e. every iPhone).
 * Quality knobs are injected as #defines and the program is rebuilt when the
 * tier changes - no dynamic branching in the hot loop.
 */

export const VERTEX_SRC = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);
}
`;

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

/** Hash / noise toolkit shared by both passes. */
const NOISE = `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n * 37.19));
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < NEB_OCTAVES; i++) {
    sum += amp * vnoise(p);
    norm += amp;
    amp *= 0.52;
    p = ROT * p * 2.03 + 19.17;
  }
  return sum / norm;
}

/* Summing octaves piles the distribution up around 0.5, which makes any
   threshold either eat everything or nothing. Stretch it back out to a usable
   0..1 before thresholding. */
float fbm01(vec2 p) {
  return clamp((fbm(p) - 0.5) * 2.7 + 0.5, 0.0, 1.0);
}
`;

/* ── Pass 1: nebula ─────────────────────────────────────────────────────── */

export const NEBULA_FRAGMENT = `
${PRECISION}
varying vec2 vUv;

uniform vec2  uRes;
uniform float uPxScale;
uniform vec2  uCam;
uniform float uZoom;
uniform float uTime;
uniform float uMotion;
uniform float uAmount;
uniform float uSeed;
uniform vec3  uNebA;
uniform vec3  uNebB;
uniform vec3  uNebC;

${NOISE}

void main() {
  // Centred CSS-pixel coordinates, y pointing down to match the camera.
  vec2 resCss = uRes / uPxScale;
  vec2 px = (vec2(vUv.x, 1.0 - vUv.y) - 0.5) * resCss;

  // Cloud features are sized relative to the viewport, so the composition
  // reads the same on a phone as on a desktop instead of being one flat wash.
  float nebScale = min(resCss.x, resCss.y) * 0.85;

  // The nebula sits far away: little parallax, and it barely scales with zoom.
  float zk = mix(1.0, uZoom, 0.28);
  vec2 p = (px + uCam * (uZoom * 0.16)) / (nebScale * zk);
  p += uSeed * 13.0;

  float t = uTime * uMotion;

  // --- galactic flow: differential rotation about the galactic core --------
  // Inner regions turn faster than outer ones, so the field shears over time
  // instead of spinning like a wheel.
  vec2 gc = p - vec2(0.35, -0.2);
  float r = length(gc) + 0.35;
  // Slow enough that you only notice it after watching for a while.
  float ang = (0.0035 / (r * r)) * t;
  float ca = cos(ang), sa = sin(ang);
  vec2 q = vec2(ca * gc.x - sa * gc.y, sa * gc.x + ca * gc.y) + vec2(0.35, -0.2);

  // --- domain warp: the source of the filament structure -------------------
  vec2 w1 = vec2(fbm(q * 0.9 + vec2(0.0, t * 0.010)),
                 fbm(q * 0.9 + vec2(5.2, 1.3) - vec2(t * 0.008, 0.0)));
  vec2 w2 = vec2(fbm(q * 2.1 + w1 * 1.6 + vec2(t * 0.013, 0.0)),
                 fbm(q * 2.1 + w1 * 1.6 + vec2(3.1, 7.7)));
  vec2 warped = q + w1 * 0.85 + w2 * 0.32;

  float base = fbm01(warped * 1.15);
  float detail = fbm01(warped * 3.4 + w2 * 0.7);

  // Large-scale coverage mask keeps most of the sky clean and dark.
  float mask = fbm01(q * 0.34 + vec2(11.0, 4.0) + t * 0.004);
  mask = smoothstep(0.44, 0.88, mask);

  // Very slow breathing, offset per region so nothing pulses in unison.
  float breathe = 1.0 + 0.16 * sin(t * 0.10 + base * 6.28318) * uMotion;

  // A soft logarithmic spiral adds structure without reading as "swirl gif".
  float theta = atan(gc.y, gc.x);
  float arms = 0.5 + 0.5 * sin(2.0 * theta + log(r + 0.6) * 5.0 - t * 0.012);
  arms = mix(0.75, 1.25, smoothstep(0.25, 0.95, arms));

  float density = smoothstep(0.44, 0.92, base * 0.72 + detail * 0.38);
  density *= mask * arms * breathe;
  density = clamp(density, 0.0, 1.0);
  density = pow(density, 1.35) * uAmount;

  // Colour: three tints woven together by low-frequency noise.
  float m1 = smoothstep(0.20, 0.82, fbm01(warped * 0.55 + 3.7));
  float m2 = smoothstep(0.25, 0.88, detail);
  vec3 col = mix(uNebA, uNebB, m1);
  col = mix(col, uNebC, m2 * 0.65);

  // Hot filament cores, kept restrained.
  float core = smoothstep(0.78, 1.0, base * 0.7 + detail * 0.45) * mask;
  col += core * 0.16;

  gl_FragColor = vec4(col * density, density);
}
`;

/* ── Pass 2: composite ──────────────────────────────────────────────────── */

export const COMPOSITE_FRAGMENT = `
${PRECISION}
varying vec2 vUv;

uniform vec2      uRes;
uniform float     uPxScale;
uniform vec2      uCam;
uniform float     uZoom;
uniform float     uTime;
uniform float     uMotion;
uniform float     uSeed;
uniform sampler2D uNebula;
uniform vec2      uNebulaTexel;
uniform vec3      uBgInner;
uniform vec3      uBgOuter;
uniform vec3      uStarWarm;
uniform vec3      uStarCool;
uniform float     uStarDensity;
uniform float     uDustDensity;
uniform float     uNebulaGain;
uniform float     uGrain;
uniform float     uVignette;
uniform float     uFade;

${NOISE}

/* One procedural star layer.
   Single tap per pixel: each grid cell holds at most one star, with a core
   tight enough that its falloff reaches zero before the cell boundary - so
   there are no grid seams even though we never sample neighbours. */
float starLayer(
  vec2 px, float parallax, float zoomK, float cell,
  float density, float sharp, float jitter, float twSpeed, float seed,
  out vec3 tint
) {
  float zk = mix(1.0, uZoom, zoomK);
  vec2 c = (px + uCam * (uZoom * parallax)) / (cell * zk);
  vec2 id = floor(c) + seed * 71.3;
  vec2 f = fract(c) - 0.5;

  vec2 h = hash22(id);
  float h3 = hash21(id + 5.1);
  float h4 = hash21(id + 9.7);

  // Thin the field out: only some cells hold a star at all.
  float exists = step(1.0 - density, h3);

  vec2 offset = (h - 0.5) * (2.0 * jitter);
  float d2 = dot(f - offset, f - offset);
  float core = exp(-d2 * sharp);

  // Twinkle, plus a rarer sparkle so the field is not a uniform shimmer.
  float ph = h4 * 6.28318;
  float tw = 0.70 + 0.30 * sin(uTime * twSpeed * (0.6 + h4) + ph);
  float flare = pow(max(0.0, sin(uTime * 0.21 * (0.5 + h.y) + ph)), 24.0);
  float bright = mix(0.28, 1.18, h.x * h.x) * mix(1.0, tw, uMotion) + flare * 0.55 * uMotion;

  tint = mix(uStarCool, uStarWarm, smoothstep(0.35, 0.9, h4));
  return core * bright * exists;
}

/* Bright focal stars: sparse, 3x3 neighbourhood so the halo can bleed across
   cells, with soft diffraction spikes. */
vec3 focalStars(vec2 px) {
  // ~2 on a phone, ~14 on a large desktop window.
  float cell = 190.0;
  float zk = mix(1.0, uZoom, 0.55);
  vec2 c = (px + uCam * (uZoom * 0.5)) / (cell * zk);
  vec2 id = floor(c);
  vec2 f = fract(c);
  vec3 acc = vec3(0.0);

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 nid = id + vec2(float(i), float(j));
      float hx = hash21(nid + uSeed * 3.3);
      if (hx < 0.75) continue;               // sparse

      vec2 h = hash22(nid + 1.7);
      float h4 = hash21(nid + 8.3);
      vec2 pos = vec2(float(i), float(j)) + 0.15 + h * 0.7;
      vec2 dv = (f - pos) * vec2(1.0, 1.0);
      float d = length(dv);

      float ph = h4 * 6.28318;
      float tw = 0.72 + 0.28 * sin(uTime * 0.55 + ph);
      float amp = mix(0.55, 1.0, h.x) * mix(1.0, tw, uMotion);

      float coreS = exp(-d * d * 900.0) * 1.5;
      float halo = exp(-d * d * 60.0) * 0.16;
      float glow = exp(-d * d * 5.0) * 0.030;

      // Cross spikes, gently rotated per star.
      float a = ph * 0.5;
      vec2 rv = vec2(cos(a) * dv.x - sin(a) * dv.y, sin(a) * dv.x + cos(a) * dv.y);
      float spike = exp(-abs(rv.x) * 46.0) * exp(-abs(rv.y) * 5.0)
                  + exp(-abs(rv.y) * 46.0) * exp(-abs(rv.x) * 5.0);
      spike *= 0.10;

      vec3 tint = mix(uStarCool, uStarWarm, smoothstep(0.4, 0.95, h4));
      acc += tint * (coreS + halo + glow + spike) * amp;
    }
  }
  return acc;
}

/* Cosmic dust: near-field motes drifting on a slow noise field. */
float dustLayer(vec2 px, float parallax, float cell, float speed, float seed) {
  float zk = mix(1.0, uZoom, 0.85);
  vec2 c = (px + uCam * (uZoom * parallax)) / (cell * zk);
  vec2 id = floor(c) + seed * 41.0;
  vec2 f = fract(c) - 0.5;

  vec2 h = hash22(id);
  float h3 = hash21(id + 3.9);
  if (h3 < 0.68) return 0.0;

  // Curl-ish drift: two out-of-phase oscillators, never a straight line.
  float t = uTime * speed * uMotion;
  float a = t * (0.7 + h.x) + h.x * 6.28318;
  float b = t * (0.5 + h.y * 0.8) + h.y * 6.28318;
  vec2 drift = vec2(sin(a) + 0.4 * sin(b * 1.7), cos(b) + 0.35 * cos(a * 1.3)) * 0.26;

  vec2 offset = (h - 0.5) * 0.4 + drift;
  float d2 = dot(f - offset, f - offset);
  float mote = exp(-d2 * 420.0);
  float shimmer = 0.55 + 0.45 * sin(t * 1.6 + h.x * 12.0);
  return mote * mix(0.35, 1.0, h.y) * mix(1.0, shimmer, uMotion);
}

/* A rare meteor. Most cycles are empty, so it reads as a lucky sighting. */
vec3 meteor(vec2 px, vec2 resCss) {
  float cycle = 17.0;
  float phase = uTime * uMotion / cycle;
  float id = floor(phase);
  float t = fract(phase);
  vec2 h = hash22(vec2(id, 7.3) + uSeed);
  if (h.x < 0.62) return vec3(0.0);

  float h2 = hash21(vec2(id, 2.1));
  vec2 start = (h - 0.5) * resCss * 1.5 - vec2(resCss.x * 0.6, 0.0);
  float ang = -0.35 + h2 * 0.7;
  vec2 dir = vec2(cos(ang), sin(ang));
  float span = length(resCss) * 0.85;

  // Ease in and out so it never appears or vanishes abruptly.
  float travel = smoothstep(0.0, 1.0, t);
  vec2 head = start + dir * span * travel;
  vec2 rel = px - head;
  float along = dot(rel, -dir);
  float across = abs(dot(rel, vec2(-dir.y, dir.x)));
  float tail = 150.0;
  float body = exp(-across * across * 0.9) * exp(-max(0.0, along) / tail)
             * step(-2.0, along);
  float headGlow = exp(-dot(rel, rel) * 0.004);
  float life = sin(3.14159 * t);
  return vec3(0.75, 0.82, 1.0) * (body * 0.5 + headGlow * 0.35) * life * life;
}

void main() {
  vec2 uvFlip = vec2(vUv.x, 1.0 - vUv.y);
  // Everything spatial is in CSS pixels: a star is the same apparent size on a
  // retina phone as on a 1x monitor, rather than half of it.
  vec2 resCss = uRes / uPxScale;
  vec2 px = (uvFlip - 0.5) * resCss;
  vec2 ndc = (uvFlip - 0.5) * vec2(resCss.x / resCss.y, 1.0) * 2.0;

  /* --- deep space background ------------------------------------------- */
  // Never flat black: a wide radial fall-off plus a very slow drifting tint.
  float rad = length(ndc) * 0.62;
  vec3 col = mix(uBgInner, uBgOuter, smoothstep(0.0, 1.35, rad));

  float slowScale = min(resCss.x, resCss.y) * 1.7;
  vec2 slow = (px + uCam * (uZoom * 0.05)) / slowScale;
  float drift = vnoise(slow + uTime * 0.004 * uMotion);
  col += (drift - 0.5) * 0.020;

  /* --- nebula (blurred upsample of the low-res pass) -------------------- */
  vec2 tx = uNebulaTexel;
  vec4 neb = texture2D(uNebula, vUv) * 0.36;
  neb += texture2D(uNebula, vUv + vec2( tx.x,  tx.y)) * 0.16;
  neb += texture2D(uNebula, vUv + vec2(-tx.x,  tx.y)) * 0.16;
  neb += texture2D(uNebula, vUv + vec2( tx.x, -tx.y)) * 0.16;
  neb += texture2D(uNebula, vUv + vec2(-tx.x, -tx.y)) * 0.16;
  col += neb.rgb * uNebulaGain;

  // Dense nebula slightly veils the stars behind it.
  float extinct = 1.0 - clamp(neb.a, 0.0, 1.0) * 0.30;

  /* --- star depth layers ------------------------------------------------ */
  vec3 stars = vec3(0.0);
  vec3 tint;

  // Cell sizes are in CSS pixels: the furthest layer is a fine grain of light
  // (~0.6px cores, hundreds on screen), the nearest is sparse and soft.
  float s;
  s = starLayer(px, 0.04, 0.02,  15.0, 0.40, 700.0, 0.38, 0.9, 1.0, tint);
  stars += tint * s * 0.30 * extinct;
#if STAR_LAYERS > 1
  s = starLayer(px, 0.10, 0.08,  24.0, 0.32, 600.0, 0.38, 1.1, 2.0, tint);
  stars += tint * s * 0.44 * extinct;
#endif
#if STAR_LAYERS > 2
  s = starLayer(px, 0.19, 0.18,  38.0, 0.26, 500.0, 0.37, 1.3, 3.0, tint);
  stars += tint * s * 0.60 * extinct;
#endif
#if STAR_LAYERS > 3
  s = starLayer(px, 0.32, 0.32,  62.0, 0.20, 420.0, 0.36, 1.5, 4.0, tint);
  stars += tint * s * 0.80 * mix(1.0, extinct, 0.5);
#endif
#if STAR_LAYERS > 4
  s = starLayer(px, 0.46, 0.46, 100.0, 0.15, 360.0, 0.35, 1.8, 5.0, tint);
  stars += tint * s * 1.00 * mix(1.0, extinct, 0.3);
#endif

  col += stars * uStarDensity;

#if FOCAL_STARS
  col += focalStars(px) * mix(0.55, 1.0, uStarDensity);
#endif

  /* --- dust ------------------------------------------------------------- */
  float dust = 0.0;
#if DUST_LAYERS > 0
  dust += dustLayer(px, 0.78, 70.0, 0.30, 1.0) * 0.5;
#endif
#if DUST_LAYERS > 1
  dust += dustLayer(px, 0.94, 112.0, 0.22, 2.0) * 0.75;
#endif
  col += vec3(0.72, 0.78, 0.95) * dust * uDustDensity * 0.34;

  /* --- meteor ----------------------------------------------------------- */
  col += meteor(px, resCss);

  /* --- finishing -------------------------------------------------------- */
  float vig = 1.0 - uVignette * smoothstep(0.35, 1.5, length(ndc) * 0.7);
  col *= vig;

  // Grain hides banding in the very dark gradient.
  float g = hash21(uvFlip * uRes + fract(uTime * uMotion) * 91.7);
  col += (g - 0.5) * uGrain;

  col = max(col, vec3(0.0));
  // Gentle filmic curve. Deep space is mostly near-black, and without this the
  // whole image sits in the bottom two percent of the range and reads as dead.
  col = col / (col + 0.82) * 1.82;
  gl_FragColor = vec4(col * uFade, 1.0);
}
`;

export interface ShaderDefines {
  nebOctaves: number;
  starLayers: number;
  dustLayers: number;
  focalStars: boolean;
}

export function buildDefines(d: ShaderDefines): string {
  return [
    `#define NEB_OCTAVES ${Math.max(1, Math.min(6, d.nebOctaves))}`,
    `#define STAR_LAYERS ${Math.max(1, Math.min(5, d.starLayers))}`,
    `#define DUST_LAYERS ${Math.max(0, Math.min(2, d.dustLayers))}`,
    `#define FOCAL_STARS ${d.focalStars ? 1 : 0}`,
    '',
  ].join('\n');
}
