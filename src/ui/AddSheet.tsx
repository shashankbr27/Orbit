'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useRef } from 'react';
import { KIND_SPEC, OBJECT_KINDS, type ObjectKind } from '@/data/model';
import { KIND_ICON } from './icons';
import { Sheet, useIsPhone } from './primitives';

/**
 * "Add something."
 *
 * Bottom sheet on a phone, a floating card above the + on a larger screen.
 * Either way it covers as little of the sky as it can get away with.
 */
export function AddSheet({
  open,
  onClose,
  onPick,
  onPickPhotos,
}: {
  open: boolean;
  onClose(): void;
  onPick(kind: ObjectKind): void;
  onPickPhotos(files: FileList): void;
}) {
  const phone = useIsPhone();
  const fileInput = useRef<HTMLInputElement>(null);

  const grid = (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onPickPhotos(e.target.files);
          e.target.value = '';
          onClose();
        }}
      />
      <div className="grid grid-cols-2 gap-2 pb-2 sm:grid-cols-2">
        {OBJECT_KINDS.map((kind, i) => {
          const spec = KIND_SPEC[kind];
          const Icon = KIND_ICON[kind];
          return (
            <motion.button
              key={kind}
              onClick={() => {
                if (kind === 'photo') fileInput.current?.click();
                else onPick(kind);
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.02 * i, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="group flex items-start gap-2.5 rounded-2xl p-3 text-left no-select transition-all duration-200 active:scale-[0.975]"
              style={{
                background: 'rgba(255,255,255,0.035)',
                border: '1px solid rgba(255,255,255,0.075)',
              }}
            >
              <span
                className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors duration-200"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                <Icon width={16} height={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] leading-tight text-ink/95">{spec.label}</span>
                <span className="mt-1 block text-[10.5px] leading-snug text-faint">
                  {spec.hint}
                </span>
              </span>
            </motion.button>
          );
        })}
      </div>
    </>
  );

  if (phone) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        eyebrow="Place something new"
        title="What is it?"
      >
        {grid}
      </Sheet>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={onClose} />
          <motion.div
            role="dialog"
            aria-label="Add something"
            className="glass grain fixed z-50 overflow-hidden rounded-[24px] p-4"
            style={{
              right: 'calc(var(--sar) + 14px)',
              bottom: 'calc(var(--sab) + 82px)',
              width: 420,
            }}
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="grain-overlay" />
            <div className="eyebrow mb-1">Place something new</div>
            <h2 className="mb-3 font-display text-[21px] leading-tight text-ink">What is it?</h2>
            {grid}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
