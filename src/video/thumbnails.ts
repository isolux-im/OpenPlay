import { useEffect, useSyncExternalStore } from 'react';

import { OpenPlayMedia } from '../../modules/openplay-media';

/** Largeur des miniatures (16:9) : assez pour une grille à deux colonnes. */
export const THUMB_SIZE = 480;
/** Au plus quelques centaines d'URI gardées en mémoire ; les fichiers restent en cache disque. */
const MEMORY_LIMIT = 400;

const cache = new Map<string, string | null>();
const pending = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function load(id: string) {
  if (cache.has(id) || pending.has(id) || !OpenPlayMedia?.getVideoThumbnailAsync) return;
  pending.add(id);
  OpenPlayMedia.getVideoThumbnailAsync(id, THUMB_SIZE)
    .catch(() => null)
    .then((uri) => {
      pending.delete(id);
      if (cache.size >= MEMORY_LIMIT) cache.delete(cache.keys().next().value as string);
      cache.set(id, uri);
      listeners.forEach((l) => l());
    });
}

/** Miniature d'une vidéo (URI file://), chargée à la demande ; null tant qu'elle manque. */
export function useVideoThumbnail(id: string): string | null {
  const uri = useSyncExternalStore(subscribe, () => cache.get(id) ?? null);
  useEffect(() => {
    load(id);
  }, [id]);
  return uri;
}
