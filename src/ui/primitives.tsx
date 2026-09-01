'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { IconClose } from './icons';

/* ── viewport helpers ───────────────────────────────────────────────────── */

export function useMedia(query: string, fallback = false) {
  const [matches, setMatches] = useState(fallback);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const on = () => setMatches(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/** Mobile is the primary platform, so it is the default assumption. */
export const useIsPhone = () => useMedia('(max-width: 719px)', true);
export const useIsDesktop = () => useMedia('(min-width: 1024px)', false);

/* ── buttons ────────────────────────────────────────────────────────────── */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'default' | 'accent' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
};

export function Button({ tone = 'default', size = 'md', className = '', ...rest }: BtnProps) {
  const pad =
    size === 'sm' ? 'px-3 py-1.5 text-[12px]' : size === 'lg' ? 'px-5 py-3 text-[14px]' : 'px-4 py-2.5 text-[13px]';
  const look =
    tone === 'accent'
      ? 'text-[#06070c] font-medium'
      : tone === 'danger'
        ? 'text-[#ff9b9b] hover:text-[#ffb4b4]'
        : tone === 'ghost'
          ? 'text-mute hover:text-ink'
          : 'text-ink';
  return (
    <button
      {...rest}
      className={`relative isolate rounded-full ${pad} ${look} no-select transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${className}`}
      style={{
        background:
          tone === 'accent'
            ? 'var(--accent)'
            : tone === 'ghost'
              ? 'transparent'
              : 'rgba(255,255,255,0.055)',
        border:
          tone === 'ghost'
            ? '1px solid transparent'
            : tone === 'accent'
              ? '1px solid transparent'
              : '1px solid rgba(255,255,255,0.10)',
        boxShadow: tone === 'accent' ? '0 6px 26px -10px var(--accent)' : undefined,
        ...rest.style,
      }}
    />
  );
}

export function IconButton({
  label,
  children,
  active,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full no-select transition-all duration-200 active:scale-[0.94] ${className}`}
      style={{
        background: active ? 'var(--accent-soft)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${active ? 'color-mix(in oklab, var(--accent) 45%, transparent)' : 'rgba(255,255,255,0.10)'}`,
        color: active ? 'var(--accent)' : 'rgba(232,237,247,0.88)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        ...rest.style,
      }}
    >
      {children}
    </button>
  );
}

export function Chip({
  active,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...rest}
      className="rounded-full px-3 py-1.5 text-[11.5px] no-select transition-all duration-200 active:scale-[0.97]"
      style={{
        background: active ? 'var(--accent-soft)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${active ? 'color-mix(in oklab, var(--accent) 40%, transparent)' : 'rgba(255,255,255,0.09)'}`,
        color: active ? 'var(--accent)' : 'rgba(210,217,232,0.8)',
        ...rest.style,
      }}
    >
      {children}
    </button>
  );
}

/* ── surfaces ───────────────────────────────────────────────────────────── */

/**
 * One surface for both platforms: a bottom sheet on a phone, a floating panel
 * on a larger screen. Same content, same component — the spec asks for mobile
 * not to be a shrunken desktop, and this is where that promise is kept.
 */
