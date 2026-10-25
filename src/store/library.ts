import * as MediaLibrary from 'expo-media-library/legacy';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { OpenPlayMedia } from '../../modules/openplay-media';
import { demoTracks } from '../library/demoLibrary';
import { EMPTY_INDEX, buildIndex } from '../library/indexLibrary';
import { trackFromNative } from '../library/trackFromNative';
import { withoutExcluded } from '../library/exclusions';
import type { LibraryIndex, Track } from '../types';
import { useSettings } from './settings';

export type LibraryStatus = 'checking' | 'needs-permission' | 'denied' | 'loading' | 'ready' | 'error';

type LibraryState = {
  status: LibraryStatus;
  index: LibraryIndex;
  /** Morceaux trouvés par l'analyse, dossiers exclus compris (l'index, lui, les masque). */
  allTracks: Track[];
  error: string | null;
  scannedAt: number | null;
  isDemo: boolean;
  init: (minDurationSec: number) => Promise<void>;
  requestPermission: (minDurationSec: number) => Promise<void>;
  scan: (minDurationSec: number) => Promise<void>;
  /** Retire des morceaux de l'index (après suppression du fichier), sans nouvelle analyse. */
  removeTracks: (ids: string[]) => void;
  /** Reconstruit l'index après un changement des dossiers exclus, sans nouvelle analyse. */
  applyExclusions: () => void;
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
  allTracks: [],
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
      set({ allTracks: tracks, index: buildIndex(withoutExcluded(tracks, useSettings.getState().excludedFolders)), status: 'ready', scannedAt: Date.now(), isDemo: isDemoMode() });
    } catch {
      set({ status: 'error', error: 'Impossible de lire la bibliothèque musicale.' });
    }
  },

  removeTracks: (ids) => {
    const gone = new Set(ids);
    set((s) => ({ allTracks: s.allTracks.filter((t) => !gone.has(t.id)), index: buildIndex(s.index.tracks.filter((t) => !gone.has(t.id))) }));
  },

  applyExclusions: () => {
    set((s) => ({ index: buildIndex(withoutExcluded(s.allTracks, useSettings.getState().excludedFolders)) }));
  },
}));
