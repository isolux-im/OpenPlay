import { useRoute, type RouteProp } from '@react-navigation/native';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Artwork } from '../components/Artwork';
import { Carousel, Chips, EmptyState, Grid, MediaCard, MenuRow, QuickTile, SectionHeader } from '../components/Blocks';
import { PressableScale } from '../components/PressableScale';
import { HeaderButton, ListScreen, ScrollScreen } from '../components/Screen';
import { TrackRow } from '../components/TrackRow';
import { groupHistory, mostPlayed, recentlyAddedAlbums, recentlyPlayedAlbums, recentlyAddedTracks, sortTracks, uniqueDiscover } from '../library/selectors';
import { pluralize } from '../library/text';
import { goToTab, useAppNavigation } from '../navigation/ref';
import type { SharedStackParams, SmartPlaylistKind } from '../navigation/types';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings, type SongSort } from '../store/settings';
import { useUi } from '../store/ui';
import { useUser } from '../store/user';
import type { Album, Artist, Folder, Genre } from '../types';
import { tap } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';
import { TrackCollectionScreen } from './TrackCollectionScreen';
import { useNow } from '../ui/useNow';
import { useDiscover } from './DiscoverScreen';
import { LibraryGate } from './LibraryGate';

export function LibraryScreen() {
  const navigation = useAppNavigation();
  const index = useLibrary((s) => s.index);
  const favorites = useUser((s) => s.favorites.length);
  const history = useUser((s) => s.history);
  const playlists = useUser((s) => s.playlists);
  const openAlbumMenu = useUi((s) => s.openAlbumMenu);
  const openPlaylistMenu = useUi((s) => s.openPlaylistMenu);
  const played = useMemo(() => recentlyPlayedAlbums(history, index, 12), [history, index]);
  const added = useMemo(() => recentlyAddedAlbums(index, 12), [index]);
  const recentAlbums = played.length ? played : added;
  const recentCount = useMemo(() => new Set(history.map((h) => h.trackId)).size, [history]);
  const smart: SmartPlaylistKind[] = ['mostPlayed', 'recentlyAdded', 'rediscover'];
  const discover = useDiscover();
  const discoverCount = useMemo(() => {
    const u = uniqueDiscover(discover);
    return u.never.length + u.forgotten.length + u.rare.length;
  }, [discover]);
  const { colors } = useTheme();

  return (
    <ScrollScreen
      title="Bibliothèque"
      titleRight={
        <>
          <HeaderButton icon="search-outline" label="Rechercher" onPress={() => goToTab('SearchTab')} />
          <HeaderButton icon="person-outline" label="Paramètres" onPress={() => goToTab('SettingsTab')} />
        </>
      }>
      <LibraryGate>
        <View style={styles.quickGrid}>
          <View style={styles.quickRow}>
            <QuickTile icon="time-outline" label="Récents" count={recentCount} onPress={() => navigation.navigate('History')} />
            <QuickTile icon="heart-outline" label="Favoris" count={favorites} onPress={() => navigation.navigate('Favorites')} />
          </View>
          <View style={styles.quickRow}>
            <QuickTile icon="list-outline" label="Playlists" count={playlists.length} onPress={() => goToTab('PlaylistsTab')} />
            <QuickTile icon="musical-notes-outline" label="Titres" count={index.tracks.length} onPress={() => navigation.navigate('Songs')} />
          </View>
          <View style={styles.quickRow}>
            <QuickTile icon="sparkles-outline" label="À découvrir" count={discoverCount} onPress={() => navigation.navigate('Discover')} />
          </View>
        </View>

        {recentAlbums.length ? (
          <>
            <SectionHeader title={played.length ? 'Écoutés récemment' : 'Ajoutés récemment'} onPress={() => navigation.navigate(played.length ? 'History' : 'Albums')} />
            <Carousel
              data={recentAlbums}
              keyOf={(a) => a.id}
              render={(a) => (
                <MediaCard
                  title={a.title}
                  subtitle={`Album · ${pluralize(a.trackIds.length, 'titre')}`}
                  track={index.byId[a.trackIds[0]]}
                  width={150}
                  onPress={() => navigation.push('Album', { id: a.id })}
                  onLongPress={(anchor) => openAlbumMenu(a.id, anchor)}
                />
              )}
            />
          </>
        ) : null}

        <SectionHeader title="Playlists pour vous" onPress={() => goToTab('PlaylistsTab')} />
        <Carousel
          data={[...playlists.map((p) => ({ key: p.id, playlist: p })), ...smart.map((k) => ({ key: k, kind: k }))]}
          keyOf={(x) => x.key}
          render={(x) => ('playlist' in x && x.playlist ? (
            <MediaCard
              title={x.playlist.name}
              subtitle={pluralize(x.playlist.trackIds.length, 'titre')}
              mosaic={x.playlist.trackIds.map((id) => index.byId[id]).filter(Boolean)}
              width={150}
              onPress={() => navigation.push('Playlist', { id: x.playlist.id })}
              onLongPress={(anchor) => openPlaylistMenu(x.playlist.id, anchor)}
            />
          ) : (
            <SmartCard kind={(x as { kind: SmartPlaylistKind }).kind} />
          ))}
        />

        <SectionHeader title="Parcourir" />
        <View style={[styles.browse, { backgroundColor: colors.card }]}>
          <MenuRow icon="musical-note-outline" label="Titres" detail={String(index.tracks.length)} onPress={() => navigation.navigate('Songs')} />
          <MenuRow icon="mic-outline" label="Artistes" detail={String(index.artists.length)} onPress={() => navigation.navigate('Artists')} />
          <MenuRow icon="albums-outline" label="Albums" detail={String(index.albums.length)} onPress={() => navigation.navigate('Albums')} />
          <MenuRow icon="pricetags-outline" label="Genres" detail={String(index.genres.length)} onPress={() => navigation.navigate('Genres')} />
          <MenuRow icon="folder-outline" label="Dossiers" detail={String(index.folders.length)} onPress={() => navigation.navigate('Folders')} last />
        </View>
      </LibraryGate>
    </ScrollScreen>
  );
}

