import { Container, Sprite, Texture } from 'pixi.js';
import type { SceneNode } from '../scene';
import { hexToInt } from '../math';
import type { TextureSet } from './textures';

const TAU = Math.PI * 2;

/**
 * Card width (screen px) at which a note stops showing decorative handwriting
 * and the DOM layer starts showing its actual text. Shared with LabelLayer so
 * the handover is seamless.
 */
export const NOTE_TEXT_PX = 124;

/** Paint order: soft, large things behind; bright, small things in front. */
const LAYER: Record<string, number> = {
  collection: 0,
  universe: 1,
  photo: 2,
  artwork: 2,
  note: 3,
  place: 4,
  memory: 5,
  person: 6,
  song: 6,
  event: 7,
  constellation: 8,
};

function sprite(tex: Texture, size: number, alpha: number, tint: number, add = true): Sprite {
  const s = new Sprite(tex);
  s.anchor.set(0.5);
  s.width = size;
  s.height = size;
  s.alpha = alpha;
  s.tint = tint;
  if (add) s.blendMode = 'add';
  return s;
}

/** Blend a colour toward white — keeps cores from looking muddy. */
function toward(colorInt: number, t: number, target = 0xffffff): number {
  const r = (colorInt >> 16) & 255;
  const g = (colorInt >> 8) & 255;
  const b = colorInt & 255;
  const tr = (target >> 16) & 255;
  const tg = (target >> 8) & 255;
  const tb = target & 255;
  const m = (a: number, bb: number) => Math.round(a + (bb - a) * t);
  return (m(r, tr) << 16) | (m(g, tg) << 8) | m(b, tb);
}

/**
 * One celestial body.
 *
 * A view owns a handful of tinted sprites and a per-object animation phase.
 * `update()` is called every frame; it never allocates.
 */
export class NodeView {
  readonly root = new Container();
  node: SceneNode;

  private tx: TextureSet;
  private phase: number;
  private phase2: number;
  private speed: number;

  private glow?: Sprite;
  private glow2?: Sprite;
  private core?: Sprite;
  private flare?: Sprite;
  private body?: Sprite;
  private detail?: Sprite;
  private ring?: Sprite;
  private orbitRing?: Sprite;
  private satellite?: Container;
  private pulses: Sprite[] = [];
  private tail?: Sprite;
  private frame?: Sprite;
  private image?: Sprite;
  private mat?: Sprite;
  private scrib?: Sprite;
  private selection?: Sprite;

  /** Card aspect (w/h). Updated when a photo texture resolves. */
  aspect = 4 / 3;
  /** Where the body actually sits after floating — used by hit testing. */
  driftX = 0;
  driftY = 0;

  private colorInt = 0xffffff;
  private allowGlow: boolean;

  constructor(node: SceneNode, tx: TextureSet, allowGlow: boolean) {
    this.node = node;
    this.tx = tx;
    this.allowGlow = allowGlow;
    this.phase = node.seed * TAU;
    this.phase2 = ((node.seed * 7.13) % 1) * TAU;
    this.speed = 0.7 + ((node.seed * 3.77) % 1) * 0.7;
    this.root.zIndex = (LAYER[node.kind] ?? 4) * 1000;
    this.build();
  }

  // ── construction ────────────────────────────────────────────────────────

