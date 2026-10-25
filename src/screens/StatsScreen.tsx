import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Artwork } from '../components/Artwork';
import { Chips, EmptyState, SectionHeader } from '../components/Blocks';
import { PressableScale } from '../components/PressableScale';
import { ScrollScreen } from '../components/Screen';
import { formatListening, summarize, type Ranked, type StatsPeriod } from '../library/listeningStats';
import { pluralize } from '../library/text';
import { useAppNavigation } from '../navigation/ref';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useStats } from '../store/stats';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';
import { useNow } from '../ui/useNow';

const PERIODS: { key: StatsPeriod; label: string }[] = [
  { key: 'week', label: '7 jours' },
  { key: 'month', label: '30 jours' },
  { key: 'year', label: 'Cette année' },
];

export function Tile({ value, label }: { value: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.card }]}>
      <Text variant="title3" weight="bold" numberOfLines={1}>
        {value}
      </Text>
      <Text variant="footnote" tone="secondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function RankList<T>({ items, title, subtitle, onPress, art }: { items: Ranked<T>[]; title: (x: T) => string; subtitle?: (x: T) => string; onPress?: (x: T) => void; art?: (x: T) => React.ReactNode }) {
  const { colors } = useTheme();
  const max = items[0]?.plays ?? 1;
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      {items.map(({ item, plays }, i) => (
        <PressableScale key={`${title(item)}-${i}`} disabled={!onPress} onPress={() => onPress?.(item)} scaleTo={0.98} style={styles.rankRow} accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={`${i + 1}. ${title(item)}, ${pluralize(plays, 'écoute')}`}>
          <Text variant="subhead" tone="secondary" style={styles.rankNumber}>
            {i + 1}
          </Text>
          {art ? art(item) : null}
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.rankText}>
              <Text variant="callout" weight="medium" numberOfLines={1} style={{ flex: 1 }}>
                {title(item)}
              </Text>
              <Text variant="footnote" tone="secondary">
                {pluralize(plays, 'écoute')}
              </Text>
            </View>
            {subtitle ? (
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                {subtitle(item)}
              </Text>
            ) : null}
            <View style={[styles.bar, { backgroundColor: colors.fill }]}>
              <View style={[styles.barFill, { width: `${(plays / max) * 100}%`, backgroundColor: colors.text }]} />
            </View>
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

export function HoursChart({ hours, peak, verb = 'écoutez' }: { hours: number[]; peak: number | null; verb?: string }) {
  const { colors } = useTheme();
  const max = Math.max(...hours, 1);
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]} accessibilityLabel={peak !== null ? `Heure la plus écoutée : ${peak} h` : undefined}>
      <View style={styles.chart}>
        {hours.map((sec, h) => (
          <View key={h} style={styles.chartCol}>
            <View style={[styles.chartBar, { height: `${Math.max(sec > 0 ? 4 : 0, (sec / max) * 100)}%`, backgroundColor: h === peak ? colors.accent : colors.tertiaryText }]} />
          </View>
        ))}
      </View>
      <View style={styles.chartLabels}>
        {['0 h', '6 h', '12 h', '18 h', '23 h'].map((l) => (
          <Text key={l} variant="caption" tone="tertiary">
            {l}
          </Text>
        ))}
      </View>
      {peak !== null ? (
        <Text variant="footnote" tone="secondary" style={{ marginTop: 8 }}>
          Vous {verb} surtout entre {peak} h et {peak + 1} h.
        </Text>
      ) : null}
    </View>
  );
}

/** Bilan d'écoute calculé sur l'appareil, à partir des écoutes enregistrées par OpenPlay. */
export function StatsScreen() {
  const navigation = useAppNavigation();
  const byId = useLibrary((s) => s.index.byId);
  const days = useStats((s) => s.days);
  const since = useStats((s) => s.since);
  const playTracks = usePlayer((s) => s.playTracks);
  const now = useNow(60_000);
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const sum = useMemo(() => summarize(days, byId, period, now), [days, byId, period, now]);
  const empty = sum.totalSec < 60 && sum.plays === 0;

  return (
    <ScrollScreen title="Bilan d’écoute" back subtitle={since ? `Depuis le ${new Date(since).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : undefined}>
      <Chips options={PERIODS} value={period} onChange={setPeriod} />
      {empty ? (
        <EmptyState icon="stats-chart-outline" title="Pas encore de bilan" message="Écoutez de la musique : le temps d’écoute et vos titres préférés apparaîtront ici. Seules les écoutes faites dans OpenPlay depuis la version 2.1 sont connues." />
      ) : (
        <>
          <View style={styles.tiles}>
            <Tile value={formatListening(sum.totalSec)} label="Temps d’écoute" />
            <Tile value={String(sum.plays)} label={sum.plays > 1 ? 'Écoutes' : 'Écoute'} />
          </View>
          <View style={styles.tiles}>
            <Tile value={String(sum.distinctTracks)} label={sum.distinctTracks > 1 ? 'Titres différents' : 'Titre différent'} />
            <Tile value={String(sum.activeDays)} label={sum.activeDays > 1 ? 'Jours d’écoute' : 'Jour d’écoute'} />
          </View>

          {sum.topTracks.length ? (
            <>
              <SectionHeader title="Titres les plus écoutés" />
              <RankList
                items={sum.topTracks}
                title={(t) => t.title}
                subtitle={(t) => t.artist}
                art={(t) => <Artwork track={t} size={44} rounded={10} />}
                onPress={(t) => playTracks(sum.topTracks.map((x) => x.item.id), sum.topTracks.findIndex((x) => x.item.id === t.id), { label: 'Bilan d’écoute' })}
              />
            </>
          ) : null}

          {sum.topArtists.length ? (
            <>
              <SectionHeader title="Artistes" />
              <RankList items={sum.topArtists} title={(a) => a} onPress={(a) => navigation.navigate('Artist', { id: a.toLowerCase() })} />
            </>
          ) : null}

          {sum.topAlbums.length ? (
            <>
              <SectionHeader title="Albums" />
              <RankList
                items={sum.topAlbums}
                title={(a) => a.title}
                subtitle={(a) => a.artist}
                art={(a) => <Artwork track={a.track} size={44} rounded={10} />}
                onPress={(a) => navigation.navigate('Album', { id: a.track.albumId })}
              />
            </>
          ) : null}

          {sum.topGenres.length ? (
            <>
              <SectionHeader title="Genres" />
              <RankList items={sum.topGenres} title={(g) => g} />
            </>
          ) : null}

          <SectionHeader title="Heures d’écoute" />
          <HoursChart hours={sum.hours} peak={sum.peakHour} />
        </>
      )}
      <Text variant="footnote" tone="secondary" style={styles.footer}>
        Calculé sur cet appareil ; rien n’est envoyé. Une écoute compte après 30 s de lecture effective ; le temps d’écoute tient compte de la vitesse de lecture.
      </Text>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 12, paddingHorizontal: GUTTER, marginTop: 12 },
  tile: { flex: 1, padding: 14, borderRadius: radius.lg, gap: 2 },
  card: { marginHorizontal: GUTTER, borderRadius: radius.lg, padding: 14, gap: 12 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankNumber: { width: 18, textAlign: 'center', fontVariant: ['tabular-nums'] },
  rankText: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 96, gap: 3 },
  chartCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  chartBar: { borderRadius: 2, width: '100%' },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  footer: { paddingHorizontal: GUTTER, paddingTop: 20 },
});
