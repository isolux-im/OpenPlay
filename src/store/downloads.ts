import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { downloadBackend, errorMessage, LinkError } from '../download/backend';
import type { Method, Sniffed, TargetFormat } from '../download/options';
import { useLibrary } from './library';
import { persistStorage } from './storage';
import { useSettings } from './settings';
import { newId } from './user';
import { useVideos } from './videos';

export type DownloadStatus = 'pending' | 'running' | 'paused' | 'converting' | 'done' | 'cancelled' | 'failed';

/** Enregistrement d'un téléchargement (cahier des charges § 10). */
export type DownloadRecord = {
  id: string;
  sourceUrl: string;
  sourceType: 'direct';
  displayTitle: string;
  targetFormat: TargetFormat;
  /** « original » ou « 1080p »… */
  qualityValue: string;
  qualityLabel: string;
  method: Method;
  status: DownloadStatus;
  bytesTotal: number;
  bytesDone: number;
  bytesPerSec: number;
  /** Nom du fichier et dossier de destination (« Movies/OpenPlay »). */
  fileName: string;
  relativePath: string;
  mimeType: string;
  expect: Sniffed;
  outputUri: string | null;
  /** Identifiant MediaStore du fichier publié (lecture, suppression). */
  mediaId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  /** Tentative native en cours (un nouvel identifiant à chaque démarrage ou reprise). */
  taskId: string;
  /** Fichier partiel conservé (pause, coupure, application fermée) et version du fichier côté serveur. */
  partUri: string | null;
  etag: string | null;
  lastModified: string | null;
  /** Le serveur accepte les requêtes partielles : pause et reprise possibles. */
  resumable: boolean;
  /** La dernière reprise a été refusée (fichier modifié sur le serveur) : reparti de zéro. */
  restarted: boolean;
};

export type NewDownload = Pick<DownloadRecord, 'sourceUrl' | 'displayTitle' | 'targetFormat' | 'qualityValue' | 'qualityLabel' | 'method' | 'fileName' | 'relativePath' | 'mimeType' | 'expect' | 'bytesTotal'> & { resumable?: boolean };

/** Téléchargements simultanés au plus ; les suivants attendent leur tour. */
export const MAX_PARALLEL = 2;
const POLL_MS = 700;

type State = {
  items: DownloadRecord[];
  enqueue: (d: NewDownload) => DownloadRecord | null;
  pause: (id: string) => Promise<void>;
  /** Reprend un téléchargement en pause (depuis le fichier partiel si le serveur l'accepte). */
  resume: (id: string) => void;
  cancel: (id: string) => Promise<void>;
  /** Échec ou annulation : relance, en reprenant le fichier partiel quand il a été conservé. */
  retry: (id: string) => void;
  /** Retire l'entrée de l'historique (le fichier téléchargé reste sur le téléphone). */
  removeEntry: (id: string) => void;
  clearFinished: () => void;
  /** Au lancement : reprend la file et les transferts interrompus par l'arrêt de l'application. */
  reconcile: () => Promise<void>;
};

const active = (s: DownloadStatus) => s === 'pending' || s === 'running' || s === 'converting';

function patch(id: string, p: Partial<DownloadRecord>) {
  useDownloads.setState((s) => ({ items: s.items.map((x) => (x.id === id ? { ...x, ...p, updatedAt: Date.now() } : x)) }));
}

const find = (id: string) => useDownloads.getState().items.find((x) => x.id === id);

let timer: ReturnType<typeof setInterval> | null = null;
let polling = false;

function ensurePolling() {
  if (timer) return;
  timer = setInterval(() => void poll(), POLL_MS);
}

function stopPollingIfIdle() {
  if (timer && !useDownloads.getState().items.some((x) => x.status === 'running')) {
    clearInterval(timer);
    timer = null;
  }
}

/** Fin vérifiée côté Android : le fichier est publié, on rafraîchit la bibliothèque concernée (sans redémarrage). */
async function refreshLibrary(item: DownloadRecord) {
  if (downloadBackend().isDemo) return; // la démonstration ajoute elle-même le fichier
  if (item.targetFormat === 'mp4') await useVideos.getState().scan();
  else await useLibrary.getState().scan(useSettings.getState().minDurationSec);
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const running = useDownloads.getState().items.filter((x) => x.status === 'running');
    if (!running.length) return;
    const states = await downloadBackend().states(running.map((x) => x.taskId));
    for (const item of running) {
      const st = states[item.taskId];
      if (!st) continue;
      const common: Partial<DownloadRecord> = {
        bytesDone: st.bytesDone,
        bytesTotal: st.bytesTotal > 0 ? st.bytesTotal : item.bytesTotal,
        bytesPerSec: st.status === 'running' ? st.bytesPerSec : 0,
        partUri: st.partUri ?? null,
        etag: st.etag ?? item.etag,
        lastModified: st.lastModified ?? item.lastModified,
        resumable: st.resumable ?? item.resumable,
        restarted: st.restarted ?? false,
      };
      if (st.status === 'running') {
        patch(item.id, common);
      } else if (st.status === 'paused') {
        patch(item.id, { ...common, status: 'paused' });
      } else if (st.status === 'done') {
        patch(item.id, { ...common, status: 'done', bytesTotal: st.bytesDone, partUri: null, mediaId: st.mediaId ?? null, outputUri: st.mediaUri ?? null, finishedAt: Date.now(), errorCode: null, errorMessage: null });
        void refreshLibrary(item);
      } else if (st.status === 'failed') {
        patch(item.id, { ...common, status: 'failed', errorCode: st.error ?? 'ERR_LINK_NETWORK', errorMessage: errorMessage(st.error, st.httpStatus), finishedAt: Date.now() });
      } else if (st.status === 'cancelled') {
        patch(item.id, { ...common, status: 'cancelled', partUri: null, finishedAt: Date.now() });
      }
    }
  } finally {
    polling = false;
    pump();
    stopPollingIfIdle();
  }
}

