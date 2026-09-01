'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SCRAP_STYLES,
  uid,
  type OrbitObject,
  type ScrapItem,
  type ScrapStyle,
  type ScrapbookPage,
} from '@/data/model';
import { importImageFile } from '@/data/images';
import {
  IconBack,
  IconBrush,
  IconClose,
  IconPhoto,
  IconSticker,
  IconTape,
  IconText,
  IconTrash,
  IconUndo,
} from './icons';
import { Chip, IconButton, useIsPhone } from './primitives';
import { useMediaUrl } from './useMediaUrl';

/**
 * The scrapbook.
 *
 * A memory opens into a page you can actually put things on: photographs at odd
 * angles, tape, a line of handwriting, a doodle in the margin. Coordinates are
 * fractions of the page, so a spread laid out on a phone looks the same on a
 * laptop.
 *
 * DOM rather than canvas: real text editing, real images, real fonts. A page
 * holds tens of items, not thousands, so the cost is irrelevant and the
 * fidelity is much higher.
 */

/* ── page styles ────────────────────────────────────────────────────────── */

interface StyleSpec {
  label: string;
  page: React.CSSProperties;
  ink: string;
  inkSoft: string;
  /** Extra decoration drawn behind the items. */
  decoration?: 'rules' | 'sprockets' | 'edges' | 'bloom';
  photoFrame: 'print' | 'polaroid' | 'none' | 'soft';
}

const STYLES: Record<ScrapStyle, StyleSpec> = {
  notebook: {
    label: 'Notebook',
    page: {
      background:
        'linear-gradient(#fdfaf1, #f7f2e6)',
      boxShadow: '0 40px 90px -40px rgba(0,0,0,0.85), 0 0 0 1px rgba(0,0,0,0.06)',
    },
    ink: '#2b2f3a',
    inkSoft: 'rgba(43,47,58,0.62)',
    decoration: 'rules',
    photoFrame: 'print',
  },
  film: {
    label: 'Film',
    page: {
      background: 'linear-gradient(#14151a, #0b0c11)',
      boxShadow: '0 40px 90px -40px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.07)',
    },
    ink: '#e9ecf4',
    inkSoft: 'rgba(233,236,244,0.55)',
    decoration: 'sprockets',
    photoFrame: 'none',
  },
  vintage: {
    label: 'Vintage',
    page: {
      background:
        'radial-gradient(120% 100% at 30% 10%, #f2e3c8, #e6d2ae 55%, #d9c39a 100%)',
      boxShadow: '0 40px 90px -40px rgba(0,0,0,0.85), 0 0 0 1px rgba(90,60,20,0.14)',
    },
    ink: '#4a3a22',
    inkSoft: 'rgba(74,58,34,0.6)',
    decoration: 'edges',
    photoFrame: 'polaroid',
  },
  paper: {
    label: 'Paper',
    page: {
      background: 'linear-gradient(#fffefb, #f6f4ee)',
      boxShadow: '0 40px 90px -40px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,0,0,0.05)',
    },
    ink: '#26282e',
    inkSoft: 'rgba(38,40,46,0.58)',
    photoFrame: 'print',
  },
  dreamy: {
    label: 'Dreamy',
    page: {
      background:
        'radial-gradient(90% 70% at 20% 15%, #f0e2ff, #e3e6ff 45%, #ffe6f2 100%)',
      boxShadow: '0 40px 90px -40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.4)',
    },
    ink: '#3a2f4a',
    inkSoft: 'rgba(58,47,74,0.55)',
    decoration: 'bloom',
    photoFrame: 'soft',
  },
  minimal: {
    label: 'Minimal',
    page: {
      background: '#fbfbfa',
      boxShadow: '0 40px 90px -40px rgba(0,0,0,0.75), 0 0 0 1px rgba(0,0,0,0.06)',
    },
    ink: '#1c1d21',
    inkSoft: 'rgba(28,29,33,0.5)',
    photoFrame: 'none',
  },
};

