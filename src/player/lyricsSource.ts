import { File } from 'expo-file-system';
import { useEffect, useSyncExternalStore } from 'react';

import { OpenPlayMedia } from '../../modules/openplay-media';
import { useOnlineLyrics, type OnlineEntry } from '../store/onlineLyrics';
import { useSettings } from '../store/settings';
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

export type LyricsSource = 'imported' | 'file' | 'lrclib';

export type LyricsState = {
  lyrics: Lyrics | null;
  /** Origine des paroles affichées. */
  source: LyricsSource | null;
  loading: boolean;
  /** État de la recherche LRCLIB quand aucune parole locale n'existe. */
  online: OnlineEntry | null;
};

/**
 * Paroles du morceau, par ordre de priorité : paroles enregistrées (fichier importé ou transcription),
 * fichier .lrc voisin (si Android l'autorise), puis LRCLIB — interrogé seulement quand rien n'existe localement.
 */
export function useLyrics(track: Track | null): LyricsState {
  const imported = useUser((s) => (track ? s.lyrics[track.id] : undefined));
  const onlineEnabled = useSettings((s) => s.onlineLyrics);
  const path = track?.path ?? null;
  const sibling = useSyncExternalStore(subscribe, () => (path ? siblingCache.get(path) : null));
  const needsLookup = !imported && !!path && !!OpenPlayMedia;
  const localPending = needsLookup && sibling === undefined;
  const wantsOnline = !!track && onlineEnabled && !imported && !localPending && !sibling;
  const online = useOnlineLyrics((s) => (track && wantsOnline ? (s.entries[track.id] ?? null) : null));
  const trackId = track?.id;

  useEffect(() => {
    if (needsLookup && path) lookupSibling(path);
  }, [needsLookup, path]);

  useEffect(() => {
    if (!wantsOnline || !track) return;
    useOnlineLyrics.getState().request(track);
    // Morceau quitté : la réponse éventuelle ne sert plus.
    return () => useOnlineLyrics.getState().cancel(track.id);
  }, [wantsOnline, trackId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetched = online?.status === 'done' && (online.result.kind === 'synced' || online.result.kind === 'plain') ? online.result.text : null;
  const raw = imported ?? sibling ?? fetched ?? null;
  const source: LyricsSource | null = imported ? 'imported' : sibling ? 'file' : fetched ? 'lrclib' : null;
  return {
    lyrics: raw ? parseLyrics(raw) : null,
    source,
    loading: localPending || online?.status === 'loading' || (wantsOnline && !online),
    online,
  };
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
