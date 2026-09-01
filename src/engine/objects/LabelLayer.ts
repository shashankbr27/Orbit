import type { Camera } from '../camera';
import type { Scene, SceneNode } from '../scene';
import { NOTE_TEXT_PX } from './NodeView';

interface LabelEl {
  root: HTMLDivElement;
  title: HTMLDivElement;
  meta: HTMLDivElement;
  body: HTMLDivElement | null;
  id: string | null;
  lastTitle: string;
  lastMeta: string;
  lastBody: string;
  lastFont: number;
  major: boolean;
  /** Measured once per text change, so placement never forces a layout. */
  w: number;
  h: number;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const boxRect = (cx: number, top: number, halfW: number, h: number): Rect => ({
  x0: cx - halfW - 5,
  y0: top - 3,
  x1: cx + halfW + 5,
  y1: top + h + 3,
});

const overlapsAny = (b: Rect, list: Rect[]) =>
  list.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);

/** Label priority per kind — what gets a name when space is tight. */
const PRIORITY: Record<string, number> = {
  universe: 100,
  memory: 80,
  constellation: 72,
  collection: 68,
  person: 60,
  place: 52,
  song: 46,
  event: 44,
  artwork: 30,
  photo: 24,
  note: 20,
};

/**
 * Object names live in the DOM, not the canvas.
 *
 * Reasons: real font rendering (the display serif matters here), crisp text at
 * any zoom, and free text shaping. The cost is bounded by a hard cap on how
 * many labels can exist at once, plus a pool so nothing is ever created during
 * a gesture.
 */
export class LabelLayer {
  private host: HTMLElement;
  private pool: LabelEl[] = [];
  private max: number;
  private accent = '#8fb4ff';

  constructor(host: HTMLElement, max = 44) {
    this.host = host;
    this.max = max;
  }

  setMax(max: number) {
    this.max = max;
    while (this.pool.length > max) {
      const el = this.pool.pop();
      el?.root.remove();
    }
  }

  setAccent(accent: string) {
    this.accent = accent;
  }

  private acquire(index: number): LabelEl {
    let el = this.pool[index];
    if (el) return el;
    const root = document.createElement('div');
    root.className = 'orbit-label';
    const title = document.createElement('div');
    title.className = 'orbit-label__title';
    const meta = document.createElement('div');
    meta.className = 'orbit-label__meta';
    root.appendChild(title);
    root.appendChild(meta);
    el = {
      root,
      title,
      meta,
      body: null,
      id: null,
      lastTitle: '',
      lastMeta: '',
      lastBody: '',
      lastFont: 0,
      major: false,
      w: 0,
      h: 0,
    };
    this.host.appendChild(root);
    this.pool[index] = el;
    return el;
  }

