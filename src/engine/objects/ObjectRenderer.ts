import { Application, Container, Graphics } from 'pixi.js';
import type { Camera } from '../camera';
import type { QualitySettings } from '../quality';
import type { Scene, SceneNode } from '../scene';
import { hexToInt } from '../math';
import { getTextures, type TextureSet } from './textures';
import { NodeView } from './NodeView';
import { mediaCache } from './mediaCache';

/** Finger-friendly floor for tap targets, in screen pixels. */
const MIN_HIT_PX = 22;

/**
 * The object layer: every celestial body, plus the constellation lines.
 *
 * Kept strictly separate from React. `setScene()` is the only way data gets in,
 * and it diffs by id so a 60fps drag never rebuilds a sprite.
 */
export class ObjectRenderer {
  private app: Application | null = null;
  private tx: TextureSet | null = null;
  private world = new Container();
  private links = new Graphics();
  private bodies = new Container();
  private views = new Map<string, NodeView>();
  private scene: Scene = { nodes: [], links: [], accent: '#8fb4ff', version: -1 };
  private accentInt = 0x8fb4ff;
  private selection = new Set<string>();
  private quality: QualitySettings;
  private linkRedrawFrame = 0;
  private lastLinkZoom = 0;
  private ready = false;

  /** A link being dragged out in connect mode: world-space endpoints. */
  pendingLink: { fromId: string; x: number; y: number } | null = null;

  constructor(quality: QualitySettings) {
    this.quality = quality;
    this.bodies.sortableChildren = true;
    this.world.addChild(this.links);
    this.world.addChild(this.bodies);
  }

  async init(canvas: HTMLCanvasElement, width: number, height: number, dpr: number) {
    const app = new Application();
    await app.init({
      canvas,
      width,
      height,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(dpr, this.quality.maxDpr),
      autoDensity: true,
      autoStart: false,
      preference: 'webgl',
      powerPreference: 'high-performance',
      clearBeforeRender: true,
    });
    app.ticker.stop();
    app.stage.addChild(this.world);
    this.app = app;
    this.tx = getTextures();
    this.ready = true;
    // Anything set before init lands now.
    this.rebuildAll();
  }

  get isReady() {
    return this.ready;
  }

  setQuality(q: QualitySettings) {
    const glowChanged = q.objectGlow !== this.quality.objectGlow;
    this.quality = q;
    if (this.app) {
      const res = Math.min(window.devicePixelRatio || 1, q.maxDpr);
      if (Math.abs(this.app.renderer.resolution - res) > 0.01) {
        this.app.renderer.resolution = res;
        this.app.renderer.resize(this.app.renderer.width, this.app.renderer.height);
      }
    }
    if (glowChanged) this.rebuildAll();
  }

  resize(width: number, height: number, dpr: number) {
    if (!this.app) return;
    const res = Math.min(dpr, this.quality.maxDpr);
    this.app.renderer.resolution = res;
    this.app.renderer.resize(width, height);
  }

  setScene(scene: Scene) {
    const prev = this.scene;
    this.scene = scene;
    this.accentInt = hexToInt(scene.accent);
    if (!this.ready || !this.tx) return;

    const seen = new Set<string>();
    for (const n of scene.nodes) {
      seen.add(n.id);
      const existing = this.views.get(n.id);
      if (!existing) {
        this.addView(n);
      } else if (existing.node.kind !== n.kind || existing.node.variant !== n.variant) {
        this.removeView(n.id);
        this.addView(n);
      } else {
        existing.sync(n);
      }
    }
    for (const id of [...this.views.keys()]) {
      if (!seen.has(id)) this.removeView(id);
    }
    if (prev.version !== scene.version) this.linkRedrawFrame = 0;
  }

  private addView(n: SceneNode) {
    if (!this.tx) return;
    const view = new NodeView(n, this.tx, this.quality.objectGlow);
    this.views.set(n.id, view);
    this.bodies.addChild(view.root);
    if (this.selection.has(n.id)) view.setSelected(true, this.accentInt);
    if (n.mediaId) this.attachMedia(view, n.mediaId);
  }

  private attachMedia(view: NodeView, mediaId: string) {
    const cache = mediaCache();
    const hit = cache.peek(mediaId);
    if (hit) {
      view.setTexture(hit);
      return;
    }
    void cache.texture(mediaId).then((tex) => {
      // The view may have been recycled while the blob decoded.
      if (tex && this.views.get(view.node.id) === view) view.setTexture(tex);
    });
  }

