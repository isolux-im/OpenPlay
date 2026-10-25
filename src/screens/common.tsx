import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_BAR_HEIGHT } from '../components/Screen';
import { useArtwork } from '../library/artwork';
import { formatTotalDuration, pluralize } from '../library/text';
import { usePlayer } from '../store/player';
import type { Track } from '../types';
import { Text } from '../ui/Text';
import { GUTTER, useTheme } from '../ui/theme';

/** Lance une liste de morceaux à partir de l'un d'eux, avec l'étiquette de provenance. */
export function usePlayList(tracks: Track[], label: string | null) {
  const playTracks = usePlayer((s) => s.playTracks);
  const ids = tracks.map((t) => t.id);
  const key = ids.join('|');
  return {
    playAt: useCallback((i: number) => playTracks(ids, i, { label }), [key, label]), // eslint-disable-line react-hooks/exhaustive-deps
    play: useCallback(() => playTracks(ids, 0, { label }), [key, label]), // eslint-disable-line react-hooks/exhaustive-deps
    shuffle: useCallback(() => playTracks(ids, undefined, { shuffle: true, label }), [key, label]), // eslint-disable-line react-hooks/exhaustive-deps
  };
}

/** Halo discret en haut des pages de détail, tiré de la pochette. */
export function ArtworkGlow({ track, height = 420, children }: { track: Pick<Track, 'id' | 'albumId'> | null | undefined; height?: number; children?: ReactNode }) {
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const info = useArtwork(track ?? null);
  // Sans vraie pochette, halo gris neutre plutôt qu'une teinte de repli arbitraire.
  const palette = info?.colors ?? (dark ? { vibrant: '#3A3A3C', dominant: '#2C2C2E' } : { vibrant: '#D8D8DC', dominant: '#E5E5EA' });
  return (
    <View>
      <LinearGradient
        colors={[`${palette.vibrant}${dark ? '40' : '26'}`, `${palette.dominant}${dark ? '14' : '0C'}`, colors.background]}
        locations={[0, 0.55, 1]}
        style={[StyleSheet.absoluteFill, { height }]}
        pointerEvents="none"
      />
      <View style={{ height: insets.top + NAV_BAR_HEIGHT }} />
      {children}
    </View>
  );
}

type HeaderProps = {
  art: ReactNode;
  title: string;
  byline?: ReactNode;
  meta?: string;
  children?: ReactNode;
};

/** En-tête de liste de morceaux : pochette à gauche, titre et « 12 titres • 47 min » à droite, actions dessous. */
export function CollectionHeader({ art, title, byline, meta, children }: HeaderProps) {
  return (
    <View>
      <View style={styles.header}>
        <View style={styles.art}>{art}</View>
        <View style={styles.headerText}>
          <Text variant="title2" numberOfLines={3} accessibilityRole="header">
            {title}
          </Text>
          {byline}
          {meta ? (
            <Text variant="footnote" tone="secondary" style={{ marginTop: 4 }}>
              {meta}
            </Text>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

/** Durée totale au format de la maquette : « 12 titres • 47 min ». */
export function collectionMeta(tracks: Track[]) {
  const total = tracks.reduce((s, t) => s + t.durationSec, 0);
  return `${pluralize(tracks.length, 'titre')} • ${formatTotalDuration(total)}`;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 16, paddingHorizontal: GUTTER, paddingTop: 8 },
  art: { borderRadius: 16, boxShadow: '0px 10px 24px rgba(0,0,0,0.16)' },
  headerText: { flex: 1, paddingBottom: 4 },
});
