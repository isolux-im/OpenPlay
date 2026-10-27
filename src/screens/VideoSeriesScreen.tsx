import { useRoute, type RouteProp } from '@react-navigation/native';
import { Pressable, StyleSheet, View } from 'react-native';

import { EmptyState, SectionHeader } from '../components/Blocks';
import { ScrollScreen } from '../components/Screen';
import { formatDuration, pluralize } from '../library/text';
import type { SharedStackParams } from '../navigation/types';
import { useVideoHistory } from '../store/videoHistory';
import { useUi, type VideoPlaylistContext } from '../store/ui';
import { useVideoPlayer } from '../store/videoPlayer';
import { tap } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';
import { episodeLabel, episodeTitle, isWatched, seasonLabel, seriesProgress, type Series } from '../video/series';
import { useSeriesIndex } from '../video/useSeries';
import { VideoRow } from '../video/VideoList';
import { VideoThumb } from '../video/VideoThumb';

/** Progression d'une série (barre fine). */
export function SeriesBar({ watched, total }: { watched: number; total: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: colors.fill }]}>
      <View style={[styles.barFill, { width: `${total ? (watched / total) * 100 : 0}%`, backgroundColor: colors.text }]} />
    </View>
  );
}

/** Ligne de série : vignette de l'épisode à regarder, nom, épisodes vus ; appui long : menu de la série. */
export function SeriesRow({ series, onPress, playlist }: { series: Series; onPress: () => void; playlist?: VideoPlaylistContext }) {
  const { colors } = useTheme();
  const history = useVideoHistory((s) => s.entries);
  const openSeriesMenu = useUi((s) => s.openSeriesMenu);
  const p = seriesProgress(series, history);
  const cover = p.next ?? series.episodes[0];
  return (
    <Pressable
      onPress={onPress}
      onLongPress={(e) => {
        tap();
        openSeriesMenu(series.key, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }, playlist);
      }}
      delayLongPress={320}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}
      accessibilityRole="button"
      accessibilityLabel={`Série ${series.name}, ${pluralize(p.total, 'épisode')}, ${p.watched} vus`}>
      <VideoThumb video={cover} width={128} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="callout" weight="semibold" numberOfLines={2}>
          {series.name}
        </Text>
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {[series.seasons.length > 1 ? pluralize(series.seasons.length, 'saison') : null, pluralize(p.total, 'épisode'), p.finished ? 'terminée' : p.watched ? `${p.watched} vus` : null].filter(Boolean).join(' · ')}
        </Text>
        {p.watched > 0 ? <SeriesBar watched={p.watched} total={p.total} /> : null}
      </View>
      <Pressable
        onPress={(e) => {
          tap();
          openSeriesMenu(series.key, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }, playlist);
        }}
        hitSlop={10}
        style={styles.more}
        accessibilityRole="button"
        accessibilityLabel={`Options pour la série ${series.name}`}>
        <Icon name="ellipsis-vertical" size={18} color={colors.secondaryText} />
      </Pressable>
    </Pressable>
  );
}

export function VideoSeriesScreen() {
  const { params } = useRoute<RouteProp<SharedStackParams, 'VideoSeries'>>();
  const series = useSeriesIndex().byKey[params.key];
  const history = useVideoHistory((s) => s.entries);
  const { colors } = useTheme();
  if (!series) {
    return (
      <ScrollScreen title="Série" back largeTitle={false}>
        <EmptyState icon="tv-outline" title="Série introuvable" message="Les épisodes ont peut-être été déplacés ou renommés." />
      </ScrollScreen>
    );
  }
  const p = seriesProgress(series, history);
  const ids = series.episodes.map((e) => e.id);
  const open = (id: string, restart = false) => {
    tap();
    useVideoPlayer.getState().open(id, ids, { restart });
  };
  const main = p.next
    ? { label: p.resumeAt > 0 ? `Reprendre ${episodeLabel(series.info[p.next.id])}` : `${p.watched ? 'Continuer' : 'Commencer'} : ${episodeLabel(series.info[p.next.id])}`, run: () => open(p.next!.id) }
    : { label: 'Revoir depuis le début', run: () => open(series.episodes[0].id, true) };

  return (
    <ScrollScreen title={series.name} back subtitle={[pluralize(p.total, 'épisode'), `${p.watched} vus`].join(' · ')}>
      <View style={styles.header}>
        <Pressable onPress={main.run} style={[styles.play, { backgroundColor: colors.accent }]} accessibilityRole="button" accessibilityLabel={main.label}>
          <Icon name="play" size={18} color={colors.onAccent} />
          <Text variant="headline" color={colors.onAccent} numberOfLines={1}>
            {main.label}
          </Text>
        </Pressable>
        {p.watched > 0 ? <SeriesBar watched={p.watched} total={p.total} /> : null}
      </View>
      {series.seasons.map((season) => (
        <View key={season}>
          {series.seasons.length > 1 ? <SectionHeader title={seasonLabel(season)} /> : null}
          {series.episodes
            .filter((e) => series.info[e.id].season === season)
            .map((e) => (
              <VideoRow
                key={e.id}
                video={e}
                list={ids}
                label={episodeLabel(series.info[e.id])}
                title={episodeTitle(e, series.info[e.id])}
                watched={isWatched(e, history)}
                subtitle={isWatched(e, history) ? `Vu · ${formatDuration(e.durationSec)}` : formatDuration(e.durationSec)}
              />
            ))}
        </View>
      ))}
      <Text variant="footnote" tone="secondary" style={styles.note}>
        Série reconnue au nom des fichiers (S01E02, 1x02, « Épisode 2 »…). À la fin d’un épisode, le suivant démarre après 10 secondes (réglable dans Paramètres › Vidéos).
      </Text>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: GUTTER, paddingVertical: 8 },
  bar: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  barFill: { height: 3 },
  header: { paddingHorizontal: GUTTER, gap: 12, paddingBottom: 8 },
  play: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: radius.lg, paddingHorizontal: 16 },
  note: { paddingHorizontal: GUTTER, paddingTop: 16 },
  more: { paddingLeft: 4, paddingVertical: 8 },
});
