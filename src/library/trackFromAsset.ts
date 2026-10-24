import type { Track } from '../types';

export type AudioAssetLike = {
  id: string;
  uri: string;
  filename: string;
  duration: number;
  creationTime: number;
};

const EXTENSION = /\.[a-z0-9]{1,5}$/i;
// Exige une ponctuation après le numéro pour ne pas tronquer « 50 Cent » ou « 2Pac ».
const LEADING_TRACK_NUMBER = /^\d{1,3}\s*[-._)]\s*/;
const ARTIST_SEPARATOR = /\s+[-–—]\s+/;

/**
 * expo-media-library n'expose pas les étiquettes ID3 (titre, artiste) :
 * on les déduit du nom de fichier, au format courant « Artiste - Titre.mp3 ».
 */
export function parseFilename(filename: string): { title: string; artist: string | null } {
  const base = filename.replace(EXTENSION, '').replace(LEADING_TRACK_NUMBER, '').replace(/_/g, ' ').trim();
  const parts = base.split(ARTIST_SEPARATOR);
  if (parts.length >= 2) {
    const artist = parts[0].trim();
    const title = parts.slice(1).join(' - ').trim();
    if (artist && title) return { title, artist };
  }
  return { title: base || filename, artist: null };
}

export function trackFromAsset(asset: AudioAssetLike): Track {
  const { title, artist } = parseFilename(asset.filename);
  return {
    id: asset.id,
    uri: asset.uri,
    title,
    artist,
    durationSec: Math.max(0, asset.duration || 0),
    addedAt: asset.creationTime || 0,
  };
}

export function sortTracks(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) =>
    a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }),
  );
}

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
