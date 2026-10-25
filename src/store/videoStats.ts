import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STATS_RETENTION_DAYS, dayKey } from './stats';
import { persistStorage } from './storage';

/** Visionnage d'une journée (heure locale du téléphone). */
export type VideoDay = {
  /** Temps de visionnage réel, en secondes (vitesse de lecture comprise). */
  sec: number;
  /** Par heure de la journée (24 cases, secondes). */
  hours: number[];
  /** Temps par vidéo (secondes). */
  videos: Record<string, number>;
  /** Vidéos terminées ce jour-là. */
  finished: string[];
};

function emptyDay(): VideoDay {
  return { sec: 0, hours: Array.from({ length: 24 }, () => 0), videos: {}, finished: [] };
}

function prune(days: Record<string, VideoDay>, now: number): Record<string, VideoDay> {
  const oldest = dayKey(now - STATS_RETENTION_DAYS * 86_400_000);
  const keys = Object.keys(days);
  if (!keys.some((k) => k < oldest)) return days;
  return Object.fromEntries(keys.filter((k) => k >= oldest).map((k) => [k, days[k]]));
}

type State = {
  since: number | null;
  days: Record<string, VideoDay>;
  addWatching: (videoId: string, at: number, sec: number) => void;
  addFinished: (videoId: string, at: number) => void;
  clear: () => void;
};

/** Bilan de visionnage, distinct du bilan d'écoute musical ; local uniquement. */
export const useVideoStats = create<State>()(
  persist(
    (set) => ({
      since: null,
      days: {},
      addWatching: (videoId, at, sec) => {
        if (!(sec > 0)) return;
        set((s) => {
          const key = dayKey(at);
          const day = s.days[key] ?? emptyDay();
          const hours = [...day.hours];
          hours[new Date(at).getHours()] += sec;
          const videos = { ...day.videos, [videoId]: (day.videos[videoId] ?? 0) + sec };
          return { since: s.since ?? at, days: prune({ ...s.days, [key]: { ...day, sec: day.sec + sec, hours, videos } }, at) };
        });
      },
      addFinished: (videoId, at) =>
        set((s) => {
          const key = dayKey(at);
          const day = s.days[key] ?? emptyDay();
          if (day.finished.includes(videoId)) return s;
          return { since: s.since ?? at, days: prune({ ...s.days, [key]: { ...day, finished: [...day.finished, videoId] } }, at) };
        }),
      clear: () => set({ since: null, days: {} }),
    }),
    { name: 'openplay.videostats.v1', storage: persistStorage, version: 1, partialize: ({ since, days }) => ({ since, days }) },
  ),
);
