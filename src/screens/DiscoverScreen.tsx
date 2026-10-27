import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Artwork } from '../components/Artwork';
import { Chips, EmptyState, PlayShuffleButtons } from '../components/Blocks';
import { PressableScale } from '../components/PressableScale';
import { ListScreen } from '../components/Screen';
import { discoverSections, uniqueDiscover, type DiscoverCategory, type DiscoverItem, type DiscoverSections } from '../library/selectors';
import { pluralize } from '../library/text';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { useUser } from '../store/user';
import { tap } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, useTheme } from '../ui/theme';
import { useNow } from '../ui/useNow';

type Filter = 'all' | DiscoverCategory;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'never', label: 'Jamais écoutés' },
  { key: 'forgotten', label: 'Oubliés' },
  { key: 'rare', label: 'Peu écoutés' },
];

const SECTION_TITLES: Record<DiscoverCategory, string> = {
  never: 'Jamais écoutés',
  forgotten: 'À réécouter',
  rare: 'Peu écoutés',
};

const DAY = 86_400_000;
const ROW_HEIGHT = 68;

/** Catégories « À découvrir » à jour : recalculées seulement quand la bibliothèque ou l'historique changent. */
export function useDiscover(): DiscoverSections {
  const tracks = useLibrary((s) => s.index.tracks);
  const playCounts = useUser((s) => s.playCounts);
  const lastPlayed = useUser((s) => s.lastPlayed);
  const days = useSettings((s) => s.discoverDays);
  // Résolution horaire : suffisante pour des seuils exprimés en jours.
  const now = useNow(3_600_000);
  return useMemo(() => discoverSections(tracks, playCounts, lastPlayed, now, days), [tracks, playCounts, lastPlayed, now, days]);
}

function ago(lastAt: number, now: number): string {
  const days = Math.floor((now - lastAt) / DAY);
  if (days < 1) return "aujourd'hui";
  if (days < 60) return `il y a ${pluralize(days, 'jour')}`;
  return `il y a ${Math.floor(days / 30)} mois`;
}

export function describeListening(item: DiscoverItem, now: number): string {
  if (item.category === 'never') return 'Jamais écouté dans OpenPlay';
  const when = item.lastAt ? ago(item.lastAt, now) : 'date inconnue';
  return item.category === 'rare' ? `${pluralize(item.plays, 'écoute')} · ${when}` : `Dernière écoute ${when}`;
}

type Row = { type: 'header'; key: string; title: string; count: number } | { type: 'track'; key: string; item: DiscoverItem; position: number };

function DiscoverRow({ item, now, onPlay }: { item: DiscoverItem; now: number; onPlay: () => void }) {
  const { colors } = useTheme();
  const openMenu = useUi((s) => s.openTrackMenu);
  const { track } = item;
  return (
    <Pressable
      onPress={onPlay}
      onLongPress={(e) => {
        tap();
        openMenu(track.id, {}, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
      }}
      delayLongPress={320}
      android_ripple={{ color: colors.fill }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}
      accessibilityRole="button"
      accessibilityLabel={`Lire ${track.title}, ${track.artist}. ${describeListening(item, now)}`}>
      <Artwork track={track} size={50} rounded={10} />
      <View style={styles.rowText}>
        <Text variant="callout" weight="medium" numberOfLines={1}>
          {track.title}
        </Text>
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {track.artist}
        </Text>
        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          {describeListening(item, now)}
        </Text>
      </View>
      <PressableScale haptic onPress={onPlay} style={[styles.play, { borderColor: colors.separator, backgroundColor: colors.card }]} accessibilityRole="button" accessibilityLabel={`Lire ${track.title}`}>
        <Icon name="play" size={16} color={colors.text} />
      </PressableScale>
    </Pressable>
  );
}

/**
 * « À découvrir » : faire ressortir les morceaux de la bibliothèque jamais écoutés, oubliés ou peu
 * écoutés. Entièrement hors ligne ; l'historique ne quitte pas l'appareil.
 */
export function DiscoverScreen() {
  const sections = useDiscover();
  const days = useSettings((s) => s.discoverDays);
  const playTracks = usePlayer((s) => s.playTracks);
  const now = useNow(3_600_000);
  const [filter, setFilter] = useState<Filter>('all');

  const { rows, list } = useMemo(() => {
    const view = filter === 'all' ? uniqueDiscover(sections) : sections;
    const cats: DiscoverCategory[] = filter === 'all' ? ['never', 'forgotten', 'rare'] : [filter];
    const out: Row[] = [];
    const ordered: DiscoverItem[] = [];
    for (const c of cats) {
      if (!view[c].length) continue;
      if (filter === 'all') out.push({ type: 'header', key: `h-${c}`, title: SECTION_TITLES[c], count: view[c].length });
      for (const item of view[c]) {
        out.push({ type: 'track', key: `${c}-${item.track.id}`, item, position: ordered.length });
        ordered.push(item);
      }
    }
    return { rows: out, list: ordered };
  }, [sections, filter]);

  const ids = useMemo(() => list.map((i) => i.track.id), [list]);
  const play = useCallback((position: number) => playTracks(ids, position, { label: 'À découvrir' }), [ids, playTracks]);

  const renderItem = useCallback(
    ({ item }: { item: Row }) =>
      item.type === 'header' ? (
        <View style={styles.header}>
          <Text variant="title3" weight="bold">
            {item.title}
          </Text>
          <Text variant="footnote" tone="secondary">
            {item.count}
          </Text>
        </View>
      ) : (
        <DiscoverRow item={item.item} now={now} onPlay={() => play(item.position)} />
      ),
    [now, play],
  );

  const empty: Record<Filter, string> = {
    all: 'Tout a été écouté récemment. Revenez plus tard !',
    never: 'Chaque morceau a déjà été écouté au moins une fois dans OpenPlay.',
    forgotten: `Aucun morceau sans écoute depuis ${days} jours.`,
    rare: `Aucun morceau écouté une ou deux fois il y a plus de 21 jours.`,
  };

  return (
    <ListScreen
      title="À découvrir"
      back
      subtitle="Vos audios, à redécouvrir"
      data={rows}
      keyExtractor={(r) => r.key}
      renderItem={renderItem}
      initialNumToRender={14}
      windowSize={9}
      header={
        <View>
          <Chips options={FILTERS} value={filter} onChange={setFilter} />
          {ids.length ? (
            <PlayShuffleButtons onPlay={() => play(0)} onShuffle={() => playTracks(ids, undefined, { shuffle: true, label: 'À découvrir' })} />
          ) : null}
        </View>
      }
      ListEmptyComponent={<EmptyState icon="sparkles-outline" title="Rien à découvrir" message={empty[filter]} />}
      ListFooterComponent={
        <Text variant="footnote" tone="secondary" style={styles.footer}>
          Calculé sur cet appareil à partir des écoutes enregistrées par OpenPlay (30 s de lecture effective). Les écoutes antérieures à l’installation ne sont pas connues.
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: GUTTER, paddingTop: 22, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: GUTTER, height: ROW_HEIGHT },
  rowText: { flex: 1, marginLeft: 14, gap: 1 },
  play: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  footer: { paddingHorizontal: GUTTER, paddingTop: 20 },
});
