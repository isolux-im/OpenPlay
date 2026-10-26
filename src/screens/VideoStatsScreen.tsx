import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chips, EmptyState, SectionHeader } from '../components/Blocks';
import { ScrollScreen } from '../components/Screen';
import { formatListening, type StatsPeriod } from '../library/listeningStats';
import { pluralize } from '../library/text';
import { useAppNavigation } from '../navigation/ref';
import { useVideoHistory } from '../store/videoHistory';
import { useVideoPlayer } from '../store/videoPlayer';
import { useVideoStats } from '../store/videoStats';
import { useVideos } from '../store/videos';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';
import { useNow } from '../ui/useNow';
import { episodeLabel, seriesProgress } from '../video/series';
import { useSeriesIndex } from '../video/useSeries';
import { VideoThumb } from '../video/VideoThumb';
import { summarizeWatching } from '../video/watchStats';
import { SeriesBar } from './VideoSeriesScreen';
import { HoursChart, Tile } from './StatsScreen';

const PERIODS: { key: StatsPeriod; label: string }[] = [
  { key: 'week', label: '7 jours' },
  { key: 'month', label: '30 jours' },
  { key: 'year', label: 'Cette année' },
];

/** Bilan de visionnage, calculé sur l'appareil à partir des vidéos regardées dans OpenPlay. */
export function VideoStatsScreen() {
  const navigation = useAppNavigation();
  const { colors } = useTheme();
  const days = useVideoStats((s) => s.days);
  const since = useVideoStats((s) => s.since);
  const byId = useVideos((s) => s.byId);
  const history = useVideoHistory((s) => s.entries);
  const series = useSeriesIndex().list;
  const now = useNow(60_000);
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const sum = useMemo(() => summarizeWatching(days, byId, period, now), [days, byId, period, now]);
  const progress = useMemo(() => series.map((s) => ({ series: s, p: seriesProgress(s, history) })), [series, history]);
  const inProgress = progress.filter((x) => x.p.watched > 0 && !x.p.finished).sort((a, b) => b.p.lastWatchedAt - a.p.lastWatchedAt);
  const done = progress.filter((x) => x.p.finished);
  const empty = sum.totalSec < 60 && sum.finished === 0;
  const max = sum.top[0]?.sec ?? 1;

  return (
    <ScrollScreen title="Bilan de visionnage" back subtitle={since ? `Depuis le ${new Date(since).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : undefined}>
      <Chips options={PERIODS} value={period} onChange={setPeriod} />
      {empty ? (
        <EmptyState icon="film-outline" title="Pas encore de bilan" message="Regardez des vidéos dans OpenPlay : le temps passé, les vidéos terminées et vos séries apparaîtront ici." />
      ) : (
        <>
          <View style={styles.tiles}>
            <Tile value={formatListening(sum.totalSec)} label="Temps de visionnage" />
            <Tile value={String(sum.distinct)} label={sum.distinct > 1 ? 'Vidéos regardées' : 'Vidéo regardée'} />
          </View>
          <View style={styles.tiles}>
            <Tile value={String(sum.finished)} label={sum.finished > 1 ? 'Vidéos terminées' : 'Vidéo terminée'} />
            <Tile value={String(sum.activeDays)} label={sum.activeDays > 1 ? 'Jours de visionnage' : 'Jour de visionnage'} />
          </View>

          {sum.top.length ? (
            <>
              <SectionHeader title="Les plus regardées" />
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                {sum.top.map(({ video, sec }, i) => (
                  <Pressable
                    key={video.id}
                    onPress={() => useVideoPlayer.getState().open(video.id, sum.top.map((t) => t.video.id))}
                    style={styles.rank}
                    accessibilityRole="button"
                    accessibilityLabel={`${i + 1}. ${video.title}, ${formatListening(sec)}`}>
                    <Text variant="subhead" tone="secondary" style={styles.rankNumber}>
                      {i + 1}
                    </Text>
                    <VideoThumb video={video} width={72} style={{ borderRadius: 8 }} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text variant="callout" weight="medium" numberOfLines={1}>
                        {video.title}
                      </Text>
                      <Text variant="footnote" tone="secondary">
                        {formatListening(sec)}
                      </Text>
                      <View style={[styles.bar, { backgroundColor: colors.fill }]}>
                        <View style={[styles.bar, { width: `${(sec / max) * 100}%`, backgroundColor: colors.text }]} />
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <SectionHeader title="Heures de visionnage" />
          <HoursChart hours={sum.hours} peak={sum.peakHour} verb="regardez" />
        </>
      )}

      {inProgress.length ? (
        <>
          <SectionHeader title="Séries en cours" />
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {inProgress.map(({ series: s, p }) => (
              <Pressable key={s.key} onPress={() => navigation.push('VideoSeries', { key: s.key })} style={{ gap: 4 }} accessibilityRole="button" accessibilityLabel={`${s.name}, ${p.watched} épisodes vus sur ${p.total}`}>
                <View style={styles.seriesLine}>
                  <Text variant="callout" weight="medium" numberOfLines={1} style={{ flex: 1 }}>
                    {s.name}
                  </Text>
                  <Text variant="footnote" tone="secondary">
                    {p.watched}/{p.total}
                  </Text>
                </View>
                {p.next ? (
                  <Text variant="footnote" tone="secondary" numberOfLines={1}>
                    À suivre : {episodeLabel(s.info[p.next.id])}
                  </Text>
                ) : null}
                <SeriesBar watched={p.watched} total={p.total} />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {done.length ? (
        <>
          <SectionHeader title={`Séries terminées (${done.length})`} />
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {done.map(({ series: s, p }) => (
              <Pressable key={s.key} onPress={() => navigation.push('VideoSeries', { key: s.key })} style={styles.seriesLine} accessibilityRole="button">
                <Text variant="callout" weight="medium" numberOfLines={1} style={{ flex: 1 }}>
                  {s.name}
                </Text>
                <Text variant="footnote" tone="secondary">
                  {pluralize(p.total, 'épisode')}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <Text variant="footnote" tone="secondary" style={styles.footer}>
        Calculé sur cet appareil ; rien n’est envoyé. Le temps compte la lecture effective (vitesse comprise) ; une vidéo est terminée à 95 % ou dans ses 15 dernières secondes.
      </Text>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 12, paddingHorizontal: GUTTER, marginTop: 12 },
  card: { marginHorizontal: GUTTER, borderRadius: radius.lg, padding: 14, gap: 14 },
  rank: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankNumber: { width: 18, textAlign: 'center', fontVariant: ['tabular-nums'] },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  seriesLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  footer: { paddingHorizontal: GUTTER, paddingTop: 20 },
});