  private build() {
    const n = this.node;
    this.colorInt = hexToInt(n.color);
    const c = this.colorInt;
    const r = n.radius;

    switch (n.kind) {
      case 'universe':
        this.buildUniverse();
        break;
      case 'person':
        this.buildStar(r, 1.0);
        this.orbitRing = sprite(this.tx.outline, r * 3.6, 0.13, toward(c, 0.5), false);
        this.root.addChild(this.orbitRing);
        this.satellite = new Container();
        {
          const dot = sprite(this.tx.core, r * 0.55, 0.85, toward(c, 0.7));
          dot.x = r * 1.8;
          this.satellite.addChild(dot);
        }
        this.root.addChild(this.satellite);
        break;
      case 'song':
        this.buildStar(r, 0.85);
        for (let i = 0; i < 3; i++) {
          const p = sprite(this.tx.outline, r * 2.4, 0, toward(c, 0.3), false);
          this.pulses.push(p);
          this.root.addChild(p);
        }
        break;
      case 'event':
        this.tail = new Sprite(this.tx.tail);
        this.tail.anchor.set(1, 0.5);
        this.tail.width = r * 11;
        this.tail.height = r * 3.2;
        this.tail.alpha = 0.5;
        this.tail.tint = toward(c, 0.55);
        this.tail.blendMode = 'add';
        this.root.addChild(this.tail);
        this.buildStar(r, 0.95);
        break;
      case 'constellation':
        this.glow = sprite(this.tx.glow, r * 8, 0.22, toward(c, 0.35));
        this.root.addChild(this.glow);
        this.ring = sprite(this.tx.outline, r * 3.2, 0.3, toward(c, 0.5), false);
        this.root.addChild(this.ring);
        this.core = sprite(this.tx.core, r * 1.5, 0.9, toward(c, 0.75));
        this.root.addChild(this.core);
        break;
      case 'memory':
        this.glow = sprite(this.tx.glow, r * 5.2, 0.42, toward(c, 0.25));
        this.root.addChild(this.glow);
        this.body = sprite(this.tx.spheres[n.variant % 6], r * 2, 1, toward(c, 0.22), false);
        this.root.addChild(this.body);
        this.detail = sprite(this.tx.details[n.variant % 6], r * 2, 0.55, 0xffffff);
        this.root.addChild(this.detail);
        this.ring = sprite(this.tx.outline, r * 2.7, 0.14, toward(c, 0.6), false);
        this.root.addChild(this.ring);
        if (n.hasScrapbook) {
          this.orbitRing = sprite(this.tx.outline, r * 3.3, 0.09, toward(c, 0.7), false);
          this.root.addChild(this.orbitRing);
        }
        break;
      case 'place':
        this.glow = sprite(this.tx.glow, r * 4.2, 0.3, toward(c, 0.3));
        this.root.addChild(this.glow);
        this.ring = new Sprite(this.tx.ring);
        this.ring.anchor.set(0.5);
        this.ring.width = r * 5.4;
        this.ring.height = r * 1.85;
        this.ring.alpha = 0.5;
        this.ring.tint = toward(c, 0.6);
        this.ring.blendMode = 'add';
        this.ring.rotation = -0.34;
        this.root.addChild(this.ring);
        this.body = sprite(this.tx.spheres[(n.variant + 1) % 6], r * 2, 1, toward(c, 0.28), false);
        this.root.addChild(this.body);
        this.detail = sprite(this.tx.details[(n.variant + 2) % 6], r * 2, 0.45, 0xffffff);
        this.root.addChild(this.detail);
        break;
      case 'collection':
        this.glow = sprite(this.tx.glow, r * 3.4, 0.2, toward(c, 0.2));
        this.root.addChild(this.glow);
        this.body = sprite(this.tx.clusters[n.variant % 3], r * 2.5, 0.9, toward(c, 0.45));
        this.root.addChild(this.body);
        break;
      case 'photo':
      case 'artwork':
        this.buildCard(n.kind === 'artwork');
        break;
      case 'note':
        this.buildNote();
        break;
      default:
        this.buildStar(r, 1);
    }
  }

  private buildStar(r: number, intensity: number) {
    const c = this.colorInt;
    const g = this.node.glow;
    this.glow = sprite(this.tx.glow, r * (6 + g * 4), 0.30 * intensity * (0.5 + g), toward(c, 0.28));
    this.root.addChild(this.glow);
    if (this.allowGlow) {
      this.flare = sprite(this.tx.flare, r * (8 + g * 5), 0.16 * intensity * (0.4 + g), toward(c, 0.8));
      this.root.addChild(this.flare);
    }
    this.glow2 = sprite(this.tx.glowTight, r * 3, 0.5 * intensity, toward(c, 0.55));
    this.root.addChild(this.glow2);
    this.core = sprite(this.tx.core, r * 1.7, 0.95 * intensity, toward(c, 0.82));
    this.root.addChild(this.core);
  }

