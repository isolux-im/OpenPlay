import { useRoute, type RouteProp } from '@react-navigation/native';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Carousel, EmptyState, MenuRow, QuickTile, SectionHeader } from '../components/Blocks';
import { SelectButton } from '../components/SelectButton';
import { HeaderButton, ListScreen } from '../components/Screen';
import { pluralize } from '../library/text';
import { goToTab, useAppNavigation } from '../navigation/ref';
import type { SharedStackParams } from '../navigation/types';
import { useSettings } from '../store/settings';
import { useSelectable } from '../store/selection';
import { useUi } from '../store/ui';
import { useVideoHistory } from '../store/videoHistory';
import { useVideoPlayer } from '../store/videoPlayer';
import { useVideoPlaylists } from '../store/videoPlaylists';
import { useVideos } from '../store/videos';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';
import { continueWatching, recentlyWatched, searchVideos, sortVideos, videoFolders } from '../video/library';
import type { Video } from '../video/types';
import { VideoList, VideoRow } from '../video/VideoList';
import { useSeriesIndex } from '../video/useSeries';
import { VideoThumb } from '../video/VideoThumb';
import { FolderActions, NewFolderRow } from './NewFolderScreen';
import { useFolders } from '../store/folders';
import { NewVideoPlaylistRow, VideoPlaylistRow } from './VideoPlaylistScreen';
import { SeriesRow } from './VideoSeriesScreen';

function LayoutButton({ selectable = false }: { selectable?: boolean }) {
  const navigation = useAppNavigation();
  const layout = useSettings((s) => s.videoLayout);
  const update = useSettings((s) => s.update);
  return (
    <View style={styles.headerButtons}>
      {selectable ? <SelectButton kind="video" /> : null}
      <HeaderButton icon="stats-chart-outline" label="Bilan de visionnage" onPress={() => navigation.push('VideoStats')} />
      <HeaderButton
      icon={layout === 'grid' ? 'list-outline' : 'grid-outline'}
      label={layout === 'grid' ? 'Afficher en liste' : 'Afficher en grille'}
      onPress={() => update({ videoLayout: layout === 'grid' ? 'list' : 'grid' })}
      />
    </View>
  );
}

/** Autorisation, chargement ou erreur : écran d'attente commun à l'onglet. */
function VideosGate() {
  const status = useVideos((s) => s.status);
  const { requestPermission, scan } = useVideos.getState();
  if (status === 'loading' || status === 'idle') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (status === 'denied') {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="Accès aux vidéos refusé"
        message="Autorisez « Photos et vidéos » pour OpenPlay dans les paramètres d’Android. La musique n’est pas concernée."
        action={{ label: 'Ouvrir les paramètres', onPress: () => Linking.openSettings() }}
      />
    );
  }
  if (status === 'error') return <EmptyState icon="alert-circle-outline" title="Vidéos illisibles" message="Impossible de lire la liste des vidéos." action={{ label: 'Réessayer', onPress: scan }} />;
  return (
    <EmptyState
      icon="film-outline"
      title="Vos vidéos, hors ligne"
      message="OpenPlay a besoin d’accéder aux vidéos de l’appareil pour les afficher. Rien n’est envoyé sur Internet."
      action={{ label: 'Autoriser l’accès aux vidéos', onPress: requestPermission }}
    />
  );
}

