import { PermissionsAndroid, Platform } from 'react-native';

import { OpenPlayMedia, type NativeLinkDownload, type NativeTrack, type NativeVideo } from '../../modules/openplay-media';
import { trackFromNative } from '../library/trackFromNative';
import { useLibrary } from '../store/library';
import { useVideos } from '../store/videos';
import { videoFromNative } from '../video/library';
import type { Probe, Sniffed } from './options';

/** Erreur d'analyse ou de transfert, avec un code typé (traduit en message par `errorMessage`). */
export class LinkError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type StartRequest = {
  taskId: string;
  url: string;
  kind: 'audio' | 'video';
  relativePath: string;
  displayName: string;
  mimeType: string;
  /** Type réel attendu : le fichier reçu est vérifié avant d'apparaître dans la bibliothèque. */
  expect: Sniffed;
  /** Taille annoncée lors de l'analyse (-1 : inconnue) ; un fichier plus court est un fichier incomplet. */
  expectedSize: number;
  /** Reprise : fichier partiel et version du fichier côté serveur (ETag, date de modification). */
  partUri?: string | null;
  etag?: string | null;
  lastModified?: string | null;
};

/**
 * Accès réseau et stockage : module Android (requêtes vérifiées, fichier partiel invisible jusqu'à la
 * vérification, service de premier plan) ou démonstration (aperçu web, tests), sans aucun accès réseau.
 */
export type DownloadBackend = {
  available: boolean;
  isDemo: boolean;
  probe(url: string): Promise<Probe>;
  exists(kind: 'audio' | 'video', relativePath: string, displayName: string): Promise<boolean>;
  start(req: StartRequest): Promise<void>;
  states(taskIds: string[]): Promise<Record<string, NativeLinkDownload>>;
  pause(taskId: string): Promise<void>;
  /** Annule le transfert et supprime le fichier partiel (en cours, ou laissé par une pause ou une coupure). */
  cancel(taskId: string, partUri: string | null): Promise<void>;
  discard(partUri: string): Promise<void>;
};

function asLinkError(e: unknown): LinkError {
  if (e instanceof LinkError) return e;
  const code = (e as { code?: string })?.code;
  return new LinkError(typeof code === 'string' ? code : 'ERR_LINK_NETWORK', e instanceof Error ? e.message : undefined);
}

/** Android 9 et avant : écrire dans Music/ ou Movies/ demande l'autorisation « Stockage » (une fois). */
async function ensureLegacyWrite() {
  if (Platform.OS !== 'android' || Number(Platform.Version) >= 29) return;
  const permission = PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;
  if (await PermissionsAndroid.check(permission)) return;
  const result = await PermissionsAndroid.request(permission, {
    title: 'Enregistrer les téléchargements',
    message: 'OpenPlay enregistre les fichiers téléchargés dans Musique et Films de votre téléphone.',
    buttonPositive: 'Autoriser',
    buttonNegative: 'Refuser',
  });
  if (result !== PermissionsAndroid.RESULTS.GRANTED) throw new LinkError('ERR_LINK_PERMISSION');
}

const nativeBackend: DownloadBackend = {
  available: !!OpenPlayMedia?.probeLinkAsync,
  isDemo: false,
  async probe(url) {
    try {
      return await OpenPlayMedia!.probeLinkAsync!(url);
    } catch (e) {
      throw asLinkError(e);
    }
  },
  exists: (kind, relativePath, displayName) => OpenPlayMedia!.mediaFileExistsAsync!(kind, relativePath, displayName),
  async start({ taskId, ...options }) {
    await ensureLegacyWrite();
    try {
      await OpenPlayMedia!.startLinkDownloadAsync!(taskId, options);
    } catch (e) {
      throw asLinkError(e);
    }
  },
  states: (ids) => OpenPlayMedia!.getLinkDownloadsAsync!(ids),
  pause: (id) => OpenPlayMedia!.pauseLinkDownloadAsync!(id),
  cancel: (id, partUri) => OpenPlayMedia!.cancelLinkDownloadAsync!(id, partUri),
  discard: (partUri) => OpenPlayMedia!.discardLinkPartAsync!(partUri),
};

// --- Démonstration (aperçu web, tests) : liens d'exemple, transfert simulé, ajout à la bibliothèque de démo. ---
// Chemins d'exemple : /coupure/ (coupure réseau à mi-parcours, une fois), /sans-reprise/ (serveur sans requêtes
// partielles), /no-space/ (espace insuffisant), /403/, /404/, /429/… (réponses HTTP).

type DemoTask = NativeLinkDownload & { req: StartRequest; startedAt: number; offset: number };
const demoTasks = new Map<string, DemoTask>();
const demoFiles = new Set<string>();
/** Fichiers partiels simulés : octets déjà reçus. */
const demoParts = new Map<string, number>();
const demoCut = new Set<string>();
let demoPartCounter = 0;
/** Durée simulée d'un transfert complet (ms) ; réglable par les tests. */
export const demoTiming = { durationMs: 2400 };