const STICKERS = ['★', '✦', '✿', '♡', '☾', '☀', '✈', '❋', '☕', '⚡', '✶', '❀', '☂', '✽'];
const TAPE_TINTS = ['#e9d9a8', '#cfe0e8', '#e8cfd6', '#d9e8cf', '#e5e2da', '#f0d0b0'];

type Tool = 'select' | 'draw';

const EMPTY_PAGE: ScrapbookPage = { style: 'paper', items: [], updatedAt: 0 };

export function Scrapbook({
  object,
  onClose,
  onSave,
}: {
  object: OrbitObject | null;
  onClose(): void;
  onSave(page: ScrapbookPage): void;
}) {
  const open = !!object;
  const [page, setPage] = useState<ScrapbookPage>(EMPTY_PAGE);
  /** The authoritative page, readable synchronously between renders. */
  const live = useRef<ScrapbookPage>(EMPTY_PAGE);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [styleOpen, setStyleOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const history = useRef<ScrapItem[][]>([]);
  const pageRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const phone = useIsPhone();

  /**
   * While the scrapbook is open it owns the page; the store is a mirror.
   *
   * Re-seeding from `object.scrapbook` on every change would be a loop: each
   * edit saves, the store hands back a new object, and the page (and the
   * selection with it) resets — so a just-placed item could never be resized,
   * rotated or deleted. Load once per memory instead.
   */
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!object) {
      loadedFor.current = null;
      return;
    }
    if (loadedFor.current === object.id) return;
    loadedFor.current = object.id;
    const loaded =
      object.scrapbook ?? {
        style: 'paper' as ScrapStyle,
        items: [],
        heading: object.title,
        updatedAt: Date.now(),
      };
    setPage(loaded);
    live.current = loaded;
    setSelected(null);
    setTool('select');
    history.current = [];
  }, [object]);

  const style = STYLES[page.style] ?? STYLES.paper;

  const apply = useCallback(
    (next: ScrapbookPage, opts: { remember?: boolean; save?: boolean } = {}) => {
      const { remember = true, save = true } = opts;
      if (remember) {
        history.current.push(live.current.items);
        if (history.current.length > 24) history.current.shift();
      }
      const stamped = { ...next, updatedAt: Date.now() };
      live.current = stamped;
      setPage(stamped);
      // Saving inside a state updater would run twice under StrictMode; the
      // ref lets us keep `prev` correct without that.
      if (save) onSave(stamped);
    },
    [onSave],
  );

  const commit = useCallback(
    (next: ScrapbookPage, remember = true) => apply(next, { remember }),
    [apply],
  );

  const patchItems = useCallback(
    (fn: (items: ScrapItem[]) => ScrapItem[], remember = true) =>
      apply({ ...live.current, items: fn(live.current.items) }, { remember }),
    [apply],
  );

  /** Live update during a drag — no history entry, no save until release. */
  const previewItems = useCallback(
    (fn: (items: ScrapItem[]) => ScrapItem[]) =>
      apply({ ...live.current, items: fn(live.current.items) }, {
        remember: false,
        save: false,
      }),
    [apply],
  );

  const flush = useCallback(() => {
    onSave({ ...live.current, updatedAt: Date.now() });
  }, [onSave]);

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (!prev) return;
    apply({ ...live.current, items: prev }, { remember: false });
    setSelected(null);
  }, [apply]);

  const topZ = () => live.current.items.reduce((m, i) => Math.max(m, i.z), 0);

  const addItem = (item: Omit<ScrapItem, 'id' | 'z'>) => {
    const full: ScrapItem = { ...item, id: uid('scr'), z: topZ() + 1 };
    patchItems((items) => [...items, full]);
    setSelected(full.id);
  };

  const addPhotos = async (files: FileList) => {
    setBusy(true);
    try {
      const created: ScrapItem[] = [];
      let z = topZ();
      let i = 0;
      for (const file of Array.from(files).slice(0, 8)) {
        const asset = await importImageFile(file);
        if (!asset) continue;
        const ar = asset.width / asset.height;
        const w = 0.42;
        created.push({
          id: uid('scr'),
          type: 'photo',
          x: 0.5 + (i % 2 === 0 ? -0.11 : 0.11) + (Math.random() - 0.5) * 0.08,
          y: 0.36 + i * 0.05 + (Math.random() - 0.5) * 0.06,
          w,
          h: w / ar,
          rotation: (Math.random() - 0.5) * 0.14,
          z: ++z,
          mediaId: asset.id,
        });
        i++;
      }
      if (created.length) patchItems((items) => [...items, ...created]);
    } finally {
      setBusy(false);
    }
  };

  const selectedItem = page.items.find((i) => i.id === selected) ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.isContentEditable || t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        if (selected) setSelected(null);
        else onClose();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        patchItems((items) => items.filter((i) => i.id !== selected));
        setSelected(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, selected, onClose, patchItems, undo]);

  return (
    <AnimatePresence>
      {open && object && (
        <motion.div
          className="fixed inset-0 z-[70] flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background:
              'radial-gradient(120% 90% at 50% 0%, rgba(10,12,20,0.96), rgba(3,4,9,0.99))',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void addPhotos(e.target.files);
              e.target.value = '';
            }}
          />

          {/* header */}
          <div
            className="flex shrink-0 items-center gap-3 px-4 pb-2"
            style={{ paddingTop: 'calc(var(--sat) + 12px)' }}
          >
            <IconButton label="Back to the universe" onClick={onClose}>
              <IconBack width={18} height={18} />
            </IconButton>
            <div className="min-w-0 flex-1">
              <div className="eyebrow">Scrapbook</div>
              <div className="truncate font-display text-[19px] leading-tight text-ink/95">
                {object.title || 'A memory'}
              </div>
            </div>
            <IconButton label="Undo" onClick={undo} disabled={history.current.length === 0}>
              <IconUndo width={17} height={17} />
            </IconButton>
          </div>

          {/* the page */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 py-2">
            <motion.div
              ref={pageRef}
              className="relative overflow-hidden"
              style={{
                aspectRatio: '4 / 5',
                width: 'min(100%, min(560px, calc((100vh - 240px) * 0.8)))',
                borderRadius: page.style === 'vintage' ? 4 : 8,
                ...style.page,
                touchAction: 'none',
              }}
              initial={{ opacity: 0, y: 22, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              onPointerDown={(e) => {
                if (tool === 'select' && e.target === e.currentTarget) setSelected(null);
              }}
            >
              <Decoration spec={style} />

              {page.heading !== undefined && (
                <Heading
                  value={page.heading}
                  ink={style.ink}
                  onChange={(heading) => commit({ ...live.current, heading }, false)}
                />
              )}

              {[...page.items]
                .sort((a, b) => a.z - b.z)
                .map((item) => (
                  <ScrapItemView
                    key={item.id}
                    item={item}
                    spec={style}
                    selected={selected === item.id}
                    interactive={tool === 'select'}
                    pageEl={pageRef}
                    onSelect={() => {
                      setSelected(item.id);
                      // Selecting lifts an item, the way picking one up would.
                      if (item.z !== topZ()) {
                        previewItems((items) =>
                          items.map((i) => (i.id === item.id ? { ...i, z: topZ() + 1 } : i)),
                        );
                      }
                    }}
                    onPreview={(patch) =>
                      previewItems((items) =>
                        items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)),
                      )
                    }
                    onCommit={flush}
                    onDelete={() => {
                      patchItems((items) => items.filter((i) => i.id !== item.id));
                      setSelected(null);
                    }}
                    onText={(text) =>
                      patchItems(
                        (items) => items.map((i) => (i.id === item.id ? { ...i, text } : i)),
                        false,
                      )
                    }
                  />
                ))}

              {tool === 'draw' && (
                <DrawSurface
                  ink={style.ink}
                  onStroke={(points, stroke, color) =>
                    addItem({
                      type: 'doodle',
                      x: 0,
                      y: 0,
                      w: 1,
                      h: 1,
                      rotation: 0,
                      points,
                      stroke,
                      color,
                    })
                  }
                />
              )}
            </motion.div>

            {busy && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="glass rounded-full px-4 py-2 text-[12px] text-mute">
                  adding photographs…
                </div>
              </div>
            )}
          </div>

          {/* selected-item controls */}
          <AnimatePresence>
            {selectedItem && tool === 'select' && (
              <motion.div
                className="mx-auto mb-1 flex w-[min(94vw,560px)] shrink-0 items-center gap-2 px-1"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.2 }}
              >
                <div className="glass flex flex-1 items-center gap-2 overflow-x-auto rounded-full px-2.5 py-2">
                  <span className="eyebrow shrink-0 pl-1 pr-1">
                    {selectedItem.type === 'photo'
                      ? 'Photo'
                      : selectedItem.type === 'doodle'
                        ? 'Doodle'
                        : selectedItem.type === 'tape'
                          ? 'Tape'
                          : selectedItem.type === 'sticker'
                            ? 'Sticker'
                            : 'Text'}
                  </span>
                  {(selectedItem.type === 'text' || selectedItem.type === 'note') && (
                    <>
                      {(['hand', 'serif', 'sans'] as const).map((f) => (
                        <Chip
                          key={f}
                          active={(selectedItem.font ?? 'hand') === f}
                          onClick={() =>
                            patchItems((items) =>
                              items.map((i) => (i.id === selectedItem.id ? { ...i, font: f } : i)),
                            )
                          }
                        >
                          {f === 'hand' ? 'Hand' : f === 'serif' ? 'Serif' : 'Sans'}
                        </Chip>
                      ))}
                    </>
                  )}
                  {selectedItem.type === 'tape' && (
                    <div className="flex shrink-0 gap-1.5">
                      {TAPE_TINTS.map((c) => (
                        <button
                          key={c}
                          aria-label={c}
                          onClick={() =>
                            patchItems((items) =>
                              items.map((i) => (i.id === selectedItem.id ? { ...i, color: c } : i)),
                            )
                          }
                          className="h-5 w-5 rounded-full"
                          style={{
                            background: c,
                            boxShadow:
                              selectedItem.color === c
                                ? '0 0 0 2px #0a0d16, 0 0 0 3px ' + c
                                : 'inset 0 0 0 1px rgba(0,0,0,0.2)',
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() =>
                      patchItems((items) =>
                        items.map((i) =>
                          i.id === selectedItem.id
                            ? { ...i, z: Math.min(...items.map((x) => x.z)) - 1 }
                            : i,
                        ),
                      )
                    }
                    className="shrink-0 rounded-full px-2.5 py-1 text-[11px] text-mute"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  >
                    Send back
                  </button>
                  <button
                    onClick={() => {
                      patchItems((items) => items.filter((i) => i.id !== selectedItem.id));
                      setSelected(null);
                    }}
                    className="ml-auto shrink-0 rounded-full p-1.5 text-[#ff9b9b]"
                    style={{ background: 'rgba(255,90,90,0.1)' }}
                    aria-label="Remove"
                  >
                    <IconTrash width={15} height={15} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* tool bar */}
          <div
            className="shrink-0 px-3"
            style={{ paddingBottom: 'calc(var(--sab) + 12px)', paddingTop: 6 }}
          >
            <div className="glass mx-auto flex w-[min(94vw,560px)] items-center gap-1 rounded-full p-1.5">
              <Tool
                label="Photo"
                icon={<IconPhoto width={17} height={17} />}
                onClick={() => fileInput.current?.click()}
                compact={phone}
              />
              <Tool
                label="Text"
                icon={<IconText width={17} height={17} />}
                onClick={() =>
                  addItem({
                    type: 'text',
                    x: 0.5,
                    y: 0.72,
                    w: 0.58,
                    h: 0.1,
                    rotation: (Math.random() - 0.5) * 0.05,
                    text: 'Say something',
                    font: 'hand',
                  })
                }
                compact={phone}
              />
              <Tool
                label="Tape"
                icon={<IconTape width={17} height={17} />}
                onClick={() =>
                  addItem({
                    type: 'tape',
                    x: 0.5,
                    y: 0.2,
                    w: 0.26,
                    h: 0.055,
                    rotation: (Math.random() - 0.5) * 0.7,
                    color: TAPE_TINTS[Math.floor(Math.random() * TAPE_TINTS.length)],
                  })
                }
                compact={phone}
              />
              <Tool
                label="Sticker"
                icon={<IconSticker width={17} height={17} />}
                onClick={() => setStickerOpen((v) => !v)}
                active={stickerOpen}
                compact={phone}
              />
              <Tool
                label="Draw"
                icon={<IconBrush width={17} height={17} />}
                onClick={() => {
                  setTool((t) => (t === 'draw' ? 'select' : 'draw'));
                  setSelected(null);
                }}
                active={tool === 'draw'}
                compact={phone}
              />
              <div className="mx-1 h-6 w-px bg-white/10" />
              <Tool
                label="Style"
                icon={<span className="text-[13px] leading-none">Aa</span>}
                onClick={() => setStyleOpen((v) => !v)}
                active={styleOpen}
                compact={phone}
              />
            </div>

            <AnimatePresence>
              {stickerOpen && (
                <motion.div
                  className="glass mx-auto mt-2 flex w-[min(94vw,560px)] flex-wrap gap-1.5 rounded-3xl p-3"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                >
                  {STICKERS.map((g) => (
                    <button
                      key={g}
                      onClick={() => {
                        addItem({
                          type: 'sticker',
                          x: 0.3 + Math.random() * 0.4,
                          y: 0.3 + Math.random() * 0.4,
                          w: 0.12,
                          h: 0.12,
                          rotation: (Math.random() - 0.5) * 0.5,
                          glyph: g,
                          color: style.ink,
                        });
                        setStickerOpen(false);
                      }}
                      className="grid h-9 w-9 place-items-center rounded-xl text-[17px] no-select"
                      style={{ background: 'rgba(255,255,255,0.05)' }}
                    >
                      {g}
                    </button>
                  ))}
                </motion.div>
              )}
              {styleOpen && (
                <motion.div
                  className="glass mx-auto mt-2 flex w-[min(94vw,560px)] flex-wrap gap-1.5 rounded-3xl p-3"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                >
                  {SCRAP_STYLES.map((s) => (
                    <Chip
                      key={s}
                      active={page.style === s}
                      onClick={() => commit({ ...live.current, style: s })}
                    >
                      {STYLES[s].label}
                    </Chip>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── page furniture ─────────────────────────────────────────────────────── */

function Decoration({ spec }: { spec: StyleSpec }) {
  if (spec.decoration === 'rules') {
    return (
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent 0 27px, rgba(60,80,140,0.13) 27px 28px)',
          }}
        />
        <div className="absolute bottom-0 left-[11%] top-0 w-px bg-[rgba(200,90,90,0.28)]" />
      </div>
    );
  }
  if (spec.decoration === 'sprockets') {
    return (
      <div className="pointer-events-none absolute inset-0">
        {[0, 1].map((row) => (
          <div
            key={row}
            className="absolute left-0 right-0 flex justify-around"
            style={{ [row ? 'bottom' : 'top']: 8, height: 14 }}
          >
            {Array.from({ length: 14 }).map((_, i) => (
              <span
                key={i}
                className="rounded-[2px]"
                style={{ width: 12, height: 9, background: 'rgba(255,255,255,0.09)' }}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (spec.decoration === 'edges') {
    return (
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow: 'inset 0 0 70px rgba(90,60,20,0.35), inset 0 0 14px rgba(90,60,20,0.2)',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
          opacity: 0.09,
          mixBlendMode: 'multiply',
        }}
      />
    );
  }
  if (spec.decoration === 'bloom') {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-10 -top-10 h-52 w-52 rounded-full"
          style={{ background: 'radial-gradient(rgba(255,255,255,0.7), transparent 70%)', filter: 'blur(8px)' }}
        />
        <div
          className="absolute -bottom-16 right-[-30px] h-64 w-64 rounded-full"
          style={{ background: 'radial-gradient(rgba(255,214,236,0.75), transparent 70%)', filter: 'blur(10px)' }}
        />
      </div>
    );
  }
  return null;
}

function Heading({
  value,
  ink,
  onChange,
}: {
  value: string;
  ink: string;
  onChange(v: string): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={(e) => onChange(e.currentTarget.textContent ?? '')}
      className="absolute left-[8%] right-[8%] top-[4.5%] outline-none"
      style={{
        fontFamily: 'var(--font-hand)',
        fontSize: 'clamp(22px, 5.4vw, 34px)',
        lineHeight: 1.1,
        color: ink,
        opacity: 0.9,
      }}
    >
      {value}
    </div>
  );
}

/* ── items ──────────────────────────────────────────────────────────────── */

type Handle = 'move' | 'resize' | 'rotate' | null;

function ScrapItemView({
  item,
  spec,
  selected,
  interactive,
  pageEl,
  onSelect,
  onPreview,
  onCommit,
  onDelete,
  onText,
}: {
  item: ScrapItem;
  spec: StyleSpec;
  selected: boolean;
  interactive: boolean;
  pageEl: React.RefObject<HTMLDivElement | null>;
  onSelect(): void;
  onPreview(patch: Partial<ScrapItem>): void;
  onCommit(): void;
  onDelete(): void;
  onText(text: string): void;
}) {
  const url = useMediaUrl(item.type === 'photo' || item.type === 'polaroid' ? item.mediaId : null);
  const drag = useRef<{
    mode: Handle;
    startX: number;
    startY: number;
    ix: number;
    iy: number;
    iw: number;
    ih: number;
    ir: number;
    cx: number;
    cy: number;
    startDist: number;
    startAngle: number;
  } | null>(null);
  const [editing, setEditing] = useState(false);

  const rect = () => pageEl.current?.getBoundingClientRect();

  const begin = (mode: Handle) => (e: React.PointerEvent) => {
    if (!interactive || item.type === 'doodle') return;
    e.stopPropagation();
    const r = rect();
    if (!r) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const cx = r.left + (item.x + 0) * r.width;
    const cy = r.top + (item.y + 0) * r.height;
    drag.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      ix: item.x,
      iy: item.y,
      iw: item.w,
      ih: item.h,
      ir: item.rotation,
      cx,
      cy,
      startDist: Math.hypot(e.clientX - cx, e.clientY - cy) || 1,
      startAngle: Math.atan2(e.clientY - cy, e.clientX - cx),
    };
    onSelect();
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const r = rect();
    if (!d || !r) return;
    e.stopPropagation();
    if (d.mode === 'move') {
      onPreview({
        x: clamp01(d.ix + (e.clientX - d.startX) / r.width),
        y: clamp01(d.iy + (e.clientY - d.startY) / r.height),
      });
    } else if (d.mode === 'resize') {
      const dist = Math.hypot(e.clientX - d.cx, e.clientY - d.cy);
      const k = Math.max(0.18, Math.min(6, dist / d.startDist));
      onPreview({
        w: Math.max(0.04, Math.min(1.6, d.iw * k)),
        h: Math.max(0.02, Math.min(1.6, d.ih * k)),
      });
    } else if (d.mode === 'rotate') {
      const a = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
      onPreview({ rotation: d.ir + (a - d.startAngle) });
    }
  };

  const end = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    onCommit();
  };

  if (item.type === 'doodle') {
    return (
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ zIndex: item.z + 10, overflow: 'visible' }}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        <polyline
          points={(item.points ?? []).reduce<string>(
            (acc, v, i) => (i % 2 === 0 ? `${acc} ${v}` : `${acc},${v}`),
            '',
          )}
          fill="none"
          stroke={item.color ?? spec.ink}
          strokeWidth={(item.stroke ?? 0.004)}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={item.opacity ?? 0.85}
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: `${(item.stroke ?? 2.2)}px` }}
        />
      </svg>
    );
  }

  const wrapper: React.CSSProperties = {
    position: 'absolute',
    left: `${item.x * 100}%`,
    top: `${item.y * 100}%`,
    width: `${item.w * 100}%`,
    zIndex: item.z + 10,
    transform: `translate(-50%, -50%) rotate(${item.rotation}rad)`,
    touchAction: 'none',
    cursor: interactive ? 'grab' : 'default',
  };

  return (
    <div
      style={wrapper}
      onPointerDown={begin('move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => {
        if (item.type === 'text' || item.type === 'note') setEditing(true);
      }}
    >
      {item.type === 'photo' && (
        <PhotoBody url={url} spec={spec} aspect={item.w / Math.max(0.001, item.h)} />
      )}

      {(item.type === 'text' || item.type === 'note') && (
        <div
          contentEditable={editing}
          suppressContentEditableWarning
          spellCheck={false}
          onBlur={(e) => {
            setEditing(false);
            onText(e.currentTarget.textContent ?? '');
          }}
          onPointerDown={(e) => {
            if (editing) e.stopPropagation();
          }}
          className="outline-none"
          style={{
            fontFamily:
              item.font === 'serif'
                ? 'var(--font-display)'
                : item.font === 'sans'
                  ? 'var(--font-sans)'
                  : 'var(--font-hand)',
            fontSize: `${Math.max(11, item.w * 60)}px`,
            lineHeight: item.font === 'hand' ? 1.25 : 1.35,
            color: item.color ?? spec.ink,
            textAlign: 'center',
            whiteSpace: 'pre-wrap',
            padding: item.type === 'note' ? '10% 8%' : 0,
            background:
              item.type === 'note' ? 'rgba(255,255,255,0.62)' : undefined,
            boxShadow:
              item.type === 'note' ? '0 8px 20px -10px rgba(0,0,0,0.4)' : undefined,
            cursor: editing ? 'text' : undefined,
          }}
        >
          {item.text}
        </div>
      )}

      {item.type === 'sticker' && (
        <div
          className="grid place-items-center"
          style={{
            fontSize: `${Math.max(14, item.w * 130)}px`,
            lineHeight: 1,
            color: item.color ?? spec.ink,
            opacity: 0.85,
          }}
        >
          {item.glyph}
        </div>
      )}

      {item.type === 'tape' && (
        <div
          style={{
            height: `${Math.max(14, item.w * 60)}px`,
            background: `linear-gradient(${item.color ?? '#e9d9a8'}, ${item.color ?? '#e9d9a8'})`,
            opacity: 0.7,
            boxShadow: '0 2px 8px -3px rgba(0,0,0,0.35)',
            clipPath:
              'polygon(2% 0%, 98% 4%, 100% 96%, 3% 100%, 0% 52%)',
            backgroundBlendMode: 'multiply',
          }}
        />
      )}

      {selected && interactive && (
        <>
          <div
            className="pointer-events-none absolute -inset-1.5 rounded-[6px]"
            style={{ border: '1px solid color-mix(in oklab, var(--accent) 70%, transparent)' }}
          />
          <button
            aria-label="Resize"
            onPointerDown={begin('resize')}
            onPointerMove={move}
            onPointerUp={end}
            className="absolute -bottom-3.5 -right-3.5 h-7 w-7 rounded-full"
            style={{
              background: 'var(--accent)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
              touchAction: 'none',
            }}
          />
          <button
            aria-label="Rotate"
            onPointerDown={begin('rotate')}
            onPointerMove={move}
            onPointerUp={end}
            className="absolute -right-3.5 -top-3.5 h-7 w-7 rounded-full"
            style={{
              background: '#fff',
              boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
              touchAction: 'none',
            }}
          />
          <button
            aria-label="Remove"
            onPointerDown={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute -left-3.5 -top-3.5 grid h-7 w-7 place-items-center rounded-full text-[#7a1020]"
            style={{ background: '#ffd0d0', boxShadow: '0 2px 10px rgba(0,0,0,0.5)' }}
          >
            <IconClose width={13} height={13} strokeWidth={2} />
          </button>
        </>
      )}
    </div>
  );
}

function PhotoBody({
  url,
  spec,
  aspect,
}: {
  url: string | null;
  spec: StyleSpec;
  aspect: number;
}) {
  const frame = spec.photoFrame;
  const pad = frame === 'polaroid' ? '5% 5% 18% 5%' : frame === 'print' ? '3.5%' : '0';
  return (
    <div
      style={{
        padding: pad,
        background:
          frame === 'polaroid' ? '#fbf8f0' : frame === 'print' ? '#ffffff' : 'transparent',
        boxShadow:
          frame === 'none'
            ? '0 12px 30px -14px rgba(0,0,0,0.6)'
            : frame === 'soft'
              ? '0 14px 34px -16px rgba(0,0,0,0.35)'
              : '0 14px 34px -16px rgba(0,0,0,0.65)',
        borderRadius: frame === 'soft' ? 10 : 2,
      }}
    >
      <div
        style={{
          aspectRatio: `${aspect}`,
          width: '100%',
          background: url
            ? `center / cover no-repeat url(${JSON.stringify(url)})`
            : 'linear-gradient(135deg, rgba(120,130,150,0.35), rgba(60,70,90,0.35))',
          borderRadius: frame === 'soft' ? 6 : 1,
        }}
      />
    </div>
  );
}

/* ── drawing ────────────────────────────────────────────────────────────── */

function DrawSurface({
  ink,
  onStroke,
}: {
  ink: string;
  onStroke(points: number[], stroke: number, color: string): void;
}) {
  const [pts, setPts] = useState<number[]>([]);
  const drawing = useRef(false);
  const host = useRef<HTMLDivElement>(null);

  const add = (e: React.PointerEvent) => {
    const r = host.current?.getBoundingClientRect();
    if (!r) return;
    const x = clamp01((e.clientX - r.left) / r.width);
    const y = clamp01((e.clientY - r.top) / r.height);
    setPts((p) => {
      // Thin the stream: a point every ~0.5% of the page is plenty.
      const n = p.length;
      if (n >= 2 && Math.hypot(x - p[n - 2], y - p[n - 1]) < 0.005) return p;
      return [...p, x, y];
    });
  };

  return (
    <div
      ref={host}
      className="absolute inset-0"
      style={{ zIndex: 9000, touchAction: 'none', cursor: 'crosshair' }}
      onPointerDown={(e) => {
        drawing.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setPts([]);
        add(e);
      }}
      onPointerMove={(e) => {
        if (drawing.current) add(e);
      }}
      onPointerUp={() => {
        drawing.current = false;
        if (pts.length >= 4) onStroke(pts, 2.4, ink);
        setPts([]);
      }}
      onPointerCancel={() => {
        drawing.current = false;
        setPts([]);
      }}
    >
      {pts.length >= 4 && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          <polyline
            points={pts.reduce<string>(
              (acc, v, i) => (i % 2 === 0 ? `${acc} ${v}` : `${acc},${v}`),
              '',
            )}
            fill="none"
            stroke={ink}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ strokeWidth: '2.4px' }}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  );
}

/* ── bits ───────────────────────────────────────────────────────────────── */

function Tool({
  label,
  icon,
  onClick,
  active,
  compact,
}: {
  label: string;
  icon: React.ReactNode;
  onClick(): void;
  active?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 no-select transition-all duration-200 active:scale-[0.96] ${
        compact ? 'px-1' : 'px-3'
      }`}
      style={{
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent)' : 'rgba(226,232,244,0.82)',
      }}
    >
      {icon}
      {!compact && <span className="text-[12px]">{label}</span>}
    </button>
  );
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
