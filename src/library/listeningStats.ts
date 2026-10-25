import { dayKey, type DayStats } from '../store/stats';
import type { Track } from '../types';
import { UNKNOWN_ALBUM, UNKNOWN_ARTIST, UNKNOWN_GENRE } from './trackFromNative';

export type StatsPeriod = 'week' | 'month' | 'year';

export type Ranked<T> = { item: T; plays: number };

export type ListeningSummary = {
  totalSec: number;
  plays: number;
  activeDays: number;
  distinctTracks: number;
  topTracks: Ranked<Track>[];
  topArtists: Ranked<string>[];
  topAlbums: Ranked<{ title: string; artist: string; track: Track }>[];
  topGenres: Ranked<string>[];
  /** Temps d'écoute par heure de la journée (24 cases, secondes). */
  hours: number[];
  /** Heure la plus écoutée, ou null sans données. */
  peakHour: number | null;
};

const DAY = 86_400_000;

/** Premier jour (clé AAAA-MM-JJ) de la période, aujourd'hui compris. */
export function periodStart(period: StatsPeriod, now: number): string {
  if (period === 'year') return `${new Date(now).getFullYear()}-01-01`;
  return dayKey(now - (period === 'week' ? 6 : 29) * DAY);
}

function rank<T>(counts: Map<string, { item: T; plays: number }>, limit: number): Ranked<T>[] {
  return [...counts.values()].sort((a, b) => b.plays - a.plays).slice(0, limit);
}

/**
 * Bilan d'une période à partir des journées enregistrées. Les morceaux qui ne sont plus dans la
 * bibliothèque comptent dans le temps et le nombre d'écoutes, pas dans les classements.
 */
export function summarize(days: Record<string, DayStats>, byId: Record<string, Track>, period: StatsPeriod, now: number, limit = 5): ListeningSummary {
  const from = periodStart(period, now);
  const to = dayKey(now);
  const hours = Array.from({ length: 24 }, () => 0);
  const perTrack = new Map<string, number>();
  let totalSec = 0;
  let plays = 0;
  let activeDays = 0;

  for (const [key, day] of Object.entries(days)) {
    if (key < from || key > to) continue;
    totalSec += day.sec;
    plays += day.plays;
    if (day.sec > 0 || day.plays > 0) activeDays += 1;
    day.hours.forEach((sec, h) => {
      hours[h] += sec;
    });
    for (const [id, n] of Object.entries(day.tracks)) perTrack.set(id, (perTrack.get(id) ?? 0) + n);
  }

  const tracks = new Map<string, { item: Track; plays: number }>();
  const artists = new Map<string, { item: string; plays: number }>();
  const albums = new Map<string, { item: { title: string; artist: string; track: Track }; plays: number }>();
  const genres = new Map<string, { item: string; plays: number }>();
  const add = <T,>(map: Map<string, { item: T; plays: number }>, key: string, item: T, n: number) => {
    const e = map.get(key);
    if (e) e.plays += n;
    else map.set(key, { item, plays: n });
  };
  for (const [id, n] of perTrack) {
    const t = byId[id];
    if (!t) continue;
    add(tracks, id, t, n);
    const artist = t.albumArtist || t.artist;
    if (artist !== UNKNOWN_ARTIST) add(artists, artist.toLowerCase(), artist, n);
    if (t.album !== UNKNOWN_ALBUM) add(albums, t.albumId, { title: t.album, artist, track: t }, n);
    if (t.genre !== UNKNOWN_GENRE) add(genres, t.genre.toLowerCase(), t.genre, n);
  }

  const max = Math.max(...hours);
  return {
    totalSec,
    plays,
    activeDays,
    distinctTracks: perTrack.size,
    topTracks: rank(tracks, limit),
    topArtists: rank(artists, limit),
    topAlbums: rank(albums, limit),
    topGenres: rank(genres, limit),
    hours,
    peakHour: max > 0 ? hours.indexOf(max) : null,
  };
}

/** « 12 h 05 », « 47 min », « moins d'une minute ». */
export function formatListening(sec: number): string {
  const min = Math.floor(sec / 60);
  if (min < 1) return sec > 0 ? "moins d'une minute" : '0 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
