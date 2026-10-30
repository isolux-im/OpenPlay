import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useMemo, type ComponentType } from 'react';

import { AddSongsScreen } from '../screens/AddSongsScreen';
import { AlbumScreen } from '../screens/AlbumScreen';
import { ArtistScreen } from '../screens/ArtistScreen';
import { DiscoverScreen } from '../screens/DiscoverScreen';
import { DownloadLinkScreen } from '../screens/DownloadLinkScreen';
import { DownloadsScreen } from '../screens/DownloadsScreen';
import { EditTrackScreen } from '../screens/EditTrackScreen';
import { ExcludedFoldersScreen } from '../screens/ExcludedFoldersScreen';
import {
  LibraryScreen,
  AlbumsScreen,
  ArtistsScreen,
  FavoritesScreen,
  FolderScreen,
  FoldersScreen,
  GenreScreen,
  GenresScreen,
  HistoryScreen,
  SmartPlaylistScreen,
  SongsScreen,
} from '../screens/LibraryScreens';
import { NewFolderScreen } from '../screens/NewFolderScreen';
import { PlaylistScreen } from '../screens/PlaylistScreen';
import { PlaylistsScreen } from '../screens/PlaylistsScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { VideoPlaylistScreen } from '../screens/VideoPlaylistScreen';
import { VideoSeriesScreen } from '../screens/VideoSeriesScreen';
import { VideoStatsScreen } from '../screens/VideoStatsScreen';
import { VideoCollectionScreen, VideoFolderScreen, VideoFoldersScreen, VideoPlaylistsScreen, VideoSeriesListScreen, VideosScreen } from '../screens/VideosScreen';
import { useTheme } from '../ui/theme';
import { navigationRef } from './ref';
import { TabBar } from './TabBar';
import type { AnyStackParams, TabParams } from './types';

const Tab = createBottomTabNavigator<TabParams>();

const SHARED: { name: keyof AnyStackParams; component: ComponentType }[] = [
  { name: 'Album', component: AlbumScreen },
  { name: 'Artist', component: ArtistScreen },
  { name: 'Genre', component: GenreScreen },
  { name: 'Folder', component: FolderScreen },
  { name: 'Playlist', component: PlaylistScreen },
  { name: 'SmartPlaylist', component: SmartPlaylistScreen },
  { name: 'Songs', component: SongsScreen },
  { name: 'Artists', component: ArtistsScreen },
  { name: 'Albums', component: AlbumsScreen },
  { name: 'Genres', component: GenresScreen },
  { name: 'Folders', component: FoldersScreen },
  { name: 'Favorites', component: FavoritesScreen },
  { name: 'History', component: HistoryScreen },
  { name: 'AddSongs', component: AddSongsScreen },
  { name: 'Discover', component: DiscoverScreen },
  { name: 'ExcludedFolders', component: ExcludedFoldersScreen },
  { name: 'Stats', component: StatsScreen },
  { name: 'EditTrack', component: EditTrackScreen },
  { name: 'VideoFolder', component: VideoFolderScreen },
  { name: 'VideoSeries', component: VideoSeriesScreen },
  { name: 'VideoStats', component: VideoStatsScreen },
  { name: 'VideoPlaylist', component: VideoPlaylistScreen },
  { name: 'VideoCollection', component: VideoCollectionScreen },
  { name: 'DownloadLink', component: DownloadLinkScreen },
  { name: 'Downloads', component: DownloadsScreen },
  { name: 'VideoSeriesList', component: VideoSeriesListScreen },
  { name: 'VideoPlaylists', component: VideoPlaylistsScreen },
  { name: 'VideoFolders', component: VideoFoldersScreen },
  { name: 'NewFolder', component: NewFolderScreen },
  { name: 'MusicPlaylists', component: MusicPlaylistsScreen },
];

/** Playlists musicales en sous-écran de Musique (plus d'onglet Playlists). */
function MusicPlaylistsScreen() {
  return <PlaylistsScreen back />;
}

function VideosRoot() {
  return <VideosScreen title="Vidéos" />;
}

function MusicRoot() {
  return <LibraryScreen title="Audios" />;
}

/** Une pile par onglet, avec le même jeu d'écrans de détail : la barre d'onglets reste visible. */
function makeStack(rootName: 'Videos' | 'Music' | 'Search' | 'Settings', root: ComponentType) {
  const Stack = createNativeStackNavigator<AnyStackParams>();
  function TabStack() {
    const { colors } = useTheme();
    return (
      <Stack.Navigator
        initialRouteName={rootName}
        screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.background }, fullScreenGestureEnabled: true }}>
        <Stack.Screen name={rootName} component={root} />
        {SHARED.map((s) => (
          <Stack.Screen key={s.name} name={s.name} component={s.component} />
        ))}
      </Stack.Navigator>
    );
  }
  TabStack.displayName = `${rootName}Stack`;
  return TabStack;
}

// Quatre onglets, à la manière de VLC : Vidéo et Musique, chacun avec toutes ses fonctions (playlists comprises).
const VideosStack = makeStack('Videos', VideosRoot);
const MusicStack = makeStack('Music', MusicRoot);
const SearchStack = makeStack('Search', SearchScreen);
const SettingsStack = makeStack('Settings', SettingsScreen);

export function RootNavigator() {
  const { dark, colors } = useTheme();
  const navTheme = useMemo<NavTheme>(() => {
    const base = dark ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, primary: colors.accent, background: colors.background, card: colors.card, text: colors.text, border: colors.separator } };
  }, [dark, colors]);

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Tab.Screen name="VideosTab" component={VideosStack} />
        <Tab.Screen name="MusicTab" component={MusicStack} />
        <Tab.Screen name="SearchTab" component={SearchStack} />
        <Tab.Screen name="SettingsTab" component={SettingsStack} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
