import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Series } from '../video/series';
import type { Video } from '../video/types';
import { persistStorage } from './storage';
import { newId } from './user';

/** Élément d'une playlist vidéo : une série entière (suit ses nouveaux épisodes) ou une vidéo isolée. */
export type VideoPlaylistItem = { kind: 'series'; key: string } | { kind: 'video'; id: string };

export type VideoPlaylist = { id: string; name: string; items: VideoPlaylistItem[]; createdAt: number; updatedAt: number };

/** Élément résolu pour l'affichage ; `index` : position dans `items` (retrait, déplacement). */
export type ResolvedItem = { kind: 'series'; series: Series; index: number } | { kind: 'video'; video: Video; index: number };

const sameItem = (a: VideoPlaylistItem, b: VideoPlaylistItem) => (a.kind === 'series' ? b.kind === 'series' && a.key === b.key : b.kind === 'video' && a.id === b.id);

type State = {
  playlists: VideoPlaylist[];
  create: (name: string, items?: VideoPlaylistItem[]) => VideoPlaylist;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  /** Ajoute en fin de playlist ; un élément déjà présent n'est pas doublé. Renvoie le nombre d'ajouts. */
  addItems: (id: string, items: VideoPlaylistItem[]) => number;
  removeItem: (id: string, index: number) => void;
  moveItem: (id: string, from: number, to: number) => void;
};

function update(list: VideoPlaylist[], id: string, f: (p: VideoPlaylist) => Partial<VideoPlaylist>): VideoPlaylist[] {
  return list.map((p) => (p.id === id ? { ...p, ...f(p), updatedAt: Date.now() } : p));
}

/** Playlists vidéo (séries et vidéos), distinctes des playlists musicales ; conservées sur l'appareil. */
export const useVideoPlaylists = create<State>()(
  persist(
    (set, get) => ({
      playlists: [],
      create: (name, items = []) => {
        const now = Date.now();
        const unique = items.filter((it, i) => items.findIndex((x) => sameItem(x, it)) === i);
        const p: VideoPlaylist = { id: newId('vpl'), name: name.trim() || 'Nouvelle playlist', items: unique, createdAt: now, updatedAt: now };
        set((s) => ({ playlists: [p, ...s.playlists] }));
        return p;
      },
      rename: (id, name) => set((s) => ({ playlists: update(s.playlists, id, (p) => ({ name: name.trim() || p.name })) })),
      remove: (id) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),
      addItems: (id, items) => {
        const p = get().playlists.find((x) => x.id === id);
        if (!p) return 0;
        const fresh = items.filter((it, i) => !p.items.some((x) => sameItem(x, it)) && items.findIndex((x) => sameItem(x, it)) === i);
        if (fresh.length) set((s) => ({ playlists: update(s.playlists, id, (q) => ({ items: [...q.items, ...fresh] })) }));
        return fresh.length;
      },
      removeItem: (id, index) => set((s) => ({ playlists: update(s.playlists, id, (p) => ({ items: p.items.filter((_, i) => i !== index) })) })),
      moveItem: (id, from, to) =>
        set((s) => ({
          playlists: update(s.playlists, id, (p) => {
            if (to < 0 || to >= p.items.length || from === to) return {};
            const items = [...p.items];
            const [it] = items.splice(from, 1);
            items.splice(to, 0, it);
            return { items };
          }),
        })),
    }),
    { name: 'openplay.videoPlaylists.v1', storage: persistStorage, version: 1, partialize: ({ playlists }) => ({ playlists }) },
  ),
);

/**
 * Éléments encore présents dans la vidéothèque (une série dont les fichiers ont disparu, ou une vidéo
 * supprimée, est masquée sans être retirée : elle réapparaît si les fichiers reviennent).
 */
export function resolvePlaylist(p: VideoPlaylist, seriesByKey: Record<string, Series>, videosById: Record<string, Video>): ResolvedItem[] {
  const out: ResolvedItem[] = [];
  p.items.forEach((it, index) => {
    if (it.kind === 'series') {
      const series = seriesByKey[it.key];
      if (series) out.push({ kind: 'series', series, index });
    } else {
      const video = videosById[it.id];
      if (video) out.push({ kind: 'video', video, index });
    }
  });
  return out;
}

/** Ordre de lecture : épisodes de chaque série dans l'ordre saison / épisode, puis vidéos ; sans doublon. */
export function playlistVideoIds(items: ResolvedItem[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    for (const v of it.kind === 'series' ? it.series.episodes : [it.video]) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      ids.push(v.id);
    }
  }
  return ids;
}

export function describePlaylist(items: ResolvedItem[]): string {
  const series = items.filter((i) => i.kind === 'series').length;
  const videos = items.length - series;
  const parts = [series ? `${series} série${series > 1 ? 's' : ''}` : null, videos ? `${videos} vidéo${videos > 1 ? 's' : ''}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Vide';
}
