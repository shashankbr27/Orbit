'use client';

import { useEffect, useRef, useState } from 'react';
import { KIND_SPEC, type ObjectKind, type OrbitObject } from '@/data/model';
import { ACCENTS, Button, Chip, Divider, Field, Sheet, Slider, Swatches } from './primitives';
import { IconLayers, IconPhoto, IconSparkle, IconTrash } from './icons';

const BODY_LABEL: Partial<Record<ObjectKind, { label: string; placeholder: string; rows: number }>> = {
  note: { label: 'What does it say', placeholder: 'Write it the way you would say it.', rows: 6 },
  person: { label: 'Who are they to you', placeholder: 'one line is plenty', rows: 2 },
  song: { label: 'Artist', placeholder: 'who made it', rows: 1 },
  memory: { label: 'A line about it', placeholder: 'the part you would tell someone', rows: 3 },
  photo: { label: 'Caption', placeholder: 'where, when, who', rows: 2 },
  artwork: { label: 'About it', placeholder: 'medium, year, why', rows: 2 },
  place: { label: 'About it', placeholder: 'what it was like', rows: 2 },
  event: { label: 'What happened', placeholder: 'briefly', rows: 2 },
  collection: { label: 'About it', placeholder: 'what holds these together', rows: 2 },
};

const HAS_DATE: ObjectKind[] = ['memory', 'event', 'photo', 'artwork', 'note'];
const HAS_PLACE: ObjectKind[] = ['memory', 'photo', 'event', 'place'];

/**
 * The object editor.
 *
 * Everything autosaves as you type — there is no Save button anywhere in ORBIT,
 * because a universe you can lose is not somewhere you would put anything
 * important.
 */