function demoProbe(url: string): Probe {
  const u = new URL(url);
  const path = u.pathname.toLowerCase();
  const base: Probe = { finalUrl: url, status: 200, contentType: null, size: -1, fileName: decodeURIComponent(u.pathname.split('/').pop() || '') || null, sniff: 'unknown', redirects: 0, resumable: !path.includes('/sans-reprise/'), durationMs: null, width: null, height: null, title: null, artist: null };
  const status = path.match(/\/(401|403|404|410|429|500)(\/|$)/);
  if (status) return { ...base, status: Number(status[1]), contentType: 'text/html', sniff: 'html' };
  if (path.endsWith('.mp4')) return { ...base, contentType: 'video/mp4', size: 52_400_000, sniff: 'mp4', durationMs: 214_000, width: path.includes('720') ? 1280 : 1920, height: path.includes('720') ? 720 : 1080 };
  if (path.endsWith('.mp3')) return { ...base, contentType: 'audio/mpeg', size: 8_560_000, sniff: 'mp3', durationMs: 214_000 };
  if (path.endsWith('.m4a')) return { ...base, contentType: 'audio/mp4', size: 6_100_000, sniff: 'm4a', durationMs: 214_000 };
  if (path.endsWith('.webm')) return { ...base, contentType: 'video/webm', size: 30_000_000, sniff: 'webm' };
  // Type annoncé trompeur : l'en-tête dit MP4, le contenu est une page web.
  if (path.endsWith('.fake')) return { ...base, contentType: 'video/mp4', size: 4_000, sniff: 'html' };
  return { ...base, contentType: 'text/html; charset=utf-8', sniff: 'html', fileName: null };
}

function demoComplete(task: DemoTask) {
  const { req } = task;
  const id = `demo-dl-${req.taskId}`;
  const now = Date.now();
  const name = req.displayName;
  const title = name.replace(/\.[a-z0-9]+$/i, '');
  if (req.kind === 'video') {
    const native: NativeVideo = { id, uri: '', title, filename: name, durationMs: 214_000, size: task.bytesTotal, dateAdded: now, dateModified: now, width: 1920, height: 1080, mimeType: 'video/mp4', folder: req.relativePath, path: null };
    useVideos.getState().applyFileChanges([], [videoFromNative(native)]);
  } else {
    const native: NativeTrack = { id, uri: '', title, artist: null, albumArtist: null, album: null, albumId: '0', genre: null, durationMs: 214_000, trackNumber: 0, year: 0, dateAdded: now / 1000, filename: name, mimeType: 'audio/mpeg', size: task.bytesTotal, path: `/storage/emulated/0/${req.relativePath}/${name}` };
    useLibrary.getState().applyFileChanges([], [trackFromNative(native)]);
  }
  demoFiles.add(`${req.relativePath}/${name}`.toLowerCase());
  if (task.partUri) demoParts.delete(task.partUri);
  Object.assign(task, { status: 'done', bytesDone: task.bytesTotal, bytesPerSec: 0, mediaId: id, mediaUri: `content://demo/${id}`, partUri: null });
}

/** Avancement simulé ; une pause ou une coupure fige les octets reçus dans le fichier partiel. */
function demoAdvance(t: DemoTask) {
  // Durée de 1 ms ou moins : transfert instantané (tests), sans dépendre de l'horloge.
  const elapsed = demoTiming.durationMs <= 1 ? 1 : Math.min(1, (Date.now() - t.startedAt) / demoTiming.durationMs);
  const done = Math.round(t.offset + (t.bytesTotal - t.offset) * elapsed);
  if (t.req.url.includes('/coupure/') && !demoCut.has(t.req.url) && done >= t.bytesTotal / 2) {
    demoCut.add(t.req.url);
    const half = Math.round(t.bytesTotal / 2);
    if (t.resumable) demoParts.set(t.partUri!, half);
    Object.assign(t, { status: 'failed', error: 'ERR_LINK_NETWORK', bytesDone: half, bytesPerSec: 0, partUri: t.resumable ? t.partUri : null });
  } else if (elapsed >= 1) demoComplete(t);
  else Object.assign(t, { bytesDone: done, bytesPerSec: Math.round(t.bytesTotal / (demoTiming.durationMs / 1000)) });
}

