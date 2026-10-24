import { useRoute, type RouteProp } from '@react-navigation/native';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Artwork } from '../components/Artwork';
import { EmptyState, Grid, MenuRow, SectionHeader } from '../components/Blocks';
import { ListScreen, ScrollScreen } from '../components/Screen';
import { TrackRow } from '../components/TrackRow';
import { fallbackColors } from '../library/artwork';
import { groupHistory, mostPlayed, recentlyAddedAlbums, recentlyAddedTracks, rediscover, sortTracks } from '../library/selectors';
import { pluralize } from '../library/text';
import { useAppNavigation } from '../navigation/ref';
import type { SharedStackParams, SmartPlaylistKind } from '../navigation/types';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings, type SongSort } from '../store/settings';
import { useUser } from '../store/user';
import type { Album, Artist, Folder, Genre } from '../types';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';
import { TrackCollectionScreen } from './TrackCollectionScreen';
import { useNow } from '../ui/useNow';
import { LibraryGate } from './LibraryGate';

export function LibraryScreen() {
  const navigation = useAppNavigation();
  const index = useLibrary((s) => s.index);
  const favorites = useUser((s) => s.favorites.length);
  const historyCount = useUser((s) => s.history.length);
  const recent = useMemo(() => recentlyAddedAlbums(index, 12), [index]);

  return (
    <ScrollScreen title="Bibliothèque">
      <LibraryGate>
        <View style={{ marginTop: 4 }}>
          <MenuRow icon="heart" label="Favoris" detail={favorites ? String(favorites) : undefined} onPress={() => navigation.navigate('Favorites')} />
          <MenuRow icon="musical-note" label="Titres" detail={String(index.tracks.length)} onPress={() => navigation.navigate('Songs')} />
          <MenuRow icon="mic" label="Artistes" detail={String(index.artists.length)} onPress={() => navigation.navigate('Artists')} />
          <MenuRow icon="albums" label="Albums" detail={String(index.albums.length)} onPress={() => navigation.navigate('Albums')} />
          <MenuRow icon="pricetags" label="Genres" detail={String(index.genres.length)} onPress={() => navigation.navigate('Genres')} />
          <MenuRow icon="folder" label="Dossiers" detail={String(index.folders.length)} onPress={() => navigation.navigate('Folders')} />
          <MenuRow icon="time" label="Historique" detail={historyCount ? String(historyCount) : undefined} onPress={() => navigation.navigate('History')} last />
        </View>
        {recent.length ? (
          <>
            <SectionHeader title="Ajoutés récemment" />
            <Grid
              data={recent}
              keyOf={(a) => a.id}
              render={(a) => <AlbumGridCard album={a} />}
            />
          </>
        ) : null}
      </LibraryGate>
    </ScrollScreen>
  );
}

export function AlbumGridCard({ album }: { album: Album }) {
  const navigation = useAppNavigation();
  const byId = useLibrary((s) => s.index.byId);
  return (
    <PressableCard onPress={() => navigation.push('Album', { id: album.id })} label={`${album.title}, ${album.artist}`}>
      <Artwork track={byId[album.trackIds[0]]} rounded={radius.md} />
      <Text variant="subhead" weight="medium" numberOfLines={1} style={{ marginTop: 8 }}>
        {album.title}
      </Text>
      <Text variant="subhead" tone="secondary" numberOfLines={1}>
        {album.artist}
      </Text>
    </PressableCard>
  );
}

function PressableCard({ onPress, label, children }: { onPress: () => void; label: string; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
      {children}
    </Pressable>
  );
}

const SORT_LABELS: Record<SongSort, string> = { title: 'Titre', artist: 'Artiste', album: 'Album', added: 'Date d’ajout' };

export function SongsScreen() {
  const tracks = useLibrary((s) => s.index.tracks);
  const sort = useSettings((s) => s.songSort);
  const update = useSettings((s) => s.update);
  const { colors } = useTheme();
  const sorted = useMemo(() => sortTracks(tracks, sort), [tracks, sort]);
  const order: SongSort[] = ['title', 'artist', 'album', 'added'];
  return (
    <TrackCollectionScreen
      title="Titres"
      backLabel="Bibliothèque"
      tracks={sorted}
      label="Tous les titres"
      headerExtra={
        <View style={styles.sortRow}>
          {order.map((o) => (
            <Pressable
              key={o}
              onPress={() => update({ songSort: o })}
              style={[styles.sortChip, { backgroundColor: sort === o ? colors.accent : colors.fill }]}
              accessibilityRole="radio"
              accessibilityState={{ selected: sort === o }}>
              <Text variant="footnote" weight="semibold" color={sort === o ? '#FFFFFF' : colors.text}>
                {SORT_LABELS[o]}
              </Text>
            </Pressable>
          ))}
        </View>
      }
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
  const c = fallbackColors(`genre:${genre.name}`);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, { backgroundColor: c.dominant, opacity: pressed ? 0.8 : 1 }]} accessibilityRole="button" accessibilityLabel={`Genre ${genre.name}`}>
      <Text variant="headline" color="#FFFFFF" numberOfLines={2}>
        {genre.name}
      </Text>
      <Text variant="footnote" color="rgba(255,255,255,0.8)">
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
      <View style={[styles.folderIcon, { backgroundColor: colors.accentSoft }]}>
        <Icon name="folder" size={24} color={colors.accent} />
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
  rediscover: { title: 'À redécouvrir', icon: 'refresh' },
};

export function useSmartPlaylist(kind: SmartPlaylistKind) {
  const index = useLibrary((s) => s.index);
  const favorites = useUser((s) => s.favorites);
  const playCounts = useUser((s) => s.playCounts);
  const history = useUser((s) => s.history);
  const now = useNow();
  return useMemo(() => {
    switch (kind) {
      case 'favorites':
        return favorites.map((id) => index.byId[id]).filter(Boolean);
      case 'mostPlayed':
        return mostPlayed(playCounts, index.byId, 50);
      case 'recentlyAdded':
        return recentlyAddedTracks(index, 50);
      case 'rediscover':
        return rediscover(index, history, now, 30, 50);
    }
  }, [kind, index, favorites, playCounts, history, now]);
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
  sortRow: { flexDirection: 'row', gap: 8, paddingHorizontal: GUTTER, paddingTop: 4 },
  sortChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: GUTTER, height: 68 },
  listText: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 14, height: '100%', borderBottomWidth: StyleSheet.hairlineWidth, paddingRight: GUTTER },
  folderIcon: { width: 52, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GUTTER - 6 },
  tile: { width: '47%', margin: '1.5%', height: 104, borderRadius: radius.lg, padding: 14, justifyContent: 'space-between' },
  groupLabel: { paddingHorizontal: GUTTER, paddingTop: 20, paddingBottom: 6 },
});