/** Carte de playlist automatique : pochettes de ses premiers morceaux. */
export function SmartCard({ kind, width = 150 }: { kind: SmartPlaylistKind; width?: number }) {
  const navigation = useAppNavigation();
  const tracks = useSmartPlaylist(kind);
  const meta = SMART_PLAYLISTS[kind];
  return <MediaCard title={meta.title} subtitle={`Automatique · ${pluralize(tracks.length, 'titre')}`} mosaic={tracks} width={width} onPress={() => (kind === 'rediscover' ? navigation.navigate('Discover') : navigation.navigate('SmartPlaylist', { kind }))} />;
}

export function AlbumGridCard({ album }: { album: Album }) {
  const navigation = useAppNavigation();
  const byId = useLibrary((s) => s.index.byId);
  const openAlbumMenu = useUi((s) => s.openAlbumMenu);
  return (
    <PressableScale
      onPress={() => navigation.push('Album', { id: album.id })}
      onLongPress={(e) => {
        tap();
        openAlbumMenu(album.id, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
      }}
      delayLongPress={320}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${album.title}, ${album.artist}`}>
      <Artwork track={byId[album.trackIds[0]]} rounded={radius.lg} />
      <Text variant="subhead" weight="semibold" numberOfLines={1} style={{ marginTop: 8 }}>
        {album.title}
      </Text>
      <Text variant="footnote" tone="secondary" numberOfLines={1}>
        {album.artist}
      </Text>
    </PressableScale>
  );
}

const SORT_LABELS: Record<SongSort, string> = { title: 'Titre', artist: 'Artiste', album: 'Album', added: 'Date d’ajout' };

export function SongsScreen() {
  const tracks = useLibrary((s) => s.index.tracks);
  const sort = useSettings((s) => s.songSort);
  const update = useSettings((s) => s.update);
  const sorted = useMemo(() => sortTracks(tracks, sort), [tracks, sort]);
  const order: SongSort[] = ['title', 'artist', 'album', 'added'];
  return (
    <TrackCollectionScreen
      title="Titres"
      backLabel="Bibliothèque"
      tracks={sorted}
      label="Tous les titres"
      headerExtra={<Chips options={order.map((o) => ({ key: o, label: SORT_LABELS[o] }))} value={sort} onChange={(o) => update({ songSort: o })} />}
    />
  );
}

export function ArtistsScreen() {
  const navigation = useAppNavigation();
  const index = useLibrary((s) => s.index);
  const { colors } = useTheme();
  const renderItem = useCallback(
    ({ item }: { item: Artist }) => (
      <Pressable onPress={() => navigation.push('Artist', { id: item.id })} style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.fill }]} accessibilityRole="button" accessibilityLabel={item.name}>
        <Artwork track={index.byId[item.trackIds[0]]} size={52} circle placeholderIcon="person" />
        <View style={[styles.listText, { borderBottomColor: colors.separator }]}>
          <View style={{ flex: 1 }}>
            <Text variant="body" numberOfLines={1}>
              {item.name}
            </Text>
            <Text variant="footnote" tone="secondary">
              {pluralize(item.albumIds.length, 'album')} · {pluralize(item.trackIds.length, 'morceau', 'morceaux')}
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.tertiaryText} />
        </View>
      </Pressable>
    ),
    [navigation, index, colors],
  );
  return <ListScreen title="Artistes" back backLabel="Bibliothèque" data={index.artists} keyExtractor={(a) => a.id} renderItem={renderItem} ListEmptyComponent={<EmptyState icon="mic-outline" title="Aucun artiste" />} />;
}

export function AlbumsScreen() {
  const albums = useLibrary((s) => s.index.albums);
  return (
    <ScrollScreen title="Albums" back backLabel="Bibliothèque">
      {albums.length ? <Grid data={albums} keyOf={(a) => a.id} render={(a) => <AlbumGridCard album={a} />} /> : <EmptyState icon="albums-outline" title="Aucun album" />}
    </ScrollScreen>
  );
}

export function GenresScreen() {
  const navigation = useAppNavigation();
  const genres = useLibrary((s) => s.index.genres);
  return (
    <ScrollScreen title="Genres" back backLabel="Bibliothèque">
      <View style={styles.tiles}>
        {genres.map((g) => (
          <GenreTile key={g.id} genre={g} onPress={() => navigation.push('Genre', { id: g.id })} />
        ))}
      </View>
      {genres.length === 0 ? <EmptyState icon="pricetags-outline" title="Aucun genre" /> : null}
    </ScrollScreen>
  );
}

export function GenreTile({ genre, onPress }: { genre: Genre; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }]} accessibilityRole="button" accessibilityLabel={`Genre ${genre.name}`}>
      <Icon name="pricetag-outline" size={18} color={colors.secondaryText} />
      <Text variant="headline" numberOfLines={2}>
        {genre.name}
      </Text>
      <Text variant="footnote" tone="secondary">
        {pluralize(genre.trackIds.length, 'morceau', 'morceaux')}
      </Text>
    </Pressable>
  );
}

export function GenreScreen() {
  const { params } = useRoute<RouteProp<SharedStackParams, 'Genre'>>();
  const index = useLibrary((s) => s.index);
  const genre = index.genresById[params.id];
  const tracks = genre ? genre.trackIds.map((id) => index.byId[id]).filter(Boolean) : [];
  return <TrackCollectionScreen title={genre?.name ?? 'Genre'} tracks={tracks} backLabel="Genres" />;
}

export function FoldersScreen() {
  const navigation = useAppNavigation();
  const folders = useLibrary((s) => s.index.folders);
  const { colors } = useTheme();
  const renderItem = ({ item }: { item: Folder }) => (
    <Pressable onPress={() => navigation.push('Folder', { id: item.id })} style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.fill }]} accessibilityRole="button" accessibilityLabel={item.path}>
      <View style={[styles.folderIcon, { backgroundColor: colors.fill }]}>
        <Icon name="folder-outline" size={22} color={colors.text} />
      </View>
      <View style={[styles.listText, { borderBottomColor: colors.separator }]}>
        <View style={{ flex: 1 }}>
          <Text variant="body" numberOfLines={1}>
            {item.name}
          </Text>
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {item.path} · {pluralize(item.trackIds.length, 'morceau', 'morceaux')}
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.tertiaryText} />
      </View>
    </Pressable>
  );
  return <ListScreen title="Dossiers" back backLabel="Bibliothèque" data={folders} keyExtractor={(f) => f.id} renderItem={renderItem} ListEmptyComponent={<EmptyState icon="folder-outline" title="Aucun dossier" />} />;
}

export function FolderScreen() {
  const { params } = useRoute<RouteProp<SharedStackParams, 'Folder'>>();
  const index = useLibrary((s) => s.index);
  const folder = index.foldersById[params.id];
  const tracks = folder ? folder.trackIds.map((id) => index.byId[id]).filter(Boolean) : [];
  return <TrackCollectionScreen title={folder?.name ?? 'Dossier'} subtitle={folder?.path} tracks={tracks} backLabel="Dossiers" />;
}

export function FavoritesScreen() {
  const ids = useUser((s) => s.favorites);
  const byId = useLibrary((s) => s.index.byId);
  const tracks = useMemo(() => ids.map((id) => byId[id]).filter(Boolean), [ids, byId]);
  return (
    <TrackCollectionScreen
      title="Favoris"
      tracks={tracks}
      emptyIcon="heart-outline"
      emptyTitle="Aucun favori"
      emptyMessage="Touchez ♡ dans le lecteur ou dans le menu d'un morceau pour l'ajouter ici."
    />
  );
}

export function HistoryScreen() {
  const history = useUser((s) => s.history);
  const clearHistory = useUser((s) => s.clearHistory);
  const byId = useLibrary((s) => s.index.byId);
  const now = useNow();
  const groups = useMemo(() => groupHistory(history, byId, now), [history, byId, now]);
  return (
    <ScrollScreen
      title="Historique"
      back
      backLabel="Bibliothèque"
      right={
        history.length ? (
          <Pressable onPress={clearHistory} hitSlop={10} accessibilityRole="button">
            <Text variant="body" tone="accent">
              Effacer
            </Text>
          </Pressable>
        ) : undefined
      }>
      {groups.length === 0 ? <EmptyState icon="time-outline" title="Aucune écoute" message="Les morceaux écoutés plus de 30 secondes apparaîtront ici." /> : null}
      {groups.map((g) => (
        <View key={g.label}>
          <Text variant="overline" tone="secondary" style={styles.groupLabel}>
            {g.label.toUpperCase()}
          </Text>
          {g.entries.map((e) => (
            <TrackRow
              key={`${e.trackId}-${e.at}`}
              track={e.track}
              subtitle={`${e.track.artist} · ${new Date(e.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
              onPress={() => usePlayer.getState().playTracks([e.trackId], 0, { label: 'Historique' })}
            />
          ))}
        </View>
      ))}
    </ScrollScreen>
  );
}

