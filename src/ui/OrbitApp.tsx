'use client';

import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KIND_SPEC, type ObjectKind, type OrbitObject } from '@/data/model';
import { exportUniverses, downloadJson, importFile, slugify } from '@/data/io';
import { useOrbit } from '@/state/store';
import { useUi } from '@/state/ui';
import type { Engine } from '@/engine/Engine';
import type { QualityTier } from '@/engine/quality';
import { objectsToScene, universesToScene } from '@/engine/scene';
import { onPlayingChange, stopSong, toggleSong } from '@/lib/audio';
import { resolveTheme, type ThemePresetId, type ThemeSpec } from '@/engine/theme';
import { OrbitStage } from './OrbitStage';
import {
  ActionRail,
  AddButton,
  BottomLeftTools,
  BottomScrim,
  Scrim,
  ModeBanner,
  SelectionBar,
  StatsBadge,
  TopBar,
  Whisper,
} from './Chrome';
import { AddSheet } from './AddSheet';
import { ObjectEditor } from './ObjectEditor';
import { ObjectMenu, UniverseMenu } from './Menus';
import { SettingsPanel, ThemePanel, UniversePanel } from './Panels';
import { Timeline } from './Timeline';
import { Scrapbook } from './Scrapbook';
import { Lightbox } from './Lightbox';
import { BootScreen, GiftIntro } from './Intro';

type Phase = 'multiverse' | 'diving' | 'universe' | 'ascending';

/** The sky you see between universes. Slightly denser, slightly colder. */
const MULTIVERSE_THEME: ThemeSpec = resolveTheme({
  preset: 'night',
  overrides: {
    starDensity: 1.22,
    nebulaAmount: 0.78,
    nebulaGain: 0.54,
    dustDensity: 0.85,
    vignette: 0.45,
    accent: '#9fbcff',
  },
});

const DIVE_MS = 980;
const RISE_MS = 820;

