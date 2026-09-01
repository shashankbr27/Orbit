'use client';

import { AnimatePresence, motion } from 'motion/react';
import type { OrbitObject } from '@/data/model';
import { formatDateShort } from '@/engine/scene';
import { IconClose, IconPencil } from './icons';
import { IconButton } from './primitives';
import { useMediaUrl } from './useMediaUrl';

/** A photograph, full size, with whatever you wrote about it underneath. */
export function Lightbox({
  object,
  onClose,
  onEdit,
}: {
  object: OrbitObject | null;
  onClose(): void;
  onEdit(): void;
}) {
  const url = useMediaUrl(object?.mediaId);
  return (
    <AnimatePresence>
      {object && (
        <motion.div
          className="fixed inset-0 z-[65] flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: 'radial-gradient(120% 90% at 50% 40%, rgba(8,10,17,0.96), rgba(2,3,7,0.99))',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
          }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div
            className="flex shrink-0 items-center justify-end gap-2 px-4"
            style={{ paddingTop: 'calc(var(--sat) + 12px)' }}
          >
            <IconButton label="Edit" onClick={onEdit}>
              <IconPencil width={16} height={16} />
            </IconButton>
            <IconButton label="Close" onClick={onClose}>
              <IconClose width={17} height={17} />
            </IconButton>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-2">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
              className="max-h-full"
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={object.title || 'Photograph'}
                  className="max-h-[min(72vh,900px)] max-w-full rounded-[6px] object-contain"
                  style={{
                    background: '#fff',
                    padding: object.kind === 'photo' ? '10px 10px 34px' : 0,
                    boxShadow: '0 50px 110px -50px rgba(0,0,0,0.95)',
                  }}
                />
              ) : (
                <div className="grid h-64 w-64 place-items-center rounded-xl bg-white/5 text-[12px] text-faint">
                  no image yet
                </div>
              )}
            </motion.div>
          </div>

          <motion.div
            className="shrink-0 px-6 text-center"
            style={{ paddingBottom: 'calc(var(--sab) + 26px)' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14, duration: 0.4 }}
          >
            <h2 className="font-display text-[22px] leading-tight text-ink/95">
              {object.title || 'Untitled'}
            </h2>
            {(object.body || object.date || object.place) && (
              <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-mute">
                {object.body}
                {object.body && (object.date || object.place) ? ' · ' : ''}
                {[object.place, object.date ? formatDateShort(object.date) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
