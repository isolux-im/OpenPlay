// L'API « next » d'expo-media-library impose un appel asynchrone par fichier pour obtenir
// son URI ; l'API legacy renvoie l'URI directement, page par page.
import * as MediaLibrary from 'expo-media-library/legacy';

import type { Track } from '../types';
import { sortTracks, trackFromAsset } from './trackFromAsset';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

const PAGE_SIZE = 500;

function toState(status: string): PermissionState {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

export async function getAudioPermission(): Promise<PermissionState> {
  const res = await MediaLibrary.getPermissionsAsync(false, ['audio']);
  return toState(res.status);
}

export async function requestAudioPermission(): Promise<PermissionState> {
  const res = await MediaLibrary.requestPermissionsAsync(false, ['audio']);
  return toState(res.status);
}

export async function loadAudioTracks(): Promise<Track[]> {
  const tracks: Track[] = [];
  let after: string | undefined;
  for (;;) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.audio,
      first: PAGE_SIZE,
      after,
    });
    for (const asset of page.assets) tracks.push(trackFromAsset(asset));
    if (!page.hasNextPage || page.assets.length === 0) break;
    after = page.endCursor;
  }
  return sortTracks(tracks);
}
