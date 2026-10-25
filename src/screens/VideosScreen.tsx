import { useRoute, type RouteProp } from '@react-navigation/native';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Chips, EmptyState } from '../components/Blocks';
import { HeaderButton, ListScreen } from '../components/Screen';
import { normalizeText, pluralize } from '../library/text';
import { useAppNavigation } from '../navigation/ref';
import type { SharedStackParams } from '../navigation/types';
import { useSettings } from '../store/settings';
import { useVideoHistory } from '../store/videoHistory';
import { useVideos } from '../store/videos';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';
import { continueWatching, recentlyWatched, searchVideos, sortVideos, videoFolders } from '../video/library';
import type { VideoSort } from '../video/types';
import { VideoList } from '../video/VideoList';
import { useSeriesIndex } from '../video/useSeries';
import { VideoThumb } from '../video/VideoThumb';
import { SeriesRow } from './VideoSeriesScreen';

type Section = 'all' | 'continue' | 'recent' | 'favorites' | 'series' | 'folders';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'continue', label: 'Continuer' },
  { key: 'recent', label: 'Récentes' },
  { key: 'favorites', label: 'Favoris' },
  { key: 'series', label: 'Séries' },
  { key: 'folders', label: 'Dossiers' },
];

const SORTS: { key: VideoSort; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'name', label: 'Nom' },
  { key: 'duration', label: 'Durée' },
  { key: 'size', label: 'Taille' },
];

function LayoutButton() {
  const navigation = useAppNavigation();
  const layout = useSettings((s) => s.videoLayout);
  const update = useSettings((s) => s.update);
  return (
    <View style={styles.headerButtons}>
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

export function VideosScreen() {
  const navigation = useAppNavigation();
  const { colors } = useTheme();
  const status = useVideos((s) => s.status);
  const videos = useVideos((s) => s.videos);
  const limited = useVideos((s) => s.limited);
  const entries = useVideoHistory((s) => s.entries);
  const favorites = useVideoHistory((s) => s.favorites);
  const sort = useSettings((s) => s.videoSort);
  const update = useSettings((s) => s.update);
  const [section, setSection] = useState<Section>('all');
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);

  useEffect(() => {
    useVideos.getState().init();
  }, []);

  const list = useMemo(() => {
    const found = searchVideos(videos, deferred);
    switch (section) {
      case 'continue':
        return continueWatching(found, entries);
      case 'recent':
        return recentlyWatched(found, entries);
      case 'favorites':
        return sortVideos(found.filter((v) => favorites.includes(v.id)), sort);
      default:
        return sortVideos(found, sort);
    }
  }, [videos, deferred, section, entries, favorites, sort]);
  const folders = useMemo(() => videoFolders(searchVideos(videos, deferred)), [videos, deferred]);
  const allSeries = useSeriesIndex().list;
  const series = useMemo(() => {
    const q = normalizeText(deferred);
    return q ? allSeries.filter((x) => normalizeText(x.name).includes(q)) : allSeries;
  }, [allSeries, deferred]);

  if (status !== 'ready') {
    return (
      <ListScreen title="Vidéos" data={[]} renderItem={() => null} ListEmptyComponent={<VideosGate />} />
    );
  }

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
      <Chips options={SECTIONS} value={section} onChange={setSection} />
      {section === 'all' || section === 'favorites' ? (
        <View style={styles.sortRow}>
          <Text variant="footnote" tone="secondary" style={{ paddingLeft: GUTTER }}>
            Trier par
          </Text>
          <View style={{ flex: 1 }}>
            <Chips options={SORTS} value={sort} onChange={(videoSort) => update({ videoSort })} />
          </View>
        </View>
      ) : null}
      <View style={{ height: 12 }} />
    </View>
  );

  if (section === 'series') {
    return (
      <ListScreen
        title="Vidéos"
        titleRight={<LayoutButton />}
        header={header}
        data={series}
        keyExtractor={(x) => x.key}
        renderItem={({ item }) => <SeriesRow series={item} onPress={() => navigation.push('VideoSeries', { key: item.key })} />}
        ListEmptyComponent={<EmptyState icon="tv-outline" title="Aucune série" message="Les épisodes nommés « S01E02 », « 1x02 » ou « Épisode 2 » sont regroupés ici automatiquement (deux épisodes au moins)." />}
      />
    );
  }

  if (section === 'folders') {
    return (
      <ListScreen
        title="Vidéos"
        titleRight={<LayoutButton />}
        header={header}
        data={folders}
        keyExtractor={(f) => f.folder}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.push('VideoFolder', { folder: item.folder })}
            style={({ pressed }) => [styles.folder, pressed && { backgroundColor: colors.fill }]}
            accessibilityRole="button"
            accessibilityLabel={`Dossier ${item.folder}, ${pluralize(item.count, 'vidéo')}`}>
            <VideoThumb video={item.cover} width={96} />
            <View style={{ flex: 1 }}>
              <Text variant="callout" weight="medium" numberOfLines={1}>
                {item.folder.split('/').pop() || item.folder}
              </Text>
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                {item.folder} · {pluralize(item.count, 'vidéo')}
              </Text>
            </View>
            <Icon name="chevron-forward" size={17} color={colors.tertiaryText} />
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState icon="folder-outline" title="Aucun dossier" />}
      />
    );
  }

  const empty: Record<Exclude<Section, 'folders' | 'series'>, [string, string]> = {
    all: query ? ['Aucun résultat', `Rien ne correspond à « ${query.trim()} ».`] : ['Aucune vidéo', 'Aucune vidéo accessible sur l’appareil.'],
    continue: ['Rien à reprendre', 'Les vidéos commencées et non terminées apparaîtront ici.'],
    recent: ['Aucune vidéo regardée', 'Les vidéos ouvertes dans OpenPlay apparaîtront ici.'],
    favorites: ['Aucun favori', 'Ajoutez une vidéo aux favoris par un appui long.'],
  };
  return (
    <VideoList
      title="Vidéos"
      titleRight={<LayoutButton />}
      header={header}
      videos={list}
      emptyTitle={empty[section][0]}
      emptyMessage={empty[section][1]}
    />
  );
}

export function VideoFolderScreen() {
  const { params } = useRoute<RouteProp<SharedStackParams, 'VideoFolder'>>();
  const videos = useVideos((s) => s.videos);
  const sort = useSettings((s) => s.videoSort);
  const list = useMemo(() => sortVideos(videos.filter((v) => v.folder === params.folder), sort), [videos, params.folder, sort]);
  return <VideoList title={params.folder.split('/').pop() || params.folder} back videos={list} titleRight={<LayoutButton />} />;
}

const styles = StyleSheet.create({
  center: { paddingVertical: 60, alignItems: 'center' },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: GUTTER, marginBottom: 10, paddingHorizontal: 14, height: 44, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: GUTTER, marginBottom: 10, padding: 12, borderRadius: radius.lg },
  sortRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  folder: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: GUTTER, paddingVertical: 8 },
});
