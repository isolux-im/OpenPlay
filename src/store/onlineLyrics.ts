import { create } from 'zustand';

import { describeError, recordDiagnostic } from '../diagnostics/crashReports';
import { fetchLyrics, type LrclibResult } from '../lyrics/lrclib';
import { NetError } from '../net/http';
import type { Track } from '../types';

export type OnlineEntry =
  | { status: 'loading' }
  | { status: 'done'; result: LrclibResult }
  | { status: 'error'; message: string; retryable: boolean };

type State = {
  entries: Record<string, OnlineEntry>;
  /** Lance la recherche si elle n'a pas déjà eu lieu (ou a échoué) pendant cette session. */
  request: (track: Track) => void;
  /** Abandonne la recherche en cours d'un morceau qui n'est plus affiché. */
  cancel: (trackId: string) => void;
  retry: (track: Track) => void;
};

const controllers = new Map<string, AbortController>();

/**
 * Paroles LRCLIB, gardées en mémoire le temps de la session (aucune copie durable :
 * les droits de conservation des paroles ne sont pas établis). Une seule requête à la fois par morceau.
 */
export const useOnlineLyrics = create<State>()((set, get) => ({
  entries: {},

  request: (track) => {
    // Une erreur n'est pas relancée automatiquement : l'utilisateur choisit « Réessayer ».
    if (get().entries[track.id]) return;
    get().retry(track);
  },

  retry: (track) => {
    if (controllers.has(track.id)) return;
    const controller = new AbortController();
    controllers.set(track.id, controller);
    set((s) => ({ entries: { ...s.entries, [track.id]: { status: 'loading' } } }));
    // Réponse d'une requête annulée ou remplacée entre-temps : ignorée.
    const current = () => controllers.get(track.id) === controller;
    fetchLyrics(track, { signal: controller.signal })
      .then((result) => {
        if (current()) set((s) => ({ entries: { ...s.entries, [track.id]: { status: 'done', result } } }));
      })
      .catch((e: unknown) => {
        if (!current() || (e instanceof NetError && e.kind === 'cancelled')) return;
        const message = e instanceof NetError ? e.message : 'Recherche de paroles impossible.';
        // Un échec réseau ordinaire n'est pas un incident ; une réponse inattendue ou une exception, si.
        if (!(e instanceof NetError)) recordDiagnostic('Paroles LRCLIB : erreur inattendue', describeError(e));
        else if (e.kind === 'bad-response') recordDiagnostic('Paroles LRCLIB : réponse inattendue', `${e.status ?? ''} ${e.detail ?? ''}`);
        set((s) => ({ entries: { ...s.entries, [track.id]: { status: 'error', message, retryable: e instanceof NetError ? e.retryable : true } } }));
      })
      .finally(() => {
        if (current()) controllers.delete(track.id);
      });
  },

  cancel: (trackId) => {
    const controller = controllers.get(trackId);
    if (!controller) return;
    controllers.delete(trackId);
    controller.abort();
    // Retrait immédiat : une réouverture rapide relance la recherche au lieu d'attendre l'annulation.
    set((s) => {
      if (s.entries[trackId]?.status !== 'loading') return s;
      const entries = { ...s.entries };
      delete entries[trackId];
      return { entries };
    });
  },
}));
