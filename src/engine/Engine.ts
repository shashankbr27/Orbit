import { Camera } from './camera';
import { Loop } from './loop';
import { QualityManager, prefersReducedMotion, type QualitySettings, type QualityTier } from './quality';
import { CosmosRenderer } from './cosmos/CosmosRenderer';
import { ObjectRenderer } from './objects/ObjectRenderer';
import { LabelLayer } from './objects/LabelLayer';
import { GestureController, type GestureDelegate } from './input/GestureController';
import { EMPTY_SCENE, type Scene } from './scene';
import { resolveTheme, type ThemeRef, type ThemeSpec } from './theme';
import { clamp } from './math';

export interface EngineHandlers {
  onTap?(id: string | null, sx: number, sy: number): void;
  onDoubleTap?(id: string | null, sx: number, sy: number): void;
  onLongPress?(id: string | null, sx: number, sy: number): void;
  onContextMenu?(id: string | null, sx: number, sy: number): void;
  onHover?(id: string | null): void;
  /** Fired once when a drag/pinch begins — dismiss transient UI. */
  onGestureStart?(): void;
  /** Committed once, on release. */
  onObjectMoved?(id: string, x: number, y: number): void;
  onObjectGrab?(id: string): void;
  /** Whether this object may be dragged right now. */
  canDrag?(id: string): boolean;
  onStats?(stats: { fps: number; tier: QualityTier; nodes: number }): void;
}

export interface EngineMount {
  /** The element that receives all pointer input. */
  surface: HTMLElement;
  cosmosCanvas: HTMLCanvasElement;
  objectCanvas: HTMLCanvasElement;
  labelHost: HTMLElement;
}

/**
 * The engine ties the pieces together and owns the frame loop.
 *
 * React mounts it once, hands it scenes and themes, and receives events. It
 * never reads the engine during render, and the engine never sets React state
 * during a frame — the only bridge is `onStats`, throttled to twice a second.
 */
export class Engine {
  readonly camera = new Camera();
  readonly quality = new QualityManager();

  private cosmos: CosmosRenderer | null = null;
  private objects: ObjectRenderer | null = null;
  private labels: LabelLayer | null = null;
  private gestures: GestureController | null = null;
  private loop: Loop;

  private mountEls: EngineMount | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private motionPref = 1;
  private theme: ThemeSpec = resolveTheme(null);
  private scene: Scene = EMPTY_SCENE;
  private handlers: EngineHandlers = {};
  private focusIds = new Set<string>();
  private selectionIds = new Set<string>();

  private statsAt = 0;
  private dirty = true;
  private started = false;
  private fadeTarget = 1;
  private fadeRate = 1.6;

  constructor() {
    this.loop = new Loop(this.frame);
    this.quality.onChange(this.applyQuality);
  }

  // ── lifecycle ───────────────────────────────────────────────────────────

