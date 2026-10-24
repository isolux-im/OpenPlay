import type { Album, Artist, LibraryIndex, Playlist, Track } from '../types';
import { normalizeText } from './text';

export type SearchResults = {
  top: { kind: 'track'; item: Track } | { kind: 'album'; item: Album } | { kind: 'artist'; item: Artist } | null;
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
};

export const EMPTY_RESULTS: SearchResults = { top: null, tracks: [], albums: [], artists: [], playlists: [] };

/** Score : 3 = égalité, 2 = commence par, 1 = un mot commence par, 0.5 = contient, 0 = absent. */
export function matchScore(haystack: string, terms: string[], full: string): number {
  const h = normalizeText(haystack);
  if (!h) return 0;
  if (!terms.every((t) => h.includes(t))) return 0;
  if (h === full) return 3;
  if (h.startsWith(full)) return 2;
  if (h.split(' ').some((w) => w.startsWith(terms[0]))) return 1;
  return 0.5;
}

function rank<T>(items: T[], fields: (x: T) => string[], terms: string[], full: string, limit: number) {
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    let best = 0;
    for (const f of fields(item)) best = Math.max(best, matchScore(f, terms, full));
    if (best > 0) scored.push({ item, score: best });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function searchLibrary(index: LibraryIndex, playlists: Playlist[], query: string, limit = 50): SearchResults {
  const full = normalizeText(query);
  if (!full) return EMPTY_RESULTS;
  const terms = full.split(' ');

  const tracks = rank(index.tracks, (t) => [t.title, `${t.title} ${t.artist}`, `${t.artist} ${t.title}`, t.album], terms, full, limit);
  const albums = rank(index.albums, (a) => [a.title, `${a.title} ${a.artist}`, a.artist], terms, full, limit);
  const artists = rank(index.artists, (a) => [a.name], terms, full, limit);
  const lists = rank(playlists, (p) => [p.name], terms, full, limit);

  const candidates = [
    artists[0] && { kind: 'artist' as const, item: artists[0].item, score: artists[0].score + 0.2 },
    albums[0] && { kind: 'album' as const, item: albums[0].item, score: albums[0].score + 0.1 },
    tracks[0] && { kind: 'track' as const, item: tracks[0].item, score: tracks[0].score },
  ].filter(Boolean) as ({ score: number } & NonNullable<SearchResults['top']>)[];
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  return {
    top: best ? ({ kind: best.kind, item: best.item } as SearchResults['top']) : null,
    tracks: tracks.map((x) => x.item),
    albums: albums.map((x) => x.item),
    artists: artists.map((x) => x.item),
    playlists: lists.map((x) => x.item),
  };
}
