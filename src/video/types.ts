export type Video = {
  id: string;
  uri: string;
  title: string;
  filename: string;
  durationSec: number;
  sizeBytes: number;
  /** Date d'ajout (ms). */
  addedAt: number;
  width: number;
  height: number;
  mimeType: string;
  /** Dossier relatif (« Movies/Cours »), ou « Autres ». */
  folder: string;
};

export type VideoSort = 'name' | 'date' | 'duration' | 'size';

/** Suivi local d'une vidéo regardée (jamais transmis à LRCLIB, Groq ni à un serveur). */
export type VideoHistoryEntry = { positionSec: number; durationSec: number; watchedAt: number; finished: boolean };
