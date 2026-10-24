export type Track = {
  id: string;
  uri: string;
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  albumId: string;
  genre: string;
  durationSec: number;
  trackNumber: number;
  discNumber: number;
  year: number | null;
  addedAt: number;
  folder: string;
  path: string | null;
};

export type Album = {
  id: string;
  title: string;
  artist: string;
  year: number | null;
  trackIds: string[];
  durationSec: number;
  addedAt: number;
};

export type Artist = {
  id: string;
  name: string;
  albumIds: string[];
  trackIds: string[];
};

export type Genre = {
  id: string;
  name: string;
  trackIds: string[];
};

export type Folder = {
  id: string;
  name: string;
  path: string;
  trackIds: string[];
};

export type Playlist = {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type RepeatMode = 'off' | 'all' | 'one';

export type LibraryIndex = {
  tracks: Track[];
  byId: Record<string, Track>;
  albums: Album[];
  albumsById: Record<string, Album>;
  artists: Artist[];
  artistsById: Record<string, Artist>;
  genres: Genre[];
  genresById: Record<string, Genre>;
  folders: Folder[];
  foldersById: Record<string, Folder>;
};
