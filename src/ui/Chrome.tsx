'use client';

import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { KIND_SPEC, type OrbitObject } from '@/data/model';
import { useUi } from '@/state/ui';
import {
  IconBack,
  IconClock,
  IconGear,
  IconLayers,
  IconLink,
  IconPalette,
  IconPause,
  IconPencil,
  IconPlay,
  IconPlus,
  IconTarget,
  KIND_ICON,
} from './icons';
import { IconButton } from './primitives';

/**
 * All persistent chrome.
 *
 * The rule from the brief: nothing permanently parked over the universe. So
 * this is four small clusters pinned to the corners, each of which fades out
 * the moment a gesture starts.
 */

const RAIL_SPRING = { type: 'spring', stiffness: 380, damping: 34 } as const;

/**
 * A whisper of shade behind the chrome.
 *
 * Without it, white text lands on whatever the nebula happens to be doing and
 * legibility becomes luck. With it, the corners stay readable and the middle of
 * the sky stays untouched.
 */
export function Scrim({ hidden }: { hidden?: boolean }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-20"
      style={{
        height: 190,
        background:
          'linear-gradient(to bottom, rgba(3,4,10,0.62) 0%, rgba(3,4,10,0.34) 42%, rgba(3,4,10,0) 100%)',
      }}
      animate={{ opacity: hidden ? 0 : 1 }}
      transition={{ duration: 0.4 }}
    />
  );
}

export function BottomScrim({ hidden }: { hidden?: boolean }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20"
      style={{
        height: 150,
        background:
          'linear-gradient(to top, rgba(3,4,10,0.55) 0%, rgba(3,4,10,0.26) 45%, rgba(3,4,10,0) 100%)',
      }}
      animate={{ opacity: hidden ? 0 : 1 }}
      transition={{ duration: 0.4 }}
    />
  );
}

