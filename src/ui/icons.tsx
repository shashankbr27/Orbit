import type { SVGProps } from 'react';

/**
 * A small, deliberately plain icon set.
 *
 * Hairline strokes, round caps, no fills — the interface is supposed to
 * disappear into the sky, and heavy glyphs would fight the artwork.
 */

type P = SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
});

export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconClose = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconBack = (p: P) => (
  <svg {...base(p)}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const IconChevron = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 13l4 4L19 7" />
  </svg>
);

export const IconPalette = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3a9 9 0 100 18c1.4 0 1.8-1 1.4-1.9-.5-1 .2-2.1 1.3-2.1H17a4 4 0 004-4c0-5.3-4-10-9-10Z" />
    <circle cx="8.5" cy="10.5" r="1.1" />
    <circle cx="12" cy="7.8" r="1.1" />
    <circle cx="15.6" cy="10" r="1.1" />
  </svg>
);

export const IconGear = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.2M12 18.8V21M4.8 7.8l1.9 1.1M17.3 15.1l1.9 1.1M4.8 16.2l1.9-1.1M17.3 8.9l1.9-1.1" />
  </svg>
);

export const IconLink = (p: P) => (
  <svg {...base(p)}>
    <path d="M9.5 14.5l5-5" />
    <path d="M13 7.5l1.5-1.5a3.5 3.5 0 015 5L18 12.5" />
    <path d="M11 16.5L9.5 18a3.5 3.5 0 01-5-5L6 11.5" />
  </svg>
);

export const IconTrash = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
  </svg>
);

export const IconCopy = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M15 5.5A2.5 2.5 0 0012.5 3H6.5A2.5 2.5 0 004 5.5v6A2.5 2.5 0 006.5 14" />
  </svg>
);

export const IconPencil = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 20l1-4 11-11a2.1 2.1 0 013 3L8 19l-4 1Z" />
  </svg>
);

export const IconClock = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconLayers = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3l8 4.5-8 4.5-8-4.5L12 3Z" />
    <path d="M4 12.5L12 17l8-4.5" />
    <path d="M4 16.8L12 21.3l8-4.5" />
  </svg>
);

export const IconDownload = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 4v11M8 11.5l4 4 4-4M5 19.5h14" />
  </svg>
);

export const IconUpload = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 16V5M8 8.5l4-4 4 4M5 19.5h14" />
  </svg>
);

export const IconPlay = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 5.5l11 6.5-11 6.5v-13Z" />
  </svg>
);

export const IconPause = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 5v14M15 5v14" />
  </svg>
);

export const IconTarget = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M12 2v2.6M12 19.4V22M2 12h2.6M19.4 12H22" />
  </svg>
);

export const IconSparkle = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6-4.6-1.7 4.6-1.7L12 3.5Z" />
    <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" />
  </svg>
);

export const IconSearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </svg>
);

export const IconUndo = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9h9a5 5 0 110 10H8" />
    <path d="M7.5 5.5L4 9l3.5 3.5" />
  </svg>
);

export const IconEraser = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 19H5l-1.5-1.5a1.6 1.6 0 010-2.3l9-9a1.6 1.6 0 012.3 0l4 4a1.6 1.6 0 010 2.3L14.5 19H8Z" />
    <path d="M9 13.5l4 4" />
  </svg>
);

/* ── object kinds ───────────────────────────────────────────────────────── */

export const IconPerson = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8.5" r="3.2" />
    <path d="M5.5 20a6.5 6.5 0 0113 0" />
  </svg>
);

export const IconPhoto = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4 17l4.5-4.5 3.5 3.5 3-3 5 5" />
  </svg>
);

export const IconNote = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 3.5h9l4 4V20.5H6z" />
    <path d="M15 3.5v4h4M9 12h6M9 15.5h4" />
  </svg>
);

export const IconMemory = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="6.2" />
    <path d="M5.5 8.5A9 9 0 0118.5 15.5" opacity="0.55" />
  </svg>
);

export const IconSong = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="17.5" r="2.6" />
    <path d="M10.6 17.5V6l7.4-2v10.6" />
    <circle cx="15.4" cy="14.6" r="2.6" />
  </svg>
);

export const IconPlace = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 21s6.5-6.1 6.5-10.4A6.5 6.5 0 005.5 10.6C5.5 14.9 12 21 12 21Z" />
    <circle cx="12" cy="10.4" r="2.2" />
  </svg>
);

export const IconCollection = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="2.4" />
    <circle cx="16" cy="9.5" r="1.8" />
    <circle cx="11" cy="15.5" r="2.9" />
    <circle cx="17.5" cy="16" r="1.3" />
  </svg>
);

export const IconArtwork = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <rect x="7.5" y="7.5" width="9" height="9" rx="0.8" />
  </svg>
);

export const IconEvent = (p: P) => (
  <svg {...base(p)}>
    <circle cx="16" cy="8" r="2.6" />
    <path d="M13.6 10.2L4 19.5M14.6 12.6l-6 3.4M11.4 8.4l-3.6 6" />
  </svg>
);

export const IconConstellation = (p: P) => (
  <svg {...base(p)}>
    <circle cx="5.5" cy="8" r="1.3" />
    <circle cx="12" cy="5" r="1.3" />
    <circle cx="18.5" cy="10" r="1.3" />
    <circle cx="9" cy="17" r="1.3" />
    <circle cx="16" cy="19" r="1.3" />
    <path d="M5.9 7l5.2-1.6M13 5.6l4.6 3.3M17.9 11.2L16.4 17.7M15 19.2l-4.7-1.7M8.7 15.7L6 9.3" opacity="0.6" />
  </svg>
);

export const IconTape = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 9.5l18-3v7l-18 3v-7Z" />
  </svg>
);

export const IconText = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 6h14M12 6v13M9 19h6" />
  </svg>
);

export const IconSticker = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 3.5A8.5 8.5 0 1120.5 12h-4a2.5 2.5 0 00-2.5 2.5v6" />
    <path d="M14 20.5c3-1 5.5-3.5 6.5-6.5" opacity="0.6" />
  </svg>
);

export const IconBrush = (p: P) => (
  <svg {...base(p)}>
    <path d="M15.5 4.5l4 4-7 7-4-4 7-7Z" />
    <path d="M8.5 11.5L5 15c-1 1-1 4-1 4s3 0 4-1l3.5-3.5" />
  </svg>
);

export const KIND_ICON: Record<string, (p: P) => React.ReactElement> = {
  person: IconPerson,
  photo: IconPhoto,
  note: IconNote,
  memory: IconMemory,
  song: IconSong,
  place: IconPlace,
  collection: IconCollection,
  artwork: IconArtwork,
  event: IconEvent,
  constellation: IconConstellation,
};
