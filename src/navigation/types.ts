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
  VideoPlaylist: { id: string };
  /** Sous-écrans de l'onglet Vidéo (comme ceux de Musique). */
  VideoCollection: { section: 'all' | 'favorites' | 'continue' | 'recent' };
  VideoSeriesList: undefined;
  VideoPlaylists: undefined;
  VideoFolders: undefined;
  /** Nouveau dossier : choix des fichiers à y déplacer ou copier. */
  NewFolder: { kind: 'audio' | 'video'; folder: string };
  /** Playlists musicales, ouvertes depuis l'onglet Musique. */
  MusicPlaylists: undefined;
};

export type VideosStackParams = SharedStackParams & { Videos: undefined };
export type MusicStackParams = SharedStackParams & { Music: undefined };
export type SearchStackParams = SharedStackParams & { Search: undefined };
export type SettingsStackParams = SharedStackParams & { Settings: undefined };

export type TabParams = {
  VideosTab: NavigatorScreenParams<VideosStackParams>;
  MusicTab: NavigatorScreenParams<MusicStackParams>;
  SearchTab: NavigatorScreenParams<SearchStackParams>;
  SettingsTab: NavigatorScreenParams<SettingsStackParams>;
};

export type AnyStackParams = SharedStackParams & {
  Videos: undefined;
  Music: undefined;
  Search: undefined;
  Settings: undefined;
};