export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  side = 'bottom',
  width = 380,
  dim = true,
}: {
  open: boolean;
  onClose(): void;
  title?: ReactNode;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  side?: 'bottom' | 'right' | 'left';
  width?: number;
  dim?: boolean;
}) {
  const phone = useIsPhone();
  const reduce = useReducedMotion();
  const asSheet = phone || side === 'bottom';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const spring = reduce
    ? { duration: 0.14 }
    : ({ type: 'spring', stiffness: 420, damping: 38, mass: 0.9 } as const);

  return (
    <AnimatePresence>
      {open && (
        <>
          {dim && (
            <motion.div
              className="fixed inset-0 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24 }}
              onPointerDown={onClose}
              style={{
                background:
                  'radial-gradient(120% 90% at 50% 100%, rgba(3,4,10,0.72), rgba(3,4,10,0.34))',
                backdropFilter: 'blur(2px)',
                WebkitBackdropFilter: 'blur(2px)',
              }}
            />
          )}
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`glass grain fixed z-50 flex flex-col overflow-hidden ${
              asSheet
                ? 'inset-x-0 bottom-0 rounded-t-[26px]'
                : side === 'right'
                  ? 'right-0 top-0 h-full rounded-l-[22px]'
                  : 'left-0 top-0 h-full rounded-r-[22px]'
            }`}
            style={
              asSheet
                ? {
                    paddingBottom: 'calc(var(--sab) + 14px)',
                    maxHeight: 'min(86vh, 720px)',
                  }
                : { width, paddingTop: 'calc(var(--sat) + 10px)' }
            }
            initial={asSheet ? { y: '100%' } : { x: side === 'right' ? '100%' : '-100%' }}
            animate={asSheet ? { y: 0 } : { x: 0 }}
            exit={asSheet ? { y: '100%' } : { x: side === 'right' ? '100%' : '-100%' }}
            transition={spring}
          >
            <div className="grain-overlay" />
            {asSheet && (
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-9 rounded-full bg-white/22" />
              </div>
            )}
            {(title || eyebrow) && (
              <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-3">
                <div className="min-w-0">
                  {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
                  {title && (
                    <h2 className="font-display text-[22px] leading-tight tracking-[0.01em] text-ink">
                      {title}
                    </h2>
                  )}
                </div>
                <IconButton label="Close" onClick={onClose} className="-mt-1">
                  <IconClose width={17} height={17} />
                </IconButton>
              </div>
            )}
            <div className="scroll-y min-h-0 flex-1 px-5 pb-2">{children}</div>
            {footer && (
              <div className="border-t border-white/8 px-5 pt-3.5 pb-1">{footer}</div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** A floating popover anchored near a point — desktop context menus. */
export function Popover({
  open,
  x,
  y,
  onClose,
  children,
  width = 214,
}: {
  open: boolean;
  x: number;
  y: number;
  onClose(): void;
  children: ReactNode;
  width?: number;
}) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const vw = typeof window === 'undefined' ? 1024 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 768 : window.innerHeight;
  const left = Math.min(Math.max(10, x - width / 2), vw - width - 10);
  const flip = y > vh - 260;
  const top = flip ? Math.max(10, y - 12) : y + 12;

  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={onClose} />
          <motion.div
            role="menu"
            className="glass grain fixed z-50 overflow-hidden rounded-2xl p-1.5"
            style={{ left, top, width, transformOrigin: flip ? 'bottom center' : 'top center' }}
            initial={
              reduce
                ? { opacity: 0, y: flip ? '-100%' : 0 }
                : { opacity: 0, scale: 0.94, y: flip ? '-100%' : 0 }
            }
            animate={{ opacity: 1, scale: 1, y: flip ? '-100%' : 0 }}
            exit={
              reduce
                ? { opacity: 0, y: flip ? '-100%' : 0 }
                : { opacity: 0, scale: 0.96, y: flip ? '-100%' : 0 }
            }
            transition={{ duration: 0.19, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="grain-overlay" />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function MenuItem({
  icon,
  children,
  danger,
  onClick,
  hint,
}: {
  icon?: ReactNode;
  children: ReactNode;
  danger?: boolean;
  onClick(): void;
  hint?: string;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-[13px] no-select transition-colors duration-150 hover:bg-white/7 ${
        danger ? 'text-[#ff9b9b]' : 'text-ink/90'
      }`}
    >
      {icon && <span className="grid h-5 w-5 shrink-0 place-items-center opacity-70">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-[10px] tracking-wider text-faint">{hint}</span>}
    </button>
  );
}

/* ── form bits ──────────────────────────────────────────────────────────── */

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block py-2">
      <div className="eyebrow mb-2">{label}</div>
      {children}
      {hint && <div className="mt-1.5 text-[11px] leading-snug text-faint">{hint}</div>}
    </label>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(v: number): void;
  format?(v: number): string;
}) {
  return (
    <div className="py-2">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="eyebrow">{label}</span>
        <span className="text-[11px] tabular-nums text-mute">
          {format ? format(value) : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export function Divider({ label }: { label?: string }) {
  if (!label) return <div className="my-3 h-px bg-white/8" />;
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-white/8" />
      <span className="eyebrow">{label}</span>
      <div className="h-px flex-1 bg-white/8" />
    </div>
  );
}

export function Swatches({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange(c: string): void;
  colors: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c}
          aria-label={c}
          onClick={() => onChange(c)}
          className="h-7 w-7 rounded-full no-select transition-transform duration-150 active:scale-90"
          style={{
            background: c,
            boxShadow:
              value.toLowerCase() === c.toLowerCase()
                ? `0 0 0 2px #0a0d16, 0 0 0 3.5px ${c}`
                : 'inset 0 0 0 1px rgba(255,255,255,0.16)',
          }}
        />
      ))}
    </div>
  );
}

export const ACCENTS = [
  '#8fb4ff',
  '#cdd8ff',
  '#b08cff',
  '#ff9e7a',
  '#ffd9a0',
  '#6ff0c0',
  '#7fe0ff',
  '#ff9bc4',
  '#d8b26a',
  '#ffffff',
];
