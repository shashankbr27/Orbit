'use client';

import { useRef, useState } from 'react';
import {
  UNIVERSE_FORMS,
  type Universe,
  type UniverseForm,
} from '@/data/model';
import { THEME_PRESETS, resolveTheme, type ThemePresetId, type ThemeSpec } from '@/engine/theme';
import type { QualityTier } from '@/engine/quality';
import { ACCENTS, Button, Chip, Divider, Field, Sheet, Slider, Swatches } from './primitives';
import { IconDownload, IconPlus, IconTrash, IconUpload } from './icons';

/* ── theme ──────────────────────────────────────────────────────────────── */

const FORM_LABEL: Record<UniverseForm, string> = {
  planet: 'Planet',
  star: 'Star',
  galaxy: 'Galaxy',
  nebula: 'Nebula',
  ringed: 'Ringed',
  moon: 'Moon',
};

export function ThemePanel({
  open,
  universe,
  onClose,
  onChange,
}: {
  open: boolean;
  universe: Universe | null;
  onClose(): void;
  onChange(patch: Partial<Universe>): void;
}) {
  if (!universe) return null;
  const preset = (universe.theme.preset ?? 'night') as ThemePresetId;
  const overrides = (universe.theme.overrides ?? {}) as Partial<ThemeSpec>;
  const spec = resolveTheme({ preset, overrides });

  const setOverride = (key: keyof ThemeSpec, value: number) => {
    onChange({ theme: { preset, overrides: { ...overrides, [key]: value } } });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow="How this universe looks"
      title={universe.name}
      side="right"
      width={392}
      footer={
        <div className="flex items-center justify-between pb-1">
          <span className="text-[11px] text-faint">Applies to this universe only</span>
          <Button
            size="sm"
            tone="ghost"
            onClick={() => onChange({ theme: { preset, overrides: {} } })}
          >
            Back to preset
          </Button>
        </div>
      }
    >
      <Field label="Sky">
        <div className="flex flex-wrap gap-1.5 pt-1">
          {THEME_PRESETS.map((p) => (
            <Chip
              key={p.id}
              active={preset === p.id}
              onClick={() => onChange({ theme: { preset: p.id, overrides: {} } })}
            >
              {p.name}
            </Chip>
          ))}
        </div>
      </Field>
      <p className="-mt-1 pb-2 text-[11.5px] leading-snug text-faint">
        {THEME_PRESETS.find((p) => p.id === preset)?.blurb}
      </p>

      <Divider label="Its body" />

      <Field label="Shape in the multiverse">
        <div className="flex flex-wrap gap-1.5 pt-1">
          {UNIVERSE_FORMS.map((f) => (
            <Chip key={f} active={universe.form === f} onClick={() => onChange({ form: f })}>
              {FORM_LABEL[f]}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Colour">
        <div className="pt-1">
          <Swatches colors={ACCENTS} value={universe.color} onChange={(c) => onChange({ color: c })} />
        </div>
      </Field>

      <Slider
        label="Size"
        min={0.5}
        max={2}
        step={0.02}
        value={universe.size}
        onChange={(v) => onChange({ size: v })}
        format={(v) => `${Math.round(v * 100)}%`}
      />

      <Divider label="Its weather" />

      <Slider
        label="Stars"
        min={0}
        max={1.6}
        value={spec.starDensity}
        onChange={(v) => setOverride('starDensity', v)}
        format={(v) => `${Math.round((v / 1.6) * 100)}%`}
      />
      <Slider
        label="Nebula"
        min={0}
        max={1.4}
        value={spec.nebulaAmount}
        onChange={(v) => setOverride('nebulaAmount', v)}
        format={(v) => `${Math.round((v / 1.4) * 100)}%`}
      />
      <Slider
        label="Dust"
        min={0}
        max={1.6}
        value={spec.dustDensity}
        onChange={(v) => setOverride('dustDensity', v)}
        format={(v) => `${Math.round((v / 1.6) * 100)}%`}
      />
      <Slider
        label="Vignette"
        min={0}
        max={0.9}
        value={spec.vignette}
        onChange={(v) => setOverride('vignette', v)}
        format={(v) => `${Math.round((v / 0.9) * 100)}%`}
      />
      <Slider
        label="How alive"
        min={0}
        max={1.5}
        value={spec.animation}
        onChange={(v) => setOverride('animation', v)}
        format={(v) => (v < 0.05 ? 'still' : `${Math.round((v / 1.5) * 100)}%`)}
      />
      <div className="h-2" />
    </Sheet>
  );
}

/* ── settings ───────────────────────────────────────────────────────────── */

const TIERS: { id: QualityTier | 'auto'; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'ultra', label: 'Ultra' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];

export function SettingsPanel({
  open,
  onClose,
  motion,
  onMotion,
  quality,
  onQuality,
  showStats,
  onToggleStats,
  reducedMotion,
  onExportAll,
  onExportUniverse,
  onImport,
  onReset,
  canExportUniverse,
}: {
  open: boolean;
  onClose(): void;
  motion: number;
  onMotion(v: number): void;
  quality: QualityTier | 'auto';
  onQuality(t: QualityTier | 'auto'): void;
  showStats: boolean;
  onToggleStats(): void;
  reducedMotion: boolean;
  onExportAll(): void;
  onExportUniverse(): void;
  onImport(text: string): void;
  onReset(): void;
  canExportUniverse: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const isIos =
    typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

  return (
    <Sheet open={open} onClose={onClose} eyebrow="Settings" title="How it behaves" side="right" width={392}>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.orbit,.json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          onImport(await f.text());
        }}
      />

      <Slider
        label="Motion"
        min={0}
        max={1.5}
        value={motion}
        onChange={onMotion}
        format={(v) => (v < 0.05 ? 'still' : v < 0.6 ? 'calm' : v < 1.1 ? 'normal' : 'lively')}
      />
      {reducedMotion && (
        <p className="-mt-1 pb-2 text-[11.5px] leading-snug text-faint">
          Your device asks for reduced motion, so continuous animation is off. The universe is
          still fully explorable.
        </p>
      )}

      <Field label="Quality" hint="Auto watches the frame rate and adjusts as it goes.">
        <div className="flex flex-wrap gap-1.5 pt-1">
          {TIERS.map((t) => (
            <Chip key={t.id} active={quality === t.id} onClick={() => onQuality(t.id)}>
              {t.label}
            </Chip>
          ))}
        </div>
      </Field>

      <button
        role="switch"
        aria-checked={showStats}
        onClick={onToggleStats}
        className="flex w-full cursor-pointer items-center justify-between py-3 text-left"
      >
        <span className="text-[13px] text-ink/90">Show frame rate</span>
        <span
          className="relative block h-6 w-11 shrink-0 rounded-full transition-colors duration-200"
          style={{ background: showStats ? 'var(--accent)' : 'rgba(255,255,255,0.12)' }}
        >
          {/* `left: 0` matters: an absolutely positioned child with `left: auto`
              takes its static position, which a button centres. */}
          <span
            className="absolute top-0.5 block h-5 w-5 rounded-full bg-white transition-transform duration-200"
            style={{ left: 0, transform: `translateX(${showStats ? 22 : 2}px)` }}
          />
        </span>
      </button>

      <Divider label="Your universes" />

      <div className="flex flex-wrap gap-2 pb-1">
        {canExportUniverse && (
          <Button size="sm" onClick={onExportUniverse}>
            <span className="flex items-center gap-2">
              <IconDownload width={15} height={15} />
              Export this universe
            </span>
          </Button>
        )}
        <Button size="sm" onClick={onExportAll}>
          <span className="flex items-center gap-2">
            <IconDownload width={15} height={15} />
            Export everything
          </span>
        </Button>
        <Button size="sm" onClick={() => fileInput.current?.click()}>
          <span className="flex items-center gap-2">
            <IconUpload width={15} height={15} />
            Import
          </span>
        </Button>
      </div>
      <p className="pb-1 pt-2 text-[11.5px] leading-relaxed text-faint">
        Everything lives on this device, in this browser. Nothing is uploaded anywhere. An export
        is a single file with your universes and photographs inside — keep it somewhere safe.
      </p>

      {isIos && !standalone && (
        <>
          <Divider label="On your phone" />
          <p className="text-[12px] leading-relaxed text-mute">
            Share → <span className="text-ink">Add to Home Screen</span> and ORBIT opens
            full-screen, with no browser around it. It works offline once it has loaded.
          </p>
        </>
      )}

      <Divider />

      {confirmReset ? (
        <div className="pb-4">
          <p className="mb-3 text-[12px] leading-snug text-mute">
            This erases every universe on this device and starts again from the gift. Export first
            if you want to keep any of it.
          </p>
          <div className="flex gap-2">
            <Button size="sm" tone="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button size="sm" tone="danger" onClick={onReset}>
              Erase and start over
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirmReset(true)}
          className="mb-4 flex items-center gap-2 text-[12px] text-mute no-select transition-colors hover:text-[#ff9b9b]"
        >
          <IconTrash width={15} height={15} />
          Start over
        </button>
      )}
    </Sheet>
  );
}

/* ── universes ──────────────────────────────────────────────────────────── */

export function UniversePanel({
  open,
  universes,
  counts,
  onClose,
  onEnter,
  onRename,
  onDelete,
  onCreate,
  onImport,
}: {
  open: boolean;
  universes: Universe[];
  counts: Record<string, number>;
  onClose(): void;
  onEnter(id: string): void;
  onRename(id: string, name: string): void;
  onDelete(id: string): void;
  onCreate(name: string): void;
  onImport(text: string): void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [newName, setNewName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow={`${universes.length} ${universes.length === 1 ? 'universe' : 'universes'}`}
      title="Everything you have"
      side="right"
      width={392}
      footer={
        <div className="flex items-center gap-2 pb-1">
          <input
            type="text"
            value={newName}
            placeholder="Name a new universe"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) {
                onCreate(newName.trim());
                setNewName('');
              }
            }}
          />
          <Button
            tone="accent"
            size="sm"
            disabled={!newName.trim()}
            onClick={() => {
              onCreate(newName.trim());
              setNewName('');
            }}
          >
            <IconPlus width={16} height={16} />
          </Button>
        </div>
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.orbit,.json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onImport(await f.text());
        }}
      />

      <div className="space-y-1.5 py-1">
        {universes.map((u) => (
          <div
            key={u.id}
            className="group flex items-center gap-3 rounded-2xl px-3 py-2.5"
            style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: u.color, boxShadow: `0 0 12px ${u.color}` }}
            />
            {editing === u.id ? (
              <input
                autoFocus
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (draft.trim()) onRename(u.id, draft.trim());
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (draft.trim()) onRename(u.id, draft.trim());
                    setEditing(null);
                  }
                  if (e.key === 'Escape') setEditing(null);
                }}
              />
            ) : (
              <button
                className="min-w-0 flex-1 text-left no-select"
                onClick={() => onEnter(u.id)}
                onDoubleClick={() => {
                  setEditing(u.id);
                  setDraft(u.name);
                }}
              >
                <span className="block truncate text-[13.5px] leading-tight text-ink/95">
                  {u.name}
                </span>
                <span className="eyebrow mt-1 block">
                  {counts[u.id] ?? 0} {(counts[u.id] ?? 0) === 1 ? 'thing' : 'things'}
                </span>
              </button>
            )}
            <button
              aria-label="Rename"
              onClick={() => {
                setEditing(u.id);
                setDraft(u.name);
              }}
              className="rounded-full px-2 py-1 text-[11px] text-faint no-select transition-colors hover:text-ink"
            >
              rename
            </button>
            {universes.length > 1 && (
              <button
                aria-label={`Delete ${u.name}`}
                onClick={() => onDelete(u.id)}
                className="shrink-0 rounded-full p-1.5 text-faint no-select transition-colors hover:text-[#ff9b9b]"
              >
                <IconTrash width={15} height={15} />
              </button>
            )}
          </div>
        ))}
      </div>

      <Divider />
      <Button size="sm" onClick={() => fileInput.current?.click()}>
        <span className="flex items-center gap-2">
          <IconUpload width={15} height={15} />
          Import a universe file
        </span>
      </Button>
      <div className="h-3" />
    </Sheet>
  );
}
