import type { NativeVideo } from '../../modules/openplay-media';
import { compareText, normalizeText } from '../library/text';
import type { Video, VideoHistoryEntry, VideoSort } from './types';

export function videoFromNative(n: NativeVideo): Video {
  const filename = n.filename ?? n.title ?? 'Vidéo';
  const title = (n.title && n.title.trim()) || filename.replace(/\.[^.]+$/, '');
  return {
    id: n.id,
    uri: n.uri,
    title,
    filename,
    durationSec: Math.max(0, n.durationMs / 1000),
    sizeBytes: n.size || 0,
    addedAt: (n.dateAdded || 0) * 1000,
    width: n.width || 0,
    height: n.height || 0,
    mimeType: n.mimeType || 'video/mp4',
    folder: n.folder?.trim() || 'Autres',
  };
}

export function sortVideos(videos: Video[], sort: VideoSort): Video[] {
  const list = [...videos];
  switch (sort) {
    case 'name':
      return list.sort((a, b) => compareText(a.title, b.title));
    case 'date':
      return list.sort((a, b) => b.addedAt - a.addedAt);
    case 'duration':
      return list.sort((a, b) => b.durationSec - a.durationSec);
    case 'size':
      return list.sort((a, b) => b.sizeBytes - a.sizeBytes);
  }
}

export function searchVideos(videos: Video[], query: string): Video[] {
  const q = normalizeText(query);
  if (!q) return videos;
  return videos.filter((v) => normalizeText(`${v.title} ${v.filename} ${v.folder}`).includes(q));
}

/** Seuil à partir duquel une vidéo est considérée vue en entier (crédits de fin compris). */
export function isFinished(positionSec: number, durationSec: number): boolean {
  return durationSec > 0 && (positionSec >= durationSec - 15 || positionSec / durationSec >= 0.95);
}

/** Position de reprise : ni dans les 10 premières secondes, ni au-delà de la fin. */
export function resumePosition(entry: VideoHistoryEntry | undefined, durationSec: number): number {
  if (!entry || entry.finished) return 0;
  const end = durationSec || entry.durationSec;
  if (entry.positionSec < 10 || (end > 0 && isFinished(entry.positionSec, end))) return 0;
  return entry.positionSec;
}

/** « Continuer à regarder » : commencées, non terminées, la plus récente d'abord. */
export function continueWatching(videos: Video[], history: Record<string, VideoHistoryEntry>): Video[] {
  return videos.filter((v) => resumePosition(history[v.id], v.durationSec) > 0).sort((a, b) => history[b.id].watchedAt - history[a.id].watchedAt);
}

/** « Récemment regardées » : toute vidéo ouverte, la plus récente d'abord. */
export function recentlyWatched(videos: Video[], history: Record<string, VideoHistoryEntry>): Video[] {
  return videos.filter((v) => history[v.id]).sort((a, b) => history[b.id].watchedAt - history[a.id].watchedAt);
}

export function videoFolders(videos: Video[]): { folder: string; count: number; cover: Video }[] {
  const map = new Map<string, { folder: string; count: number; cover: Video }>();
  for (const v of videos) {
    const f = map.get(v.folder);
    if (f) f.count += 1;
    else map.set(v.folder, { folder: v.folder, count: 1, cover: v });
  }
  return [...map.values()].sort((a, b) => compareText(a.folder, b.folder));
}

export function formatResolution(v: Pick<Video, 'width' | 'height'>): string | null {
  if (!v.width || !v.height) return null;
  const short = Math.min(v.width, v.height);
  const label = short >= 2160 ? '4K' : short >= 1440 ? '1440p' : short >= 1080 ? '1080p' : short >= 720 ? '720p' : short >= 480 ? '480p' : `${short}p`;
  return `${v.width} × ${v.height} (${label})`;
}

/** Démonstration hors Android (aperçu web, tests) : aucune vraie vidéo n'est lue. */
export function demoVideos(): Video[] {
  const base = Date.UTC(2026, 9, 20);
  const items: [string, string, number, number][] = [
    ['Concert au Bénin', 'Movies/Concerts', 3725, 812_000_000],
    ['Cours de guitare — leçon 1', 'Movies/Cours', 1460, 240_000_000],
    ['Cours de guitare — leçon 2', 'Movies/Cours', 1622, 268_000_000],
    ['Clip — Lagune', 'Movies/Clips', 214, 48_000_000],
    ['Clip — Neon Drift', 'Movies/Clips', 198, 41_000_000],
    ['Mariage de Koffi', 'DCIM/Camera', 5420, 1_900_000_000],
    ['Anniversaire', 'DCIM/Camera', 312, 120_000_000],
    ['Documentaire Ganvié', 'Download', 2890, 640_000_000],
  ];
  return items.map(([title, folder, durationSec, sizeBytes], i) => ({
    id: `demo-video-${i + 1}`,
    uri: '',
    title,
    filename: `${title}.mp4`,
    durationSec,
    sizeBytes,
    addedAt: base - i * 86_400_000,
    width: 1920,
    height: 1080,
    mimeType: 'video/mp4',
    folder,
  }));
}
