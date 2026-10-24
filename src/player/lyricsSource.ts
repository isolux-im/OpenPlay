import { File } from 'expo-file-system';
import { useEffect, useSyncExternalStore } from 'react';

import { OpenPlayMedia } from '../../modules/openplay-media';
import { useUser } from '../store/user';
import type { Track } from '../types';
import { parseLyrics, type Lyrics } from './lrc';

/** Fichiers .lrc voisins déjà cherchés : texte trouvé, ou null si absent / illisible. */
const siblingCache = new Map<string, string | null>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function lookupSibling(path: string) {
  if (siblingCache.has(path) || !OpenPlayMedia) return;
  OpenPlayMedia.readLyricsAsync(path)
    .catch(() => null)
    .then((text) => {
      siblingCache.set(path, text);
      listeners.forEach((l) => l());
    });
}

/** Paroles du morceau : fichier importé par l'utilisateur, sinon fichier .lrc voisin (si Android l'autorise). */
export function useLyrics(track: Track | null): { lyrics: Lyrics | null; loading: boolean } {
  const imported = useUser((s) => (track ? s.lyrics[track.id] : undefined));
  const path = track?.path ?? null;
  const sibling = useSyncExternalStore(subscribe, () => (path ? siblingCache.get(path) : null));
  const needsLookup = !imported && !!path && !!OpenPlayMedia;

  useEffect(() => {
    if (needsLookup && path) lookupSibling(path);
  }, [needsLookup, path]);

  const raw = imported ?? sibling ?? null;
  return { lyrics: raw ? parseLyrics(raw) : null, loading: needsLookup && sibling === undefined };
}

/** Importe un fichier .lrc ou .txt choisi par l'utilisateur et l'associe au morceau. */
export async function importLyricsFile(trackId: string): Promise<boolean> {
  const picked = await File.pickFileAsync({ mimeTypes: ['text/*', 'application/octet-stream', '*/*'] });
  if (picked.canceled) return false;
  const text = await picked.result.text();
  if (!text.trim()) return false;
  useUser.getState().setLyrics(trackId, text);
  return true;
}
