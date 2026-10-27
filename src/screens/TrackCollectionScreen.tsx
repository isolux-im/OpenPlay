import { useCallback, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';

import { EmptyState, PlayShuffleButtons } from '../components/Blocks';
import { ListScreen } from '../components/Screen';
import { SelectButton } from '../components/SelectButton';
import { TRACK_ROW_HEIGHT, TrackRow } from '../components/TrackRow';
import { formatTotalDuration, pluralize } from '../library/text';
import { useUi } from '../store/ui';
import type { Track } from '../types';
import type { IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER } from '../ui/theme';
import { collectionMeta, usePlayList } from './common';
import { useSelectable } from '../store/selection';

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
  /** Valeur de tri pour l'index A–Z (liste déjà triée sur cette valeur). */
  alphabetKey?: (t: Track) => string;
};

/** Écran générique « liste de morceaux » : titres, favoris, genre, dossier, playlists automatiques. */
export function TrackCollectionScreen({ title, tracks, label, backLabel, subtitle, headerExtra, right, emptyIcon = 'musical-notes', emptyTitle = 'Aucun morceau', emptyMessage, rowSubtitle, alphabetKey }: Props) {
  const { playAt, play, shuffle } = usePlayList(tracks, label ?? title);
  const total = tracks.reduce((s, t) => s + t.durationSec, 0);
  const alphabet = useMemo(() => (alphabetKey ? { keys: tracks.map(alphabetKey), rowHeight: TRACK_ROW_HEIGHT } : undefined), [tracks, alphabetKey]);
  const openPicker = useUi((s) => s.openPlaylistPicker);
  useSelectable('audio', useMemo(() => tracks.map((t) => t.id), [tracks]));
  const renderItem = useCallback(
    ({ item, index }: { item: Track; index: number }) => <TrackRow track={item} number={index + 1} artwork showDuration onPress={() => playAt(index)} subtitle={rowSubtitle?.(item)} />,
    [playAt, rowSubtitle],
  );

  return (
    <ListScreen
      title={title}
      back
      backLabel={backLabel}
      right={right}
      titleRight={tracks.length ? <SelectButton kind="audio" /> : undefined}
      subtitle={subtitle ?? (tracks.length ? collectionMeta(tracks) : undefined)}
      data={tracks}
      alphabet={alphabet}
      keyExtractor={(t) => t.id}
      renderItem={renderItem}
      getItemLayout={(_, index) => ({ length: TRACK_ROW_HEIGHT, offset: TRACK_ROW_HEIGHT * index, index })}
      initialNumToRender={16}
      windowSize={9}
      header={
        <View>
          {headerExtra}
          {tracks.length ? <PlayShuffleButtons onPlay={play} onShuffle={shuffle} onAdd={() => openPicker(tracks.map((t) => t.id))} /> : null}
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
