'use client';

import { create } from 'zustand';

export type StageMode = 'explore' | 'connect';

export interface MenuAnchor {
  id: string;
  x: number;
  y: number;
}

interface UiState {
  mode: StageMode;
  addOpen: boolean;
  objectMenu: MenuAnchor | null;
  universeMenu: MenuAnchor | null;
  editorId: string | null;
  scrapbookId: string | null;
  panel: null | 'theme' | 'settings' | 'universes';
  timelineOpen: boolean;
  /** Year currently emphasised by the timeline, or null for "all time". */
  timelineYear: number | null;
  hoverId: string | null;
  /** First tapped object while wiring a constellation. */
  connectFrom: string | null;
  connectChain: string[];
  toast: { text: string; tone: 'info' | 'warn' } | null;
  hint: string | null;
  showStats: boolean;
  /** Song object currently playing, if any. */
  playingId: string | null;

  setMode(m: StageMode): void;
  openAdd(open: boolean): void;
  openObjectMenu(a: MenuAnchor | null): void;
  openUniverseMenu(a: MenuAnchor | null): void;
  openEditor(id: string | null): void;
  openScrapbook(id: string | null): void;
  openPanel(p: UiState['panel']): void;
  setTimeline(open: boolean): void;
  setTimelineYear(y: number | null): void;
  setHover(id: string | null): void;
  setConnectFrom(id: string | null): void;
  pushChain(id: string): void;
  clearChain(): void;
  setPlaying(id: string | null): void;
  say(text: string, tone?: 'info' | 'warn'): void;
  setHint(text: string | null): void;
  toggleStats(): void;
  dismissAll(): void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Transient interface state.
 *
 * Kept apart from the document store so opening a sheet never invalidates
 * anything the renderer subscribes to.
 */
export const useUi = create<UiState>((set, get) => ({
  mode: 'explore',
  addOpen: false,
  objectMenu: null,
  universeMenu: null,
  editorId: null,
  scrapbookId: null,
  panel: null,
  timelineOpen: false,
  timelineYear: null,
  hoverId: null,
  connectFrom: null,
  connectChain: [],
  toast: null,
  hint: null,
  showStats: false,
  playingId: null,

  setMode(mode) {
    set({ mode, connectFrom: null, connectChain: [] });
  },
  openAdd(addOpen) {
    set({ addOpen, objectMenu: null, universeMenu: null });
  },
  openObjectMenu(objectMenu) {
    set({ objectMenu, addOpen: false, universeMenu: null });
  },
  openUniverseMenu(universeMenu) {
    set({ universeMenu, addOpen: false, objectMenu: null });
  },
  openEditor(editorId) {
    set({ editorId, objectMenu: null, addOpen: false });
  },
  openScrapbook(scrapbookId) {
    set({ scrapbookId, objectMenu: null, addOpen: false, editorId: null });
  },
  openPanel(panel) {
    set({ panel, addOpen: false, objectMenu: null, universeMenu: null });
  },
  setTimeline(timelineOpen) {
    set({ timelineOpen, timelineYear: timelineOpen ? get().timelineYear : null });
  },
  setTimelineYear(timelineYear) {
    set({ timelineYear });
  },
  setHover(hoverId) {
    if (get().hoverId !== hoverId) set({ hoverId });
  },
  setConnectFrom(connectFrom) {
    set({ connectFrom });
  },
  pushChain(id) {
    set((s) =>
      s.connectChain.includes(id)
        ? { connectChain: s.connectChain.filter((x) => x !== id) }
        : { connectChain: [...s.connectChain, id] },
    );
  },
  clearChain() {
    set({ connectChain: [], connectFrom: null });
  },
  setPlaying(playingId) {
    set({ playingId });
  },
  say(text, tone = 'info') {
    set({ toast: { text, tone } });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 3200);
  },
  setHint(hint) {
    set({ hint });
  },
  toggleStats() {
    set((s) => ({ showStats: !s.showStats }));
  },
  dismissAll() {
    set({ addOpen: false, objectMenu: null, universeMenu: null, panel: null });
  },
}));