const demoBackend: DownloadBackend = {
  available: true,
  isDemo: true,
  async probe(url) {
    return demoProbe(url);
  },
  async exists(_kind, relativePath, displayName) {
    return demoFiles.has(`${relativePath}/${displayName}`.toLowerCase());
  },
  async start(req) {
    if (req.url.includes('/no-space/')) throw new LinkError('ERR_LINK_SPACE');
    const size = req.expectedSize > 0 ? req.expectedSize : 10_000_000;
    const resumable = !req.url.includes('/sans-reprise/');
    const kept = req.partUri ? demoParts.get(req.partUri) : undefined;
    const restarted = kept !== undefined && !resumable;
    const offset = kept !== undefined && resumable ? kept : 0;
    const partUri = kept !== undefined ? req.partUri! : `demo-part-${++demoPartCounter}`;
    demoParts.set(partUri, offset);
    demoTasks.set(req.taskId, { status: 'running', bytesDone: offset, bytesTotal: size, bytesPerSec: 0, req, startedAt: Date.now(), offset, partUri, resumable, restarted, etag: '"demo-v1"', lastModified: null });
  },
  async states(ids) {
    const out: Record<string, NativeLinkDownload> = {};
    for (const id of ids) {
      const t = demoTasks.get(id);
      if (!t) continue;
      if (t.status === 'running') demoAdvance(t);
      const { req: _req, startedAt: _s, offset: _o, ...state } = t;
      out[id] = state;
    }
    return out;
  },
  async pause(id) {
    const t = demoTasks.get(id);
    if (!t || t.status !== 'running') return;
    demoAdvance(t);
    if (t.status !== 'running') return;
    demoParts.set(t.partUri!, t.bytesDone);
    Object.assign(t, { status: 'paused', bytesPerSec: 0 });
  },
  async cancel(id, partUri) {
    const t = demoTasks.get(id);
    if (t) t.status = 'cancelled';
    const part = t?.partUri ?? partUri;
    if (part) demoParts.delete(part);
  },
  async discard(partUri) {
    demoParts.delete(partUri);
  },
};

/** Remise à zéro de la démonstration (tests) ; `keepParts` simule un redémarrage de l'application. */
export function resetDemoDownloads(keepParts = false) {
  demoTasks.clear();
  if (keepParts) return;
  demoFiles.clear();
  demoParts.clear();
  demoCut.clear();
}

/** Tests : le fichier partiel simulé existe-t-il encore ? */
export function demoPartExists(partUri: string): boolean {
  return demoParts.has(partUri);
}

export function downloadBackend(): DownloadBackend {
  return OpenPlayMedia ? nativeBackend : demoBackend;
}

/** Message affiché pour un code d'erreur (analyse ou transfert). */
export function errorMessage(code: string | undefined, httpStatus?: number | null): string {
  switch (code) {
    case 'ERR_LINK_UNSAFE':
      return 'Lien refusé : il mène (directement ou par redirection) vers une adresse locale ou interne.';
    case 'ERR_LINK_SCHEME':
      return 'Lien refusé : une redirection quitte le protocole sécurisé https.';
    case 'ERR_LINK_REDIRECTS':
      return 'Trop de redirections : le lien a été abandonné.';
    case 'ERR_LINK_DNS':
      return 'Serveur introuvable : vérifiez le lien et la connexion.';
    case 'ERR_LINK_TLS':
      return 'Connexion sécurisée impossible (certificat refusé).';
    case 'ERR_LINK_TIMEOUT':
      return 'Le serveur ne répond pas (délai dépassé).';
    case 'ERR_LINK_NETWORK':
      return 'Connexion interrompue : réessayez quand le réseau est stable.';
    case 'ERR_LINK_SPACE':
      return 'Espace de stockage insuffisant sur le téléphone.';
    case 'ERR_LINK_TOO_LARGE':
      return 'Fichier trop volumineux (plus de 8 Go).';
    case 'ERR_LINK_INCOMPLETE':
      return 'Fichier incomplet : le transfert s’est arrêté avant la fin. Rien n’a été ajouté à la bibliothèque.';
    case 'ERR_LINK_TYPE':
      return 'Le fichier reçu n’est pas du type annoncé : il a été supprimé.';
    case 'ERR_LINK_STORAGE':
      return 'Enregistrement impossible dans le stockage du téléphone.';
    case 'ERR_LINK_INTERRUPTED':
      return 'Téléchargement interrompu (téléphone redémarré ou application arrêtée) et ce serveur ne permet pas la reprise : « Réessayer » recommence depuis le début.';
    case 'ERR_LINK_RESUME':
      return 'Reprise refusée par le serveur : « Réessayer » recommence depuis le début.';
    case 'ERR_LINK_PERMISSION':
      return 'Autorisation « Stockage » refusée : impossible d’enregistrer le fichier (Android 9 et avant).';
    case 'ERR_LINK_HTTP':
      return httpMessage(httpStatus ?? 0);
    default:
      return 'Téléchargement impossible.';
  }
}

export function httpMessage(status: number): string {
  if (status === 401 || status === 403) return 'Téléchargement impossible : autorisation de la plateforme ou du serveur requise.';
  if (status === 404 || status === 410) return 'Fichier introuvable sur le serveur (lien expiré ou supprimé).';
  if (status === 429) return 'Le serveur limite les téléchargements : réessayez plus tard.';
  if (status >= 500) return `Le serveur rencontre une erreur (${status}) : réessayez plus tard.`;
  return `Réponse inattendue du serveur (${status}).`;
}
