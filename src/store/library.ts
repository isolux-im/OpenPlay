import * as MediaLibrary from 'expo-media-library/legacy';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { OpenPlayMedia } from '../../modules/openplay-media';
import { demoTracks } from '../library/demoLibrary';
import { EMPTY_INDEX, buildIndex } from '../library/indexLibrary';
import { trackFromNative } from '../library/trackFromNative';
import type { LibraryIndex } from '../types';

export type LibraryStatus = 'checking' | 'needs-permission' | 'denied' | 'loading' | 'ready' | 'error';

type LibraryState = {
  status: LibraryStatus;
  index: LibraryIndex;
  error: string | null;
  scannedAt: number | null;
  isDemo: boolean;
  init: (minDurationSec: number) => Promise<void>;
  requestPermission: (minDurationSec: number) => Promise<void>;
  scan: (minDurationSec: number) => Promise<void>;
  /** Retire des morceaux de l'index (après suppression du fichier), sans nouvelle analyse. */
  removeTracks: (ids: string[]) => void;
};

/** Sans module natif (web, tests), la bibliothèque de démonstration remplace MediaStore. */
const isDemoMode = () => !OpenPlayMedia;

async function permissionStatus(request: boolean): Promise<'granted' | 'denied' | 'undetermined'> {
  if (isDemoMode() || Platform.OS !== 'android') return 'granted';
  const res = request
    ? await MediaLibrary.requestPermissionsAsync(false, ['audio'])
    : await MediaLibrary.getPermissionsAsync(false, ['audio']);
  return res.status === 'granted' ? 'granted' : res.status === 'denied' ? 'denied' : 'undetermined';
}

export const useLibrary = create<LibraryState>()((set, get) => ({
  status: 'checking',
  index: EMPTY_INDEX,
  error: null,
  scannedAt: null,
  isDemo: isDemoMode(),

  init: async (minDurationSec) => {
    try {
      const p = await permissionStatus(false);
      if (p === 'granted') await get().scan(minDurationSec);
      else set({ status: 'needs-permission' });
    } catch {
      set({ status: 'needs-permission' });
    }
  },

  requestPermission: async (minDurationSec) => {
    const p = await permissionStatus(true);
    if (p === 'granted') await get().scan(minDurationSec);
    else set({ status: p === 'denied' ? 'denied' : 'needs-permission' });
  },

  scan: async (minDurationSec) => {
    set((s) => ({ status: s.status === 'ready' ? 'ready' : 'loading', error: null }));
    try {
      const tracks = OpenPlayMedia
        ? (await OpenPlayMedia.queryTracksAsync(minDurationSec * 1000)).map(trackFromNative)
        : demoTracks().filter((t) => t.durationSec >= minDurationSec);
      set({ index: buildIndex(tracks), status: 'ready', scannedAt: Date.now(), isDemo: isDemoMode() });
    } catch {
      set({ status: 'error', error: 'Impossible de lire la bibliothèque musicale.' });
    }
  },

  removeTracks: (ids) => {
    const gone = new Set(ids);
    set((s) => ({ index: buildIndex(s.index.tracks.filter((t) => !gone.has(t.id))) }));
  },
}));
