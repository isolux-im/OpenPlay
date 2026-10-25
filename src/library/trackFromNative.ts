import type { NativeTrack } from '../../modules/openplay-media';
import type { Track } from '../types';
import { parseFilename } from './filename';

export const UNKNOWN_ARTIST = 'Artiste inconnu';
export const UNKNOWN_ALBUM = 'Album inconnu';
export const UNKNOWN_GENRE = 'Genre inconnu';

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  return v === '' || v === '<unknown>' ? null : v;
}

/** Dossier parent sans le préfixe du stockage (« /storage/emulated/0/Music/Jazz/a.mp3 » → « Music/Jazz »). */
export function folderOf(path: string | null): string {
  if (!path) return 'Inconnu';
  const parent = path.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  const relative = parent.replace(/^\/storage\/(emulated\/\d+|[^/]+)\/?/, '').replace(/^\/sdcard\/?/, '');
  return relative || 'Stockage interne';
}

/** MediaStore code le numéro de disque dans les milliers (1003 = disque 1, piste 3). */
export function splitTrackNumber(raw: number): { disc: number; track: number } {
  if (!raw || raw < 0) return { disc: 1, track: 0 };
  return raw >= 1000 ? { disc: Math.floor(raw / 1000), track: raw % 1000 } : { disc: 1, track: raw };
}

export function trackFromNative(n: NativeTrack): Track {
  const fromName = parseFilename(n.filename ?? n.title ?? '');
  const artist = clean(n.artist) ?? fromName.artist ?? UNKNOWN_ARTIST;
  const { disc, track } = splitTrackNumber(n.trackNumber);
  return {
    id: n.id,
    uri: n.uri,
    title: clean(n.title) ?? fromName.title,
    artist,
    albumArtist: clean(n.albumArtist) ?? artist,
    album: clean(n.album) ?? UNKNOWN_ALBUM,
    albumId: n.albumId || `album:${clean(n.album) ?? UNKNOWN_ALBUM}`,
    genre: clean(n.genre) ?? UNKNOWN_GENRE,
    durationSec: Math.max(0, (n.durationMs || 0) / 1000),
    trackNumber: track,
    discNumber: disc,
    year: n.year > 0 ? n.year : null,
    addedAt: (n.dateAdded || 0) * 1000,
    folder: folderOf(n.path),
    path: n.path,
    sizeBytes: n.size || 0,
    mimeType: n.mimeType || 'audio/mpeg',
  };
}