/** Vignette de vidéo dans une rangée horizontale (« Continuer à regarder », « Ajoutées récemment »). */
function VideoCard({ video, list }: { video: Video; list: string[] }) {
  const { colors } = useTheme();
  const progress = useVideoHistory((s) => {
    const e = s.entries[video.id];
    return e && !e.finished && video.durationSec ? e.positionSec / video.durationSec : 0;
  });
  return (
    <Pressable
      onPress={() => useVideoPlayer.getState().open(video.id, list)}
      onLongPress={(e) => useUi.getState().openVideoMenu(video.id, list, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
      delayLongPress={320}
      style={({ pressed }) => [{ width: 168 }, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={`Lire ${video.title}`}>
      <VideoThumb video={video} width={168} progress={progress} />
      <Text variant="subhead" weight="semibold" numberOfLines={2} style={{ marginTop: 6 }} color={colors.text}>
        {video.title}
      </Text>
    </Pressable>
  );
}

/**
 * Onglet Vidéo, organisé comme l'onglet Musique : recherche par nom, raccourcis (Récentes, Favoris, Playlists,
 * Toutes, Continuer, Bilan), rangées « Continuer à regarder » / « Ajoutées récemment », puis « Parcourir »
 * (Toutes les vidéos, Séries, Playlists, Dossiers). Les vidéos sont toujours classées par nom.
 */
export function VideosScreen({ title = 'Vidéos' }: { title?: string } = {}) {
  const navigation = useAppNavigation();
  const { colors } = useTheme();
  const status = useVideos((s) => s.status);
  const videos = useVideos((s) => s.videos);
  const limited = useVideos((s) => s.limited);
  const entries = useVideoHistory((s) => s.entries);
  const favorites = useVideoHistory((s) => s.favorites);
  const playlists = useVideoPlaylists((s) => s.playlists);
  const createdFolders = useFolders((s) => s.created.video);
  const series = useSeriesIndex().list;
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);

  useEffect(() => {
    useVideos.getState().init();
  }, []);

  const results = useMemo(() => (deferred.trim() ? sortVideos(searchVideos(videos, deferred)) : []), [videos, deferred]);
  const resultIds = useMemo(() => results.map((v) => v.id), [results]);
  useSelectable('video', resultIds);
  const resume = useMemo(() => continueWatching(videos, entries), [videos, entries]);
  const recent = useMemo(() => recentlyWatched(videos, entries), [videos, entries]);
  const added = useMemo(() => [...videos].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12), [videos]);
  const folders = useMemo(() => videoFolders(videos, createdFolders), [videos, createdFolders]);
  const favoriteCount = useMemo(() => videos.filter((v) => favorites.includes(v.id)).length, [videos, favorites]);

  if (status !== 'ready') {
    return <ListScreen title={title} data={[]} renderItem={() => null} ListEmptyComponent={<VideosGate />} />;
  }

  const row = resume.length ? { title: 'Continuer à regarder', list: resume.slice(0, 12), section: 'continue' as const } : { title: 'Ajoutées récemment', list: added, section: 'all' as const };
  const rowIds = row.list.map((v) => v.id);
  const searching = !!query.trim();

  const header = (
    <View>
      <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        <Icon name="search-outline" size={18} color={colors.secondaryText} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher une vidéo"
          placeholderTextColor={colors.secondaryText}
          style={[styles.input, { color: colors.text }]}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Rechercher une vidéo"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Effacer la recherche">
            <Icon name="close-circle" size={18} color={colors.secondaryText} />
          </Pressable>
        ) : null}
      </View>
      {limited ? (
        <Pressable onPress={() => useVideos.getState().manageLimitedAccess()} style={[styles.banner, { backgroundColor: colors.card }]} accessibilityRole="button">
          <Icon name="eye-outline" size={18} color={colors.secondaryText} />
          <Text variant="footnote" tone="secondary" style={{ flex: 1 }}>
            Accès limité : seules les vidéos que vous avez choisies sont visibles.
          </Text>
          <Text variant="footnote" weight="semibold">
            Modifier
          </Text>
        </Pressable>
      ) : null}
      {searching ? null : (
        <>
          <View style={styles.quickGrid}>
            <View style={styles.quickRow}>
              <QuickTile icon="time-outline" label="Récentes" count={recent.length} onPress={() => navigation.push('VideoCollection', { section: 'recent' })} />
              <QuickTile icon="heart-outline" label="Favoris" count={favoriteCount} onPress={() => navigation.push('VideoCollection', { section: 'favorites' })} />
            </View>
            <View style={styles.quickRow}>
              <QuickTile icon="list-outline" label="Playlists" count={playlists.length} onPress={() => navigation.push('VideoPlaylists')} />
              <QuickTile icon="film-outline" label="Toutes" count={videos.length} onPress={() => navigation.push('VideoCollection', { section: 'all' })} />
            </View>
            <View style={styles.quickRow}>
              <QuickTile icon="play-circle-outline" label="Continuer" count={resume.length} onPress={() => navigation.push('VideoCollection', { section: 'continue' })} />
              <QuickTile icon="stats-chart-outline" label="Bilan" onPress={() => navigation.push('VideoStats')} />
            </View>
          </View>

          {row.list.length ? (
            <>
              <SectionHeader title={row.title} onPress={() => navigation.push('VideoCollection', { section: row.section })} />
              <Carousel data={row.list} keyOf={(v) => v.id} render={(v) => <VideoCard video={v} list={rowIds} />} />
            </>
          ) : null}

          <SectionHeader title="Parcourir" />
          <View style={[styles.browse, { backgroundColor: colors.card }]}>
            <MenuRow icon="film-outline" label="Toutes les vidéos" detail={String(videos.length)} onPress={() => navigation.push('VideoCollection', { section: 'all' })} />
            <MenuRow icon="tv-outline" label="Séries" detail={String(series.length)} onPress={() => navigation.push('VideoSeriesList')} />
            <MenuRow icon="list-outline" label="Playlists" detail={String(playlists.length)} onPress={() => navigation.push('VideoPlaylists')} />
            <MenuRow icon="folder-outline" label="Dossiers" detail={String(folders.length)} onPress={() => navigation.push('VideoFolders')} last />
          </View>
        </>
      )}
      <View style={{ height: 12 }} />
    </View>
  );

  return (
    <ListScreen
      title={title}
      titleRight={
        <>
          {searching ? <SelectButton kind="video" /> : null}
          <HeaderButton icon="person-outline" label="Paramètres" onPress={() => goToTab('SettingsTab')} />
        </>
      }
      header={header}
      data={results}
      keyExtractor={(v) => v.id}
      renderItem={({ item }) => <VideoRow video={item} list={resultIds} />}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={searching ? <EmptyState icon="search-outline" title="Aucun résultat" message={`Rien ne correspond à « ${query.trim()} ».`} /> : undefined}
    />
  );
}

