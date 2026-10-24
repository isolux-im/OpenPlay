import type { SongSort } from '../store/settings';
import type { HistoryEntry } from '../store/user';
import type { Album, LibraryIndex, Track } from '../types';
import { compareText } from './text';

const DAY = 86_400_000;

/** Morceaux distincts, du plus récemment écouté au plus ancien. */
export function recentlyPlayed(history: HistoryEntry[], byId: Record<string, Track>, limit = 20): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const h of history) {
    if (seen.has(h.trackId)) continue;
    seen.add(h.trackId);
    const t = byId[h.trackId];
    if (t) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

export function recentlyAddedAlbums(index: LibraryIndex, limit = 20): Album[] {
  return [...index.albums].sort((a, b) => b.addedAt - a.addedAt).slice(0, limit);
}

export function recentlyAddedTracks(index: LibraryIndex, limit = 50): Track[] {
  return [...index.tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, limit);
}

export function mostPlayed(playCounts: Record<string, number>, byId: Record<string, Track>, limit = 50): Track[] {
  return Object.entries(playCounts)
    .filter(([id, n]) => n > 0 && byId[id])
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => byId[id]);
}

/** Morceaux jamais écoutés ou pas depuis `days` jours. */
export function rediscover(index: LibraryIndex, history: HistoryEntry[], now: number, days = 30, limit = 50): Track[] {
  const last = new Map<string, number>();
  for (const h of history) if (!last.has(h.trackId)) last.set(h.trackId, h.at);
  const cutoff = now - days * DAY;
  return index.tracks.filter((t) => (last.get(t.id) ?? 0) < cutoff).slice(0, limit);
}

/** Genre le plus écouté (à défaut, le plus représenté dans la bibliothèque). */
export function favoriteGenre(index: LibraryIndex, playCounts: Record<string, number>): string | null {
  const score = new Map<string, number>();
  for (const t of index.tracks) score.set(t.genre, (score.get(t.genre) ?? 0) + 1 + (playCounts[t.id] ?? 0) * 3);
  let best: string | null = null;
  let bestScore = 0;
  for (const [g, s] of score) {
    if (s > bestScore && !g.toLowerCase().includes('inconnu')) {
      best = g;
      bestScore = s;
    }
  }
  return best;
}

export function sortTracks(tracks: Track[], sort: SongSort): Track[] {
  const list = [...tracks];
  switch (sort) {
    case 'artist':
      return list.sort((a, b) => compareText(a.artist, b.artist) || compareText(a.album, b.album) || a.trackNumber - b.trackNumber);
    case 'album':
      return list.sort((a, b) => compareText(a.album, b.album) || a.discNumber - b.discNumber || a.trackNumber - b.trackNumber);
    case 'added':
      return list.sort((a, b) => b.addedAt - a.addedAt);
    default:
      return list.sort((a, b) => compareText(a.title, b.title));
  }
}

export type HistoryGroup = { label: string; entries: (HistoryEntry & { track: Track })[] };

function dayLabel(at: number, now: number): string {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const diff = Math.floor((startOfToday.getTime() - new Date(at).setHours(0, 0, 0, 0)) / DAY);
  if (diff <= 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  if (diff < 7) return 'Cette semaine';
  return new Date(at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function groupHistory(history: HistoryEntry[], byId: Record<string, Track>, now: number): HistoryGroup[] {
  const groups: HistoryGroup[] = [];
  for (const h of history) {
    const track = byId[h.trackId];
    if (!track) continue;
    const label = dayLabel(h.at, now);
    let g = groups[groups.length - 1];
    if (!g || g.label !== label) {
      g = { label, entries: [] };
      groups.push(g);
    }
    g.entries.push({ ...h, track });
  }
  return groups;
}

export function greeting(now: number): string {
  const h = new Date(now).getHours();
  if (h < 5) return 'Bonne nuit';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}