  private buildUniverse() {
    const n = this.node;
    const r = n.radius;
    const c = this.colorInt;
    const form = n.form ?? 'planet';

    if (form === 'star') {
      // Restrained multipliers: a universe is already a large body, and at
      // 9x its radius the flare stops being a highlight and becomes the scene.
      this.glow = sprite(this.tx.glow, r * 4.6, 0.38, toward(c, 0.3));
      this.root.addChild(this.glow);
      if (this.allowGlow) {
        this.flare = sprite(this.tx.flare, r * 5.4, 0.22, toward(c, 0.85));
        this.root.addChild(this.flare);
      }
      this.glow2 = sprite(this.tx.glowTight, r * 2.6, 0.7, toward(c, 0.6));
      this.root.addChild(this.glow2);
      this.core = sprite(this.tx.core, r * 1.8, 1, 0xffffff);
      this.root.addChild(this.core);
      return;
    }

    if (form === 'galaxy') {
      this.glow = sprite(this.tx.glow, r * 3.4, 0.30, toward(c, 0.25));
      this.root.addChild(this.glow);
      this.body = sprite(this.tx.clusters[n.variant % 3], r * 2.6, 0.95, toward(c, 0.4));
      this.root.addChild(this.body);
      this.detail = sprite(this.tx.clusters[(n.variant + 1) % 3], r * 1.9, 0.5, toward(c, 0.7));
      this.root.addChild(this.detail);
      this.core = sprite(this.tx.glowTight, r * 0.9, 0.8, toward(c, 0.8));
      this.root.addChild(this.core);
      return;
    }

    if (form === 'nebula') {
      this.glow = sprite(this.tx.glow, r * 3.6, 0.34, toward(c, 0.15));
      this.root.addChild(this.glow);
      this.glow2 = sprite(this.tx.glow, r * 2.3, 0.26, toward(c, 0.45));
      this.glow2.x = r * 0.28;
      this.glow2.y = -r * 0.2;
      this.root.addChild(this.glow2);
      this.body = sprite(this.tx.clusters[n.variant % 3], r * 2.1, 0.55, toward(c, 0.55));
      this.root.addChild(this.body);
      return;
    }

    // planet / ringed / moon
    this.glow = sprite(this.tx.glow, r * (form === 'moon' ? 3.2 : 4.4), 0.32, toward(c, 0.28));
    this.root.addChild(this.glow);
    if (form === 'ringed') {
      this.ring = new Sprite(this.tx.ring);
      this.ring.anchor.set(0.5);
      this.ring.width = r * 5.8;
      this.ring.height = r * 2;
      this.ring.alpha = 0.62;
      this.ring.tint = toward(c, 0.62);
      this.ring.blendMode = 'add';
      this.ring.rotation = -0.28;
      this.root.addChild(this.ring);
    }
    const variant = form === 'moon' ? 1 : n.variant % 6;
    this.body = sprite(this.tx.spheres[variant], r * 2, 1, toward(c, form === 'moon' ? 0.45 : 0.25), false);
    this.root.addChild(this.body);
    this.detail = sprite(this.tx.details[n.variant % 6], r * 2, 0.6, 0xffffff);
    this.root.addChild(this.detail);
    this.orbitRing = sprite(this.tx.outline, r * 2.9, 0.055, toward(c, 0.65), false);
    this.root.addChild(this.orbitRing);
  }

  private buildCard(gallery: boolean) {
    const n = this.node;
    const c = this.colorInt;
    const w = n.radius * 2;
    this.glow = sprite(this.tx.glow, w * 2.4, gallery ? 0.16 : 0.13, toward(c, 0.3));
    this.root.addChild(this.glow);

    this.frame = new Sprite(this.tx.panelSharp);
    this.frame.anchor.set(0.5);
    this.frame.tint = gallery ? 0x14161e : 0xf3efe6;
    this.frame.alpha = gallery ? 0.96 : 0.97;
    this.root.addChild(this.frame);

    if (gallery) {
      this.mat = new Sprite(this.tx.panelSharp);
      this.mat.anchor.set(0.5);
      this.mat.tint = 0xe9e4d8;
      this.mat.alpha = 0.9;
      this.root.addChild(this.mat);
    }

    this.image = new Sprite(Texture.EMPTY);
    this.image.anchor.set(0.5);
    this.image.alpha = 0;
    this.root.addChild(this.image);
    this.layoutCard();
  }

