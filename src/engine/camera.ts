import { clamp, damp, easeInOutQuint } from './math';

export interface CameraSnapshot {
  x: number;
  y: number;
  zoom: number;
}

interface FlightPlan {
  fromX: number;
  fromY: number;
  fromZoom: number;
  toX: number;
  toY: number;
  toZoom: number;
  /** Mid-flight zoom dip, for the "pull back, travel, dive in" feeling. */
  dip: number;
  t: number;
  duration: number;
  onDone?: () => void;
}

/**
 * The camera is the single source of truth for the view transform.
 *
 * It is deliberately NOT React state: gestures mutate it, the render loop reads
 * it. Nothing here ever triggers a re-render.
 *
 * Model:
 *   world -> screen:  s = (w - cam) * zoom + viewport/2
 *   screen -> world:  w = (s - viewport/2) / zoom + cam
 *
 * `x/y/zoom` are the *rendered* values; `tx/ty/tzoom` are where input wants to
 * be. Rendered values chase targets with frame-rate independent exponential
 * smoothing, which is what gives panning its weight.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  tx = 0;
  ty = 0;
  tzoom = 1;

  /** Inertial velocity in world units / second. */
  vx = 0;
  vy = 0;

  width = 1;
  height = 1;
  dpr = 1;

  minZoom = 0.06;
  maxZoom = 6;

  /** Soft world radius. Beyond it the camera rubber-bands back. */
  boundRadius = 26000;

  /** 0..1 - set to 0 for prefers-reduced-motion (instant, no glide). */
  smoothness = 1;

  private panSmoothing = 0.0006;
  private zoomSmoothing = 0.0009;
  private friction = 0.0022;

  private flight: FlightPlan | null = null;
  private dragging = false;

  /** Bumped whenever the transform actually changed, so layers can skip work. */
  revision = 0;

  resize(width: number, height: number, dpr: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = dpr;
    this.revision++;
  }

  set(x: number, y: number, zoom: number) {
    this.x = this.tx = x;
    this.y = this.ty = y;
    this.zoom = this.tzoom = clamp(zoom, this.minZoom, this.maxZoom);
    this.vx = this.vy = 0;
    this.flight = null;
    this.revision++;
  }

  snapshot(): CameraSnapshot {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }

  screenToWorldX(sx: number) {
    return (sx - this.width / 2) / this.zoom + this.x;
  }
  screenToWorldY(sy: number) {
    return (sy - this.height / 2) / this.zoom + this.y;
  }
  worldToScreenX(wx: number) {
    return (wx - this.x) * this.zoom + this.width / 2;
  }
  worldToScreenY(wy: number) {
    return (wy - this.y) * this.zoom + this.height / 2;
  }

  /** Visible world rect, padded by `pad` screen pixels. */
  visibleWorld(pad = 0) {
    const hw = (this.width / 2 + pad) / this.zoom;
    const hh = (this.height / 2 + pad) / this.zoom;
    return { x0: this.x - hw, y0: this.y - hh, x1: this.x + hw, y1: this.y + hh };
  }

  // -- input ---------------------------------------------------------------

  beginDrag() {
    this.dragging = true;
    this.flight = null;
    this.vx = 0;
    this.vy = 0;
  }

  /** Move by a screen-space delta (as produced by a pointer drag). */
  panByScreen(dxScreen: number, dyScreen: number) {
    this.flight = null;
    this.tx -= dxScreen / this.tzoom;
    this.ty -= dyScreen / this.tzoom;
  }

  /** Release a drag with a screen-space velocity (px/s) -> inertial glide. */
  endDrag(vxScreen: number, vyScreen: number) {
    this.dragging = false;
    if (this.smoothness <= 0) return;
    this.vx = (-vxScreen / this.tzoom) * this.smoothness;
    this.vy = (-vyScreen / this.tzoom) * this.smoothness;
  }

  /** Zoom by `factor` while keeping the world point under (sx,sy) anchored. */
  zoomAt(sx: number, sy: number, factor: number) {
    this.flight = null;
    const before = this.tzoom;
    const next = clamp(before * factor, this.minZoom, this.maxZoom);
    if (next === before) return;
    // World point currently under the focal screen point (using targets, so
    // repeated calls during a pinch stay consistent).
    const wx = (sx - this.width / 2) / before + this.tx;
    const wy = (sy - this.height / 2) / before + this.ty;
    this.tzoom = next;
    this.tx = wx - (sx - this.width / 2) / next;
    this.ty = wy - (sy - this.height / 2) / next;
  }

  nudge(dxScreen: number, dyScreen: number) {
    this.flight = null;
    this.tx += dxScreen / this.tzoom;
    this.ty += dyScreen / this.tzoom;
  }

  // -- cinematic transitions -----------------------------------------------

  /**
   * Scripted flight. For long journeys the zoom dips first (pull back), then
   * dives into the destination - the Van Wijk "smooth and efficient zooming
   * and panning" idea, simplified.
   */
  flyTo(
    x: number,
    y: number,
    zoom: number,
    opts: { duration?: number; onDone?: () => void; arc?: boolean } = {},
  ) {
    const targetZoom = clamp(zoom, this.minZoom, this.maxZoom);
    if (this.smoothness <= 0 || (opts.duration ?? 1) <= 0) {
      this.set(x, y, targetZoom);
      opts.onDone?.();
      return;
    }
    const travel = Math.hypot(x - this.x, y - this.y) * Math.min(this.zoom, targetZoom);
    const screenSpan = Math.max(this.width, this.height);
    const arc = opts.arc === false ? 0 : clamp(travel / (screenSpan * 3), 0, 1);
    this.flight = {
      fromX: this.x,
      fromY: this.y,
      fromZoom: this.zoom,
      toX: x,
      toY: y,
      toZoom: targetZoom,
      dip: 1 - arc * 0.55,
      t: 0,
      duration: opts.duration ?? 1.15,
      onDone: opts.onDone,
    };
    this.vx = this.vy = 0;
  }

  get isFlying() {
    return this.flight !== null;
  }

  cancelFlight() {
    this.flight = null;
  }

  // -- frame update --------------------------------------------------------

  update(dt: number) {
    const prevX = this.x;
    const prevY = this.y;
    const prevZoom = this.zoom;

    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.duration);
      const e = easeInOutQuint(f.t);
      this.x = this.tx = f.fromX + (f.toX - f.fromX) * e;
      this.y = this.ty = f.fromY + (f.toY - f.fromY) * e;
      // Geometric zoom interpolation with a mid-flight dip.
      const lz = Math.log(f.fromZoom) + (Math.log(f.toZoom) - Math.log(f.fromZoom)) * e;
      const dipCurve = Math.sin(Math.PI * f.t); // 0 -> 1 -> 0
      this.zoom = this.tzoom = Math.exp(lz) * (1 - (1 - f.dip) * dipCurve);
      if (f.t >= 1) {
        this.zoom = this.tzoom = f.toZoom;
        const done = f.onDone;
        this.flight = null;
        done?.();
      }
    } else {
      // Inertia
      if (!this.dragging && (this.vx !== 0 || this.vy !== 0)) {
        this.tx += this.vx * dt;
        this.ty += this.vy * dt;
        const decay = Math.pow(this.friction, dt);
        this.vx *= decay;
        this.vy *= decay;
        if (Math.abs(this.vx) * this.tzoom < 2 && Math.abs(this.vy) * this.tzoom < 2) {
          this.vx = this.vy = 0;
        }
      }

      // Rubber-band back inside the soft world bounds.
      const r = Math.hypot(this.tx, this.ty);
      if (r > this.boundRadius) {
        const pull = Math.pow(0.02, dt);
        const k = this.boundRadius / r;
        const ax = this.tx * k;
        const ay = this.ty * k;
        this.tx = ax + (this.tx - ax) * pull;
        this.ty = ay + (this.ty - ay) * pull;
        this.vx *= pull;
        this.vy *= pull;
      }

      this.tzoom = clamp(this.tzoom, this.minZoom, this.maxZoom);

      if (this.smoothness <= 0) {
        this.x = this.tx;
        this.y = this.ty;
        this.zoom = this.tzoom;
      } else {
        const ps = Math.pow(this.panSmoothing, 1 / Math.max(0.15, this.smoothness));
        const zs = Math.pow(this.zoomSmoothing, 1 / Math.max(0.15, this.smoothness));
        this.x = damp(this.x, this.tx, ps, dt);
        this.y = damp(this.y, this.ty, ps, dt);
        // Smooth zoom in log space so it feels linear to the hand.
        const lz = damp(Math.log(this.zoom), Math.log(this.tzoom), zs, dt);
        this.zoom = Math.exp(lz);
        // Snap out sub-pixel residuals so the loop can go fully idle.
        if (Math.abs(this.x - this.tx) * this.zoom < 0.05) this.x = this.tx;
        if (Math.abs(this.y - this.ty) * this.zoom < 0.05) this.y = this.ty;
        if (Math.abs(this.zoom / this.tzoom - 1) < 0.0005) this.zoom = this.tzoom;
      }
    }

    const moved = this.x !== prevX || this.y !== prevY || this.zoom !== prevZoom;
    if (moved) this.revision++;
    return moved;
  }

  /** True when nothing is in motion. */
  get isSettled() {
    return (
      !this.flight &&
      !this.dragging &&
      this.vx === 0 &&
      this.vy === 0 &&
      this.x === this.tx &&
      this.y === this.ty &&
      this.zoom === this.tzoom
    );
  }
}