  private removeView(id: string) {
    const v = this.views.get(id);
    if (!v) return;
    this.bodies.removeChild(v.root);
    v.destroy();
    this.views.delete(id);
  }

  private rebuildAll() {
    for (const id of [...this.views.keys()]) this.removeView(id);
    const scene = this.scene;
    this.scene = { ...scene, version: -1 };
    this.setScene(scene);
  }

  /** Global alpha for the whole object layer (used by scene transitions). */
  setAlpha(a: number) {
    if (this.app) this.app.stage.alpha = a;
  }

  setSelection(ids: Iterable<string>) {
    const next = new Set(ids);
    for (const id of this.selection) {
      if (!next.has(id)) this.views.get(id)?.setSelected(false, this.accentInt);
    }
    for (const id of next) {
      if (!this.selection.has(id)) this.views.get(id)?.setSelected(true, this.accentInt);
    }
    this.selection = next;
  }

  /** World position of a node including its current drift. */
  nodePosition(id: string): { x: number; y: number } | null {
    const v = this.views.get(id);
    if (!v) return null;
    return { x: v.node.x + v.driftX, y: v.node.y + v.driftY };
  }

  nodeById(id: string): SceneNode | null {
    return this.views.get(id)?.node ?? null;
  }

  /**
   * Move a node during a drag.
   *
   * This writes straight to the scene node so the frame that follows the
   * pointer is already correct — the store is told once, on release. Dragging
   * at 60fps therefore costs zero React renders and zero IndexedDB writes.
   */
  moveNode(id: string, dxWorld: number, dyWorld: number): { x: number; y: number } | null {
    const v = this.views.get(id);
    if (!v) return null;
    v.node.x += dxWorld;
    v.node.y += dyWorld;
    return { x: v.node.x, y: v.node.y };
  }

  setNodePosition(id: string, x: number, y: number) {
    const v = this.views.get(id);
    if (!v) return;
    v.node.x = x;
    v.node.y = y;
  }

  /** Lift a node above everything while it is being dragged. */
  setDragging(id: string | null) {
    for (const [key, v] of this.views) {
      const lifted = key === id;
      const base = v.root.zIndex % 100000;
      v.root.zIndex = lifted ? 900000 + base : base;
    }
  }

  // ── frame ───────────────────────────────────────────────────────────────

  render(camera: Camera, time: number, dt: number, motion: number) {
    const app = this.app;
    if (!app) return;

    const zoom = camera.zoom;
    this.world.scale.set(zoom);
    this.world.position.set(
      -camera.x * zoom + camera.width / 2,
      -camera.y * zoom + camera.height / 2,
    );

    // Cull generously: glows extend well past a node's radius.
    const view = camera.visibleWorld(240 / Math.max(0.05, zoom));
    let animated = 0;
    const budget = this.quality.maxAnimatedObjects;

    for (const v of this.views.values()) {
      const n = v.node;
      const pad = n.radius * 4;
      const onScreen =
        n.x + pad > view.x0 && n.x - pad < view.x1 && n.y + pad > view.y0 && n.y - pad < view.y1;
      const tooSmall = n.radius * zoom < 0.9;
      const visible = onScreen && !tooSmall && n.emphasis > 0.02;
      v.root.visible = visible;
      if (!visible) continue;
      if (animated < budget) {
        v.update(time, dt, zoom, motion);
        animated++;
      } else {
        // Past the budget: keep it on screen, just stop animating it.
        v.root.x = n.x;
        v.root.y = n.y;
      }
    }

    this.drawLinks(time, zoom, motion);
    app.renderer.render(app.stage);
  }

