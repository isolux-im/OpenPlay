import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { isFinished } from '../video/library';
import type { VideoHistoryEntry } from '../video/types';
import { persistStorage } from './storage';

/** Au-delà, les vidéos regardées le plus anciennement sont oubliées. */
export const VIDEO_HISTORY_LIMIT = 300;

type State = {
  entries: Record<string, VideoHistoryEntry>;
  favorites: string[];
  savePosition: (id: string, positionSec: number, durationSec: number, at: number) => void;
  toggleFavorite: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
};

/** Historique vidéo, distinct de l'historique musical et conservé sur l'appareil uniquement. */
export const useVideoHistory = create<State>()(
  persist(
    (set) => ({
      entries: {},
      favorites: [],
      savePosition: (id, positionSec, durationSec, at) =>
        set((s) => {
          const entries = { ...s.entries, [id]: { positionSec, durationSec, watchedAt: at, finished: isFinished(positionSec, durationSec) } };
          const ids = Object.keys(entries);
          if (ids.length > VIDEO_HISTORY_LIMIT) {
            ids.sort((a, b) => entries[a].watchedAt - entries[b].watchedAt);
            for (const old of ids.slice(0, ids.length - VIDEO_HISTORY_LIMIT)) delete entries[old];
          }
          return { entries };
        }),
      toggleFavorite: (id) => set((s) => ({ favorites: s.favorites.includes(id) ? s.favorites.filter((x) => x !== id) : [id, ...s.favorites] })),
      remove: (id) =>
        set((s) => {
          const entries = { ...s.entries };
          delete entries[id];
          return { entries };
        }),
      clear: () => set({ entries: {} }),
    }),
    { name: 'openplay.videos.v1', storage: persistStorage, version: 1, partialize: ({ entries, favorites }) => ({ entries, favorites }) },
  ),
);
