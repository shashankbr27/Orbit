'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useRef } from 'react';
import type { OrbitObject } from '@/data/model';
import { IconClose } from './icons';

/**
 * The timeline.
 *
 * It is a scrubber, not a view: dragging through it emphasises the objects that
 * belong to that year and lets the rest recede. It only exists while you are
 * using it, because permanent chrome over a universe is the thing we are trying
 * hardest to avoid.
 */
export function Timeline({
  open,
  objects,
  year,
  onYear,
  onClose,
  onFocusYear,
}: {
  open: boolean;
  objects: OrbitObject[];
  year: number | null;
  onYear(y: number | null): void;
  onClose(): void;
  onFocusYear(y: number): void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const { years, counts } = useMemo(() => {
    const map = new Map<number, number>();
    for (const o of objects) {
      if (!o.date) continue;
      const y = new Date(o.date).getFullYear();
      if (!Number.isFinite(y)) continue;
      map.set(y, (map.get(y) ?? 0) + 1);
    }
    if (map.size === 0) {
      const now = new Date().getFullYear();
      return { years: [now - 2, now - 1, now, now + 1], counts: map };
    }
    const keys = [...map.keys()].sort((a, b) => a - b);
    const lo = keys[0];
    const hi = keys[keys.length - 1];
    const span: number[] = [];
    for (let y = lo; y <= Math.max(hi, lo + 2); y++) span.push(y);
    return { years: span, counts: map };
  }, [objects]);

  const pick = (clientX: number) => {
    const el = rail.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
    const idx = Math.round(t * (years.length - 1));
    const y = years[Math.min(years.length - 1, Math.max(0, idx))];
    if (y !== year) onYear(y);
  };

  const activeIdx = year === null ? -1 : years.indexOf(year);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed bottom-0 left-1/2 z-30 w-[min(94vw,720px)] -translate-x-1/2"
          style={{ paddingBottom: 'calc(var(--sab) + 84px)' }}
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="glass grain relative rounded-[22px] px-4 pb-3.5 pt-3">
            <div className="grain-overlay" />
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-baseline gap-2.5">
                <span className="font-display text-[19px] leading-none text-ink/95">
                  {year ?? 'All time'}
                </span>
                {year !== null && (
                  <span className="text-[11px] text-mute">
                    {counts.get(year) ?? 0} {(counts.get(year) ?? 0) === 1 ? 'thing' : 'things'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {year !== null && (
                  <>
                    <button
                      onClick={() => onFocusYear(year)}
                      className="rounded-full px-2.5 py-1 text-[11px] text-mute no-select transition-colors hover:text-ink"
                      style={{ background: 'rgba(255,255,255,0.06)' }}
                    >
                      Fly there
                    </button>
                    <button
                      onClick={() => onYear(null)}
                      className="rounded-full px-2.5 py-1 text-[11px] text-mute no-select transition-colors hover:text-ink"
                      style={{ background: 'rgba(255,255,255,0.06)' }}
                    >
                      All time
                    </button>
                  </>
                )}
                <button
                  aria-label="Close timeline"
                  onClick={onClose}
                  className="grid h-7 w-7 place-items-center rounded-full text-mute no-select transition-colors hover:text-ink"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  <IconClose width={13} height={13} />
                </button>
              </div>
            </div>

            <div
              ref={rail}
              className="relative h-11 cursor-pointer no-select"
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => {
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                pick(e.clientX);
              }}
              onPointerMove={(e) => {
                if (dragging.current) pick(e.clientX);
              }}
              onPointerUp={(e) => {
                dragging.current = false;
                e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => {
                dragging.current = false;
              }}
            >
              {/* the rail */}
              <div className="absolute left-0 right-0 top-[18px] h-px bg-white/12" />
              {/* the lit portion */}
              {activeIdx >= 0 && years.length > 1 && (
                <div
                  className="absolute top-[18px] h-px"
                  style={{
                    left: 0,
                    width: `${(activeIdx / (years.length - 1)) * 100}%`,
                    background:
                      'linear-gradient(to right, transparent, color-mix(in oklab, var(--accent) 70%, transparent))',
                  }}
                />
              )}

              {years.map((y, i) => {
                const t = years.length > 1 ? i / (years.length - 1) : 0.5;
                const n = counts.get(y) ?? 0;
                const active = y === year;
                const size = n === 0 ? 3 : Math.min(9, 4 + n * 1.1);
                return (
                  <div
                    key={y}
                    className="absolute flex flex-col items-center"
                    style={{ left: `${t * 100}%`, top: 0, transform: 'translateX(-50%)' }}
                  >
                    <div
                      className="mt-[14px] rounded-full transition-all duration-200"
                      style={{
                        width: size,
                        height: size,
                        background: active
                          ? 'var(--accent)'
                          : n > 0
                            ? 'rgba(226,232,244,0.55)'
                            : 'rgba(226,232,244,0.18)',
                        boxShadow: active ? '0 0 14px var(--accent)' : undefined,
                      }}
                    />
                    <span
                      className="mt-2 tabular-nums transition-colors duration-200"
                      style={{
                        fontSize: 9.5,
                        letterSpacing: '0.1em',
                        color: active ? 'var(--accent)' : n > 0 ? 'rgba(154,163,184,0.8)' : 'rgba(92,100,120,0.7)',
                      }}
                    >
                      {years.length > 12 && i % 2 === 1 ? '' : `’${String(y).slice(2)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