export function OrbitApp() {
  const store = useOrbit();
  const ui = useUi();
  // Zustand action identities are stable, so capturing them lets effects and
  // callbacks declare honest dependency arrays instead of silencing the rule.
  const {
    say: uiSay,
    openEditor: uiOpenEditor,
    openScrapbook: uiOpenScrapbook,
    setPlaying: uiSetPlaying,
  } = ui;
  const [engine, setEngine] = useState<Engine | null>(null);
  const [phase, setPhase] = useState<Phase>('multiverse');
  const [stats, setStats] = useState<{ fps: number; tier: string; nodes: number } | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [qualityLock, setQualityLock] = useState<QualityTier | 'auto'>('auto');

  const multiverseCam = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const placeAt = useRef<{ x: number; y: number } | null>(null);
  const introPlayed = useRef(false);
  const deepLinkChecked = useRef(false);

  const {
    status,
    error,
    universes,
    objects,
    connections,
    activeId,
    selection,
    settings,
    isGift,
  } = store;

  const active = useMemo(
    () => universes.find((u) => u.id === activeId) ?? null,
    [universes, activeId],
  );

  const busyTransition = phase === 'diving' || phase === 'ascending';

  /* ── boot ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    void store.boot();
    // Store actions are stable; this must run exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The audio element is the source of truth for what is playing; the store
  // just mirrors it so the song's star can pulse.
  useEffect(() => onPlayingChange(uiSetPlaying), [uiSetPlaying]);

  // Leaving a universe should not leave a song playing into the void.
  useEffect(() => {
    if (!activeId) stopSong();
  }, [activeId]);

  // Offline support. Registered late so it never competes with the first paint,
  // and only in production — a service worker in dev just hides your changes.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        /* offline is a bonus, not a requirement */
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  /* ── theme + scene wiring ───────────────────────────────────────────── */

  const themeSpec = useMemo<ThemeSpec>(() => {
    if (!active) return MULTIVERSE_THEME;
    return resolveTheme({
      preset: (active.theme.preset ?? 'night') as ThemePresetId,
      overrides: active.theme.overrides as Partial<ThemeSpec> | undefined,
    });
  }, [active]);

  // The accent drives every piece of chrome, so it lives on :root.
  useEffect(() => {
    const accent = active?.color ?? themeSpec.accent;
    document.documentElement.style.setProperty('--accent', accent);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', themeSpec.bgOuter);
  }, [active?.color, themeSpec]);

  const scene = useMemo(() => {
    if (activeId && active) {
      const year = ui.timelineOpen ? ui.timelineYear : null;
      const emphasis =
        year === null
          ? undefined
          : (o: OrbitObject) => {
              if (!o.date) return 0.34;
              return new Date(o.date).getFullYear() === year ? 1 : 0.16;
            };
      return objectsToScene(
        objects,
        connections,
        (active.theme.preset ?? 'night') as string,
        emphasis,
        ui.playingId,
      );
    }
    return universesToScene(universes, MULTIVERSE_THEME.accent);
  }, [
    activeId,
    active,
    objects,
    connections,
    universes,
    ui.timelineOpen,
    ui.timelineYear,
    ui.playingId,
  ]);

  useEffect(() => {
    if (!engine) return;
    engine.setScene(scene);
  }, [engine, scene]);

  useEffect(() => {
    if (!engine) return;
    engine.setTheme(themeSpec, active?.seed ?? 0);
  }, [engine, themeSpec, active?.seed]);

  useEffect(() => {
    if (!engine) return;
    engine.setSelection(selection);
  }, [engine, selection]);

  useEffect(() => {
    if (!engine) return;
    const focus = new Set<string>(selection);
    if (ui.hoverId) focus.add(ui.hoverId);
    for (const id of ui.connectChain) focus.add(id);
    engine.setFocus(focus);
  }, [engine, selection, ui.hoverId, ui.connectChain]);

  useEffect(() => {
    if (!engine) return;
    engine.setMotionPreference(settings.motion);
  }, [engine, settings.motion]);

  useEffect(() => {
    if (!engine) return;
    engine.setQualityLock(qualityLock === 'auto' ? null : qualityLock);
  }, [engine, qualityLock]);

  /* ── transitions ────────────────────────────────────────────────────── */

  const enterUniverse = useCallback(
    (id: string, animate = true) => {
      const u = universes.find((x) => x.id === id);
      if (!u || !engine) return;
      ui.dismissAll();
      ui.setMode('explore');
      store.setSelection([]);

      const land = () => {
        const cam = u.lastCamera ?? { x: 0, y: 0, zoom: engine.universeZoom };
        engine.camera.set(cam.x, cam.y, cam.zoom * 1.55);
        engine.camera.flyTo(cam.x, cam.y, cam.zoom, { duration: 1.5, arc: false });
        engine.fadeTo(1, 1.15);
        setPhase('universe');
        engine.setInputEnabled(true);
      };

      if (!animate) {
        void store.openUniverse(id).then(land);
        return;
      }

      setPhase('diving');
      engine.setInputEnabled(false);
      multiverseCam.current = engine.camera.snapshot();
      // Rush the camera into the universe's body while the sky dims.
      engine.camera.flyTo(u.x, u.y, Math.min(engine.camera.maxZoom, engine.camera.zoom * 7), {
        duration: DIVE_MS / 1000,
        arc: false,
      });
      engine.fadeTo(0, 2.1);
      window.setTimeout(() => {
        void store.openUniverse(id).then(land);
      }, DIVE_MS);

      try {
        window.history.pushState({ orbit: 'universe', id }, '', `?u=${encodeURIComponent(id)}`);
      } catch {
        /* history is a nicety, not a requirement */
      }
    },
    // Store/ui actions are stable references from zustand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, universes],
  );

  const leaveUniverse = useCallback(
    (viaHistory = false) => {
      if (!engine) return;
      const u = active;
      if (u) store.rememberCamera(u.id, engine.camera.snapshot());
      ui.dismissAll();
      ui.setMode('explore');
      ui.setTimeline(false);
      setPhase('ascending');
      engine.setInputEnabled(false);
      engine.fadeTo(0, 2.4);
      engine.camera.flyTo(engine.camera.x, engine.camera.y, engine.camera.zoom * 0.26, {
        duration: RISE_MS / 1000,
        arc: false,
      });

      window.setTimeout(() => {
        store.closeUniverse();
        const fallbackZoom = engine.multiverseZoom;
        const cam =
          multiverseCam.current ??
          (u ? { x: u.x, y: u.y, zoom: fallbackZoom } : { x: 0, y: 0, zoom: fallbackZoom });
        engine.camera.set(cam.x, cam.y, cam.zoom * 1.5);
        engine.camera.flyTo(cam.x, cam.y, cam.zoom, { duration: 1.35, arc: false });
        engine.fadeTo(1, 1.2);
        setPhase('multiverse');
        engine.setInputEnabled(true);
      }, RISE_MS);

      if (!viaHistory) {
        try {
          window.history.pushState({ orbit: 'multiverse' }, '', window.location.pathname);
        } catch {
          /* ignore */
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, active],
  );

  const goBack = useCallback(() => {
    if (window.history.state?.orbit === 'universe') window.history.back();
    else leaveUniverse(true);
  }, [leaveUniverse]);

  useEffect(() => {
    const onPop = () => {
      const isUniverse = window.history.state?.orbit === 'universe';
      const id = window.history.state?.id as string | undefined;
      if (isUniverse && id && id !== activeId) enterUniverse(id, false);
      else if (!isUniverse && activeId) leaveUniverse(true);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [activeId, enterUniverse, leaveUniverse]);

  /* ── first arrival ──────────────────────────────────────────────────── */

  useEffect(() => {
    if (!engine || status !== 'ready' || introPlayed.current) return;
    introPlayed.current = true;

    if (!deepLinkChecked.current) {
      deepLinkChecked.current = true;
      const params = new URLSearchParams(window.location.search);
      const wanted = params.get('u');
      if (wanted && universes.some((u) => u.id === wanted)) {
        void store.openUniverse(wanted).then(() => {
          const u = universes.find((x) => x.id === wanted)!;
          const cam = u.lastCamera ?? { x: 0, y: 0, zoom: engine.universeZoom };
          engine.playIntro(cam.x, cam.y, cam.zoom, 3.0);
          setPhase('universe');
        });
        return;
      }
    }
    // Arrive on your own star, then pull back to the neighbourhood.
    engine.playIntro(0, 0, engine.multiverseZoom, 3.6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, status]);

  /* ── engine handlers (stable, read from a ref) ──────────────────────── */

  interface LiveHandlers {
    onTap(id: string | null, sx: number, sy: number): void;
    onDoubleTap(id: string | null, sx: number, sy: number): void;
    onLongPress(id: string | null, sx: number, sy: number): void;
    onObjectMoved(id: string, x: number, y: number): void;
    onHover(id: string | null): void;
    onGestureStart(): void;
    canDrag(id: string): boolean;
  }

  const handlersRef = useRef<LiveHandlers>({
    onTap: () => {},
    onDoubleTap: () => {},
    onLongPress: () => {},
    onObjectMoved: () => {},
    onHover: () => {},
    onGestureStart: () => {},
    canDrag: () => true,
  });

  const playSong = useCallback(
    (o: OrbitObject) => {
      if (!o.audioUrl) {
        uiSay('Add a link to this song and it will play here.');
        uiOpenEditor(o.id);
        return;
      }
      const result = toggleSong(o.id, o.audioUrl);
      if (result === 'failed') uiSay('That link would not play.', 'warn');
    },
    [uiSay, uiOpenEditor],
  );

  const openObject = useCallback(
    (o: OrbitObject) => {
      if (o.kind === 'memory') uiOpenScrapbook(o.id);
      else if (o.kind === 'photo' || o.kind === 'artwork') setLightboxId(o.id);
      else if (o.kind === 'song') playSong(o);
      else uiOpenEditor(o.id);
    },
    [playSong, uiOpenScrapbook, uiOpenEditor],
  );

  handlersRef.current = {
    onTap: (id, sx, sy) => {
      if (busyTransition) return;
      if (!id) {
        store.setSelection([]);
        ui.dismissAll();
        if (ui.mode === 'connect' && ui.connectChain.length === 0) ui.setMode('explore');
        return;
      }
      if (!activeId) {
        enterUniverse(id);
        return;
      }
      if (ui.mode === 'connect') {
        ui.pushChain(id);
        return;
      }
      store.setSelection([id]);
      ui.openObjectMenu(null);
      void sx;
      void sy;
    },
    onDoubleTap: (id, sx, sy) => {
      if (busyTransition) return;
      if (!id) {
        engine?.camera.zoomAt(sx, sy, 2.1);
        return;
      }
      if (!activeId) {
        enterUniverse(id);
        return;
      }
      const o = objects.find((x) => x.id === id);
      if (o) openObject(o);
    },
    onLongPress: (id, sx, sy) => {
      if (busyTransition) return;
      if (navigator.vibrate) navigator.vibrate(8);
      if (!id) {
        if (!activeId) {
          ui.openPanel('universes');
          return;
        }
        placeAt.current = engine ? engine.screenToWorld(sx, sy) : null;
        ui.openAdd(true);
        return;
      }
      if (!activeId) {
        ui.openUniverseMenu({ id, x: sx, y: sy });
        return;
      }
      store.setSelection([id]);
      ui.openObjectMenu({ id, x: sx, y: sy });
    },
    onObjectMoved: (id, x, y) => {
      void store.moveObject(id, x, y);
    },
    onHover: (id) => ui.setHover(id),
    onGestureStart: () => {
      if (ui.objectMenu || ui.universeMenu || ui.addOpen) ui.dismissAll();
    },
    canDrag: () => !!activeId && ui.mode !== 'connect',
  };

  useEffect(() => {
    if (!engine) return;
    engine.setHandlers({
      onTap: (id, sx, sy) => handlersRef.current.onTap(id, sx, sy),
      onDoubleTap: (id, sx, sy) => handlersRef.current.onDoubleTap(id, sx, sy),
      onLongPress: (id, sx, sy) => handlersRef.current.onLongPress(id, sx, sy),
      onContextMenu: (id, sx, sy) => handlersRef.current.onLongPress(id, sx, sy),
      onObjectMoved: (id, x, y) => handlersRef.current.onObjectMoved(id, x, y),
      onHover: (id) => handlersRef.current.onHover(id),
      onGestureStart: () => handlersRef.current.onGestureStart(),
      canDrag: (id) => handlersRef.current.canDrag(id),
      onStats: setStats,
    });
  }, [engine]);

  /* ── keyboard shortcuts ─────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape') {
        if (ui.scrapbookId) return; // the scrapbook handles its own escape
        if (lightboxId) setLightboxId(null);
        else if (ui.editorId) ui.openEditor(null);
        else if (ui.panel) ui.openPanel(null);
        else if (ui.addOpen || ui.objectMenu || ui.universeMenu) ui.dismissAll();
        else if (ui.mode === 'connect') ui.setMode('explore');
        else if (selection.length) store.setSelection([]);
        else if (activeId) goBack();
        return;
      }
      if (e.key === '0') engine?.fit(undefined, 0.7, 1.1);
      if (e.key === 'n' && activeId) ui.openAdd(true);
      if (e.key === 'c' && activeId) ui.setMode(ui.mode === 'connect' ? 'explore' : 'connect');
      if (e.key === 't' && activeId) ui.setTimeline(!ui.timelineOpen);
      if (e.key === 'f') ui.toggleStats();
      if (e.key === 'Enter' && selection.length === 1) {
        const o = objects.find((x) => x.id === selection[0]);
        if (o) openObject(o);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length === 1 && activeId) {
        void store.deleteObject(selection[0]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, activeId, selection, objects, lightboxId, ui.scrapbookId, ui.editorId, ui.panel, ui.addOpen, ui.objectMenu, ui.universeMenu, ui.mode, ui.timelineOpen, goBack, openObject]);

  /* ── actions ────────────────────────────────────────────────────────── */

  const addKind = async (kind: ObjectKind) => {
    if (!activeId) return;
    if (kind === 'constellation') {
      ui.openAdd(false);
      ui.setMode('connect');
      ui.say('Tap the things you want to connect.');
      return;
    }
    const centre = placeAt.current ?? engine?.viewCentre() ?? { x: 0, y: 0 };
    placeAt.current = null;
    const spread = KIND_SPEC[kind].radius * 1.4;
    const o = await store.addObject(kind, {
      x: centre.x + (Math.random() - 0.5) * spread,
      y: centre.y + (Math.random() - 0.5) * spread,
      title: '',
      rotation:
        kind === 'photo' || kind === 'note' || kind === 'artwork'
          ? (Math.random() - 0.5) * 0.14
          : 0,
    });
    ui.openAdd(false);
    if (o) ui.openEditor(o.id);
  };

  const addPhotos = async (files: FileList) => {
    if (!activeId) return;
    const centre = placeAt.current ?? engine?.viewCentre() ?? { x: 0, y: 0 };
    placeAt.current = null;
    const list = Array.from(files).slice(0, 12);
    ui.say(list.length > 1 ? `Adding ${list.length} photographs…` : 'Adding a photograph…');
    let i = 0;
    for (const file of list) {
      const golden = 2.399963;
      const r = list.length === 1 ? 0 : 90 + i * 46;
      const a = i * golden;
      await store.addPhoto(file, {
        x: centre.x + Math.cos(a) * r,
        y: centre.y + Math.sin(a) * r,
      });
      i++;
    }
    ui.say(list.length > 1 ? `${list.length} photographs placed.` : 'Placed.');
  };

  const finishConnecting = async () => {
    const chain = ui.connectChain;
    if (chain.length < 2) {
      ui.clearChain();
      ui.setMode('explore');
      return;
    }
    const con = await store.createConstellation(chain, '');
    ui.clearChain();
    ui.setMode('explore');
    if (con) {
      ui.openEditor(con.id);
      ui.say('Constellation drawn. Give it a name.');
    }
  };

  const doExport = async (universeId: string | null) => {
    try {
      const file = await exportUniverses(universeId);
      const name = universeId
        ? `orbit-${slugify(universes.find((u) => u.id === universeId)?.name ?? 'universe')}.json`
        : 'orbit-everything.json';
      downloadJson(file, name);
      ui.say('Exported.');
    } catch {
      ui.say('Could not export that.', 'warn');
    }
  };

  const doImport = async (text: string) => {
    try {
      const res = await importFile(text);
      await store.reload();
      ui.say(
        `Imported ${res.universes} ${res.universes === 1 ? 'universe' : 'universes'} · ${res.objects} things.`,
      );
    } catch (err) {
      ui.say(err instanceof Error ? err.message : 'That file could not be read.', 'warn');
    }
  };

  /* ── derived UI data ────────────────────────────────────────────────── */

  const selectedObject = useMemo(
    () => (selection.length === 1 ? objects.find((o) => o.id === selection[0]) ?? null : null),
    [selection, objects],
  );
  const editorObject = useMemo(
    () => (ui.editorId ? objects.find((o) => o.id === ui.editorId) ?? null : null),
    [ui.editorId, objects],
  );
  const menuObject = useMemo(
    () => (ui.objectMenu ? objects.find((o) => o.id === ui.objectMenu!.id) ?? null : null),
    [ui.objectMenu, objects],
  );
  const scrapbookObject = useMemo(
    () => (ui.scrapbookId ? objects.find((o) => o.id === ui.scrapbookId) ?? null : null),
    [ui.scrapbookId, objects],
  );
  const lightboxObject = useMemo(
    () => (lightboxId ? objects.find((o) => o.id === lightboxId) ?? null : null),
    [lightboxId, objects],
  );
  const menuUniverse = useMemo(
    () => (ui.universeMenu ? universes.find((u) => u.id === ui.universeMenu!.id) ?? null : null),
    [ui.universeMenu, universes],
  );
  const collections = useMemo(() => objects.filter((o) => o.kind === 'collection'), [objects]);
  const memberTitles = useMemo(() => {
    const members = editorObject?.members ?? [];
    return members
      .map((id) => objects.find((o) => o.id === id)?.title || 'Untitled')
      .filter(Boolean);
  }, [editorObject, objects]);

  const chromeHidden = busyTransition || !!ui.scrapbookId || !!lightboxId || isGift;

  return (
    <>
      <OrbitStage onReady={setEngine} />

      <Scrim hidden={chromeHidden} />
      <BottomScrim hidden={chromeHidden} />

      <TopBar
        hidden={chromeHidden}
        title={active ? active.name : 'ORBIT'}
        subtitle={
          active
            ? active.tagline || `${objects.length} ${objects.length === 1 ? 'thing' : 'things'}`
            : `${universes.length} universes · everything has a place`
        }
        onBack={activeId ? goBack : undefined}
        onTitleClick={
          activeId ? () => ui.openPanel('theme') : () => ui.openPanel('universes')
        }
      />

      <ActionRail
        hidden={chromeHidden}
        inUniverse={!!activeId}
        onTheme={() => ui.openPanel(ui.panel === 'theme' ? null : 'theme')}
        onSettings={() => ui.openPanel(ui.panel === 'settings' ? null : 'settings')}
        onTimeline={() => ui.setTimeline(!ui.timelineOpen)}
        onUniverses={() => ui.openPanel(ui.panel === 'universes' ? null : 'universes')}
      />

      <BottomLeftTools
        hidden={chromeHidden}
        inUniverse={!!activeId}
        onFit={() => engine?.fit(undefined, 0.7, 1.1)}
        onConnect={() => ui.setMode(ui.mode === 'connect' ? 'explore' : 'connect')}
        connectActive={ui.mode === 'connect'}
      />

      <AddButton
        hidden={chromeHidden || ui.mode === 'connect'}
        onClick={() => {
          if (!activeId) {
            void store.createUniverse().then((u) => {
              ui.say(`“${u.name}” created. Long press it to rename.`);
              engine?.fit(undefined, 0.7, 1.2);
            });
            return;
          }
          placeAt.current = null;
          ui.openAdd(!ui.addOpen);
        }}
      />

      <SelectionBar
        object={ui.mode === 'connect' || ui.editorId ? null : selectedObject}
        playing={!!selectedObject && ui.playingId === selectedObject.id}
        onPlay={() => selectedObject && playSong(selectedObject)}
        onOpen={() => selectedObject && openObject(selectedObject)}
        onEdit={() => selectedObject && ui.openEditor(selectedObject.id)}
        onConnect={() => {
          if (!selectedObject) return;
          ui.setMode('connect');
          ui.pushChain(selectedObject.id);
          ui.say('Now tap what it connects to.');
        }}
        onMore={(pt) =>
          selectedObject && ui.openObjectMenu({ id: selectedObject.id, x: pt.x, y: pt.y })
        }
      />

      <AnimatePresence>
        {ui.mode === 'connect' && (
          <ModeBanner onCancel={finishConnecting}>
            {ui.connectChain.length === 0
              ? 'Tap things to connect them'
              : `${ui.connectChain.length} chosen · tap more, then Done`}
          </ModeBanner>
        )}
      </AnimatePresence>

      <Timeline
        open={ui.timelineOpen && !!activeId}
        objects={objects}
        year={ui.timelineYear}
        onYear={ui.setTimelineYear}
        onClose={() => ui.setTimeline(false)}
        onFocusYear={(y) => {
          const ids = objects
            .filter((o) => o.date && new Date(o.date).getFullYear() === y)
            .map((o) => o.id);
          if (ids.length) engine?.fit(ids, 0.6, 1.2);
        }}
      />

      <AddSheet
        open={ui.addOpen}
        onClose={() => ui.openAdd(false)}
        onPick={(k) => void addKind(k)}
        onPickPhotos={(files) => void addPhotos(files)}
      />

      <ObjectEditor
        object={editorObject}
        onClose={() => ui.openEditor(null)}
        onChange={(patch) => editorObject && void store.updateObject(editorObject.id, patch)}
        onDelete={() => {
          if (!editorObject) return;
          void store.deleteObject(editorObject.id);
          ui.openEditor(null);
        }}
        onOpenScrapbook={() => editorObject && ui.openScrapbook(editorObject.id)}
        onReplacePhoto={(file) =>
          editorObject && void store.replacePhoto(editorObject.id, file)
        }
        onConnect={() => {
          if (!editorObject) return;
          ui.openEditor(null);
          ui.setMode('connect');
          ui.pushChain(editorObject.id);
        }}
        memberTitles={memberTitles}
      />

      <ObjectMenu
        anchor={ui.objectMenu}
        object={menuObject}
        collections={collections}
        onClose={() => ui.openObjectMenu(null)}
        onOpen={() => {
          ui.openObjectMenu(null);
          if (menuObject) openObject(menuObject);
        }}
        onEdit={() => menuObject && ui.openEditor(menuObject.id)}
        onConnect={() => {
          if (!menuObject) return;
          ui.openObjectMenu(null);
          ui.setMode('connect');
          ui.pushChain(menuObject.id);
        }}
        onDuplicate={() => {
          if (!menuObject) return;
          void store.duplicateObject(menuObject.id);
          ui.openObjectMenu(null);
        }}
        onDelete={() => {
          if (!menuObject) return;
          void store.deleteObject(menuObject.id);
          ui.openObjectMenu(null);
        }}
        onMoveToCollection={(id) => {
          if (!menuObject) return;
          void store.updateObject(menuObject.id, { parentId: id });
          ui.openObjectMenu(null);
          ui.say(id ? 'Moved into the collection.' : 'Taken out.');
        }}
        onBringToFront={() => {
          if (!menuObject) return;
          const top = objects.reduce((m, o) => Math.max(m, o.z), 0);
          void store.updateObject(menuObject.id, { z: top + 1 });
          ui.openObjectMenu(null);
        }}
        onFocus={() => {
          if (!menuObject) return;
          ui.openObjectMenu(null);
          engine?.flyToNode(menuObject.id, Math.max(0.9, engine.camera.zoom), 1.1);
        }}
      />

      <UniverseMenu
        anchor={ui.universeMenu}
        universe={menuUniverse}
        canDelete={universes.length > 1}
        onClose={() => ui.openUniverseMenu(null)}
        onEnter={() => {
          if (!menuUniverse) return;
          ui.openUniverseMenu(null);
          enterUniverse(menuUniverse.id);
        }}
        onRename={() => {
          ui.openUniverseMenu(null);
          ui.openPanel('universes');
        }}
        onLook={() => {
          if (!menuUniverse) return;
          ui.openUniverseMenu(null);
          void store.openUniverse(menuUniverse.id).then(() => ui.openPanel('theme'));
        }}
        onExport={() => {
          if (!menuUniverse) return;
          ui.openUniverseMenu(null);
          void doExport(menuUniverse.id);
        }}
        onDelete={() => {
          if (!menuUniverse) return;
          void store.deleteUniverse(menuUniverse.id);
          ui.openUniverseMenu(null);
          ui.say('Universe deleted.');
        }}
      />

      <ThemePanel
        open={ui.panel === 'theme'}
        universe={active}
        onClose={() => ui.openPanel(null)}
        onChange={(patch) => active && void store.updateUniverse(active.id, patch)}
      />

      <UniversePanel
        open={ui.panel === 'universes'}
        universes={universes}
        counts={store.counts}
        onClose={() => ui.openPanel(null)}
        onEnter={(id) => {
          ui.openPanel(null);
          if (id === activeId) return;
          if (activeId) leaveUniverse(true);
          window.setTimeout(() => enterUniverse(id), activeId ? RISE_MS + 200 : 0);
        }}
        onRename={(id, name) => void store.updateUniverse(id, { name })}
        onDelete={(id) => {
          void store.deleteUniverse(id);
          ui.say('Universe deleted.');
        }}
        onCreate={(name) => {
          void store.createUniverse(name).then(() => engine?.fit(undefined, 0.7, 1.2));
        }}
        onImport={(text) => void doImport(text)}
      />

      <SettingsPanel
        open={ui.panel === 'settings'}
        onClose={() => ui.openPanel(null)}
        motion={settings.motion}
        onMotion={(v) => void store.patchSettings({ motion: v })}
        quality={qualityLock}
        onQuality={setQualityLock}
        showStats={ui.showStats}
        onToggleStats={ui.toggleStats}
        reducedMotion={!!engine?.quality.reducedMotion}
        canExportUniverse={!!activeId}
        onExportAll={() => void doExport(null)}
        onExportUniverse={() => void doExport(activeId)}
        onImport={(text) => void doImport(text)}
        onReset={() => {
          ui.openPanel(null);
          introPlayed.current = false;
          void store.resetAll();
        }}
      />

      <Scrapbook
        object={scrapbookObject}
        onClose={() => ui.openScrapbook(null)}
        onSave={(page) => scrapbookObject && void store.saveScrapbook(scrapbookObject.id, page)}
      />

      <Lightbox
        object={lightboxObject}
        onClose={() => setLightboxId(null)}
        onEdit={() => {
          if (!lightboxObject) return;
          const id = lightboxObject.id;
          setLightboxId(null);
          ui.openEditor(id);
        }}
      />

      <Whisper />
      <StatsBadge stats={stats} />
      <BootScreen status={status} error={error} />
      <GiftIntro
        open={isGift && status === 'ready'}
        onBegin={() => {
          store.dismissGift();
          engine?.flyTo(0, 0, engine.multiverseZoom * 1.08, 1.4);
        }}
      />
    </>
  );
}
