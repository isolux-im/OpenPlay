import { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { Track } from '../types';
import { TrackRow } from './TrackRow';
import type { Palette } from './theme';

type Props = {
  tracks: Track[];
  currentId: string | null;
  isFavorite: (id: string) => boolean;
  palette: Palette;
  emptyMessage: string;
  onPlay: (track: Track) => void;
  onToggleFavorite: (id: string) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
};

export function TrackList({
  tracks,
  currentId,
  isFavorite,
  palette,
  emptyMessage,
  onPlay,
  onToggleFavorite,
  refreshing,
  onRefresh,
}: Props) {
  const renderItem = useCallback(
    ({ item }: { item: Track }) => (
      <TrackRow
        track={item}
        active={item.id === currentId}
        favorite={isFavorite(item.id)}
        palette={palette}
        onPress={onPlay}
        onToggleFavorite={onToggleFavorite}
      />
    ),
    [currentId, isFavorite, palette, onPlay, onToggleFavorite],
  );

  return (
    <FlatList
      data={tracks}
      keyExtractor={(t) => t.id}
      renderItem={renderItem}
      refreshing={refreshing}
      onRefresh={onRefresh}
      initialNumToRender={20}
      windowSize={11}
      contentContainerStyle={tracks.length === 0 ? styles.emptyContainer : undefined}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: palette.muted }]}>{emptyMessage}</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 15, textAlign: 'center' },
});