  private buildNote() {
    const n = this.node;
    const c = this.colorInt;
    const w = n.radius * 2;
    this.aspect = 0.86;
    this.glow = sprite(this.tx.glow, w * 2.1, 0.1, toward(c, 0.35));
    this.root.addChild(this.glow);

    this.frame = new Sprite(this.tx.panel);
    this.frame.anchor.set(0.5);
    this.frame.tint = 0xf6f1e4;
    this.frame.alpha = 0.95;
    this.root.addChild(this.frame);

    this.scrib = new Sprite(this.tx.scribbles[n.variant % 4]);
    this.scrib.anchor.set(0.5);
    this.scrib.tint = 0x2b2a26;
    this.scrib.alpha = 0.6;
    this.root.addChild(this.scrib);
    this.layoutCard();
  }

  /** Recompute card geometry from radius + aspect. */
  private layoutCard() {
    const n = this.node;
    const w = n.radius * 2;
    const h = w / this.aspect;
    const isNote = n.kind === 'note';
    const gallery = n.kind === 'artwork';
    const pad = isNote ? 0 : gallery ? w * 0.09 : w * 0.055;
    const bottomPad = isNote ? 0 : gallery ? pad : w * 0.13;

    if (this.frame) {
      this.frame.width = w + pad * 2;
      this.frame.height = h + pad + bottomPad;
      this.frame.y = (bottomPad - pad) / 2;
    }
    if (this.mat) {
      this.mat.width = w + pad * 0.7;
      this.mat.height = h + pad * 0.7;
    }
    if (this.image) {
      this.image.width = w;
      this.image.height = h;
    }
    if (this.scrib) {
      this.scrib.width = w * 0.88;
      this.scrib.height = h * 0.8;
    }
    if (this.glow) {
      this.glow.width = w * 2.2;
      this.glow.height = h * 2.4;
    }
  }

  /** Called when the photo texture finally arrives. */
  setTexture(tex: Texture) {
    if (!this.image) return;
    this.image.texture = tex;
    const tw = tex.width || 4;
    const th = tex.height || 3;
    this.aspect = tw / th;
    this.layoutCard();
    this.image.alpha = 0;
  }

  /** Cheap data refresh; a kind change rebuilds instead. */
  sync(node: SceneNode) {
    const prev = this.node;
    this.node = node;
    if (node.color !== prev.color) {
      this.colorInt = hexToInt(node.color);
      const c = this.colorInt;
      if (this.glow) this.glow.tint = toward(c, 0.28);
      if (this.glow2) this.glow2.tint = toward(c, 0.55);
      if (this.core) this.core.tint = toward(c, 0.8);
      if (this.body && node.kind !== 'collection') this.body.tint = toward(c, 0.25);
      if (this.ring) this.ring.tint = toward(c, 0.6);
      if (this.orbitRing) this.orbitRing.tint = toward(c, 0.6);
      if (this.tail) this.tail.tint = toward(c, 0.55);
    }
    if (node.radius !== prev.radius) {
      this.rescale();
    }
    this.root.zIndex = (LAYER[node.kind] ?? 4) * 1000;
  }

  private rescale() {
    const n = this.node;
    const r = n.radius;
    if (this.frame || this.image || this.scrib) {
      this.layoutCard();
      if (this.glow) {
        /* handled in layoutCard */
      }
      return;
    }
    const set = (s: Sprite | undefined, mult: number) => {
      if (!s) return;
      s.width = r * mult;
      s.height = r * mult;
    };
    if (n.kind === 'memory') {
      set(this.glow, 5.2);
      set(this.body, 2);
      set(this.detail, 2);
      set(this.ring, 2.7);
      set(this.orbitRing, 3.3);
    } else if (n.kind === 'place') {
      set(this.glow, 4.2);
      set(this.body, 2);
      set(this.detail, 2);
      if (this.ring) {
        this.ring.width = r * 5.4;
        this.ring.height = r * 1.85;
      }
    } else if (n.kind === 'collection') {
      set(this.glow, 3.4);
      set(this.body, 2.5);
    } else if (n.kind === 'universe') {
      set(this.glow, n.form === 'star' ? 4.6 : 4.4);
      set(this.glow2, n.form === 'star' ? 2.6 : 3.4);
      set(this.body, 2);
      set(this.detail, 2);
      set(this.core, 1.8);
      set(this.flare, 5.4);
      set(this.orbitRing, 2.9);
      if (this.ring && n.form === 'ringed') {
        this.ring.width = r * 5.8;
        this.ring.height = r * 2;
      }
    } else {
      set(this.glow, 6 + n.glow * 4);
      set(this.glow2, 3);
      set(this.core, 1.7);
      set(this.flare, 8 + n.glow * 5);
      set(this.orbitRing, 3.6);
      if (this.tail) {
        this.tail.width = r * 11;
        this.tail.height = r * 3.2;
      }
    }
  }

