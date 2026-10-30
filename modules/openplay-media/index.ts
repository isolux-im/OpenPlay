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

/** Analyse d'un lien (quelques octets lus, redirections vérifiées) : voir `src/download/options.ts` (`Probe`). */
export type NativeProbe = {
  finalUrl: string;
  status: number;
  contentType: string | null;
  size: number;
  fileName: string | null;
  sniff: 'mp3' | 'mp4' | 'm4a' | 'mov' | 'webm' | 'ogg' | 'flac' | 'wav' | 'aac' | 'html' | 'unknown';
  redirects: number;
  /** Le serveur accepte les requêtes partielles (pause et reprise possibles). */
  resumable?: boolean;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  title: string | null;
  artist: string | null;
};

/** État d'un téléchargement par lien côté Android. */
export type NativeLinkDownload = {
  status: 'running' | 'paused' | 'done' | 'failed' | 'cancelled';
  bytesDone: number;
  /** -1 si inconnue. */
  bytesTotal: number;
  bytesPerSec: number;
  mediaId?: string;
  mediaUri?: string;
  /** Code ERR_LINK_… en cas d'échec ; `httpStatus` pour ERR_LINK_HTTP. */
  error?: string;
  httpStatus?: number;
  /** Fichier partiel conservé (pause, coupure) et version du fichier côté serveur, pour la reprise. */
  partUri?: string | null;
  etag?: string | null;
  lastModified?: string | null;
  resumable?: boolean;
  /** Reprise refusée par le serveur (fichier modifié) : le transfert est reparti de zéro. */
  restarted?: boolean;
};

export type LinkDownloadOptions = {
  url: string;
  kind: 'audio' | 'video';
  relativePath: string;
  displayName: string;
  mimeType: string;
  expect: string;
  expectedSize: number;
  /** Reprise d'un fichier partiel (requête partielle HTTP, contrôlée par ETag ou date de modification). */
  partUri?: string | null;
  etag?: string | null;
  lastModified?: string | null;
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
  /**
   * Générique commun aux `maxSeconds` premières secondes de deux vidéos (empreinte sonore, en cache sous
   * `cacheA` / `cacheB`) : positions en secondes dans chacune, ou null.
   */
  findCommonIntroAsync?(idA: string, cacheA: string, idB: string, cacheB: string, maxSeconds: number): Promise<{ startA: number; endA: number; startB: number; endB: number; density: number } | null>;
  /** État thermique Android 10+ : 0 normal … 2 modéré, 3 sévère … 6 arrêt ; -1 inconnu. */
  getThermalStatus?(): number;
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
  /**
   * Fichiers (Android 11+ pour renommer et déplacer : Android demande l'autorisation une fois par opération).
   * `false` : refusé par l'utilisateur. `displayName` garde l'extension ; `relativePath` : « Movies/Séries ».
   */
  renameMediaAsync?(kind: 'audio' | 'video', id: string, displayName: string): Promise<boolean>;
  /** Nombre de fichiers déplacés, ou `false` si l'autorisation est refusée. */
  moveMediaAsync?(kind: 'audio' | 'video', ids: string[], relativePath: string): Promise<number | false>;
  /** Android 10+ : copies créées dans `relativePath` (« (1) » ajouté si le nom existe déjà). Nombre de copies. */
  copyMediaAsync?(kind: 'audio' | 'video', ids: string[], relativePath: string): Promise<number>;
  /** Android 11+ : crée un dossier vide (« Movies/Séries ») ; true s'il existe ensuite. */
  createFolderAsync?(relativePath: string): Promise<boolean>;
  /** Android 11+ : supprime le dossier s'il est vide ; false s'il contient encore des fichiers. */
  deleteEmptyFolderAsync?(relativePath: string): Promise<boolean>;
  /**
   * Télécharger par lien (Android 7+). Analyse : https seulement, hôtes internes refusés après résolution DNS et à
   * chaque redirection (5 au plus). Erreurs : ERR_LINK_UNSAFE, ERR_LINK_SCHEME, ERR_LINK_REDIRECTS, ERR_LINK_DNS,
   * ERR_LINK_TLS, ERR_LINK_TIMEOUT, ERR_LINK_NETWORK. Le statut HTTP est renvoyé tel quel (pas d'erreur).
   */
  probeLinkAsync?(url: string): Promise<NativeProbe>;
  /** Un fichier de ce nom existe déjà dans ce dossier (« Movies/OpenPlay »). */
  mediaFileExistsAsync?(kind: 'audio' | 'video', relativePath: string, displayName: string): Promise<boolean>;
  /**
   * Démarre le transfert en arrière-plan vers une entrée MediaStore « en attente » (invisible des autres applications
   * et de la bibliothèque). À la fin : taille et type réel vérifiés, puis publication ; sinon l'entrée est supprimée.
   */
  startLinkDownloadAsync?(taskId: string, options: LinkDownloadOptions): Promise<void>;
  getLinkDownloadsAsync?(taskIds: string[]): Promise<Record<string, NativeLinkDownload>>;
  /** Pause : fichier partiel conservé (état « paused »). */
  pauseLinkDownloadAsync?(taskId: string): Promise<void>;
  /** Annule (et supprime le fichier partiel, en cours ou laissé par une pause). */
  cancelLinkDownloadAsync?(taskId: string, partUri: string | null): Promise<void>;
  discardLinkPartAsync?(partUri: string): Promise<void>;
  /** Texte du presse-papiers, lu seulement quand l'utilisateur touche « Coller ». */
  getClipboardTextAsync?(): Promise<string | null>;
  /** Texte reçu par « Partager vers OpenPlay » au lancement (consommé : renvoyé une seule fois). */
  getSharedTextAsync?(): Promise<string | null>;
  addListener?(event: 'onSharedText', listener: (e: { text: string }) => void): { remove(): void };
  /** Journal de diagnostic local et fins anormales enregistrées par Android 11+. Absents des anciennes versions. */
  getCrashReportsAsync?(): Promise<{ log: string | null; exits: ExitReason[] }>;
  clearCrashReportsAsync?(): Promise<void>;
  recordDiagnostic?(kind: string, details: string): void;
  /** État du réseau actif et requête de test vers `url` (erreur DNS, TLS, délai…). */
  diagnoseNetworkAsync?(url: string, timeoutMs: number): Promise<NetworkDiagnosis>;
};

/** null hors Android (web, tests) : l'application bascule alors sur une bibliothèque de démonstration. */
export const OpenPlayMedia = requireOptionalNativeModule<OpenPlayMediaModule>('OpenPlayMedia');
