import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '../library/trackFromAsset';
import type { Track } from '../types';
import type { Palette } from './theme';

type Props = {
  track: Track;
  active: boolean;
  favorite: boolean;
  palette: Palette;
  onPress: (track: Track) => void;
  onToggleFavorite: (id: string) => void;
};

function TrackRowBase({ track, active, favorite, palette, onPress, onToggleFavorite }: Props) {
  const subtitle = [track.artist, formatDuration(track.durationSec)].filter(Boolean).join(' · ');
  return (
    <View style={[styles.row, { borderBottomColor: palette.border }]}>
      <Pressable
        style={styles.main}
        onPress={() => onPress(track)}
        accessibilityRole="button"
        accessibilityLabel={`Lire ${track.title}`}>
        <Text numberOfLines={1} style={[styles.title, { color: active ? palette.accent : palette.text }]}>
          {track.title}
        </Text>
        <Text numberOfLines={1} style={[styles.subtitle, { color: palette.muted }]}>
          {subtitle}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onToggleFavorite(track.id)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={favorite ? `Retirer ${track.title} des favoris` : `Ajouter ${track.title} aux favoris`}
        accessibilityState={{ selected: favorite }}>
        <Text style={[styles.star, { color: favorite ? palette.accent : palette.muted }]}>
          {favorite ? '★' : '☆'}
        </Text>
      </Pressable>
    </View>
  );
}

export const TrackRow = memo(TrackRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  main: { flex: 1, marginRight: 12 },
  title: { fontSize: 16, fontWeight: '500' },
  subtitle: { fontSize: 13, marginTop: 2 },
  star: { fontSize: 22 },
});
