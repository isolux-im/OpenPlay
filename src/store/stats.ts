import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from './storage';

/** Statistiques d'une journée (heure locale du téléphone). */
export type DayStats = {
  /** Temps d'écoute réel, en secondes. */
  sec: number;
  /** Écoutes validées (30 s de lecture effective). */
  plays: number;
  /** Temps d'écoute par heure de la journée (24 cases, secondes). */
  hours: number[];
  /** Écoutes validées par morceau. */
  tracks: Record<string, number>;
};

/** Au-delà, les journées les plus anciennes sont oubliées (le bilan couvre au plus l'année en cours). */
export const STATS_RETENTION_DAYS = 400;

export function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyDay(): DayStats {
  return { sec: 0, plays: 0, hours: Array.from({ length: 24 }, () => 0), tracks: {} };
}

function prune(days: Record<string, DayStats>, now: number): Record<string, DayStats> {
  const oldest = dayKey(now - STATS_RETENTION_DAYS * 86_400_000);
  const keys = Object.keys(days);
  if (!keys.some((k) => k < oldest)) return days;
  return Object.fromEntries(keys.filter((k) => k >= oldest).map((k) => [k, days[k]]));
}

type StatsState = {
  /** Date du premier enregistrement : le bilan ne connaît rien d'antérieur. */
  since: number | null;
  days: Record<string, DayStats>;
  addListening: (at: number, sec: number) => void;
  addPlay: (trackId: string, at: number) => void;
  clear: () => void;
};

/**
 * Bilan d'écoute, conservé sur l'appareil uniquement. Stocké à part des données utilisateur :
 * le temps d'écoute est enregistré souvent et ne doit pas réécrire playlists et favoris à chaque fois.
 */
export const useStats = create<StatsState>()(
  persist(
    (set) => ({
      since: null,
      days: {},
      addListening: (at, sec) => {
        if (!(sec > 0)) return;
        set((s) => {
          const key = dayKey(at);
          const day = s.days[key] ?? emptyDay();
          const hours = [...day.hours];
          hours[new Date(at).getHours()] += sec;
          return { since: s.since ?? at, days: prune({ ...s.days, [key]: { ...day, sec: day.sec + sec, hours } }, at) };
        });
      },
      addPlay: (trackId, at) =>
        set((s) => {
          const key = dayKey(at);
          const day = s.days[key] ?? emptyDay();
          return {
            since: s.since ?? at,
            days: prune({ ...s.days, [key]: { ...day, plays: day.plays + 1, tracks: { ...day.tracks, [trackId]: (day.tracks[trackId] ?? 0) + 1 } } }, at),
          };
        }),
      clear: () => set({ since: null, days: {} }),
    }),
    { name: 'openplay.stats.v1', storage: persistStorage, version: 1, partialize: ({ since, days }) => ({ since, days }) },
  ),
);
