import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from './storage';

/** Générique repéré dans un épisode (secondes), ou analyse sans résultat (`none`, avec l'épisode comparé). */
export type IntroInfo = { start: number; end: number } | { none: true; partner: string; at: number };

export const INTRO_LIMIT = 500;

type State = {
  byVideo: Record<string, IntroInfo>;
  set: (entries: Record<string, IntroInfo>) => void;
  clear: () => void;
};

/** Résultats du repérage du générique, conservés sur l'appareil (l'analyse sonore n'est faite qu'une fois). */
export const useIntros = create<State>()(
  persist(
    (set) => ({
      byVideo: {},
      set: (entries) =>
        set((s) => {
          const byVideo = { ...s.byVideo, ...entries };
          const ids = Object.keys(byVideo);
          // Au-delà de la limite, on oublie d'abord les analyses sans résultat.
          for (const id of ids) {
            if (Object.keys(byVideo).length <= INTRO_LIMIT) break;
            if ('none' in byVideo[id] && !(id in entries)) delete byVideo[id];
          }
          for (const id of Object.keys(byVideo)) {
            if (Object.keys(byVideo).length <= INTRO_LIMIT) break;
            if (!(id in entries)) delete byVideo[id];
          }
          return { byVideo };
        }),
      clear: () => set({ byVideo: {} }),
    }),
    { name: 'openplay.intros.v1', storage: persistStorage, version: 1, partialize: ({ byVideo }) => ({ byVideo }) },
  ),
);
