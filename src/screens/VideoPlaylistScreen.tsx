import { useRoute, type RouteProp } from '@react-navigation/native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { EmptyState } from '../components/Blocks';
import { HeaderButton, ScrollScreen } from '../components/Screen';
import { formatDuration } from '../library/text';
import { useAppNavigation } from '../navigation/ref';
import type { SharedStackParams } from '../navigation/types';
import { useUi } from '../store/ui';
import { describePlaylist, playlistVideoIds, resolvePlaylist, useVideoPlaylists, type VideoPlaylist } from '../store/videoPlaylists';
import { useVideoPlayer } from '../store/videoPlayer';
import { useVideos } from '../store/videos';
import { tap } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';
import { useSeriesIndex } from '../video/useSeries';
import { VideoRow } from '../video/VideoList';
import { VideoThumb } from '../video/VideoThumb';
import { SeriesRow } from './VideoSeriesScreen';

/** Ligne d'une playlist vidéo (liste des playlists, section « Playlists » des Vidéos). */
export function VideoPlaylistRow({ playlist, onPress }: { playlist: VideoPlaylist; onPress: () => void }) {
  const { colors } = useTheme();
  const videosById = useVideos((s) => s.byId);
  const { byKey } = useSeriesIndex();
  const openMenu = useUi((s) => s.openVideoPlaylistMenu);
  const resolved = resolvePlaylist(playlist, byKey, videosById);
  const first = resolved[0];
  const cover = first ? (first.kind === 'series' ? first.series.episodes[0] : first.video) : null;
  const menu = (e: GestureResponderEvent) => {
    tap();
    openMenu(playlist.id, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
  };
  return (
    <Pressable
      onPress={onPress}
      onLongPress={menu}
      delayLongPress={320}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}
      accessibilityRole="button"
      accessibilityLabel={`Playlist ${playlist.name}, ${describePlaylist(resolved)}`}>
      {cover ? (
        <VideoThumb video={cover} width={96} />
      ) : (
        <View style={[styles.emptyThumb, { backgroundColor: colors.fill }]}>
          <Icon name="film-outline" size={26} color={colors.secondaryText} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="callout" weight="semibold" numberOfLines={1}>
          {playlist.name}
        </Text>
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {describePlaylist(resolved)}
        </Text>
      </View>
      <Pressable onPress={menu} hitSlop={10} style={styles.more} accessibilityRole="button" accessibilityLabel={`Options pour ${playlist.name}`}>
        <Icon name="ellipsis-vertical" size={18} color={colors.secondaryText} />
      </Pressable>
    </Pressable>
  );
}

/** « Nouvelle playlist… » en tête de la section Playlists des Vidéos. */
export function NewVideoPlaylistRow() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  return (
    <Pressable
      onPress={() =>
        useUi.getState().openPrompt({
          title: 'Nouvelle playlist vidéo',
          message: 'Rangez-y des séries entières et des vidéos (films, clips…).',
          placeholder: 'Nom (ex. Animés, Policier…)',
          confirmLabel: 'Créer',
          onSubmit: (name) => {
            const p = useVideoPlaylists.getState().create(name);
            navigation.push('VideoPlaylist', { id: p.id });
          },
        })
      }
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}
      accessibilityRole="button"
      accessibilityLabel="Nouvelle playlist vidéo">
      <View style={[styles.emptyThumb, { backgroundColor: colors.fill }]}>
        <Icon name="add" size={30} color={colors.accent} />
      </View>
      <Text variant="body" tone="accent">
        Nouvelle playlist…
      </Text>
    </Pressable>
  );
}

export function VideoPlaylistScreen() {
  const { params } = useRoute<RouteProp<SharedStackParams, 'VideoPlaylist'>>();
  const navigation = useAppNavigation();
  const { colors } = useTheme();
  const playlist = useVideoPlaylists((s) => s.playlists.find((p) => p.id === params.id));
  const videosById = useVideos((s) => s.byId);
  const { byKey } = useSeriesIndex();
  const resolved = useMemo(() => (playlist ? resolvePlaylist(playlist, byKey, videosById) : []), [playlist, byKey, videosById]);
  const ids = useMemo(() => playlistVideoIds(resolved), [resolved]);

  if (!playlist) {
    return (
      <ScrollScreen title="Playlist" back largeTitle={false}>
        <EmptyState icon="film-outline" title="Playlist introuvable" message="Elle a peut-être été supprimée." />
      </ScrollScreen>
    );
  }
  const total = ids.reduce((sum, id) => sum + (videosById[id]?.durationSec ?? 0), 0);
  const count = playlist.items.length;
  return (
    <ScrollScreen
      title={playlist.name}
      back
      subtitle={[describePlaylist(resolved), total ? formatDuration(total) : null].filter(Boolean).join(' · ')}
      titleRight={<HeaderButton icon="ellipsis-horizontal" label="Options de la playlist" onPress={() => useUi.getState().openVideoPlaylistMenu(playlist.id)} />}>
      {ids.length ? (
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              tap();
              useVideoPlayer.getState().open(ids[0], ids);
            }}
            style={[styles.play, { backgroundColor: colors.accent }]}
            accessibilityRole="button"
            accessibilityLabel="Lire la playlist">
            <Icon name="play" size={18} color={colors.onAccent} />
            <Text variant="headline" color={colors.onAccent}>
              Lire
            </Text>
          </Pressable>
        </View>
      ) : null}
      {resolved.length ? (
        resolved.map((it) =>
          it.kind === 'series' ? (
            <SeriesRow key={`s:${it.series.key}`} series={it.series} playlist={{ playlistId: playlist.id, index: it.index, count }} onPress={() => navigation.push('VideoSeries', { key: it.series.key })} />
          ) : (
            <VideoRow key={`v:${it.video.id}`} video={it.video} list={ids} playlist={{ playlistId: playlist.id, index: it.index, count }} />
          ),
        )
      ) : (
        <EmptyState icon="albums-outline" title="Playlist vide" message="Appui long (ou « ⋮ ») sur une série ou une vidéo, puis « Ajouter à une playlist vidéo »." />
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: GUTTER, paddingVertical: 8 },
  emptyThumb: { width: 96, height: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  more: { paddingLeft: 4, paddingVertical: 8 },
  header: { paddingHorizontal: GUTTER, paddingBottom: 8 },
  play: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: radius.lg, paddingHorizontal: 16 },
});
