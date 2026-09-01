import type { Camera } from '../camera';

export interface GestureDelegate {
  /** Object id under the given screen point, or null for empty space. */
  hitTest(sx: number, sy: number): string | null;
  /** Whether a hit object may be dragged right now (e.g. not locked). */
  canDrag(id: string): boolean;

  onObjectGrab(id: string, sx: number, sy: number): void;
  onObjectDrag(id: string, sx: number, sy: number, dxWorld: number, dyWorld: number): void;
  onObjectRelease(id: string, sx: number, sy: number, moved: boolean): void;

  onTap(id: string | null, sx: number, sy: number): void;
  onDoubleTap(id: string | null, sx: number, sy: number): void;
  onLongPress(id: string | null, sx: number, sy: number): void;
  onContextMenu(id: string | null, sx: number, sy: number): void;

  onHover?(id: string | null, sx: number, sy: number): void;
  /** Fired once when any camera/object gesture begins - used to dismiss UI. */
  onGestureStart?(): void;
}

interface PointerState {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
  moved: boolean;
}

const TAP_SLOP = 8; // px of movement still considered a tap
const DRAG_SLOP = 6; // px before a drag actually starts
const LONG_PRESS_MS = 480;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 32;
const VELOCITY_WINDOW_MS = 90;

/**
 * One controller for every input device.
 *
 * Design notes:
 *  - The camera is mutated directly; nothing here touches React state, so a
 *    60fps drag costs zero renders.
 *  - Pointer Events unify mouse/touch/pen. `touch-action: none` on the surface
 *    is what stops Safari from scrolling or double-tap zooming underneath us.
 *  - Velocity is measured over a short trailing window rather than the last
 *    frame, which makes flicks feel deliberate instead of twitchy.
 */
export class GestureController {
  private el: HTMLElement;
  private camera: Camera;
  private delegate: GestureDelegate;

  private pointers = new Map<number, PointerState>();
  private samples: { t: number; x: number; y: number }[] = [];

  private mode: 'idle' | 'camera' | 'object' | 'pinch' = 'idle';
  private draggingId: string | null = null;
  private objectMoved = false;

  private lastX = 0;
  private lastY = 0;
  private pinchDist = 0;
  private pinchCx = 0;
  private pinchCy = 0;

  private longPressTimer: number | null = null;
  private lastTapTime = 0;
  private lastTapX = 0;
  private lastTapY = 0;

  private spaceHeld = false;
  private keys = new Set<string>();

  enabled = true;
  /** When false, only camera gestures are produced (used during transitions). */
  objectsInteractive = true;