  private drawLinks(time: number, zoom: number, motion: number) {
    const list = this.scene.links;
    if (!list.length && !this.pendingLink) {
      if (this.linkRedrawFrame !== -1) {
        this.links.clear();
        this.linkRedrawFrame = -1;
      }
      return;
    }

    // Redraw when geometry could have changed: zoom step, or every few frames
    // for the pulse. Line width is in world units, hence the zoom dependency.
    const zoomShift = Math.abs(zoom / (this.lastLinkZoom || zoom) - 1) > 0.02;
    const heavy = list.length > 260;
    const cadence = heavy ? 4 : 2;
    this.linkRedrawFrame++;
    if (!zoomShift && !this.pendingLink && this.linkRedrawFrame % cadence !== 0) return;
    this.lastLinkZoom = zoom;

    const g = this.links;
    g.clear();
    const w = 1.35 / zoom;

    for (const link of list) {
      const a = this.views.get(link.a);
      const b = this.views.get(link.b);
      if (!a || !b) continue;
      const ax = a.node.x + a.driftX;
      const ay = a.node.y + a.driftY;
      const bx = b.node.x + b.driftX;
      const by = b.node.y + b.driftY;

      // Each line breathes on its own clock.
      const ph = (a.node.seed + b.node.seed) * 6.283;
      const pulse = 0.55 + 0.45 * Math.sin(time * 0.55 + ph) * (motion > 0 ? 1 : 0);
      const alpha = (0.14 + 0.16 * pulse) * link.strength;

      // Bow the line slightly so constellations feel drawn, not computed.
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const bow = Math.min(len * 0.06, 90) * (a.node.seed - 0.5) * 2;
      const cx = mx - (dy / len) * bow;
      const cy = my + (dx / len) * bow;

      g.moveTo(ax, ay);
      g.quadraticCurveTo(cx, cy, bx, by);
      g.stroke({ width: w, color: hexToInt(link.color), alpha, cap: 'round' });
    }

    if (this.pendingLink) {
      const from = this.views.get(this.pendingLink.fromId);
      if (from) {
        g.moveTo(from.node.x + from.driftX, from.node.y + from.driftY);
        g.lineTo(this.pendingLink.x, this.pendingLink.y);
        g.stroke({
          width: w * 1.1,
          color: this.accentInt,
          alpha: 0.55,
          cap: 'round',
        });
      }
    }
  }

  // ── picking ─────────────────────────────────────────────────────────────

  /**
   * Front-most node under a screen point, or null.
   * Tap targets are expanded to a finger-friendly minimum so tiny distant
   * stars stay selectable without zooming in.
   */
  hitTest(sx: number, sy: number, camera: Camera): string | null {
    const zoom = camera.zoom;
    const wx = camera.screenToWorldX(sx);
    const wy = camera.screenToWorldY(sy);

    let best: string | null = null;
    let bestLayer = -Infinity;
    let bestDist = Infinity;

    for (const v of this.views.values()) {
      if (!v.root.visible) continue;
      const n = v.node;
      const cxw = n.x + v.driftX;
      const cyw = n.y + v.driftY;
      const layer = v.root.zIndex;

      let inside = false;
      let dist = 0;

      if (n.kind === 'photo' || n.kind === 'artwork' || n.kind === 'note') {
        const halfW = n.radius;
        const halfH = n.radius / (v.aspect || 1);
        const cos = Math.cos(-v.root.rotation);
        const sin = Math.sin(-v.root.rotation);
        const dxw = wx - cxw;
        const dyw = wy - cyw;
        const lx = dxw * cos - dyw * sin;
        const ly = dxw * sin + dyw * cos;
        const growW = Math.max(0, MIN_HIT_PX / zoom - halfW) + 4 / zoom;
        const growH = Math.max(0, MIN_HIT_PX / zoom - halfH) + 4 / zoom;
        inside = Math.abs(lx) <= halfW + growW && Math.abs(ly) <= halfH + growH;
        dist = Math.max(Math.abs(lx) / (halfW + growW), Math.abs(ly) / (halfH + growH));
      } else {
        const r = Math.max(n.radius * 1.05, MIN_HIT_PX / zoom);
        const d = Math.hypot(wx - cxw, wy - cyw);
        inside = d <= r;
        dist = d / r;
      }

      if (!inside) continue;
      // Prefer the front-most layer; within a layer prefer the closer centre.
      if (layer > bestLayer || (layer === bestLayer && dist < bestDist)) {
        best = n.id;
        bestLayer = layer;
        bestDist = dist;
      }
    }
    return best;
  }

  dispose() {
    for (const id of [...this.views.keys()]) this.removeView(id);
    if (this.app) {
      // Destroying the app takes the stage — and therefore world, links and
      // bodies — with it. Shared textures are explicitly spared.
      this.app.destroy(false, { children: true, texture: false });
      this.app = null;
    } else {
      // init() never completed: tear the containers down by hand.
      this.links.destroy();
      this.bodies.destroy();
      this.world.destroy();
    }
    this.ready = false;
  }
}
