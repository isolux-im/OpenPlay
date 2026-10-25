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

export type ExitReason = { timestamp: number; reason: 'crash' | 'crash-native' | 'anr' | 'low-memory' | 'init-failure'; description: string | null; trace: string | null };

export type NetworkDiagnosis = {
  network: { connected: boolean | null; validated: boolean | null; transport: string };
  probe: { ok: boolean; status: number | null; error: 'dns' | 'tls' | 'timeout' | 'unreachable' | 'io' | 'other' | null; message: string | null; ms: number };
};

type OpenPlayMediaModule = {
  queryTracksAsync(minDurationMs: number): Promise<NativeTrack[]>;
  getArtworkAsync(trackId: string, albumId: string, size: number): Promise<NativeArtwork | null>;
  readLyricsAsync(path: string): Promise<string | null>;
  /** Ouvre la feuille de partage Android avec le fichier audio (URI MediaStore). Absent des anciennes versions. */
  shareAudioAsync?(trackId: string, mimeType: string, title: string): Promise<void>;
  /** Journal de diagnostic local et fins anormales enregistrées par Android 11+. Absents des anciennes versions. */
  getCrashReportsAsync?(): Promise<{ log: string | null; exits: ExitReason[] }>;
  clearCrashReportsAsync?(): Promise<void>;
  recordDiagnostic?(kind: string, details: string): void;
  /** État du réseau actif et requête de test vers `url` (erreur DNS, TLS, délai…). */
  diagnoseNetworkAsync?(url: string, timeoutMs: number): Promise<NetworkDiagnosis>;
};

/** null hors Android (web, tests) : l'application bascule alors sur une bibliothèque de démonstration. */
export const OpenPlayMedia = requireOptionalNativeModule<OpenPlayMediaModule>('OpenPlayMedia');