  constructor(el: HTMLElement, camera: Camera, delegate: GestureDelegate) {
    this.el = el;
    this.camera = camera;
    this.delegate = delegate;

    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', this.onContextMenu);
    // Safari-only pinch events: swallow them so the page never zooms.
    el.addEventListener('gesturestart', this.preventNative as EventListener);
    el.addEventListener('gesturechange', this.preventNative as EventListener);
    el.addEventListener('gestureend', this.preventNative as EventListener);
    el.addEventListener('dblclick', this.preventNative as EventListener);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  dispose() {
    const el = this.el;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('contextmenu', this.onContextMenu);
    el.removeEventListener('gesturestart', this.preventNative as EventListener);
    el.removeEventListener('gesturechange', this.preventNative as EventListener);
    el.removeEventListener('gestureend', this.preventNative as EventListener);
    el.removeEventListener('dblclick', this.preventNative as EventListener);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.clearLongPress();
  }

  private preventNative = (e: Event) => e.preventDefault();

  private local(e: PointerEvent | WheelEvent | MouseEvent) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private clearLongPress() {
    if (this.longPressTimer !== null) {
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private pushSample(x: number, y: number) {
    const t = performance.now();
    this.samples.push({ t, x, y });
    while (this.samples.length > 2 && t - this.samples[0].t > VELOCITY_WINDOW_MS * 2) {
      this.samples.shift();
    }
  }

  private velocity() {
    const s = this.samples;
    if (s.length < 2) return { vx: 0, vy: 0 };
    const last = s[s.length - 1];
    let first = s[0];
    for (let i = s.length - 1; i >= 0; i--) {
      if (last.t - s[i].t > VELOCITY_WINDOW_MS) break;
      first = s[i];
    }
    const dt = (last.t - first.t) / 1000;
    if (dt <= 0.008) return { vx: 0, vy: 0 };
    // Cap so a jittery sample cannot launch the camera into deep space.
    const cap = 6000;
    return {
      vx: Math.max(-cap, Math.min(cap, (last.x - first.x) / dt)),
      vy: Math.max(-cap, Math.min(cap, (last.y - first.y) / dt)),
    };
  }

  // ── pointer ─────────────────────────────────────────────────────────────

  private onPointerDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;

    const { x, y } = this.local(e);
    this.el.setPointerCapture?.(e.pointerId);
    e.preventDefault();

    this.pointers.set(e.pointerId, {
      id: e.pointerId,
      x,
      y,
      startX: x,
      startY: y,
      startTime: performance.now(),
      moved: false,
    });

    if (this.pointers.size === 1) {
      this.samples.length = 0;
      this.pushSample(x, y);
      this.lastX = x;
      this.lastY = y;
      this.mode = 'idle';

      const hit =
        this.objectsInteractive && !this.spaceHeld && e.button !== 1
          ? this.delegate.hitTest(x, y)
          : null;

      // Middle-click or space always means "pan the camera".
      this.draggingId = hit && this.delegate.canDrag(hit) ? hit : null;

      this.clearLongPress();
      this.longPressTimer = window.setTimeout(() => {
        this.longPressTimer = null;
        const p = this.pointers.get(e.pointerId);
        if (!p || p.moved || this.pointers.size !== 1) return;
        // A long press cancels any pending drag and opens the object menu.
        this.mode = 'idle';
        this.draggingId = null;
        this.delegate.onLongPress(hit, x, y);
      }, LONG_PRESS_MS);
    } else if (this.pointers.size === 2) {
      this.clearLongPress();
      this.beginPinch();
    }
  };

  private beginPinch() {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;
    // A pinch supersedes whatever the first finger was doing.
    if (this.mode === 'object' && this.draggingId) {
      this.delegate.onObjectRelease(this.draggingId, a.x, a.y, this.objectMoved);
      this.draggingId = null;
    }
    this.mode = 'pinch';
    this.pinchDist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    this.pinchCx = (a.x + b.x) / 2;
    this.pinchCy = (a.y + b.y) / 2;
    this.camera.beginDrag();
    this.samples.length = 0;
    this.pushSample(this.pinchCx, this.pinchCy);
    this.delegate.onGestureStart?.();
  }

  private onPointerMove = (e: PointerEvent) => {
    if (!this.enabled) return;
    const p = this.pointers.get(e.pointerId);
    const { x, y } = this.local(e);

    if (!p) {
      if (e.pointerType === 'mouse' && this.mode === 'idle') {
        this.delegate.onHover?.(this.delegate.hitTest(x, y), x, y);
      }
      return;
    }

    e.preventDefault();
    const prevX = p.x;
    const prevY = p.y;
    p.x = x;
    p.y = y;
    if (!p.moved && Math.hypot(x - p.startX, y - p.startY) > TAP_SLOP) {
      p.moved = true;
      this.clearLongPress();
    }

    if (this.mode === 'pinch') {
      const [a, b] = [...this.pointers.values()];
      if (!a || !b) return;
      const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      // Two-finger pan, then zoom about the moving centroid.
      this.camera.panByScreen(cx - this.pinchCx, cy - this.pinchCy);
      this.camera.zoomAt(cx, cy, dist / this.pinchDist);
      this.pinchDist = dist;
      this.pinchCx = cx;
      this.pinchCy = cy;
      this.pushSample(cx, cy);
      return;
    }

    const dx = x - prevX;
    const dy = y - prevY;

    if (this.mode === 'idle') {
      if (Math.hypot(x - p.startX, y - p.startY) < DRAG_SLOP) return;
      if (this.draggingId) {
        this.mode = 'object';
        this.objectMoved = false;
        this.delegate.onObjectGrab(this.draggingId, x, y);
      } else {
        this.mode = 'camera';
        this.camera.beginDrag();
      }
      this.delegate.onGestureStart?.();
    }

    if (this.mode === 'camera') {
      this.camera.panByScreen(dx, dy);
      this.pushSample(x, y);
    } else if (this.mode === 'object' && this.draggingId) {
      this.objectMoved = true;
      this.delegate.onObjectDrag(
        this.draggingId,
        x,
        y,
        dx / this.camera.zoom,
        dy / this.camera.zoom,
      );
      this.pushSample(x, y);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.el.releasePointerCapture?.(e.pointerId);
    this.clearLongPress();
    if (!p) return;

    if (this.mode === 'pinch') {
      if (this.pointers.size === 1) {
        // Dropping to one finger: continue as a camera drag from the remaining
        // finger's current position, with no jump.
        const rest = [...this.pointers.values()][0];
        this.mode = 'camera';
        this.samples.length = 0;
        this.pushSample(rest.x, rest.y);
        rest.startX = rest.x;
        rest.startY = rest.y;
        rest.moved = true;
      } else {
        const v = this.velocity();
        this.camera.endDrag(v.vx, v.vy);
        this.mode = 'idle';
      }
      return;
    }

    if (this.mode === 'camera') {
      const v = this.velocity();
      this.camera.endDrag(v.vx, v.vy);
      this.mode = 'idle';
      return;
    }

    if (this.mode === 'object' && this.draggingId) {
      this.delegate.onObjectRelease(this.draggingId, p.x, p.y, this.objectMoved);
      this.draggingId = null;
      this.mode = 'idle';
      return;
    }

    // No drag happened → it was a tap.
    const dt = performance.now() - p.startTime;
    const dist = Math.hypot(p.x - p.startX, p.y - p.startY);
    if (dt < 700 && dist <= TAP_SLOP) {
      const id = this.objectsInteractive ? this.delegate.hitTest(p.x, p.y) : null;
      const now = performance.now();
      const isDouble =
        now - this.lastTapTime < DOUBLE_TAP_MS &&
        Math.hypot(p.x - this.lastTapX, p.y - this.lastTapY) < DOUBLE_TAP_SLOP;
      if (isDouble) {
        this.lastTapTime = 0;
        this.delegate.onDoubleTap(id, p.x, p.y);
      } else {
        this.lastTapTime = now;
        this.lastTapX = p.x;
        this.lastTapY = p.y;
        this.delegate.onTap(id, p.x, p.y);
      }
    }
    this.mode = 'idle';
    this.draggingId = null;
  };

  private onPointerLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && this.pointers.size === 0) {
      this.delegate.onHover?.(null, -1, -1);
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    const { x, y } = this.local(e);
    // Normalise across line/page delta modes and trackpad pinch (ctrlKey).
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 18;
    else if (e.deltaMode === 2) dy *= 400;
    const intensity = e.ctrlKey ? 0.012 : 0.0022;
    const factor = Math.exp(-dy * intensity);
    this.camera.zoomAt(x, y, factor);
  };

  private onContextMenu = (e: MouseEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    const { x, y } = this.local(e);
    this.delegate.onContextMenu(this.objectsInteractive ? this.delegate.hitTest(x, y) : null, x, y);
  };

  // ── keyboard ────────────────────────────────────────────────────────────

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }
    if (e.code === 'Space') {
      this.spaceHeld = true;
      this.el.style.cursor = 'grab';
    }
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      this.spaceHeld = false;
      this.el.style.cursor = '';
    }
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.spaceHeld = false;
    this.pointers.clear();
    this.mode = 'idle';
    this.clearLongPress();
  };

  /** Called each frame so held arrow keys glide the camera. */
  updateKeyboard(dt: number) {
    if (this.keys.size === 0) return;
    const speed = 900 * dt;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) dx += speed;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) dx -= speed;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) dy += speed;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) dy -= speed;
    if (dx || dy) this.camera.nudge(dx, dy);

    const cx = this.camera.width / 2;
    const cy = this.camera.height / 2;
    if (this.keys.has('Equal') || this.keys.has('NumpadAdd')) {
      this.camera.zoomAt(cx, cy, Math.exp(1.6 * dt));
    }
    if (this.keys.has('Minus') || this.keys.has('NumpadSubtract')) {
      this.camera.zoomAt(cx, cy, Math.exp(-1.6 * dt));
    }
  }
}
