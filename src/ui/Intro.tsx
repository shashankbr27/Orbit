'use client';

import { AnimatePresence, motion } from 'motion/react';
import type { BootStatus } from '@/state/store';
import { Button } from './primitives';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The first four seconds.
 *
 * A dark card over the sky (which is already rendering underneath), the
 * wordmark, then nothing. No progress bars, no spinners — the point is that
 * arriving somewhere should feel quiet.
 */
export function BootScreen({ status, error }: { status: BootStatus; error: string | null }) {
  const visible = status !== 'ready' && status !== 'error';
  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            className="fixed inset-0 z-[60] grid place-items-center"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: EASE }}
            style={{
              background:
                'radial-gradient(120% 100% at 50% 45%, #080b14 0%, #04050a 55%, #020308 100%)',
            }}
          >
            <div className="px-8 text-center">
              <motion.div
                initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 1.2, ease: EASE }}
              >
                <div
                  className="font-display text-[42px] leading-none tracking-[0.22em] text-ink/90"
                  style={{ textShadow: '0 0 60px rgba(143,180,255,0.25)' }}
                >
                  ORBIT
                </div>
              </motion.div>
              <motion.p
                className="mt-5 text-[11.5px] tracking-[0.24em] text-faint uppercase"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 1.1 }}
              >
                {status === 'seeding' ? 'placing a few stars' : 'opening'}
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {status === 'error' && (
          <motion.div
            className="fixed inset-0 z-[60] grid place-items-center bg-[#04050a] px-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="max-w-sm text-center">
              <h1 className="font-display text-[26px] leading-tight text-ink">
                ORBIT could not open.
              </h1>
              <p className="mt-3 text-[13px] leading-relaxed text-mute">{error}</p>
              <p className="mt-3 text-[12px] leading-relaxed text-faint">
                This usually means private browsing is on, or the browser is blocking local
                storage. ORBIT keeps everything on your device, so it needs somewhere to put it.
              </p>
              <div className="mt-6">
                <Button tone="accent" onClick={() => location.reload()}>
                  Try again
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Gift mode.
 *
 * Shown once, the first time a freshly seeded universe opens. The words matter
 * more than the design here: it has to read as a present, not as onboarding.
 */
export function GiftIntro({ open, onBegin }: { open: boolean; onBegin(): void }) {
  const lines = [
    'Welcome to your universe.',
    'Some stars have already been placed for you.',
    'Everything else is yours to create.',
  ];
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-center justify-center px-7"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.9, ease: EASE } }}
          transition={{ duration: 1.4, delay: 0.5, ease: EASE }}
          style={{
            background:
              'radial-gradient(85% 65% at 50% 50%, rgba(4,5,10,0.66) 0%, rgba(4,5,10,0.40) 58%, rgba(4,5,10,0.04) 100%)',
          }}
        >
          <div className="max-w-[440px] text-center">
            {lines.map((line, i) => (
              <motion.p
                key={line}
                className={
                  i === 0
                    ? 'font-display text-[30px] leading-[1.22] text-ink/95 sm:text-[36px]'
                    : 'mt-3.5 text-[14px] leading-relaxed text-mute sm:text-[15px]'
                }
                initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ delay: 1.0 + i * 0.55, duration: 1.15, ease: EASE }}
              >
                {line}
              </motion.p>
            ))}
            <motion.div
              className="mt-9"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 3.0, duration: 1, ease: EASE }}
            >
              <Button tone="accent" size="lg" onClick={onBegin}>
                Look around
              </Button>
              <p className="mt-4 text-[11px] leading-relaxed tracking-wide text-faint">
                Drag to move. Pinch or scroll to zoom. Long press anything for its menu.
              </p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
