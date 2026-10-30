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
};

/**
 * Accès réseau et stockage : module Android (requêtes vérifiées, fichier MediaStore « en attente » jusqu'à la
 * vérification) ou démonstration (aperçu web, tests), sans aucun accès réseau.
 */
export type DownloadBackend = {
  available: boolean;
  isDemo: boolean;
  probe(url: string): Promise<Probe>;
  exists(kind: 'audio' | 'video', relativePath: string, displayName: string): Promise<boolean>;
  start(req: StartRequest): Promise<void>;
  states(taskIds: string[]): Promise<Record<string, NativeLinkDownload>>;
  cancel(taskId: string): Promise<void>;
};

function asLinkError(e: unknown): LinkError {
  if (e instanceof LinkError) return e;
  const code = (e as { code?: string })?.code;
  return new LinkError(typeof code === 'string' ? code : 'ERR_LINK_NETWORK', e instanceof Error ? e.message : undefined);
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
  async start(r) {
    try {
      await OpenPlayMedia!.startLinkDownloadAsync!(r.taskId, r.url, r.kind, r.relativePath, r.displayName, r.mimeType, r.expect, r.expectedSize);
    } catch (e) {
      throw asLinkError(e);
    }
  },
  states: (ids) => OpenPlayMedia!.getLinkDownloadsAsync!(ids),
  cancel: (id) => OpenPlayMedia!.cancelLinkDownloadAsync!(id),
};

// --- Démonstration (aperçu web, tests) : liens d'exemple, transfert simulé, ajout à la bibliothèque de démo. ---

type DemoTask = NativeLinkDownload & { req: StartRequest; startedAt: number };
const demoTasks = new Map<string, DemoTask>();
const demoFiles = new Set<string>();
/** Durée simulée d'un transfert (ms) ; réglable par les tests. */
export const demoTiming = { durationMs: 2400 };

function demoProbe(url: string): Probe {
  const u = new URL(url);
  const path = u.pathname.toLowerCase();
  const base: Probe = { finalUrl: url, status: 200, contentType: null, size: -1, fileName: decodeURIComponent(u.pathname.split('/').pop() || '') || null, sniff: 'unknown', redirects: 0, durationMs: null, width: null, height: null, title: null, artist: null };
  const status = path.match(/\/(401|403|404|410|429|500)(\/|$)/);
  if (status) return { ...base, status: Number(status[1]), contentType: 'text/html', sniff: 'html' };
  if (path.endsWith('.mp4')) return { ...base, contentType: 'video/mp4', size: 52_400_000, sniff: 'mp4', durationMs: 214_000, width: path.includes('720') ? 1280 : 1920, height: path.includes('720') ? 720 : 1080 };
  if (path.endsWith('.mp3')) return { ...base, contentType: 'audio/mpeg', size: 8_560_000, sniff: 'mp3', durationMs: 214_000, title: null, artist: null };
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
  Object.assign(task, { status: 'done', bytesDone: task.bytesTotal, mediaId: id, mediaUri: `content://demo/${id}` });
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
    demoTasks.set(req.taskId, { status: 'running', bytesDone: 0, bytesTotal: size, bytesPerSec: 0, req, startedAt: Date.now() });
  },
  async states(ids) {
    const out: Record<string, NativeLinkDownload> = {};
    for (const id of ids) {
      const t = demoTasks.get(id);
      if (!t) continue;
      if (t.status === 'running') {
        const progress = Math.min(1, (Date.now() - t.startedAt) / demoTiming.durationMs);
        if (t.req.url.includes('/coupure/') && progress >= 0.5) Object.assign(t, { status: 'failed', error: 'ERR_LINK_NETWORK', bytesDone: Math.round(t.bytesTotal / 2) });
        else if (progress >= 1) demoComplete(t);
        else Object.assign(t, { bytesDone: Math.round(t.bytesTotal * progress), bytesPerSec: Math.round(t.bytesTotal / (demoTiming.durationMs / 1000)) });
      }
      const { req: _req, startedAt: _s, ...state } = t;
      out[id] = state;
    }
    return out;
  },
  async cancel(id) {
    const t = demoTasks.get(id);
    if (t && t.status === 'running') t.status = 'cancelled';
  },
};

/** Remise à zéro de la démonstration (tests). */
export function resetDemoDownloads() {
  demoTasks.clear();
  demoFiles.clear();
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
      return 'Téléchargement interrompu (application fermée). Le fichier partiel a été supprimé.';
    case 'ERR_UNSUPPORTED':
      return 'Téléchargement par lien disponible à partir d’Android 10.';
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
