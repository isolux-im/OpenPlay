import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { downloadBackend, errorMessage, LinkError } from '../download/backend';
import type { Method, Sniffed, TargetFormat } from '../download/options';
import { useLibrary } from './library';
import { persistStorage } from './storage';
import { useSettings } from './settings';
import { newId } from './user';
import { useVideos } from './videos';

export type DownloadStatus = 'pending' | 'running' | 'converting' | 'done' | 'cancelled' | 'failed';

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
  /** Tentative native en cours (un nouvel identifiant à chaque « Réessayer »). */
  taskId: string;
};

export type NewDownload = Pick<DownloadRecord, 'sourceUrl' | 'displayTitle' | 'targetFormat' | 'qualityValue' | 'qualityLabel' | 'method' | 'fileName' | 'relativePath' | 'mimeType' | 'expect' | 'bytesTotal'>;

/** Téléchargements simultanés au plus ; les suivants attendent leur tour. */
export const MAX_PARALLEL = 2;
const POLL_MS = 700;

type State = {
  items: DownloadRecord[];
  enqueue: (d: NewDownload) => DownloadRecord | null;
  cancel: (id: string) => Promise<void>;
  retry: (id: string) => void;
  /** Retire l'entrée de l'historique (le fichier téléchargé reste sur le téléphone). */
  removeEntry: (id: string) => void;
  clearFinished: () => void;
  /** Après relance de l'application : reprend la file, constate les transferts interrompus. */
  reconcile: () => Promise<void>;
};

const active = (s: DownloadStatus) => s === 'pending' || s === 'running' || s === 'converting';

function patch(id: string, p: Partial<DownloadRecord>) {
  useDownloads.setState((s) => ({ items: s.items.map((x) => (x.id === id ? { ...x, ...p, updatedAt: Date.now() } : x)) }));
}

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
  const backend = downloadBackend();
  if (backend.isDemo) return; // la démonstration ajoute elle-même le fichier
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
      if (st.status === 'running') {
        patch(item.id, { bytesDone: st.bytesDone, bytesTotal: st.bytesTotal > 0 ? st.bytesTotal : item.bytesTotal, bytesPerSec: st.bytesPerSec });
      } else if (st.status === 'done') {
        patch(item.id, { status: 'done', bytesDone: st.bytesDone, bytesTotal: st.bytesDone, bytesPerSec: 0, mediaId: st.mediaId ?? null, outputUri: st.mediaUri ?? null, finishedAt: Date.now(), errorCode: null, errorMessage: null });
        void refreshLibrary(item);
      } else if (st.status === 'failed') {
        patch(item.id, { status: 'failed', bytesPerSec: 0, errorCode: st.error ?? 'ERR_LINK_NETWORK', errorMessage: errorMessage(st.error, st.httpStatus), finishedAt: Date.now() });
      } else if (st.status === 'cancelled') {
        patch(item.id, { status: 'cancelled', bytesPerSec: 0, finishedAt: Date.now() });
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
      .start({ taskId: item.taskId, url: item.sourceUrl, kind, relativePath: item.relativePath, displayName: item.fileName, mimeType: item.mimeType, expect: item.expect, expectedSize: item.bytesTotal })
      .then(ensurePolling)
      .catch((e: unknown) => {
        const code = e instanceof LinkError ? e.code : 'ERR_LINK_STORAGE';
        patch(item.id, { status: 'failed', errorCode: code, errorMessage: errorMessage(code), finishedAt: Date.now() });
        pump();
      });
  }
}

export const useDownloads = create<State>()(
  persist(
    (set, get) => ({
      items: [],

      enqueue: (d) => {
        // Pas de doublon : même lien et même format déjà en cours.
        if (get().items.some((x) => active(x.status) && x.sourceUrl === d.sourceUrl && x.targetFormat === d.targetFormat)) return null;
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
        };
        set((s) => ({ items: [record, ...s.items] }));
        pump();
        return record;
      },

      cancel: async (id) => {
        const item = get().items.find((x) => x.id === id);
        if (!item || !active(item.status)) return;
        if (item.status === 'running') await downloadBackend().cancel(item.taskId);
        patch(id, { status: 'cancelled', bytesPerSec: 0, finishedAt: Date.now() });
        pump();
      },

      retry: (id) => {
        const item = get().items.find((x) => x.id === id);
        if (!item || active(item.status) || item.status === 'done') return;
        patch(id, { status: 'pending', taskId: newId('task'), bytesDone: 0, bytesPerSec: 0, errorCode: null, errorMessage: null, finishedAt: null });
        pump();
      },

      removeEntry: (id) => {
        const item = get().items.find((x) => x.id === id);
        if (!item || active(item.status)) return;
        set((s) => ({ items: s.items.filter((x) => x.id !== id) }));
      },

      clearFinished: () => set((s) => ({ items: s.items.filter((x) => active(x.status)) })),

      reconcile: async () => {
        const running = get().items.filter((x) => x.status === 'running' || x.status === 'converting');
        if (running.length) {
          let states: Awaited<ReturnType<ReturnType<typeof downloadBackend>['states']>> = {};
          try {
            states = await downloadBackend().states(running.map((x) => x.taskId));
          } catch {
            states = {};
          }
          // Transfert inconnu du module Android : l'application a été fermée entre-temps ; le fichier partiel,
          // jamais publié, a été supprimé par Android (entrée « en attente »).
          for (const item of running) {
            if (!states[item.taskId]) patch(item.id, { status: 'failed', bytesPerSec: 0, errorCode: 'ERR_LINK_INTERRUPTED', errorMessage: errorMessage('ERR_LINK_INTERRUPTED'), finishedAt: Date.now() });
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
