import { useVideos } from '../store/videos';
import { buildSeries, seriesByVideo, type Series } from './series';
import type { Video } from './types';

// Calcul partagé : recalculé seulement quand la liste des vidéos change.
let cachedFor: Video[] | null = null;
let cached: { list: Series[]; byVideo: Record<string, Series>; byKey: Record<string, Series> } = { list: [], byVideo: {}, byKey: {} };

export function seriesIndex(videos: Video[]) {
  if (videos !== cachedFor) {
    const list = buildSeries(videos);
    cached = { list, byVideo: seriesByVideo(list), byKey: Object.fromEntries(list.map((s) => [s.key, s])) };
    cachedFor = videos;
  }
  return cached;
}

/** Séries reconnues dans la vidéothèque. */
export function useSeriesIndex() {
  const videos = useVideos((s) => s.videos);
  return seriesIndex(videos);
}
