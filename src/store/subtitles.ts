import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { clampOffset } from '../video/subtitles';
import { persistStorage } from './storage';

/** Fichier de sous-titres associé explicitement à une vidéo par l'utilisateur. */
export type SubtitleLink = {
  uri: string;
  name: string;
  /** Accès conservé après redémarrage (accordé par le fournisseur du fichier). */
  persistent: boolean;
  offsetSec: number;
  addedAt: number;
};

/** Au-delà, les associations les plus anciennes sont oubliées. */
export const SUBTITLE_LINK_LIMIT = 300;

type State = {
  byVideo: Record<string, SubtitleLink>;
  /** Associe un fichier ; renvoie les URI qui ne sont plus utilisées (accès à libérer). */
  link: (videoId: string, file: Omit<SubtitleLink, 'offsetSec' | 'addedAt'>, at: number) => string[];
  setOffset: (videoId: string, offsetSec: number) => void;
  /** Renvoie les URI qui ne sont plus utilisées par aucune vidéo. */
  unlink: (videoId: string) => string[];
};

function released(before: Record<string, SubtitleLink>, after: Record<string, SubtitleLink>): string[] {
  const kept = new Set(Object.values(after).map((l) => l.uri));
  return [...new Set(Object.values(before).map((l) => l.uri))].filter((uri) => !kept.has(uri));
}

/** Associations vidéo → sous-titres. Seules celles dont l'accès est persistant survivent à un redémarrage. */
export const useSubtitles = create<State>()(
  persist(
    (set, get) => ({
      byVideo: {},
      link: (videoId, file, at) => {
        const before = get().byVideo[videoId];
        const byVideo = { ...get().byVideo, [videoId]: { ...file, offsetSec: before?.uri === file.uri ? before.offsetSec : 0, addedAt: at } };
        const ids = Object.keys(byVideo);
        if (ids.length > SUBTITLE_LINK_LIMIT) {
          ids.sort((a, b) => byVideo[a].addedAt - byVideo[b].addedAt);
          for (const old of ids.slice(0, ids.length - SUBTITLE_LINK_LIMIT)) delete byVideo[old];
        }
        const gone = released(get().byVideo, byVideo);
        set({ byVideo });
        return gone;
      },
      setOffset: (videoId, offsetSec) =>
        set((s) => {
          const l = s.byVideo[videoId];
          return l ? { byVideo: { ...s.byVideo, [videoId]: { ...l, offsetSec: clampOffset(offsetSec) } } } : s;
        }),
      unlink: (videoId) => {
        const before = get().byVideo[videoId];
        if (!before) return [];
        const byVideo = { ...get().byVideo };
        delete byVideo[videoId];
        const gone = released(get().byVideo, byVideo);
        set({ byVideo });
        return gone;
      },
    }),
    {
      name: 'openplay.subtitles.v1',
      storage: persistStorage,
      version: 1,
      partialize: ({ byVideo }) => ({ byVideo: Object.fromEntries(Object.entries(byVideo).filter(([, l]) => l.persistent)) }),
    },
  ),
);
