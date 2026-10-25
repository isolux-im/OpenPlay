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

/** Albums des derniers morceaux écoutés, du plus récent au plus ancien, sans doublon. */
export function recentlyPlayedAlbums(history: HistoryEntry[], index: LibraryIndex, limit = 12): Album[] {
  const out: Album[] = [];
  const seen = new Set<string>();
  for (const h of history) {
    const albumId = index.byId[h.trackId]?.albumId;
    if (!albumId || seen.has(albumId)) continue;
    seen.add(albumId);
    const album = index.albumsById[albumId];
    if (album) out.push(album);
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
    // Un morceau réécouté le même jour n'apparaît qu'une fois, à sa dernière écoute.
    if (g.entries.some((e) => e.trackId === h.trackId)) continue;
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

export type DiscoverCategory = 'never' | 'forgotten' | 'rare';
export type DiscoverItem = { track: Track; category: DiscoverCategory; plays: number; lastAt: number | null };
export type DiscoverSections = Record<DiscoverCategory, DiscoverItem[]>;

/** « Peu écoutés » : une ou deux écoutes validées, la dernière il y a au moins 21 jours. */
export const RARE_MAX_PLAYS = 2;
export const RARE_MIN_DAYS = 21;

/**
 * Rubrique « À découvrir », calculée hors ligne depuis l'historique local d'OpenPlay :
 * jamais écoutés, à réécouter (dernière écoute ≥ `forgottenDays`), peu écoutés.
 * Un morceau compté mais sans date connue (historique antérieur à la v2) n'est classé nulle part :
 * on ne prétend pas connaître son ancienneté. Chaque catégorie est complète ; `uniqueDiscover`
 * fusionne sans doublon pour la vue « Tout ».
 */
export function discoverSections(tracks: Track[], playCounts: Record<string, number>, lastPlayed: Record<string, number>, now: number, forgottenDays: number): DiscoverSections {
  const out: DiscoverSections = { never: [], forgotten: [], rare: [] };
  for (const track of tracks) {
    const plays = playCounts[track.id] ?? 0;
    const lastAt = lastPlayed[track.id] ?? null;
    if (plays === 0 && lastAt === null) {
      out.never.push({ track, category: 'never', plays, lastAt });
      continue;
    }
    if (lastAt === null) continue;
    const age = now - lastAt;
    if (age >= forgottenDays * DAY) out.forgotten.push({ track, category: 'forgotten', plays, lastAt });
    if (plays >= 1 && plays <= RARE_MAX_PLAYS && age >= RARE_MIN_DAYS * DAY) out.rare.push({ track, category: 'rare', plays, lastAt });
  }
  out.never.sort((a, b) => b.track.addedAt - a.track.addedAt);
  out.forgotten.sort((a, b) => (a.lastAt ?? 0) - (b.lastAt ?? 0));
  out.rare.sort((a, b) => a.plays - b.plays || (a.lastAt ?? 0) - (b.lastAt ?? 0));
  return { never: diversify(out.never), forgotten: diversify(out.forgotten), rare: diversify(out.rare) };
}

/** Vue « Tout » : chaque morceau une seule fois, dans la première catégorie qui le contient. */
export function uniqueDiscover(sections: DiscoverSections): DiscoverSections {
  const seen = new Set<string>();
  const keep = (items: DiscoverItem[]) =>
    items.filter((i) => {
      if (seen.has(i.track.id)) return false;
      seen.add(i.track.id);
      return true;
    });
  return { never: keep(sections.never), forgotten: keep(sections.forgotten), rare: keep(sections.rare) };
}

/** Alterne les artistes pour éviter une série du même disque, sans changer l’ordre propre à chaque artiste. */
export function diversify(items: DiscoverItem[]): DiscoverItem[] {
  const groups = new Map<string, DiscoverItem[]>();
  for (const i of items) {
    const key = i.track.albumArtist || i.track.artist;
    const g = groups.get(key);
    if (g) g.push(i);
    else groups.set(key, [i]);
  }
  const queues = [...groups.values()];
  const out: DiscoverItem[] = [];
  for (let round = 0; out.length < items.length; round++) {
    for (const q of queues) if (q[round]) out.push(q[round]);
  }
  return out;
}