export function ObjectEditor({
  object,
  onClose,
  onChange,
  onDelete,
  onOpenScrapbook,
  onReplacePhoto,
  onConnect,
  memberTitles,
}: {
  object: OrbitObject | null;
  onClose(): void;
  onChange(patch: Partial<OrbitObject>): void;
  onDelete(): void;
  onOpenScrapbook(): void;
  onReplacePhoto(file: File): void;
  onConnect(): void;
  memberTitles: string[];
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setConfirmDelete(false);
  }, [object?.id]);

  if (!object) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const spec = KIND_SPEC[object.kind];
  const body = BODY_LABEL[object.kind];

  return (
    <Sheet
      open
      onClose={onClose}
      eyebrow={spec.label}
      title={object.title || 'Untitled'}
      side="right"
      width={392}
      footer={
        <div className="flex items-center justify-between gap-3 pb-1">
          {confirmDelete ? (
            <div className="flex w-full items-center gap-2">
              <span className="flex-1 text-[12px] text-mute">Delete this for good?</span>
              <Button size="sm" tone="ghost" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
              <Button size="sm" tone="danger" onClick={onDelete}>
                Delete
              </Button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 rounded-full px-3 py-2 text-[12px] text-mute no-select transition-colors hover:text-[#ff9b9b]"
              >
                <IconTrash width={15} height={15} />
                Delete
              </button>
              <span className="text-[11px] text-faint">Saved automatically</span>
            </>
          )}
        </div>
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onReplacePhoto(f);
          e.target.value = '';
        }}
      />

      <Field label="Name">
        <input
          type="text"
          value={object.title}
          placeholder={spec.label}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </Field>

      {body && (
        <Field label={body.label}>
          {body.rows > 1 ? (
            <textarea
              rows={body.rows}
              value={object.body ?? ''}
              placeholder={body.placeholder}
              onChange={(e) => onChange({ body: e.target.value })}
              className="resize-y leading-relaxed"
              style={{ fontFamily: object.kind === 'note' ? 'var(--font-hand)' : undefined, fontSize: object.kind === 'note' ? 16 : undefined }}
            />
          ) : (
            <input
              type="text"
              value={object.body ?? ''}
              placeholder={body.placeholder}
              onChange={(e) => onChange({ body: e.target.value })}
            />
          )}
        </Field>
      )}

      {HAS_DATE.includes(object.kind) && (
        <Field label="When" hint="Dated things show up on the timeline.">
          <input
            type="date"
            value={object.date ?? ''}
            onChange={(e) => onChange({ date: e.target.value || undefined })}
          />
        </Field>
      )}

      {HAS_PLACE.includes(object.kind) && object.kind !== 'place' && (
        <Field label="Where">
          <input
            type="text"
            value={object.place ?? ''}
            placeholder="somewhere"
            onChange={(e) => onChange({ place: e.target.value || undefined })}
          />
        </Field>
      )}

      {object.kind === 'song' && (
        <Field label="Link" hint="A preview or streaming url. Optional.">
          <input
            type="url"
            value={object.audioUrl ?? ''}
            placeholder="https://"
            onChange={(e) => onChange({ audioUrl: e.target.value || undefined })}
          />
        </Field>
      )}

      {object.kind === 'constellation' && (
        <Field label="Stars in it" hint="Tap the constellation tool to add or remove stars.">
          <div className="flex flex-wrap gap-1.5 pt-1">
            {memberTitles.length ? (
              memberTitles.map((t, i) => (
                <span
                  key={i}
                  className="rounded-full px-2.5 py-1 text-[11px] text-mute"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  {t}
                </span>
              ))
            ) : (
              <span className="text-[12px] text-faint">Nothing connected yet.</span>
            )}
          </div>
        </Field>
      )}

      <Divider label="Look" />

      <Field label="Colour">
        <div className="pt-1">
          <Swatches
            colors={ACCENTS}
            value={object.color ?? ''}
            onChange={(c) => onChange({ color: c })}
          />
        </div>
      </Field>

      {spec.resizable && (
        <Slider
          label="Size"
          min={0.4}
          max={3}
          step={0.02}
          value={object.scale}
          onChange={(v) => onChange({ scale: v })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      )}

      {spec.rotatable && (
        <Slider
          label="Tilt"
          min={-0.6}
          max={0.6}
          step={0.005}
          value={object.rotation}
          onChange={(v) => onChange({ rotation: v })}
          format={(v) => `${Math.round((v * 180) / Math.PI)}°`}
        />
      )}

      <Slider
        label="How much it matters"
        min={0}
        max={1}
        step={0.02}
        value={object.glow}
        onChange={(v) => onChange({ glow: v })}
        format={(v) => (v > 0.75 ? 'a lot' : v > 0.45 ? 'some' : v > 0.15 ? 'a little' : 'quietly')}
      />

      <Field label="Appearance">
        <div className="flex flex-wrap gap-1.5 pt-1">
          {[0, 1, 2, 3, 4, 5].map((v) => (
            <Chip key={v} active={object.variant === v} onClick={() => onChange({ variant: v })}>
              {v + 1}
            </Chip>
          ))}
        </div>
      </Field>

      <Divider />

      <div className="flex flex-wrap gap-2 pb-3">
        {object.kind === 'memory' && (
          <Button onClick={onOpenScrapbook} tone="accent" size="sm">
            <span className="flex items-center gap-2">
              <IconLayers width={15} height={15} />
              Open the scrapbook
            </span>
          </Button>
        )}
        {(object.kind === 'photo' || object.kind === 'artwork') && (
          <Button size="sm" onClick={() => fileInput.current?.click()}>
            <span className="flex items-center gap-2">
              <IconPhoto width={15} height={15} />
              {object.mediaId ? 'Replace image' : 'Choose an image'}
            </span>
          </Button>
        )}
        <Button size="sm" onClick={onConnect}>
          <span className="flex items-center gap-2">
            <IconSparkle width={15} height={15} />
            Connect it to something
          </span>
        </Button>
      </div>
    </Sheet>
  );
}
