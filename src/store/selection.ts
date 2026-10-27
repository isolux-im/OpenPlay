import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useId } from 'react';
import { create } from 'zustand';

import type { MediaKind } from '../library/fileOps';

/**
 * Sélection unique ou multiple de morceaux ou de vidéos (« Sélectionner » dans le menu d'un élément),
 * pour agir sur plusieurs fichiers à la fois : playlist, copier, déplacer, renommer, supprimer.
 * Une seule sélection à la fois ; elle prend fin quand on quitte l'écran.
 */
type State = {
  kind: MediaKind | null;
  ids: string[];
  /** Éléments de l'écran affiché, pour « Tout sélectionner ». */
  available: Record<MediaKind, string[]>;
  /** Écran qui a déclaré `available` (un écran quitté ne vide que sa propre déclaration). */
  owner: Record<MediaKind, string | null>;
  /** Démarre la sélection, avec un premier élément coché ou aucun (bouton « Sélectionner »). */
  start: (kind: MediaKind, id?: string) => void;
  toggle: (id: string) => void;
  /** Tout sélectionner (true) ou tout désélectionner (false) parmi les éléments de l'écran. */
  setAll: (all: boolean) => void;
  clear: () => void;
  setAvailable: (kind: MediaKind, ids: string[], owner: string | null) => void;
};

export const useSelection = create<State>()((set, get) => ({
  kind: null,
  ids: [],
  available: { audio: [], video: [] },
  owner: { audio: null, video: null },
  start: (kind, id) => set({ kind, ids: id ? [id] : [] }),
  toggle: (id) => set((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id] })),
  setAll: (all) => {
    const { kind, available } = get();
    if (kind) set({ ids: all ? [...available[kind]] : [] });
  },
  clear: () => set({ kind: null, ids: [] }),
  setAvailable: (kind, ids, owner) => set((s) => ({ available: { ...s.available, [kind]: ids }, owner: { ...s.owner, [kind]: owner } })),
}));

/**
 * Déclare les éléments sélectionnables de l'écran (dans l'ordre affiché) tant qu'il est au premier plan ;
 * la sélection en cours s'arrête quand on le quitte.
 */
export function useSelectable(kind: MediaKind, ids: string[]) {
  const owner = useId();
  useFocusEffect(
    useCallback(() => {
      useSelection.getState().setAvailable(kind, ids, owner);
    }, [kind, ids, owner]),
  );
  useFocusEffect(
    useCallback(
      () => () => {
        const s = useSelection.getState();
        if (s.owner[kind] === owner) s.setAvailable(kind, [], null);
        if (s.kind === kind) s.clear();
      },
      [kind, owner],
    ),
  );
}

