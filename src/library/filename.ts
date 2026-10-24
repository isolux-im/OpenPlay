const EXTENSION = /\.[a-z0-9]{1,5}$/i;
// Exige une ponctuation après le numéro pour ne pas tronquer « 50 Cent » ou « 2Pac ».
const LEADING_TRACK_NUMBER = /^\d{1,3}\s*[-._)]\s*/;
const ARTIST_SEPARATOR = /\s+[-–—]\s+/;

/**
 * Titre et artiste déduits du nom de fichier (« Artiste - Titre.mp3 ») : solution de repli
 * quand le fichier n'a pas d'étiquettes.
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
