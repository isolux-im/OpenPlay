import { useEffect, useSyncExternalStore } from 'react';

import { OpenPlayMedia } from '../../modules/openplay-media';
import type { Track } from '../types';

export type ArtworkColors = { dominant: string; vibrant: string; darkMuted: string };
export type ArtworkInfo = { uri: string | null; colors: ArtworkColors };

/** Côté le plus long en pixels : couvre la pochette du lecteur plein écran sur les écrans courants. */
export const ARTWORK_SIZE = 1200;

const cache = new Map<string, ArtworkInfo>();
const pending = new Map<string, Promise<ArtworkInfo>>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

/** Couleurs déterministes pour les morceaux sans pochette : chaque album garde sa teinte. */
export function fallbackColors(seed: string): ArtworkColors {
  const hue = hash(seed) % 360;
  return {
    dominant: hslToHex(hue, 0.45, 0.42),
    vibrant: hslToHex((hue + 25) % 360, 0.7, 0.55),
    darkMuted: hslToHex(hue, 0.35, 0.18),
  };
}

export function artworkKey(track: Pick<Track, 'id' | 'albumId'>): string {
  return track.albumId || track.id;
}

export function peekArtwork(track: Pick<Track, 'id' | 'albumId'>): ArtworkInfo | null {
  return cache.get(artworkKey(track)) ?? null;
}

export function loadArtwork(track: Pick<Track, 'id' | 'albumId'>): Promise<ArtworkInfo> {
  const key = artworkKey(track);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(key);
  if (inflight) return inflight;

  const fallback: ArtworkInfo = { uri: null, colors: fallbackColors(key) };
  const p = (OpenPlayMedia ? OpenPlayMedia.getArtworkAsync(track.id, track.albumId, ARTWORK_SIZE) : Promise.resolve(null))
    .then((native) =>
      native
        ? { uri: native.uri, colors: { dominant: native.dominant, vibrant: native.vibrant, darkMuted: native.darkMuted } }
        : fallback,
    )
    .catch(() => fallback)
    .then((info) => {
      cache.set(key, info);
      pending.delete(key);
      listeners.forEach((l) => l());
      return info;
    });
  pending.set(key, p);
  return p;
}

/** Pochette d'un morceau : lue dans le cache partagé, chargée à la demande. */
export function useArtwork(track: Pick<Track, 'id' | 'albumId'> | null | undefined): ArtworkInfo | null {
  const key = track ? artworkKey(track) : null;
  const info = useSyncExternalStore(subscribe, () => (key ? (cache.get(key) ?? null) : null));
  const trackId = track?.id;
  const albumId = track?.albumId;
  useEffect(() => {
    if (trackId !== undefined && albumId !== undefined && !info) loadArtwork({ id: trackId, albumId });
  }, [trackId, albumId, info]);
  return info;
}

/** Réservé aux tests. */
export function __resetArtworkCache() {
  cache.clear();
  pending.clear();
}