const COLLECTIONS = {
  all: { title: 'Toutes les vidéos', empty: ['Aucune vidéo', 'Aucune vidéo accessible sur l’appareil.'] },
  favorites: { title: 'Favoris', empty: ['Aucun favori', 'Ajoutez une vidéo aux favoris depuis son menu « ⋮ ».'] },
  continue: { title: 'Continuer', empty: ['Rien à reprendre', 'Les vidéos commencées et non terminées apparaîtront ici.'] },
  recent: { title: 'Récentes', empty: ['Aucune vidéo regardée', 'Les vidéos ouvertes dans OpenPlay apparaîtront ici.'] },
} as const;

/**
 * Toutes, Favoris : classées par nom (ordre alphabétique, automatique). Continuer, Récentes : la plus récente
 * d'abord, puisque c'est leur rôle.
 */
export function VideoCollectionScreen() {
  const { params } = useRoute<RouteProp<SharedStackParams, 'VideoCollection'>>();
  const videos = useVideos((s) => s.videos);
  const entries = useVideoHistory((s) => s.entries);
  const favorites = useVideoHistory((s) => s.favorites);
  const list = useMemo(() => {
    switch (params.section) {
      case 'continue':
        return continueWatching(videos, entries);
      case 'recent':
        return recentlyWatched(videos, entries);
      case 'favorites':
        return sortVideos(videos.filter((v) => favorites.includes(v.id)));
      default:
        return sortVideos(videos);
    }
  }, [params.section, videos, entries, favorites]);
  const meta = COLLECTIONS[params.section];
  return <VideoList title={meta.title} back videos={list} titleRight={<LayoutButton selectable />} emptyTitle={meta.empty[0]} emptyMessage={meta.empty[1]} />;
}

/** Séries reconnues, par ordre alphabétique (saisons et épisodes dans l'ordre croissant). */
export function VideoSeriesListScreen() {
  const navigation = useAppNavigation();
  const series = useSeriesIndex().list;
  return (
    <ListScreen
      title="Séries"
      back
      backLabel="Vidéos"
      data={series}
      keyExtractor={(x) => x.key}
      renderItem={({ item }) => <SeriesRow series={item} onPress={() => navigation.push('VideoSeries', { key: item.key })} />}
      ListEmptyComponent={<EmptyState icon="tv-outline" title="Aucune série" message="Les épisodes nommés « S01E02 », « 1x02 » ou « Épisode 2 » sont regroupés ici automatiquement (deux épisodes au moins)." />}
    />
  );
}

