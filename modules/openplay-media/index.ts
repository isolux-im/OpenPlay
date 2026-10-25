import { requireOptionalNativeModule } from 'expo';

export type NativeTrack = {
  id: string;
  uri: string;
  title: string | null;
  artist: string | null;
  albumArtist: string | null;
  album: string | null;
  albumId: string;
  genre: string | null;
  durationMs: number;
  trackNumber: number;
  year: number;
  dateAdded: number;
  filename: string | null;
  mimeType: string | null;
  size: number;
  path: string | null;
};

export type NativeArtwork = {
  uri: string;
  dominant: string;
  vibrant: string;
  darkMuted: string;
  width: number;
  height: number;
};

type OpenPlayMediaModule = {
  queryTracksAsync(minDurationMs: number): Promise<NativeTrack[]>;
  getArtworkAsync(trackId: string, albumId: string, size: number): Promise<NativeArtwork | null>;
  readLyricsAsync(path: string): Promise<string | null>;
  /** Ouvre la feuille de partage Android avec le fichier audio (URI MediaStore). Absent des anciennes versions. */
  shareAudioAsync?(trackId: string, mimeType: string, title: string): Promise<void>;
};

/** null hors Android (web, tests) : l'application bascule alors sur une bibliothèque de démonstration. */
export const OpenPlayMedia = requireOptionalNativeModule<OpenPlayMediaModule>('OpenPlayMedia');
