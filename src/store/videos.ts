import * as MediaLibrary from 'expo-media-library/legacy';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { OpenPlayMedia } from '../../modules/openplay-media';
import { describeError, recordDiagnostic } from '../diagnostics/crashReports';
import { demoVideos, videoFromNative } from '../video/library';
import type { Video } from '../video/types';

export type VideoLibraryStatus = 'idle' | 'needs-permission' | 'denied' | 'loading' | 'ready' | 'error';

type State = {
  status: VideoLibraryStatus;
  videos: Video[];
  byId: Record<string, Video>;
  /** Android 14+ : l'utilisateur n'a autorisé que certaines vidéos. */
  limited: boolean;
  isDemo: boolean;
  /** Vérifie l'autorisation sans la demander, puis indexe si elle est accordée. */
  init: () => Promise<void>;
  requestPermission: () => Promise<void>;
  /** Accès partiel : rouvre le sélecteur système pour modifier les vidéos autorisées. */
  manageLimitedAccess: () => Promise<void>;
  scan: () => Promise<void>;
};

const isDemo = () => !OpenPlayMedia?.queryVideosAsync;

/**
 * Accès « Vidéos » (READ_MEDIA_VIDEO ; accès partiel READ_MEDIA_VISUAL_USER_SELECTED sur Android 14+ ;
 * READ_EXTERNAL_STORAGE avant Android 13). `denied` seulement quand Android ne peut plus le redemander.
 */
export async function videoAccess(request: boolean): Promise<{ status: 'granted' | 'denied' | 'undetermined'; limited: boolean }> {
  if (isDemo() || Platform.OS !== 'android') return { status: 'granted', limited: false };
  const res = request ? await MediaLibrary.requestPermissionsAsync(false, ['video']) : await MediaLibrary.getPermissionsAsync(false, ['video']);
  const status = res.status === 'granted' ? 'granted' : res.status === 'denied' && !res.canAskAgain ? 'denied' : 'undetermined';
  return { status, limited: res.accessPrivileges === 'limited' };
}

const permission = videoAccess;

/**
 * Vidéothèque locale (MediaStore.Video). Au lancement, `init` vérifie l'autorisation sans la demander
 * et indexe si elle est accordée ; la demande passe par l'accueil des autorisations ou par la section Vidéos.
 */
export const useVideos = create<State>()((set, get) => ({
  status: 'idle',
  videos: [],
  byId: {},
  limited: false,
  isDemo: isDemo(),

  init: async () => {
    if (get().status !== 'idle') return;
    try {
      const p = await permission(false);
      if (p.status === 'granted') {
        set({ limited: p.limited });
        await get().scan();
      } else set({ status: 'needs-permission' });
    } catch {
      set({ status: 'needs-permission' });
    }
  },

  requestPermission: async () => {
    try {
      const p = await permission(true);
      if (p.status === 'granted') {
        set({ limited: p.limited });
        await get().scan();
      } else set({ status: p.status === 'denied' ? 'denied' : 'needs-permission' });
    } catch (e) {
      recordDiagnostic('Autorisation vidéo en échec', describeError(e));
      set({ status: 'error' });
    }
  },

  manageLimitedAccess: async () => {
    try {
      await MediaLibrary.presentPermissionsPickerAsync(['video']);
      const p = await permission(false);
      set({ limited: p.limited });
      await get().scan();
    } catch (e) {
      recordDiagnostic('Sélecteur d’accès partiel en échec', describeError(e));
    }
  },

  scan: () => {
    // Une seule indexation à la fois (lancement et accueil des autorisations peuvent se croiser).
    scanning ??= runScan().finally(() => {
      scanning = null;
    });
    return scanning;
  },
}));

let scanning: Promise<void> | null = null;

async function runScan() {
  const set = useVideos.setState;
  set((s) => ({ status: s.status === 'ready' ? 'ready' : 'loading' }));
  try {
    const videos = OpenPlayMedia?.queryVideosAsync ? (await OpenPlayMedia.queryVideosAsync()).map(videoFromNative) : demoVideos();
    const byId: Record<string, Video> = {};
    for (const v of videos) byId[v.id] = v;
    set({ videos, byId, status: 'ready', isDemo: isDemo() });
  } catch (e) {
    recordDiagnostic('Indexation des vidéos en échec', describeError(e));
    set({ status: 'error' });
  }
}
