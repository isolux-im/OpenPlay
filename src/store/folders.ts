import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { MediaKind } from '../library/fileOps';
import { persistStorage } from './storage';

/**
 * Dossiers créés dans OpenPlay. Android n'indexe pas un dossier vide (MediaStore ne connaît que les
 * fichiers) : ils sont retenus ici pour rester visibles dans Dossiers et dans le choix de destination.
 */
type State = {
  created: Record<MediaKind, string[]>;
  add: (kind: MediaKind, folder: string) => void;
  remove: (kind: MediaKind, folder: string) => void;
};

export const useFolders = create<State>()(
  persist(
    (set) => ({
      created: { audio: [], video: [] },
      add: (kind, folder) => set((s) => (s.created[kind].includes(folder) ? s : { created: { ...s.created, [kind]: [...s.created[kind], folder] } })),
      remove: (kind, folder) => set((s) => ({ created: { ...s.created, [kind]: s.created[kind].filter((f) => f !== folder) } })),
    }),
    { name: 'openplay.folders.v1', storage: persistStorage, version: 1, partialize: ({ created }) => ({ created }) },
  ),
);
