export type Track = {
  id: string;
  uri: string;
  title: string;
  /** null lorsque l'artiste ne peut pas être déduit du nom de fichier. */
  artist: string | null;
  durationSec: number;
  addedAt: number;
};