  setSelected(on: boolean, accent: number) {
    if (on && !this.selection) {
      const n = this.node;
      const isCard = !!this.frame;
      const size = isCard ? n.radius * 2.5 : n.radius * 3.1;
      this.selection = sprite(this.tx.outlineThick, size, 0.7, accent, false);
      this.root.addChildAt(this.selection, 0);
    } else if (!on && this.selection) {
      this.root.removeChild(this.selection);
      this.selection.destroy();
      this.selection = undefined;
    } else if (on && this.selection) {
      this.selection.tint = accent;
    }
  }

  // ── per-frame ───────────────────────────────────────────────────────────

  update(t: number, dt: number, zoom: number, motion: number) {
    const n = this.node;
    const r = n.radius;
    const screenR = r * zoom;
    const detailed = screenR > 7;
    const em = n.emphasis;

    // Organic float: two out-of-phase oscillators so nothing tracks anything.
    const amp = motion * Math.min(1, 40 / Math.max(8, r));
    this.driftX = Math.sin(t * 0.21 * this.speed + this.phase) * r * 0.05 * amp;
    this.driftY = Math.cos(t * 0.17 * this.speed + this.phase2) * r * 0.06 * amp;
    this.root.x = n.x + this.driftX;
    this.root.y = n.y + this.driftY;
    this.root.alpha = em;

    const twinkle = 0.78 + 0.22 * Math.sin(t * 1.05 * this.speed + this.phase);
    const slowPulse = 0.5 + 0.5 * Math.sin(t * 0.32 * this.speed + this.phase2);

    switch (n.kind) {
      case 'photo':
      case 'artwork':
      case 'note': {
        this.root.rotation = n.rotation + Math.sin(t * 0.13 * this.speed + this.phase) * 0.012 * motion;
        if (this.image && this.image.texture !== Texture.EMPTY) {
          // Fade the photo in once, then hold.
          this.image.alpha = Math.min(1, this.image.alpha + dt * 2.2);
        }
        if (this.glow) this.glow.alpha = (0.10 + 0.05 * slowPulse * motion) * (0.5 + n.glow);
        // Handwriting from afar; the real text takes over (in the DOM layer)
        // once the card is wide enough to actually read.
        if (this.scrib) this.scrib.visible = detailed && r * 2 * zoom < NOTE_TEXT_PX;
        break;
      }
      case 'memory': {
        if (this.detail) {
          this.detail.rotation += dt * 0.045 * motion;
          this.detail.visible = detailed;
        }
        if (this.glow) this.glow.alpha = 0.34 + 0.20 * slowPulse * motion;
        if (this.ring) {
          this.ring.rotation += dt * 0.02 * motion;
          this.ring.visible = detailed;
          this.ring.alpha = 0.10 + 0.08 * slowPulse;
        }
        if (this.orbitRing) {
          this.orbitRing.rotation -= dt * 0.035 * motion;
          this.orbitRing.visible = detailed;
        }
        break;
      }
      case 'place': {
        if (this.detail) {
          this.detail.rotation += dt * 0.06 * motion;
          this.detail.visible = detailed;
        }
        if (this.ring) {
          this.ring.rotation = -0.34 + Math.sin(t * 0.1 + this.phase) * 0.05 * motion;
          this.ring.visible = detailed;
        }
        if (this.glow) this.glow.alpha = 0.26 + 0.1 * slowPulse * motion;
        break;
      }
      case 'collection': {
        this.root.rotation = n.rotation + t * 0.005 * motion;
        if (this.body) this.body.alpha = 0.75 + 0.2 * slowPulse * motion;
        if (this.glow) this.glow.alpha = 0.16 + 0.08 * slowPulse * motion;
        break;
      }
      case 'person': {
        this.starTick(twinkle, motion, detailed);
        if (this.orbitRing) {
          this.orbitRing.rotation += dt * 0.06 * motion;
          this.orbitRing.visible = detailed;
        }
        if (this.satellite) {
          this.satellite.rotation = t * 0.22 * this.speed * motion + this.phase;
          this.satellite.visible = detailed;
        }
        break;
      }
      case 'song': {
        this.starTick(twinkle, motion, detailed);
        const playing = !!n.playing;
        for (let i = 0; i < this.pulses.length; i++) {
          const p = this.pulses[i];
          p.visible = detailed;
          if (playing) {
            const k = ((t * 0.55 + i / this.pulses.length) % 1);
            const size = r * (2.2 + k * 5.5);
            p.width = size;
            p.height = size;
            p.alpha = (1 - k) * 0.5;
          } else {
            const size = r * (2.4 + i * 0.7);
            p.width = size;
            p.height = size;
            p.alpha = 0.10 * (1 - i * 0.25) * (0.6 + 0.4 * slowPulse);
          }
        }
        break;
      }
      case 'event': {
        // A comet: a long, slow ellipse around its home point.
        const ex = Math.cos(t * 0.055 * this.speed + this.phase) * r * 3.2 * motion;
        const ey = Math.sin(t * 0.055 * this.speed + this.phase) * r * 1.1 * motion;
        this.root.x = n.x + ex;
        this.root.y = n.y + ey;
        this.driftX = ex;
        this.driftY = ey;
        const vx = -Math.sin(t * 0.055 * this.speed + this.phase);
        const vy = Math.cos(t * 0.055 * this.speed + this.phase) * 0.34;
        if (this.tail) {
          this.tail.rotation = Math.atan2(vy, vx) + Math.PI;
          this.tail.alpha = (0.34 + 0.16 * twinkle) * (motion > 0 ? 1 : 0.6);
          this.tail.visible = detailed;
        }
        this.starTick(twinkle, motion, detailed);
        break;
      }
      case 'constellation': {
        if (this.ring) {
          this.ring.rotation += dt * 0.09 * motion;
          this.ring.alpha = 0.2 + 0.18 * slowPulse * motion;
          this.ring.visible = detailed;
        }
        if (this.core) this.core.alpha = 0.7 + 0.3 * twinkle;
        if (this.glow) this.glow.alpha = 0.16 + 0.1 * slowPulse * motion;
        break;
      }
      case 'universe': {
        const form = n.form ?? 'planet';
        if (form === 'galaxy') {
          if (this.body) this.body.rotation += dt * 0.012 * motion;
          if (this.detail) this.detail.rotation -= dt * 0.02 * motion;
          if (this.core) this.core.alpha = 0.7 + 0.25 * twinkle;
        } else if (form === 'nebula') {
          if (this.glow) this.glow.alpha = 0.28 + 0.10 * slowPulse * motion;
          if (this.glow2) this.glow2.alpha = 0.20 + 0.10 * (1 - slowPulse) * motion;
          if (this.body) this.body.rotation += dt * 0.006 * motion;
        } else if (form === 'star') {
          this.starTick(twinkle, motion, detailed);
        } else {
          if (this.detail) {
            this.detail.rotation += dt * 0.035 * motion;
            this.detail.visible = detailed;
          }
          if (this.glow) this.glow.alpha = 0.26 + 0.09 * slowPulse * motion;
          if (this.orbitRing) {
            this.orbitRing.rotation += dt * 0.03 * motion;
            this.orbitRing.visible = detailed;
          }
          if (this.ring) this.ring.visible = detailed;
        }
        break;
      }
      default:
        this.starTick(twinkle, motion, detailed);
    }

    if (this.selection) {
      this.selection.rotation += dt * 0.35;
      this.selection.alpha = 0.45 + 0.3 * Math.sin(t * 2.4);
    }
  }

  private starTick(twinkle: number, motion: number, detailed: boolean) {
    const g = this.node.glow;
    const tw = motion > 0 ? twinkle : 1;
    if (this.core) this.core.alpha = 0.7 + 0.3 * tw;
    if (this.glow2) this.glow2.alpha = (0.35 + 0.2 * tw) * (0.6 + g * 0.6);
    if (this.glow) this.glow.alpha = (0.20 + 0.12 * tw) * (0.5 + g);
    if (this.flare) {
      this.flare.alpha = (0.08 + 0.10 * tw) * (0.4 + g);
      this.flare.visible = detailed;
      this.flare.rotation += 0.0004;
    }
  }

  destroy() {
    this.root.destroy({ children: true, texture: false });
  }
}