  /**
   * Position and fill labels for this frame.
   *
   * `focusIds` are always labelled (selection, hover, search hit) regardless of
   * how small they are on screen.
   */
  update(
    scene: Scene,
    camera: Camera,
    positionOf: (id: string) => { x: number; y: number } | null,
    focusIds: Set<string>,
  ) {
    const zoom = camera.zoom;
    const W = camera.width;
    const H = camera.height;
    const margin = 60;

    // Score every candidate, then keep the best `max`.
    const candidates: { n: SceneNode; score: number; sx: number; sy: number; rpx: number }[] = [];
    for (const n of scene.nodes) {
      if (n.emphasis < 0.15) continue;
      const p = positionOf(n.id) ?? { x: n.x, y: n.y };
      const sx = camera.worldToScreenX(p.x);
      const sy = camera.worldToScreenY(p.y);
      const rpx = n.radius * zoom;
      // Allow for the body's own size: a large card can be half on screen
      // while its centre is not, and a blank card with no text looks broken.
      const reach = margin + rpx;
      if (sx < -reach || sx > W + reach || sy < -reach || sy > H + reach) continue;
      const focused = focusIds.has(n.id);
      if (!focused && rpx < 5.5) continue;
      if (!n.title && !focused) continue;
      const base = PRIORITY[n.kind] ?? 20;
      // Bigger on screen and closer to the middle wins.
      const centreBias = 1 - Math.min(1, Math.hypot(sx - W / 2, sy - H / 2) / Math.hypot(W, H));
      const score =
        base + Math.min(60, rpx * 0.5) + centreBias * 22 + n.glow * 10 + (focused ? 1000 : 0);
      candidates.push({ n, score, sx, sy, rpx });
    }

    candidates.sort((a, b) => b.score - a.score);
    // Consider more than we can show: some will lose their place to a collision.
    const considered = candidates.slice(0, this.max * 2);

    // Best-scoring labels claim their space first; anything that would collide
    // is simply not drawn. Two names stacked on each other reads as a bug.
    const placed: Rect[] = [];
    let shownCount = 0;

    for (let ci = 0; ci < considered.length; ci++) {
      if (shownCount >= this.max) break;
      const { n, sy, rpx } = considered[ci];
      let sx = considered[ci].sx;
      const el = this.acquire(shownCount);
      const major = n.kind === 'universe' || n.kind === 'memory' || rpx > 90;

      if (el.major !== major) {
        el.root.classList.toggle('orbit-label--major', major);
        el.major = major;
        el.w = 0;
      }

      const title = n.title || 'Untitled';
      if (el.lastTitle !== title) {
        el.title.textContent = title;
        el.lastTitle = title;
        el.w = 0;
      }
      // Only major bodies get a second line; everything else would be noise.
      // The subtitle is what makes a label wide, so it is also the first thing
      // sacrificed when labels start crowding each other.
      const wantMeta = major ? (n.subtitle ?? '') : '';

      /** Set the second line and re-measure. Layout only happens on a change. */
      const setMeta = (text: string) => {
        if (el.lastMeta !== text) {
          el.meta.textContent = text;
          el.meta.style.display = text ? '' : 'none';
          el.lastMeta = text;
          el.w = 0;
        }
        if (el.w === 0) {
          // Must be laid out to be measured, so un-hide first.
          if (el.root.style.display === 'none') el.root.style.display = '';
          el.w = el.root.offsetWidth;
          el.h = el.root.offsetHeight;
        }
      };

      // A universe is the whole navigation: it always gets a name.
      const mustShow = focusIds.has(n.id) || n.kind === 'universe';
      const rawSx = sx;

      /**
       * Try to place the label, given a second line and a vertical step.
       * Returns the resolved geometry, or null if it would collide.
       *
       * Labels are clamped fully on screen, which pushes neighbours near an
       * edge toward each other — so placement is a small search rather than a
       * single guess.
       */
      const tryPlace = (meta: string, step: number) => {
        setMeta(meta);
        const half = el.w / 2;
        const cx = Math.min(Math.max(rawSx, half + 10), W - half - 10);
        const top = sy + Math.max(rpx, 4) + (major ? 14 : 9) + step * (el.h + 7);
        const rect = boxRect(cx, top, half, el.h);
        return overlapsAny(rect, placed) ? null : { cx, top, rect, step };
      };

      const placement =
        tryPlace(wantMeta, 0) ??
        (wantMeta ? tryPlace('', 0) : null) ??
        tryPlace(el.lastMeta, 1);

      if (!placement && !mustShow) {
        el.root.style.display = 'none';
        el.id = null;
        continue;
      }

      /** Nowhere clean, but this one has to be shown: title only, at its body. */
      const force = () => {
        setMeta('');
        const half = el.w / 2;
        const cx = Math.min(Math.max(rawSx, half + 10), W - half - 10);
        const top = sy + Math.max(rpx, 4) + (major ? 14 : 9);
        return { cx, top, rect: boxRect(cx, top, half, el.h), step: 0 };
      };

      const resolved = placement ?? force();

      sx = resolved.cx;
      const nudged = resolved.step * (el.h + 7);
      placed.push(resolved.rect);
      shownCount++;

      // Notes reveal their real text once the card is big enough to read.
      const cardPx = n.radius * 2 * zoom;
      const wantsBody = n.kind === 'note' && !!n.text && cardPx >= NOTE_TEXT_PX;
      if (wantsBody) {
        if (!el.body) {
          const b = document.createElement('div');
          b.className = 'orbit-note-body';
          el.root.appendChild(b);
          el.body = b;
        }
        const text = n.text ?? '';
        if (el.lastBody !== text) {
          el.body.textContent = text;
          el.lastBody = text;
        }
        // Quantise the font size so we are not re-laying-out text every frame.
        const font = Math.round(Math.max(9, cardPx * 0.062) * 2) / 2;
        if (Math.abs(font - el.lastFont) > 0.4) {
          el.body.style.fontSize = `${font}px`;
          el.body.style.width = `${Math.round(cardPx * 0.82)}px`;
          el.lastFont = font;
        }
        el.body.style.display = '';
      } else if (el.body) {
        el.body.style.display = 'none';
        el.lastBody = '';
      }

      // Fade in with apparent size; focused labels are always solid.
      const focused = focusIds.has(n.id);
      const alpha = focused ? 1 : Math.min(1, Math.max(0, (rpx - 4) / 9)) * n.emphasis;

      const offset = wantsBody ? 0 : Math.max(rpx, 4) + (major ? 14 : 9) + nudged;
      const y = wantsBody ? sy - (n.radius / 0.86) * zoom * 0.34 : sy + offset;
      el.root.style.transform = `translate3d(${sx.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, 0)`;
      el.root.style.opacity = alpha.toFixed(3);
      el.root.style.textAlign = 'center';
      if (el.id !== n.id) {
        el.root.style.setProperty('--label-accent', n.color || this.accent);
        el.id = n.id;
      }
      if (el.root.style.display === 'none') el.root.style.display = '';
    }

    for (let i = shownCount; i < this.pool.length; i++) {
      const el = this.pool[i];
      if (el && el.root.style.display !== 'none') {
        el.root.style.display = 'none';
        el.id = null;
      }
    }
  }

  clear() {
    for (const el of this.pool) el.root.style.display = 'none';
  }

  dispose() {
    for (const el of this.pool) el.root.remove();
    this.pool.length = 0;
  }
}
