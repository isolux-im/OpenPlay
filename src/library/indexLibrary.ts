import type { Album, Artist, Folder, Genre, LibraryIndex, Track } from '../types';
import { compareText } from './text';
import { UNKNOWN_ARTIST } from './trackFromNative';

function group<T>(items: Track[], keyOf: (t: Track) => string, create: (t: Track, key: string) => T, add: (g: T, t: Track) => void) {
  const map = new Map<string, T>();
  for (const t of items) {
    const key = keyOf(t);
    let g = map.get(key);
    if (!g) {
      g = create(t, key);
      map.set(key, g);
    }
    add(g, t);
  }
  return map;
}

function byTrackOrder(a: Track, b: Track) {
  return a.discNumber - b.discNumber || a.trackNumber - b.trackNumber || compareText(a.title, b.title);
}

function toRecord<T extends { id: string }>(list: T[]): Record<string, T> {
  const r: Record<string, T> = {};
  for (const x of list) r[x.id] = x;
  return r;
}

export function buildIndex(input: Track[]): LibraryIndex {
  const tracks = [...input].sort((a, b) => compareText(a.title, b.title));
  const byId: Record<string, Track> = {};
  for (const t of tracks) byId[t.id] = t;

  const albumMap = group<Album>(
    tracks,
    (t) => t.albumId,
    (t, key) => ({ id: key, title: t.album, artist: t.albumArtist, year: t.year, trackIds: [], durationSec: 0, addedAt: 0 }),
    (a, t) => {
      a.trackIds.push(t.id);
      a.durationSec += t.durationSec;
      a.addedAt = Math.max(a.addedAt, t.addedAt);
      if (!a.year && t.year) a.year = t.year;
    },
  );
  const albums = [...albumMap.values()];
  for (const a of albums) a.trackIds.sort((x, y) => byTrackOrder(byId[x], byId[y]));
  albums.sort((a, b) => compareText(a.title, b.title));

  const artistMap = group<Artist>(
    tracks,
    (t) => t.albumArtist.toLowerCase(),
    (t, key) => ({ id: key, name: t.albumArtist, albumIds: [], trackIds: [] }),
    (ar, t) => {
      ar.trackIds.push(t.id);
      if (!ar.albumIds.includes(t.albumId)) ar.albumIds.push(t.albumId);
    },
  );
  const artists = [...artistMap.values()].sort((a, b) => {
    if (a.name === UNKNOWN_ARTIST) return 1;
    if (b.name === UNKNOWN_ARTIST) return -1;
    return compareText(a.name, b.name);
  });

  const genres = [
    ...group<Genre>(
      tracks,
      (t) => t.genre.toLowerCase(),
      (t, key) => ({ id: key, name: t.genre, trackIds: [] }),
      (g, t) => g.trackIds.push(t.id),
    ).values(),
  ].sort((a, b) => compareText(a.name, b.name));

  const folders = [
    ...group<Folder>(
      tracks,
      (t) => t.folder,
      (t, key) => ({ id: key, path: key, name: key.split('/').pop() || key, trackIds: [] }),
      (f, t) => f.trackIds.push(t.id),
    ).values(),
  ].sort((a, b) => compareText(a.name, b.name));

  return {
    tracks,
    byId,
    albums,
    albumsById: toRecord(albums),
    artists,
    artistsById: toRecord(artists),
    genres,
    genresById: toRecord(genres),
    folders,
    foldersById: toRecord(folders),
  };
}

export const EMPTY_INDEX: LibraryIndex = buildIndex([]);
