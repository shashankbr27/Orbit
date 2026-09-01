'use client';

/**
 * One audio element for the whole app.
 *
 * A song object can carry a url; playing it makes its star pulse (the object
 * layer already draws expanding rings for `playing` nodes). Deliberately
 * minimal: one track at a time, no queue, no visualiser — the point is that a
 * song you loved is *there*, not that ORBIT is a music player.
 */

let el: HTMLAudioElement | null = null;
let currentId: string | null = null;
const listeners = new Set<(id: string | null) => void>();

function announce(id: string | null) {
  currentId = id;
  listeners.forEach((fn) => fn(id));
}

function element(): HTMLAudioElement {
  if (el) return el;
  el = new Audio();
  el.preload = 'none';
  el.addEventListener('ended', () => announce(null));
  el.addEventListener('error', () => announce(null));
  el.addEventListener('pause', () => {
    if (el && el.currentTime === 0) announce(null);
  });
  return el;
}

export function playingSongId(): string | null {
  return currentId;
}

export function onPlayingChange(fn: (id: string | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Play, or stop if this song is already the one playing. */
export function toggleSong(id: string, url: string | undefined): 'playing' | 'stopped' | 'failed' {
  if (!url) return 'failed';
  if (currentId === id) {
    stopSong();
    return 'stopped';
  }
  const audio = element();
  audio.src = url;
  audio.currentTime = 0;
  // Optimistic: the ring should start pulsing the instant you tap.
  announce(id);
  void audio.play().catch(() => {
    // Autoplay blocked, bad url, unsupported format — fail quietly.
    if (currentId === id) announce(null);
  });
  return 'playing';
}

export function stopSong() {
  if (el) {
    el.pause();
    el.currentTime = 0;
  }
  announce(null);
}
