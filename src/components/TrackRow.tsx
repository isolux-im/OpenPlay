import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatDuration } from '../library/text';
import { usePlayer } from '../store/player';
import { useUi, type TrackMenuContext } from '../store/ui';
import { useUser } from '../store/user';
import type { Track } from '../types';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, useTheme } from '../ui/theme';
import { Artwork } from './Artwork';
import { NowPlayingBars } from './NowPlayingBars';

export const TRACK_ROW_HEIGHT = 64;

type Props = {
  track: Track;
  onPress: () => void;
  /** Numéro de piste à la place de la pochette (vue album). */
  number?: number;
  subtitle?: string;
  showDuration?: boolean;
  menuContext?: TrackMenuContext;
  accessory?: React.ReactNode;
};

function TrackRowBase({ track, onPress, number, subtitle, showDuration = false, menuContext, accessory }: Props) {
  const { colors } = useTheme();
  const isCurrent = usePlayer((s) => s.queue[s.index] === track.id);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const favorite = useUser((s) => s.favorites.includes(track.id));
  const openMenu = useUi((s) => s.openTrackMenu);
  const sub = subtitle ?? track.artist;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={() => openMenu(track.id, menuContext)}
      android_ripple={{ color: colors.fill }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}
      accessibilityRole="button"
      accessibilityLabel={`Lire ${track.title}, ${track.artist}`}>
      {number !== undefined ? (
        <View style={styles.number}>
          {isCurrent ? <NowPlayingBars playing={isPlaying} color={colors.accent} /> : <Text variant="body" tone="secondary">{number || '–'}</Text>}
        </View>
      ) : (
        <View>
          <Artwork track={track} size={48} rounded={6} />
          {isCurrent ? (
            <View style={styles.overlay}>
              <NowPlayingBars playing={isPlaying} color="#FFFFFF" />
            </View>
          ) : null}
        </View>
      )}
      <View style={[styles.text, { borderBottomColor: colors.separator }]}>
        <View style={{ flex: 1 }}>
          <Text variant="body" numberOfLines={1} color={isCurrent ? colors.accent : undefined}>
            {track.title}
          </Text>
          {sub ? (
            <View style={styles.subRow}>
              {favorite ? <Icon name="heart" size={11} color={colors.accent} /> : null}
              <Text variant="subhead" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
                {sub}
              </Text>
            </View>
          ) : null}
        </View>
        {showDuration ? (
          <Text variant="subhead" tone="secondary" style={{ marginLeft: 8 }}>
            {formatDuration(track.durationSec)}
          </Text>
        ) : null}
        {accessory ?? (
          <Pressable onPress={() => openMenu(track.id, menuContext)} hitSlop={10} style={styles.more} accessibilityRole="button" accessibilityLabel={`Options pour ${track.title}`}>
            <Icon name="ellipsis-horizontal" size={20} color={colors.text} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

export const TrackRow = memo(TrackRowBase);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: GUTTER, height: TRACK_ROW_HEIGHT },
  number: { width: 28, alignItems: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 12, height: '100%', borderBottomWidth: StyleSheet.hairlineWidth, paddingRight: GUTTER - 4 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  more: { paddingLeft: 12, paddingVertical: 8 },
});
