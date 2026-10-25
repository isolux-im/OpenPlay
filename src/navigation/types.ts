import type { NavigatorScreenParams } from '@react-navigation/native';

export type SmartPlaylistKind = 'favorites' | 'mostPlayed' | 'recentlyAdded' | 'rediscover';

/** Écrans communs à toutes les piles d'onglets : la barre d'onglets reste visible. */
export type SharedStackParams = {
  Album: { id: string };
  Artist: { id: string };
  Genre: { id: string };
  Folder: { id: string };
  Playlist: { id: string };
  SmartPlaylist: { kind: SmartPlaylistKind };
  Songs: undefined;
  Artists: undefined;
  Albums: undefined;
  Genres: undefined;
  Folders: undefined;
  Favorites: undefined;
  History: undefined;
  AddSongs: { playlistId: string };
  Discover: undefined;
  ExcludedFolders: undefined;
  Stats: undefined;
  EditTrack: { id: string };
  VideoFolder: { folder: string };
  VideoSeries: { key: string };
  VideoStats: undefined;
};

export type HomeStackParams = SharedStackParams & { Home: undefined };
export type LibraryStackParams = SharedStackParams & { Library: undefined };
export type PlaylistsStackParams = SharedStackParams & { Playlists: undefined };
export type SearchStackParams = SharedStackParams & { Search: undefined };
export type SettingsStackParams = SharedStackParams & { Settings: undefined };

export type TabParams = {
  HomeTab: NavigatorScreenParams<HomeStackParams>;
  LibraryTab: NavigatorScreenParams<LibraryStackParams>;
  PlaylistsTab: NavigatorScreenParams<PlaylistsStackParams>;
  SearchTab: NavigatorScreenParams<SearchStackParams>;
  SettingsTab: NavigatorScreenParams<SettingsStackParams>;
};

export type AnyStackParams = SharedStackParams & {
  Home: undefined;
  Library: undefined;
  Playlists: undefined;
  Search: undefined;
  Settings: undefined;
};