/** Démarre les téléchargements en attente, dans la limite des transferts simultanés. */
function pump() {
  const { items } = useDownloads.getState();
  let slots = MAX_PARALLEL - items.filter((x) => x.status === 'running').length;
  for (const item of [...items].reverse()) {
    if (slots <= 0) break;
    if (item.status !== 'pending') continue;
    slots -= 1;
    patch(item.id, { status: 'running' });
    const kind = item.targetFormat === 'mp4' ? 'video' : 'audio';
    downloadBackend()
      .start({
        taskId: item.taskId,
        url: item.sourceUrl,
        kind,
        relativePath: item.relativePath,
        displayName: item.fileName,
        mimeType: item.mimeType,
        expect: item.expect,
        expectedSize: item.bytesTotal,
        partUri: item.partUri,
        etag: item.etag,
        lastModified: item.lastModified,
      })
      .then(ensurePolling)
      .catch((e: unknown) => {
        const code = e instanceof LinkError ? e.code : 'ERR_LINK_STORAGE';
        patch(item.id, { status: 'failed', errorCode: code, errorMessage: errorMessage(code), finishedAt: Date.now() });
        pump();
      });
  }
}

/** Remet un téléchargement dans la file (nouvelle tentative native, fichier partiel conservé s'il existe). */
function requeue(id: string) {
  patch(id, { status: 'pending', taskId: newId('task'), bytesPerSec: 0, errorCode: null, errorMessage: null, finishedAt: null });
  pump();
}

export const useDownloads = create<State>()(
  persist(
    (set, get) => ({
      items: [],

      enqueue: (d) => {
        // Pas de doublon : même lien et même format déjà en cours ou en pause.
        if (get().items.some((x) => (active(x.status) || x.status === 'paused') && x.sourceUrl === d.sourceUrl && x.targetFormat === d.targetFormat)) return null;
        const now = Date.now();
        const record: DownloadRecord = {
          ...d,
          id: newId('dl'),
          taskId: newId('task'),
          sourceType: 'direct',
          status: 'pending',
          bytesDone: 0,
          bytesPerSec: 0,
          outputUri: null,
          mediaId: null,
          errorCode: null,
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          finishedAt: null,
          partUri: null,
          etag: null,
          lastModified: null,
          resumable: d.resumable ?? false,
          restarted: false,
        };
        set((s) => ({ items: [record, ...s.items] }));
        pump();
        return record;
      },

      pause: async (id) => {
        const item = find(id);
        if (!item) return;
        if (item.status === 'pending') {
          patch(id, { status: 'paused' });
          return;
        }
        if (item.status !== 'running' || !item.resumable) return;
        await downloadBackend().pause(item.taskId);
        await poll();
      },

      resume: (id) => {
        if (find(id)?.status === 'paused') requeue(id);
      },

      cancel: async (id) => {
        const item = find(id);
        if (!item || !(active(item.status) || item.status === 'paused' || (item.status === 'failed' && item.partUri))) return;
        await downloadBackend().cancel(item.taskId, item.partUri);
        patch(id, { status: 'cancelled', bytesPerSec: 0, partUri: null, finishedAt: Date.now() });
        pump();
      },

      retry: (id) => {
        const item = find(id);
        if (!item || (item.status !== 'failed' && item.status !== 'cancelled')) return;
        if (!item.partUri) patch(id, { bytesDone: 0 });
        requeue(id);
      },

      removeEntry: (id) => {
        const item = find(id);
        if (!item || active(item.status)) return;
        // Fichier partiel d'une entrée retirée (pause, coupure) : supprimé, il ne servira plus.
        if (item.partUri) void downloadBackend().discard(item.partUri);
        set((s) => ({ items: s.items.filter((x) => x.id !== id) }));
      },

      clearFinished: () => {
        for (const item of get().items) if (!active(item.status) && item.status !== 'paused' && item.partUri) void downloadBackend().discard(item.partUri);
        set((s) => ({ items: s.items.filter((x) => active(x.status) || x.status === 'paused') }));
      },

      reconcile: async () => {
        const running = get().items.filter((x) => x.status === 'running' || x.status === 'converting');
        if (running.length) {
          let states: Awaited<ReturnType<ReturnType<typeof downloadBackend>['states']>> = {};
          try {
            states = await downloadBackend().states(running.map((x) => x.taskId));
          } catch {
            states = {};
          }
          for (const item of running) {
            if (states[item.taskId]) continue;
            // Transfert inconnu du module Android : le processus a été arrêté entre-temps (redémarrage, arrêt forcé).
            // Reprise automatique depuis le fichier partiel si le serveur l'accepte ; sinon, échec explicite.
            if (item.resumable && item.partUri) {
              requeue(item.id);
            } else {
              if (item.partUri) void downloadBackend().discard(item.partUri);
              patch(item.id, { status: 'failed', bytesPerSec: 0, partUri: null, errorCode: 'ERR_LINK_INTERRUPTED', errorMessage: errorMessage('ERR_LINK_INTERRUPTED'), finishedAt: Date.now() });
            }
          }
          if (Object.keys(states).length) ensurePolling();
        }
        pump();
      },
    }),
    {
      name: 'openplay.downloads.v1',
      storage: persistStorage,
      version: 1,
      partialize: ({ items }) => ({ items: items.slice(0, 200) }),
    },
  ),
);

/** Tests : arrêt du suivi périodique. */
export function stopDownloadPolling() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Tests : un tour de suivi immédiat. */
export const pollDownloadsNow = poll;