export function TopBar({
  title,
  subtitle,
  onBack,
  onTitleClick,
  hidden,
}: {
  title: string;
  subtitle?: string;
  onBack?(): void;
  onTitleClick?(): void;
  hidden?: boolean;
}) {
  return (
    <motion.div
      className="pointer-events-none fixed left-0 top-0 z-30 flex max-w-[min(72vw,520px)] items-start gap-2.5"
      style={{ paddingTop: 'calc(var(--sat) + 14px)', paddingLeft: 'calc(var(--sal) + 14px)' }}
      animate={{ opacity: hidden ? 0 : 1, y: hidden ? -6 : 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {onBack && (
        <div className="pointer-events-auto">
          <IconButton label="Back to the multiverse" onClick={onBack}>
            <IconBack width={18} height={18} />
          </IconButton>
        </div>
      )}
      <button
        onClick={onTitleClick}
        className={`pointer-events-auto min-w-0 pt-0.5 text-left no-select ${
          onTitleClick ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        <h1
          className="truncate font-display text-[26px] leading-[1.1] tracking-[0.005em] text-ink/95"
          style={{ textShadow: '0 2px 26px rgba(0,0,0,0.85)' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="mt-0.5 truncate text-[11.5px] leading-snug text-mute/85"
            style={{ textShadow: '0 1px 14px rgba(0,0,0,0.9)' }}
          >
            {subtitle}
          </p>
        )}
      </button>
    </motion.div>
  );
}

export function ActionRail({
  hidden,
  inUniverse,
  onTheme,
  onSettings,
  onTimeline,
  onUniverses,
}: {
  hidden?: boolean;
  inUniverse: boolean;
  onTheme(): void;
  onSettings(): void;
  onTimeline(): void;
  onUniverses(): void;
}) {
  const timelineOpen = useUi((s) => s.timelineOpen);
  const panel = useUi((s) => s.panel);
  return (
    <motion.div
      className="fixed right-0 top-0 z-30 flex flex-col gap-2"
      style={{ paddingTop: 'calc(var(--sat) + 14px)', paddingRight: 'calc(var(--sar) + 14px)' }}
      animate={{ opacity: hidden ? 0 : 1, x: hidden ? 8 : 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {inUniverse ? (
        <>
          <IconButton label="Timeline" onClick={onTimeline} active={timelineOpen}>
            <IconClock width={18} height={18} />
          </IconButton>
          <IconButton label="Look of this universe" onClick={onTheme} active={panel === 'theme'}>
            <IconPalette width={18} height={18} />
          </IconButton>
        </>
      ) : (
        <IconButton label="All universes" onClick={onUniverses} active={panel === 'universes'}>
          <IconLayers width={18} height={18} />
        </IconButton>
      )}
      <IconButton label="Settings" onClick={onSettings} active={panel === 'settings'}>
        <IconGear width={18} height={18} />
      </IconButton>
    </motion.div>
  );
}

export function BottomLeftTools({
  hidden,
  inUniverse,
  onFit,
  onConnect,
  connectActive,
}: {
  hidden?: boolean;
  inUniverse: boolean;
  onFit(): void;
  onConnect(): void;
  connectActive: boolean;
}) {
  return (
    <motion.div
      className="fixed bottom-0 left-0 z-30 flex items-center gap-2"
      style={{
        paddingBottom: 'calc(var(--sab) + 16px)',
        paddingLeft: 'calc(var(--sal) + 14px)',
      }}
      animate={{ opacity: hidden ? 0 : 1, y: hidden ? 8 : 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <IconButton label="Frame everything" onClick={onFit}>
        <IconTarget width={18} height={18} />
      </IconButton>
      {inUniverse && (
        <IconButton
          label={connectActive ? 'Stop connecting' : 'Draw a constellation'}
          onClick={onConnect}
          active={connectActive}
        >
          <IconLink width={18} height={18} />
        </IconButton>
      )}
    </motion.div>
  );
}

export function AddButton({ onClick, hidden }: { onClick(): void; hidden?: boolean }) {
  return (
    <motion.button
      onClick={onClick}
      aria-label="Add something"
      className="fixed bottom-0 right-0 z-30 grid place-items-center no-select"
      style={{
        marginBottom: 'calc(var(--sab) + 14px)',
        marginRight: 'calc(var(--sar) + 14px)',
        height: 56,
        width: 56,
        borderRadius: 999,
        background:
          'radial-gradient(120% 120% at 30% 20%, color-mix(in oklab, var(--accent) 92%, white), var(--accent))',
        color: '#05070d',
        boxShadow:
          '0 14px 40px -14px color-mix(in oklab, var(--accent) 70%, transparent), 0 2px 0 0 rgba(255,255,255,0.28) inset',
      }}
      animate={{ opacity: hidden ? 0 : 1, scale: hidden ? 0.9 : 1 }}
      whileTap={{ scale: 0.93 }}
      transition={RAIL_SPRING}
    >
      <IconPlus width={24} height={24} strokeWidth={1.8} />
    </motion.button>
  );
}

/**
 * The card that appears when one object is selected. Deliberately small and
 * transient — it is a springboard, not a toolbar.
 */
export function SelectionBar({
  object,
  playing,
  onOpen,
  onEdit,
  onMore,
  onConnect,
  onPlay,
}: {
  object: OrbitObject | null;
  playing: boolean;
  onOpen(): void;
  onEdit(): void;
  onMore(e: { x: number; y: number }): void;
  onConnect(): void;
  onPlay(): void;
}) {
  const spec = object ? KIND_SPEC[object.kind] : null;
  const Icon = object ? KIND_ICON[object.kind] : null;
  const openable = object?.kind === 'memory' || object?.kind === 'photo' || object?.kind === 'artwork';
  const playable = object?.kind === 'song' && !!object.audioUrl;

  return (
    <AnimatePresence>
      {object && (
        <motion.div
          className="fixed bottom-0 left-1/2 z-30 w-[min(92vw,430px)]"
          style={{ paddingBottom: 'calc(var(--sab) + 84px)' }}
          initial={{ opacity: 0, y: 14, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 10, x: '-50%' }}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="glass grain relative flex items-center gap-3 rounded-[20px] px-3.5 py-3">
            <div className="grain-overlay" />
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
              style={{
                background: 'var(--accent-soft)',
                color: object.color ?? 'var(--accent)',
              }}
            >
              {Icon && <Icon width={17} height={17} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] leading-tight text-ink/95">
                {object.title || 'Untitled'}
              </div>
              <div className="eyebrow mt-1">{spec?.label}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {playable && (
                <IconButton
                  label={playing ? 'Stop' : 'Play'}
                  onClick={onPlay}
                  active={playing}
                  className="h-9 w-9"
                >
                  {playing ? (
                    <IconPause width={14} height={14} />
                  ) : (
                    <IconPlay width={14} height={14} />
                  )}
                </IconButton>
              )}
              {openable && (
                <button
                  onClick={onOpen}
                  className="rounded-full px-3 py-1.5 text-[12px] no-select transition-transform active:scale-95"
                  style={{ background: 'var(--accent)', color: '#06070c' }}
                >
                  Open
                </button>
              )}
              <IconButton label="Edit" onClick={onEdit} className="h-9 w-9">
                <IconPencil width={15} height={15} />
              </IconButton>
              <IconButton label="Connect" onClick={onConnect} className="h-9 w-9">
                <IconLink width={15} height={15} />
              </IconButton>
              <IconButton
                label="More"
                className="h-9 w-9"
                onClick={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  onMore({ x: r.left + r.width / 2, y: r.top });
                }}
              >
                <span className="text-[15px] leading-none tracking-widest">···</span>
              </IconButton>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A one-line whisper: mode hints, autosave confirmations, errors. */
export function Whisper() {
  const toast = useUi((s) => s.toast);
  const hint = useUi((s) => s.hint);
  const text = toast?.text ?? hint;
  const warn = toast?.tone === 'warn';
  return (
    <AnimatePresence>
      {text && (
        <motion.div
          key={text}
          className="pointer-events-none fixed left-1/2 z-40 -translate-x-1/2"
          style={{ top: 'calc(var(--sat) + 78px)' }}
          initial={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="glass-soft rounded-full px-4 py-2 text-center text-[12px] leading-tight"
            style={{ color: warn ? '#ffb4b4' : 'rgba(226,232,244,0.9)' }}
          >
            {text}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function StatsBadge({
  stats,
}: {
  stats: { fps: number; tier: string; nodes: number } | null;
}) {
  const show = useUi((s) => s.showStats);
  if (!show || !stats) return null;
  return (
    <div
      className="pointer-events-none fixed z-40 rounded-lg px-2.5 py-1.5 font-mono text-[10px] leading-relaxed tracking-wide text-mute/80"
      style={{
        left: 'calc(var(--sal) + 14px)',
        bottom: 'calc(var(--sab) + 74px)',
        background: 'rgba(6,8,14,0.6)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {stats.fps} fps · {stats.tier} · {stats.nodes} objects
    </div>
  );
}

export function ModeBanner({ children, onCancel }: { children: ReactNode; onCancel(): void }) {
  return (
    <motion.div
      className="fixed left-1/2 z-30 -translate-x-1/2"
      style={{ top: 'calc(var(--sat) + 18px)' }}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="glass flex items-center gap-3 rounded-full py-2 pl-4 pr-2">
        <span className="text-[12px] text-ink/90">{children}</span>
        <button
          onClick={onCancel}
          className="rounded-full px-3 py-1 text-[11.5px] text-mute no-select transition-colors hover:text-ink"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          Done
        </button>
      </div>
    </motion.div>
  );
}
