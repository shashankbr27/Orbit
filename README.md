# ORBIT

A personal universe you can fly through.

Everything you want to keep — people, photographs, songs, places, the days that
counted — placed among the stars, arranged however you like. Pan, zoom, drag
things around, draw constellations between them, open a memory into a
scrapbook. It runs in a browser, keeps everything on your own device, and can be
added to an iPhone home screen like an app.

The interface *is* the universe. There is no dashboard.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build (binds `$PORT`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run icons` | Regenerate the PWA icon set from `scripts/generate-icons.mjs` |

`scripts/screenshot.mjs` drives headless Chrome against a running build and
writes a PNG after a scripted set of gestures — the only honest way to check
canvas work. It is not a dependency of the app; see the comment at the top of
the file for usage.

First run seeds a small **gift universe** — six universes with a handful of
things already placed, plus procedurally generated abstract photographs so no
frame is ever empty. Every seeded item is editable and deletable. Settings →
*Start over* wipes it and re-seeds.

---

## How to use it

**On a phone**

| Gesture | What happens |
| --- | --- |
| One finger drag | Pan |
| Pinch | Zoom, anchored on your fingers |
| Two-finger drag | Pan |
| Tap a universe | Fly into it |
| Tap an object | Select it |
| Double tap | Open it (memory → scrapbook, photo → full size) |
| Long press an object | Its menu |
| Long press empty space | Add something there |
| Drag an object | Move it |

**On a desktop**

Same universe, same gestures where they apply, plus: mouse wheel zooms about the
cursor, right-click opens the object menu, space or middle-drag pans, and the
arrow keys / WASD glide the camera.

| Key | |
| --- | --- |
| `0` | Frame everything |
| `n` | Add something |
| `c` | Constellation mode |
| `t` | Timeline |
| `Enter` | Open the selected object |
| `Delete` | Delete the selected object |
| `f` | Frame-rate readout |
| `Esc` | Back out of whatever is open |

---

## Architecture

The rule that shapes everything: **the renderer and React never touch each
other during a frame.** React owns the interface; the engine owns the pixels.
Dragging an object at 60fps costs zero React renders and zero database writes.

```
src/
  engine/                 the renderer — no React anywhere in here
    camera.ts             smoothed, inertial camera; focal-point zoom; flyTo
    loop.ts               the frame loop (clamped dt, visibility-aware)
    quality.ts            device tiering + live frame-time adaptation
    theme.ts              per-universe look, as plain data
    scene.ts              OrbitObject/Universe → Scene (the renderer's input)
    Engine.ts             ties it together, owns the loop
    cosmos/
      shaders.ts          GLSL: the living sky
      CosmosRenderer.ts   raw WebGL, two passes
    objects/
      textures.ts         generated, tintable sprite textures
      NodeView.ts         one celestial body
      ObjectRenderer.ts   the object layer (PixiJS) + picking
      LabelLayer.ts       object names, in the DOM
      mediaCache.ts       blobs → GPU textures, once
    input/
      GestureController.ts one controller for touch, mouse, pen, keyboard
  data/                   the object model and persistence
    model.ts              types, kind defaults, ids
    db.ts                 Dexie/IndexedDB repositories
    seed.ts               the gift universe
    seedArt.ts            generated abstract photographs
    images.ts             camera-roll import (downscale + thumbnail)
    io.ts                 export / import (single self-contained JSON)
  state/
    store.ts              document state (zustand) — autosaves
    ui.ts                 transient interface state, kept separate
  ui/                     React: chrome, sheets, editors, scrapbook
```

### The sky

The cosmic environment is **entirely procedural, evaluated per pixel** in its own
WebGL canvas. Nothing is a sprite, an image, or a DOM node, which is what makes
it cheap enough to be extravagant:

- **Five star depth layers**, each a hashed grid with its own parallax factor,
  zoom response, cell size, density and twinkle speed. One texture tap per layer
  per pixel — cores are tight enough that their falloff reaches zero before the
  cell boundary, so there are no grid seams despite never sampling neighbours.
- **Focal stars**: sparse, bright, sampled over a 3×3 neighbourhood so their
  halos can bleed across cells, with soft diffraction spikes.
- **Nebulae**: domain-warped fBm with a differential galactic rotation (inner
  regions turn faster, so the field shears instead of spinning like a wheel) and
  a soft logarithmic spiral. Rendered to an offscreen target at ⅓–⅙ resolution
  and upsampled with a five-tap blur — it is blurry by nature, so the low
  resolution is free. Dense cloud slightly veils the stars behind it.
- **Dust**: near-field motes drifting on two out-of-phase oscillators, never in
  a straight line.
- A **rare meteor**: most cycles are empty, so it reads as a lucky sighting.
- Deep-space gradient, vignette, film grain, and a gentle filmic curve — deep
  space otherwise sits in the bottom two percent of the range and reads as dead.

Everything spatial is in **CSS pixels** (`uPxScale`), so a star is the same
apparent size on a retina phone as on a 1× monitor. Cloud features are sized
relative to the viewport so the composition reads the same on both.

Written against GLSL ES 1.00 / WebGL1, so it runs on every iPhone. Quality knobs
are injected as `#define`s and the programs are rebuilt when the tier changes —
no dynamic branching in the hot loop.

### Objects

Bodies are PixiJS sprites built from a handful of generated greyscale textures,
tinted per object — a few hundred objects cost a few draw calls. Two things
learned the hard way and enforced in `textures.ts`:

- Shade spheres by **luminance at full alpha**, never by alpha. Sprites are
  tinted at draw time, and an alpha gradient makes a planet translucent.
- Use **only concentric** radial gradients. An offset gradient is a cone
  gradient, which Canvas renders with visible straight facets.

Object **names live in the DOM**, not the canvas: real font rendering, crisp at
any zoom. Bounded by a hard cap, a pool (nothing is created during a gesture),
and greedy collision-aware placement that nudges a clashing label down a line
before dropping it. A note shows decorative handwriting from afar and hands over
to its real text once the card is wide enough to read.

Picking is done in world-space maths rather than through the scene graph, with a
22px minimum tap radius so distant stars stay reachable with a thumb.

### Performance

- One WebGL canvas for the sky, one for the objects, a DOM overlay for text.
- `QualityManager` guesses a tier from cores/memory/DPR/UA, then watches real
  frame times: it drops a tier fast (a stutter is felt immediately) and raises
  one slowly and only once, so quality never visibly oscillates. Tier controls
  DPR ceiling, nebula resolution and octaves, star layers, dust layers, focal
  stars, grain, and the animated-object budget. Overridable in Settings.
- Offscreen and sub-pixel objects are culled; past the animation budget, objects
  stay on screen but stop animating.
- Constellation lines are re-tessellated only on zoom steps or every few frames.
- Position writes during a drag are coalesced into one.
- `prefers-reduced-motion` stops all continuous animation (the sky becomes a
  still photograph) while leaving the universe fully explorable; camera easing
  stays, because that is usability rather than decoration.
- When nothing is moving and motion is off, the loop skips the frame entirely.

### Persistence

IndexedDB via Dexie is the whole backend. One table per entity with foreign keys
by id — deliberately the shape a relational cloud store would take, so
synchronisation can be added as a layer over the same repositories rather than a
migration. Everything autosaves; there is no Save button anywhere.

**Export** writes a single self-contained JSON with your universes and the
photographs inline. **Import** always remaps ids, so importing your own export
twice gives you two universes rather than a silent overwrite.

---

## Deploying

The app is a standard Next.js server with no hosting-specific dependencies, so
it runs unchanged on Render or Vercel. No secrets are required.

### Render (primary)

`render.yaml` is a complete blueprint. Push the repo, then in Render:
**New → Blueprint** → pick the repository → apply. That creates one web service:

- Build: `npm ci && npm run build`
- Start: `npm run start` (binds `$PORT`)
- Health check: `/`

To do it manually instead: **New → Web Service**, runtime Node, same two
commands. Set `NODE_VERSION=22`.

Leave `NODE_ENV` unset on the service: some npm versions treat
`NODE_ENV=production` as `--omit=dev`, which strips TypeScript and Tailwind and
breaks the build. `next build` establishes production mode by itself.

Render terminates TLS for you, so the result is an HTTPS URL
(`https://<name>.onrender.com`) you can hand to someone directly. A custom
domain can be attached in the service's settings.

> The `starter` plan does not sleep. On the free plan the service spins down when
> idle and the first visit after that takes a few seconds — worth avoiding if
> you are giving the link to someone as a present.

### Vercel

`vercel --prod`, or import the repo in the dashboard. Nothing to configure: no
`vercel.json`, no adapter, no image-optimisation dependency (`images.unoptimized`
is set so both hosts serve images identically).

### Environment variables

None are needed. `.env.example` lists placeholders for the future cloud layer.
Nothing is hard-coded and nothing secret exists in this build.

---

## Installing it on a phone

It is a PWA: web app manifest, generated icon set (including a maskable icon),
`standalone` display mode, theme colour, `viewport-fit=cover` with safe-area
insets honoured throughout, and a service worker for offline use.

- **iPhone (Safari)**: Share → *Add to Home Screen*. It then launches
  full-screen with no browser chrome. Settings shows this hint until installed.
- **Android (Chrome)**: the install prompt appears on its own, or menu →
  *Install app*.

The service worker is deliberately modest: navigations are network-first with a
cached shell as the offline fallback, content-hashed build assets are
cache-first, and everything else goes straight to the network. It never touches
IndexedDB — your universes live there, and the worker has no business near them.

---

## Gift mode

ORBIT is meant to be handed to someone. Send them the URL and they land in a
universe that already has a few stars in it, with:

> Welcome to your universe.
> Some stars have already been placed for you.
> Everything else is yours to create.

Because everything is local to their browser, what they do next is theirs alone —
nothing is shared back, nothing is uploaded. They can delete every seeded item.

`?u=<universeId>` deep-links straight into one universe; the back button works.

---

## Tested viewports

iPhone (390×844) · Android (412×915) · tablet (820×1180) · 1366×768 ·
1920×1080. Mobile is the primary target and the layout is designed there first —
on a phone the universe takes the whole viewport, controls are four small
corner clusters that fade out the moment a gesture starts, and editors are bottom
sheets. On a larger screen the same editors become side panels.

---

## Future cloud layer

Not implemented, and not needed for this to work. The model is shaped for it:
Supabase auth over the same repositories, assets to object storage with
`mediaId` unchanged, shareable and collaborative universes, private/public
visibility, custom domains, backup. `src/data/db.ts` is the only file that would
need a sibling.

---

## Tech

Next.js 15 · React 19 · TypeScript · PixiJS 8 · Tailwind CSS 4 · Zustand ·
Dexie · Motion. Icons and photographs are generated by code — there are no
binary assets in this repository except the generated PWA icons, which
`npm run icons` reproduces exactly.
