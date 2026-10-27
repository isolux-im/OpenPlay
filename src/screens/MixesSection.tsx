import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Mosaic } from '../components/Artwork';
import { Carousel, SectionHeader } from '../components/Blocks';
import { PressableScale } from '../components/PressableScale';
import { favoriteGenre, mostPlayed, uniqueDiscover } from '../library/selectors';
import { pluralize } from '../library/text';
import { shuffled } from '../player/queue';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUser } from '../store/user';
import type { Track } from '../types';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { radius, useTheme } from '../ui/theme';
import { useDiscover } from './DiscoverScreen';

type Mix = { key: string; title: string; subtitle: string; icon: IconName; tracks: Track[] };

function MixCard({ mix }: { mix: Mix }) {
  const { colors } = useTheme();
  const playTracks = usePlayer((s) => s.playTracks);
  return (
    <PressableScale
      haptic
      onPress={() => playTracks(mix.tracks.map((t) => t.id), 0, { label: mix.title })}
      style={[styles.mix, { backgroundColor: colors.card }]}
      accessibilityRole="button"
      accessibilityLabel={`Lancer ${mix.title}`}>
      <Mosaic tracks={mix.tracks} size={124} rounded={14} />
      <View style={styles.mixText}>
        <View style={{ flex: 1 }}>
          <Text variant="subhead" weight="semibold" numberOfLines={1}>
            {mix.title}
          </Text>
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {mix.subtitle}
          </Text>
        </View>
        <Icon name={mix.icon} size={17} color={colors.secondaryText} />
      </View>
    </PressableScale>
  );
}

/**
 * « Mix pour vous » (titres phares, genre préféré, à découvrir, mix aléatoire), autrefois sur l'Accueil :
 * désormais en tête de l'onglet Musique.
 */
export function MixesSection() {
  const index = useLibrary((s) => s.index);
  const playCounts = useUser((s) => s.playCounts);
  const discover = useDiscover();
  const mixes = useMemo<Mix[]>(() => {
    const out: Mix[] = [];
    const top = mostPlayed(playCounts, index.byId, 50);
    if (top.length >= 3) out.push({ key: 'top', title: 'Vos titres phares', subtitle: pluralize(top.length, 'morceau', 'morceaux'), icon: 'flame-outline', tracks: top });
    const genre = favoriteGenre(index, playCounts);
    if (genre) {
      const g = index.genresById[genre.toLowerCase()];
      if (g) out.push({ key: `genre-${genre}`, title: `Mix ${genre}`, subtitle: pluralize(g.trackIds.length, 'morceau', 'morceaux'), icon: 'radio-outline', tracks: shuffled(g.trackIds.map((id) => index.byId[id])) });
    }
    const u = uniqueDiscover(discover);
    const re = [...u.never, ...u.forgotten, ...u.rare].map((i) => i.track).slice(0, 60);
    if (re.length >= 3) out.push({ key: 'rediscover', title: 'À découvrir', subtitle: 'Jamais ou peu écoutés', icon: 'sparkles-outline', tracks: shuffled(re) });
    if (index.tracks.length) out.push({ key: 'shuffle', title: 'Mix aléatoire', subtitle: 'Tous vos audios', icon: 'shuffle-outline', tracks: shuffled(index.tracks).slice(0, 100) });
    return out;
  }, [index, playCounts, discover]);
  if (!mixes.length) return null;
  return (
    <>
      <SectionHeader title="Mix pour vous" />
      <Carousel data={mixes} keyOf={(m) => m.key} render={(m) => <MixCard mix={m} />} gap={12} />
    </>
  );
}

const styles = StyleSheet.create({
  mix: { width: 148, padding: 12, borderRadius: radius.xl, gap: 10 },
  mixText: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