export const SMART_PLAYLISTS: Record<SmartPlaylistKind, { title: string; icon: 'heart' | 'flame' | 'sparkles' | 'refresh' }> = {
  favorites: { title: 'Favoris', icon: 'heart' },
  mostPlayed: { title: 'Les plus écoutés', icon: 'flame' },
  recentlyAdded: { title: 'Ajoutés récemment', icon: 'sparkles' },
  rediscover: { title: 'À découvrir', icon: 'refresh' },
};

export function useSmartPlaylist(kind: SmartPlaylistKind) {
  const index = useLibrary((s) => s.index);
  const favorites = useUser((s) => s.favorites);
  const playCounts = useUser((s) => s.playCounts);
  const discover = useDiscover();
  return useMemo(() => {
    switch (kind) {
      case 'favorites':
        return favorites.map((id) => index.byId[id]).filter(Boolean);
      case 'mostPlayed':
        return mostPlayed(playCounts, index.byId, 50);
      case 'recentlyAdded':
        return recentlyAddedTracks(index, 50);
      case 'rediscover': {
        const u = uniqueDiscover(discover);
        return [...u.never, ...u.forgotten, ...u.rare].map((i) => i.track);
      }
    }
  }, [kind, index, favorites, playCounts, discover]);
}

export function SmartPlaylistScreen() {
  const { params } = useRoute<RouteProp<SharedStackParams, 'SmartPlaylist'>>();
  const tracks = useSmartPlaylist(params.kind);
  const meta = SMART_PLAYLISTS[params.kind];
  const messages: Record<SmartPlaylistKind, string> = {
    favorites: 'Ajoutez des favoris pour remplir cette playlist.',
    mostPlayed: 'Écoutez de la musique : vos titres les plus joués apparaîtront ici.',
    recentlyAdded: 'Aucun morceau ajouté récemment.',
    rediscover: 'Vous avez écouté toute votre bibliothèque ces 30 derniers jours !',
  };
  return <TrackCollectionScreen title={meta.title} tracks={tracks} emptyIcon={meta.icon} emptyTitle="Rien pour l'instant" emptyMessage={messages[params.kind]} subtitle="Playlist automatique" />;
}

const styles = StyleSheet.create({
  quickGrid: { paddingHorizontal: GUTTER, gap: 12, marginTop: 4 },
  quickRow: { flexDirection: 'row', gap: 12 },
  browse: { marginHorizontal: GUTTER, borderRadius: radius.lg, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: GUTTER, height: 68 },
  listText: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 14, height: '100%', borderBottomWidth: StyleSheet.hairlineWidth, paddingRight: GUTTER },
  folderIcon: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GUTTER - 6 },
  tile: { width: '47%', margin: '1.5%', height: 104, borderRadius: radius.lg, padding: 14, justifyContent: 'space-between' },
  groupLabel: { paddingHorizontal: GUTTER, paddingTop: 20, paddingBottom: 6 },
});

