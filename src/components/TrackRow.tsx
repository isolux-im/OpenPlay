import { memo } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { formatDuration } from '../library/text';
import { usePlayer } from '../store/player';
import { useSelection } from '../store/selection';
import { useUi, type TrackMenuContext } from '../store/ui';
import { useUser } from '../store/user';
import type { Track } from '../types';
import { tap } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, useTheme } from '../ui/theme';
import { Artwork } from './Artwork';
import { NowPlayingBars } from './NowPlayingBars';

export const TRACK_ROW_HEIGHT = 64;

type Props = {
  track: Track;
  onPress: () => void;
  /** Numéro affiché en tête de ligne (vue album, liste numérotée). */
  number?: number;
  /** Vignette de pochette ; masquée par défaut quand un numéro est affiché (album). */
  artwork?: boolean;
  subtitle?: string;
  showDuration?: boolean;
  menuContext?: TrackMenuContext;
  accessory?: React.ReactNode;
};

function TrackRowBase({ track, onPress, number, artwork = number === undefined, subtitle, showDuration = false, menuContext, accessory }: Props) {
  const { colors } = useTheme();
  const isCurrent = usePlayer((s) => s.queue[s.index] === track.id);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const favorite = useUser((s) => s.favorites.includes(track.id));
  const openMenu = useUi((s) => s.openTrackMenu);
  const selecting = useSelection((s) => s.kind === 'audio');
  const checked = useSelection((s) => s.kind === 'audio' && s.ids.includes(track.id));
  const sub = subtitle ?? track.artist;

  const open = (e: GestureResponderEvent) => openMenu(track.id, menuContext, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
  const toggle = () => {
    tap('selection');
    useSelection.getState().toggle(track.id);
  };

  return (
    <Pressable
      onPress={selecting ? toggle : onPress}
      // Toucher : lecture ; appui long : sélection (le menu reste sur « ⋮ »).
      onLongPress={() => {
        if (selecting) return toggle();
        tap();
        useSelection.getState().start('audio', track.id);
      }}
      delayLongPress={320}
      android_ripple={{ color: colors.fill }}
      style={({ pressed }) => [styles.row, (pressed || checked) && { backgroundColor: colors.fill }]}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityState={selecting ? { checked } : undefined}
      accessibilityLabel={selecting ? track.title : `Lire ${track.title}, ${track.artist}`}
      accessibilityHint={selecting ? undefined : 'Appui long pour sélectionner'}>
      {number !== undefined ? (
        <View style={styles.number}>
          {isCurrent && !artwork ? (
            <NowPlayingBars playing={isPlaying} color={colors.accent} />
          ) : (
            <Text variant="subhead" tone="secondary" style={styles.numberText}>
              {number || '–'}
            </Text>
          )}
        </View>
      ) : null}
      {artwork ? (
        <View style={number !== undefined && styles.afterNumber}>
          <Artwork track={track} size={46} rounded={10} />
          {isCurrent ? (
            <View style={styles.overlay}>
              <NowPlayingBars playing={isPlaying} color="#FFFFFF" />
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.text}>
        <View style={{ flex: 1 }}>
          <Text variant="callout" weight="medium" numberOfLines={1} color={isCurrent ? colors.accent : undefined}>
            {track.title}
          </Text>
          {sub ? (
            <View style={styles.subRow}>
              {favorite ? <Icon name="heart" size={11} color={colors.secondaryText} /> : null}
              <Text variant="footnote" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
                {sub}
              </Text>
            </View>
          ) : null}
        </View>
        {showDuration ? (
          <Text variant="footnote" tone="secondary" style={styles.duration}>
            {formatDuration(track.durationSec)}
          </Text>
        ) : null}
        {selecting ? (
          <View style={styles.more}>
            <Icon name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={checked ? colors.accent : colors.tertiaryText} />
          </View>
        ) : accessory ?? (
          <Pressable onPress={open} hitSlop={10} style={styles.more} accessibilityRole="button" accessibilityLabel={`Options pour ${track.title}`}>
            <Icon name="ellipsis-vertical" size={18} color={colors.secondaryText} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

export const TrackRow = memo(TrackRowBase);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: GUTTER, height: TRACK_ROW_HEIGHT },
  number: { width: 22, alignItems: 'center' },
  numberText: { fontVariant: ['tabular-nums'] },
  afterNumber: { marginLeft: 10 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 14, height: '100%', paddingRight: GUTTER - 8 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  duration: { marginLeft: 8, fontVariant: ['tabular-nums'] },
  more: { paddingLeft: 10, paddingRight: 4, paddingVertical: 8 },
});
