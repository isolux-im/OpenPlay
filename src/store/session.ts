import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from './storage';
import { useUser, type Session } from './user';

/**
 * Session de lecture (file, aléatoire, répétition), écrite seulement quand la file change.
 * Stockée à part des données utilisateur : avant, la position était réécrite toutes les 5 s avec
 * tout l'historique, les compteurs et les playlists.
 */
type QueueState = { session: Session | null; saved: boolean; save: (s: Session | null) => void };

export const usePlaybackSession = create<QueueState>()(
  persist(
    (set) => ({
      session: null,
      saved: false,
      save: (session) => {
        // Première écriture : l'ancienne session gardée dans les données utilisateur n'est plus utile.
        if (useUser.getState().session) useUser.getState().saveSession(null);
        set({ session, saved: true });
      },
    }),
    { name: 'openplay.session.v1', storage: persistStorage, version: 1, partialize: ({ session, saved }) => ({ session, saved }) },
  ),
);

/** Position courante, petite écriture fréquente (piste et seconde). */
type PositionState = { trackId: string | null; positionSec: number; save: (trackId: string | null, positionSec: number) => void };

export const usePlaybackPosition = create<PositionState>()(
  persist(
    (set) => ({
      trackId: null,
      positionSec: 0,
      save: (trackId, positionSec) => set({ trackId, positionSec: Math.round(positionSec) }),
    }),
    { name: 'openplay.position.v1', storage: persistStorage, version: 1, partialize: ({ trackId, positionSec }) => ({ trackId, positionSec }) },
  ),
);

/** Session à reprendre au lancement : la plus récente, avec la dernière position connue. */
export function sessionToRestore(): Session | null {
  const { session: stored, saved } = usePlaybackSession.getState();
  // Mise à jour depuis une version antérieure : session encore rangée dans les données utilisateur.
  const session = saved ? stored : useUser.getState().session;
  if (!session) return null;
  const { trackId, positionSec } = usePlaybackPosition.getState();
  const at = trackId ? session.queue.indexOf(trackId) : -1;
  return at >= 0 ? { ...session, index: at, positionSec } : session;
}

export function whenSessionStoresReady(run: () => void): () => void {
  const stores = [useUser.persist, usePlaybackSession.persist, usePlaybackPosition.persist];
  let done = false;
  const check = () => {
    if (!done && stores.every((p) => p.hasHydrated())) {
      done = true;
      run();
    }
  };
  const unsubs = stores.map((p) => p.onFinishHydration(check));
  check();
  return () => unsubs.forEach((u) => u());
}