/** Playlists vidéo (séries et vidéos), avec « Nouvelle playlist… ». */
export function VideoPlaylistsScreen() {
  const navigation = useAppNavigation();
  const playlists = useVideoPlaylists((s) => s.playlists);
  return (
    <ListScreen
      title="Playlists"
      back
      backLabel="Vidéos"
      header={<NewVideoPlaylistRow />}
      data={playlists}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <VideoPlaylistRow playlist={item} onPress={() => navigation.push('VideoPlaylist', { id: item.id })} />}
      ListEmptyComponent={<EmptyState icon="albums-outline" title="Aucune playlist vidéo" message="Créez des listes pour ranger vos séries et vos vidéos (ex. « Animés », « À voir en famille »)." />}
    />
  );
}

/** Dossiers des vidéos (et dossiers créés vides), par ordre alphabétique, avec « Nouveau dossier… ». */
export function VideoFoldersScreen() {
  const navigation = useAppNavigation();
  const { colors } = useTheme();
  const videos = useVideos((s) => s.videos);
  const createdFolders = useFolders((s) => s.created.video);
  const folders = useMemo(() => videoFolders(videos, createdFolders), [videos, createdFolders]);
  return (
    <ListScreen
      title="Dossiers"
      back
      backLabel="Vidéos"
      header={<NewFolderRow kind="video" />}
      data={folders}
      keyExtractor={(f) => f.folder}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => navigation.push('VideoFolder', { folder: item.folder })}
          style={({ pressed }) => [styles.folder, pressed && { backgroundColor: colors.fill }]}
          accessibilityRole="button"
          accessibilityLabel={`Dossier ${item.folder}, ${pluralize(item.count, 'vidéo')}`}>
          {item.cover ? (
            <VideoThumb video={item.cover} width={96} />
          ) : (
            <View style={[styles.emptyFolder, { backgroundColor: colors.fill }]}>
              <Icon name="folder-open-outline" size={26} color={colors.secondaryText} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text variant="callout" weight="medium" numberOfLines={1}>
              {item.folder.split('/').pop() || item.folder}
            </Text>
            <Text variant="footnote" tone="secondary" numberOfLines={1}>
              {item.folder} · {item.count ? pluralize(item.count, 'vidéo') : 'vide'}
            </Text>
          </View>
          <Icon name="chevron-forward" size={17} color={colors.tertiaryText} />
        </Pressable>
      )}
      ListEmptyComponent={<EmptyState icon="folder-outline" title="Aucun dossier" />}
    />
  );
}

export function VideoFolderScreen() {
  const { params } = useRoute<RouteProp<SharedStackParams, 'VideoFolder'>>();
  const videos = useVideos((s) => s.videos);
  // Classement automatique par nom (ordre alphabétique).
  const list = useMemo(() => sortVideos(videos.filter((v) => v.folder === params.folder)), [videos, params.folder]);
  return (
    <VideoList
      title={params.folder.split('/').pop() || params.folder}
      back
      videos={list}
      titleRight={<LayoutButton selectable />}
      header={<FolderActions kind="video" folder={params.folder} empty={!list.length} />}
      emptyTitle="Dossier vide"
      emptyMessage="Ajoutez des vidéos avec « Ajouter des fichiers », ou par Copier / Déplacer vers… depuis une vidéo."
    />
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 60, alignItems: 'center' },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: GUTTER, marginBottom: 10, paddingHorizontal: 14, height: 44, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: GUTTER, marginBottom: 10, padding: 12, borderRadius: radius.lg },
  quickGrid: { paddingHorizontal: GUTTER, gap: 12, marginTop: 4 },
  quickRow: { flexDirection: 'row', gap: 12 },
  browse: { marginHorizontal: GUTTER, borderRadius: radius.lg, overflow: 'hidden' },
  folder: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: GUTTER, paddingVertical: 8 },
  emptyFolder: { width: 96, height: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
