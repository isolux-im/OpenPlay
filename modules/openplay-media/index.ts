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

export type NativeVideo = {
  id: string;
  uri: string;
  title: string | null;
  filename: string | null;
  durationMs: number;
  size: number;
  dateAdded: number;
  dateModified: number;
  width: number;
  height: number;
  mimeType: string | null;
  folder: string | null;
  path: string | null;
  /** Rotation enregistrée dans le fichier (0, 90, 180, 270) ; Android 10+. */
  rotation?: number;
};

export type NativeArtwork = {
  uri: string;
  dominant: string;
  vibrant: string;
  darkMuted: string;
  width: number;
  height: number;
};

export type PickedFile = { uri: string; name: string; size: number; persistent: boolean };

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
  /** Vidéos accessibles (MediaStore.Video). Absent des anciennes versions. */
  queryVideosAsync?(): Promise<NativeVideo[]>;
  shareVideoAsync?(videoId: string, mimeType: string, title: string): Promise<void>;
  /** « Ouvrir avec » : choix d'une autre application pour lire la vidéo. */
  openVideoWithAsync?(videoId: string, mimeType: string, title: string): Promise<void>;
  /** URI file:// d'une miniature en cache, ou null. */
  getVideoThumbnailAsync?(videoId: string, size: number): Promise<string | null>;
  /** Volume média (0 à 1, `volumeSteps` crans) et luminosité de la fenêtre (0 à 1). */
  getVideoControlsStateAsync?(): Promise<{ volume: number; volumeSteps: number; brightness: number }>;
  setMediaVolumeAsync?(fraction: number): Promise<void>;
  /** Luminosité de la fenêtre d'OpenPlay seulement ; valeur négative : retour au réglage système. */
  setWindowBrightnessAsync?(value: number): Promise<void>;
  setScreenOrientationAsync?(mode: 'landscape' | 'portrait' | 'sensor' | 'default'): Promise<void>;
  /** Plein écran immersif : barres système masquées, rappelées d'un glissement depuis le bord. */
  setImmersiveAsync?(enabled: boolean): Promise<void>;
  /** Sélecteur de fichiers Android (sous-titres) ; null si l'utilisateur annule. `persistent` : accès conservé après redémarrage. */
  pickSubtitleAsync?(): Promise<PickedFile | null>;
  /** Texte du fichier (encodage détecté) ; erreur ERR_SUBTITLE_UNREADABLE ou ERR_SUBTITLE_TOO_LARGE. */
  readSubtitleAsync?(uri: string): Promise<string>;
  releaseSubtitleAsync?(uri: string): Promise<void>;
  /** Journal de diagnostic local et fins anormales enregistrées par Android 11+. Absents des anciennes versions. */
  getCrashReportsAsync?(): Promise<{ log: string | null; exits: ExitReason[] }>;
  clearCrashReportsAsync?(): Promise<void>;
  recordDiagnostic?(kind: string, details: string): void;
  /** État du réseau actif et requête de test vers `url` (erreur DNS, TLS, délai…). */
  diagnoseNetworkAsync?(url: string, timeoutMs: number): Promise<NetworkDiagnosis>;
};

/** null hors Android (web, tests) : l'application bascule alors sur une bibliothèque de démonstration. */
export const OpenPlayMedia = requireOptionalNativeModule<OpenPlayMediaModule>('OpenPlayMedia');