  async mount(els: EngineMount) {
    this.mountEls = els;
    const rect = els.surface.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const dpr = window.devicePixelRatio || 1;

    this.camera.resize(w, h, dpr);
    this.applyReducedMotion();

    this.cosmos = new CosmosRenderer(els.cosmosCanvas, this.quality.settings, this.theme);
    this.cosmos.resize(w, h, dpr);
    this.cosmos.fade = 0;

    this.objects = new ObjectRenderer(this.quality.settings);
    this.labels = new LabelLayer(els.labelHost, this.labelBudget());

    this.gestures = new GestureController(els.surface, this.camera, this.delegate);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(els.surface);
    window.addEventListener('orientationchange', this.handleResize);

    this.loop.start();
    this.started = true;

    // The object layer initialises asynchronously; the sky is already alive.
    try {
      await this.objects.init(els.objectCanvas, w, h, dpr);
      this.objects.setScene(this.scene);
      this.objects.setSelection(this.selectionIds);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[engine] object layer failed to start', err);
      }
    }
    this.dirty = true;
  }

  destroy() {
    this.started = false;
    this.loop.dispose();
    this.gestures?.dispose();
    this.resizeObserver?.disconnect();
    window.removeEventListener('orientationchange', this.handleResize);
    this.labels?.dispose();
    this.objects?.dispose();
    this.cosmos?.dispose();
    this.cosmos = null;
    this.objects = null;
    this.labels = null;
    this.gestures = null;
    this.mountEls = null;
  }

  private handleResize = () => {
    const els = this.mountEls;
    if (!els) return;
    const rect = els.surface.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const dpr = window.devicePixelRatio || 1;
    this.camera.resize(w, h, dpr);
    this.cosmos?.resize(w, h, dpr);
    this.objects?.resize(w, h, dpr);
    this.labels?.setMax(this.labelBudget());
    this.dirty = true;
  };

  private labelBudget() {
    const w = this.camera.width;
    if (w < 520) return 26;
    if (w < 900) return 36;
    return 52;
  }

  private applyQuality = (q: QualitySettings) => {
    this.cosmos?.setQuality(q);
    this.objects?.setQuality(q);
    this.dirty = true;
  };

  private applyReducedMotion() {
    const reduced = prefersReducedMotion();
    this.quality.reducedMotion = reduced;
    // Camera easing is usability, not decoration — it stays (a little tighter).
    this.camera.smoothness = reduced ? 0.55 : 1;
  }

  /** Effective animation multiplier: user preference × OS preference. */
  get motion() {
    return this.quality.reducedMotion ? 0 : this.motionPref;
  }

  setMotionPreference(v: number) {
    this.motionPref = clamp(v, 0, 1.5);
    this.dirty = true;
  }

  setQualityLock(tier: QualityTier | null) {
    this.quality.lock(tier);
  }

  // ── content ─────────────────────────────────────────────────────────────

  setHandlers(h: EngineHandlers) {
    this.handlers = h;
  }

  setScene(scene: Scene) {
    this.scene = scene;
    this.objects?.setScene(scene);
    this.dirty = true;
  }

  setTheme(ref: ThemeRef | ThemeSpec, seed = 0) {
    this.theme = 'bgInner' in ref ? (ref as ThemeSpec) : resolveTheme(ref as ThemeRef);
    this.cosmos?.setTheme(this.theme);
    this.cosmos?.setSeed(seed);
    this.dirty = true;
  }

  get themeSpec() {
    return this.theme;
  }

  setSelection(ids: Iterable<string>) {
    this.selectionIds = new Set(ids);
    this.objects?.setSelection(this.selectionIds);
    this.dirty = true;
  }

  /** Nodes that must always show a label (hover, search hit, selection). */
  setFocus(ids: Iterable<string>) {
    this.focusIds = new Set(ids);
    this.dirty = true;
  }

  setPendingLink(link: { fromId: string; x: number; y: number } | null) {
    if (this.objects) this.objects.pendingLink = link;
    this.dirty = true;
  }

  setObjectsInteractive(on: boolean) {
    if (this.gestures) this.gestures.objectsInteractive = on;
  }

  setInputEnabled(on: boolean) {
    if (this.gestures) this.gestures.enabled = on;
  }

  /**
   * Fade the entire scene — sky, bodies and labels together.
   *
   * Used for the dive into a universe: the world dims as the camera rushes in,
   * then lifts again on the other side, which is what makes the cut invisible.
   */
  fadeTo(target: number, rate = 1.6) {
    this.fadeTarget = clamp(target, 0, 1);
    this.fadeRate = rate;
    this.dirty = true;
  }

  /** Jump the fade with no ramp. */
  setFade(v: number) {
    const f = clamp(v, 0, 1);
    this.fadeTarget = f;
    if (this.cosmos) this.cosmos.fade = f;
    this.applyFade(f);
    this.dirty = true;
  }

  private applyFade(f: number) {
    this.objects?.setAlpha(f);
    const host = this.mountEls?.labelHost;
    if (host) host.style.opacity = f < 0.999 ? f.toFixed(3) : '';
  }

  // ── camera helpers ──────────────────────────────────────────────────────

  /**
   * Zoom at which `worldSpan` world units fill the *shorter* screen axis.
   *
   * Fixed zoom numbers do not survive contact with real devices: 0.22 frames
   * the multiverse nicely on a phone and leaves a laptop staring at six specks.
   * Everything that picks a zoom goes through here instead.
   */
  zoomForSpan(worldSpan: number, min = 0.08, max = 1.2) {
    const shorter = Math.min(this.camera.width, this.camera.height);
    return clamp(shorter / Math.max(1, worldSpan), min, max);
  }

  /** How the multiverse should sit on arrival: all of it, comfortably. */
  get multiverseZoom() {
    return this.zoomForSpan(2100, 0.14, 0.5);
  }

  /** How a universe's contents should sit when you land in one. */
  get universeZoom() {
    return this.zoomForSpan(1700, 0.18, 0.9);
  }

  screenToWorld(sx: number, sy: number) {
    return { x: this.camera.screenToWorldX(sx), y: this.camera.screenToWorldY(sy) };
  }

  /** Centre of the viewport in world space — where new objects land. */
  viewCentre() {
    return { x: this.camera.x, y: this.camera.y };
  }

  flyToNode(id: string, zoom?: number, duration = 1.2, onDone?: () => void) {
    const pos = this.objects?.nodePosition(id);
    if (!pos) return;
    this.camera.flyTo(pos.x, pos.y, zoom ?? this.camera.zoom, { duration, onDone });
  }

  flyTo(x: number, y: number, zoom: number, duration = 1.2, onDone?: () => void) {
    this.camera.flyTo(x, y, zoom, { duration, onDone });
  }

  /** Frame a set of nodes (or the whole scene) with padding. */
  fit(ids?: string[], padding = 0.72, duration = 1.1) {
    const nodes = this.scene.nodes.filter((n) => !ids || ids.includes(n.id));
    if (!nodes.length) {
      this.camera.flyTo(0, 0, 0.8, { duration });
      return;
    }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const n of nodes) {
      x0 = Math.min(x0, n.x - n.radius * 1.15);
      y0 = Math.min(y0, n.y - n.radius * 1.15);
      x1 = Math.max(x1, n.x + n.radius * 1.15);
      y1 = Math.max(y1, n.y + n.radius * 1.15);
    }
    const w = Math.max(1, x1 - x0);
    const h = Math.max(1, y1 - y0);
    const zoom = clamp(
      Math.min((this.camera.width * padding) / w, (this.camera.height * padding) / h),
      this.camera.minZoom,
      1.4,
    );
    this.camera.flyTo((x0 + x1) / 2, (y0 + y1) / 2, zoom, { duration });
  }

  /**
   * Cinematic entry: open close on one body, then pull back as the sky fades
   * up, so the first thing you see is a star and the second is a neighbourhood.
   */
  playIntro(x: number, y: number, zoom: number, duration = 3.4, from = 2.4) {
    this.camera.set(x, y, clamp(zoom * from, this.camera.minZoom, this.camera.maxZoom));
    this.camera.flyTo(x, y, zoom, { duration, arc: false });
    this.setFade(0);
    this.fadeTo(1, 0.5);
  }

  // ── gestures ────────────────────────────────────────────────────────────

  private dragOrigin: { x: number; y: number } | null = null;

  private delegate: GestureDelegate = {
    hitTest: (sx, sy) => this.objects?.hitTest(sx, sy, this.camera) ?? null,
    canDrag: (id) => this.handlers.canDrag?.(id) ?? true,
    onObjectGrab: (id) => {
      this.objects?.setDragging(id);
      const p = this.objects?.nodeById(id);
      this.dragOrigin = p ? { x: p.x, y: p.y } : null;
      this.handlers.onObjectGrab?.(id);
    },
    onObjectDrag: (id, _sx, _sy, dxWorld, dyWorld) => {
      this.objects?.moveNode(id, dxWorld, dyWorld);
      this.dirty = true;
    },
    onObjectRelease: (id, sx, sy, moved) => {
      this.objects?.setDragging(null);
      const n = this.objects?.nodeById(id);
      if (moved && n) {
        this.handlers.onObjectMoved?.(id, n.x, n.y);
      } else if (!moved) {
        this.handlers.onTap?.(id, sx, sy);
      }
      this.dragOrigin = null;
    },
    onTap: (id, sx, sy) => this.handlers.onTap?.(id, sx, sy),
    onDoubleTap: (id, sx, sy) => this.handlers.onDoubleTap?.(id, sx, sy),
    onLongPress: (id, sx, sy) => this.handlers.onLongPress?.(id, sx, sy),
    onContextMenu: (id, sx, sy) => this.handlers.onContextMenu?.(id, sx, sy),
    onHover: (id) => this.handlers.onHover?.(id),
    onGestureStart: () => this.handlers.onGestureStart?.(),
  };

  /** Undo a drag that the app rejected. */
  restoreDrag(id: string) {
    if (this.dragOrigin) this.objects?.setNodePosition(id, this.dragOrigin.x, this.dragOrigin.y);
  }

  // ── frame ───────────────────────────────────────────────────────────────

  private frame = (dt: number, time: number, frameMs: number) => {
    if (!this.started) return;
    const cam = this.camera;
    this.gestures?.updateKeyboard(dt);
    const moved = cam.update(dt);
    const motion = this.motion;

    // Ramp the global fade toward its target.
    if (this.cosmos) {
      const f = this.cosmos.fade;
      const gap = this.fadeTarget - f;
      if (Math.abs(gap) > 0.001) {
        const step = Math.min(Math.abs(gap), this.fadeRate * dt);
        const next = f + Math.sign(gap) * step;
        this.cosmos.fade = next;
        this.applyFade(next);
        this.dirty = true;
      }
    }

    // Fully static sky + settled camera + nothing changed → skip the frame.
    const canIdle = motion === 0 && !moved && cam.isSettled && !this.dirty;
    if (!canIdle) {
      this.cosmos?.render(cam, time, motion);
      this.objects?.render(cam, time, dt, motion);
      if (this.labels && this.objects) {
        const objects = this.objects;
        this.labels.setAccent(this.scene.accent);
        this.labels.update(this.scene, cam, (id) => objects.nodePosition(id), this.focusIds);
      }
      this.dirty = false;
    }

    this.quality.sample(frameMs, performance.now());

    const now = performance.now();
    if (this.handlers.onStats && now - this.statsAt > 500) {
      this.statsAt = now;
      this.handlers.onStats({
        fps: Math.round(this.loop.fps),
        tier: this.quality.settings.tier,
        nodes: this.scene.nodes.length,
      });
    }
  };

  /** Force a redraw next frame (after a theme or selection change). */
  invalidate() {
    this.dirty = true;
  }
}
