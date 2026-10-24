import { useCallback, type ReactNode } from 'react';
import { View } from 'react-native';

import { EmptyState, PlayShuffleButtons } from '../components/Blocks';
import { ListScreen } from '../components/Screen';
import { TRACK_ROW_HEIGHT, TrackRow } from '../components/TrackRow';
import { formatTotalDuration, pluralize } from '../library/text';
import type { Track } from '../types';
import type { IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER } from '../ui/theme';
import { usePlayList } from './common';

type Props = {
  title: string;
  tracks: Track[];
  label?: string;
  backLabel?: string;
  subtitle?: string;
  headerExtra?: ReactNode;
  right?: ReactNode;
  emptyIcon?: IconName;
  emptyTitle?: string;
  emptyMessage?: string;
  rowSubtitle?: (t: Track) => string;
};

/** Écran générique « liste de morceaux » : titres, favoris, genre, dossier, playlists automatiques. */
export function TrackCollectionScreen({ title, tracks, label, backLabel, subtitle, headerExtra, right, emptyIcon = 'musical-notes', emptyTitle = 'Aucun morceau', emptyMessage, rowSubtitle }: Props) {
  const { playAt, play, shuffle } = usePlayList(tracks, label ?? title);
  const total = tracks.reduce((s, t) => s + t.durationSec, 0);
  const renderItem = useCallback(
    ({ item, index }: { item: Track; index: number }) => <TrackRow track={item} onPress={() => playAt(index)} subtitle={rowSubtitle?.(item)} />,
    [playAt, rowSubtitle],
  );

  return (
    <ListScreen
      title={title}
      back
      backLabel={backLabel}
      right={right}
      subtitle={subtitle ?? (tracks.length ? `${pluralize(tracks.length, 'morceau', 'morceaux')} · ${formatTotalDuration(total)}` : undefined)}
      data={tracks}
      keyExtractor={(t) => t.id}
      renderItem={renderItem}
      getItemLayout={(_, index) => ({ length: TRACK_ROW_HEIGHT, offset: TRACK_ROW_HEIGHT * index, index })}
      initialNumToRender={16}
      windowSize={9}
      header={
        <View>
          {headerExtra}
          {tracks.length ? <PlayShuffleButtons onPlay={play} onShuffle={shuffle} /> : null}
        </View>
      }
      ListEmptyComponent={<EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} />}
      ListFooterComponent={
        tracks.length > 12 ? (
          <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: GUTTER, paddingTop: 16 }}>
            {pluralize(tracks.length, 'morceau', 'morceaux')}, {formatTotalDuration(total)}
          </Text>
        ) : undefined
      }
    />
  );
}
