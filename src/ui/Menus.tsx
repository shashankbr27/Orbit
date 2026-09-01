'use client';

import { useEffect, useState } from 'react';
import { KIND_SPEC, type OrbitObject, type Universe } from '@/data/model';
import {
  IconBack,
  IconCollection,
  IconCopy,
  IconDownload,
  IconLayers,
  IconLink,
  IconPalette,
  IconPencil,
  IconSparkle,
  IconTarget,
  IconTrash,
} from './icons';
import { MenuItem, Popover } from './primitives';

/** Long press on mobile, right-click on desktop. Same menu either way. */
export function ObjectMenu({
  anchor,
  object,
  collections,
  onClose,
  onOpen,
  onEdit,
  onConnect,
  onDuplicate,
  onDelete,
  onMoveToCollection,
  onBringToFront,
  onFocus,
}: {
  anchor: { x: number; y: number } | null;
  object: OrbitObject | null;
  collections: OrbitObject[];
  onClose(): void;
  onOpen(): void;
  onEdit(): void;
  onConnect(): void;
  onDuplicate(): void;
  onDelete(): void;
  onMoveToCollection(id: string | null): void;
  onBringToFront(): void;
  onFocus(): void;
}) {
  const [page, setPage] = useState<'root' | 'collection' | 'confirm'>('root');
  useEffect(() => {
    setPage('root');
  }, [object?.id, anchor?.x, anchor?.y]);

  const open = !!anchor && !!object;
  const openable =
    object?.kind === 'memory' || object?.kind === 'photo' || object?.kind === 'artwork';

  return (
    <Popover open={open} x={anchor?.x ?? 0} y={anchor?.y ?? 0} onClose={onClose} width={226}>
      {object && (
        <>
          <div className="px-2.5 pb-1.5 pt-1">
            <div className="truncate text-[12.5px] text-ink/90">{object.title || 'Untitled'}</div>
            <div className="eyebrow mt-1">{KIND_SPEC[object.kind].label}</div>
          </div>
          <div className="my-1 h-px bg-white/8" />

          {page === 'root' && (
            <>
              {openable && (
                <MenuItem icon={<IconLayers width={15} height={15} />} onClick={onOpen}>
                  Open
                </MenuItem>
              )}
              <MenuItem icon={<IconPencil width={15} height={15} />} onClick={onEdit}>
                Edit, resize, tilt
              </MenuItem>
              <MenuItem icon={<IconLink width={15} height={15} />} onClick={onConnect}>
                Connect
              </MenuItem>
              <MenuItem icon={<IconTarget width={15} height={15} />} onClick={onFocus}>
                Fly to it
              </MenuItem>
              <MenuItem icon={<IconCopy width={15} height={15} />} onClick={onDuplicate}>
                Duplicate
              </MenuItem>
              <MenuItem icon={<IconSparkle width={15} height={15} />} onClick={onBringToFront}>
                Bring to front
              </MenuItem>
              {collections.length > 0 && (
                <MenuItem
                  icon={<IconCollection width={15} height={15} />}
                  onClick={() => setPage('collection')}
                  hint="›"
                >
                  {object.parentId ? 'Change collection' : 'Add to collection'}
                </MenuItem>
              )}
              <div className="my-1 h-px bg-white/8" />
              <MenuItem
                icon={<IconTrash width={15} height={15} />}
                danger
                onClick={() => setPage('confirm')}
              >
                Delete
              </MenuItem>
            </>
          )}

          {page === 'collection' && (
            <>
              <MenuItem icon={<IconBack width={15} height={15} />} onClick={() => setPage('root')}>
                Back
              </MenuItem>
              <div className="my-1 h-px bg-white/8" />
              {object.parentId && (
                <MenuItem onClick={() => onMoveToCollection(null)}>Take it out</MenuItem>
              )}
              {collections
                .filter((c) => c.id !== object.id)
                .map((c) => (
                  <MenuItem
                    key={c.id}
                    onClick={() => onMoveToCollection(c.id)}
                    hint={object.parentId === c.id ? '✓' : undefined}
                  >
                    {c.title || 'Collection'}
                  </MenuItem>
                ))}
            </>
          )}

          {page === 'confirm' && (
            <div className="px-2.5 py-2">
              <p className="mb-3 text-[12px] leading-snug text-mute">
                Delete “{object.title || 'Untitled'}”? Anything connected to it stays.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage('root')}
                  className="flex-1 rounded-full py-2 text-[12px] text-mute"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  Keep
                </button>
                <button
                  onClick={onDelete}
                  className="flex-1 rounded-full py-2 text-[12px] text-[#ff9b9b]"
                  style={{ background: 'rgba(255,90,90,0.12)' }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Popover>
  );
}

export function UniverseMenu({
  anchor,
  universe,
  onClose,
  onEnter,
  onRename,
  onLook,
  onExport,
  onDelete,
  canDelete,
}: {
  anchor: { x: number; y: number } | null;
  universe: Universe | null;
  onClose(): void;
  onEnter(): void;
  onRename(): void;
  onLook(): void;
  onExport(): void;
  onDelete(): void;
  canDelete: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setConfirm(false);
  }, [universe?.id, anchor?.x]);

  return (
    <Popover open={!!anchor && !!universe} x={anchor?.x ?? 0} y={anchor?.y ?? 0} onClose={onClose}>
      {universe && (
        <>
          <div className="px-2.5 pb-1.5 pt-1">
            <div className="truncate text-[12.5px] text-ink/90">{universe.name}</div>
            <div className="eyebrow mt-1">Universe</div>
          </div>
          <div className="my-1 h-px bg-white/8" />
          {confirm ? (
            <div className="px-2.5 py-2">
              <p className="mb-3 text-[12px] leading-snug text-mute">
                Delete “{universe.name}” and everything in it? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirm(false)}
                  className="flex-1 rounded-full py-2 text-[12px] text-mute"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  Keep
                </button>
                <button
                  onClick={onDelete}
                  className="flex-1 rounded-full py-2 text-[12px] text-[#ff9b9b]"
                  style={{ background: 'rgba(255,90,90,0.12)' }}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <>
              <MenuItem icon={<IconTarget width={15} height={15} />} onClick={onEnter}>
                Go in
              </MenuItem>
              <MenuItem icon={<IconPencil width={15} height={15} />} onClick={onRename}>
                Rename
              </MenuItem>
              <MenuItem icon={<IconPalette width={15} height={15} />} onClick={onLook}>
                Change its look
              </MenuItem>
              <MenuItem icon={<IconDownload width={15} height={15} />} onClick={onExport}>
                Export it
              </MenuItem>
              {canDelete && (
                <>
                  <div className="my-1 h-px bg-white/8" />
                  <MenuItem
                    icon={<IconTrash width={15} height={15} />}
                    danger
                    onClick={() => setConfirm(true)}
                  >
                    Delete universe
                  </MenuItem>
                </>
              )}
            </>
          )}
        </>
      )}
    </Popover>
  );
}
