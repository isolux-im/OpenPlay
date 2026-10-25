import type { Track } from '../types';
import { normalizeText } from './text';

/** Champs qu'un utilisateur peut corriger. Les fichiers ne sont jamais modifiés. */
export type TrackEdit = Partial<Pick<Track, 'title' | 'artist' | 'album' | 'genre'>>;

export const EDIT_MAX_LENGTH = 200;

/**
 * Applique les corrections locales. Une correction d'artiste vaut aussi pour l'artiste de l'album
 * (cas courant des fichiers mal étiquetés) ; une correction d'album regroupe le morceau avec les
 * autres morceaux du même album corrigé, au lieu de son album d'origine.
 */
export function applyEdit(track: Track, edit: TrackEdit | undefined): Track {
  if (!edit) return track;
  const artist = edit.artist ?? track.artist;
  const albumArtist = edit.artist ?? track.albumArtist;
  const album = edit.album ?? track.album;
  return {
    ...track,
    title: edit.title ?? track.title,
    artist,
    albumArtist,
    album,
    genre: edit.genre ?? track.genre,
    albumId: edit.album !== undefined || edit.artist !== undefined ? `edit:${normalizeText(album)}|${normalizeText(albumArtist)}` : track.albumId,
  };
}

export function applyEdits(tracks: Track[], edits: Record<string, TrackEdit>): Track[] {
  return Object.keys(edits).length ? tracks.map((t) => applyEdit(t, edits[t.id])) : tracks;
}

/**
 * Correction à enregistrer : seuls les champs réellement différents de l'original, nettoyés.
 * Un champ vide garde la valeur d'origine. Renvoie null s'il ne reste rien à corriger.
 */
export function diffEdit(original: Track, values: Required<TrackEdit>): TrackEdit | null {
  const out: TrackEdit = {};
  for (const key of ['title', 'artist', 'album', 'genre'] as const) {
    const v = values[key].replace(/\s+/g, ' ').trim().slice(0, EDIT_MAX_LENGTH);
    if (v && v !== original[key]) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}
