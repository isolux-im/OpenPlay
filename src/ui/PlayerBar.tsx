import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '../library/trackFromAsset';
import type { Player } from '../player/usePlayer';
import type { Palette } from './theme';

// ︎ force le rendu texte (et non emoji) des symboles sur Android.
const PREV = '⏮︎';
const PLAY = '▶︎';
const PAUSE = '⏸︎';
const NEXT = '⏭︎';

type Props = { player: Player; palette: Palette };

export function PlayerBar({ player, palette }: Props) {
  const { track, status } = player;
  if (!track) return null;
  const progress = status.durationSec > 0 ? Math.min(1, status.positionSec / status.durationSec) : 0;

  return (
    <View style={[styles.bar, { backgroundColor: palette.surface, borderTopColor: palette.border }]}>
      <View style={[styles.progressTrack, { backgroundColor: palette.border }]}>
        <View style={[styles.progressFill, { backgroundColor: palette.accent, flex: progress }]} />
        <View style={{ flex: 1 - progress }} />
      </View>
      <View style={styles.content}>
        <View style={styles.info}>
          <Text numberOfLines={1} style={[styles.title, { color: palette.text }]}>
            {track.title}
          </Text>
          <Text numberOfLines={1} style={[styles.meta, { color: palette.muted }]}>
            {formatDuration(status.positionSec)} / {formatDuration(status.durationSec || track.durationSec)}
            {track.artist ? ` · ${track.artist}` : ''}
          </Text>
        </View>
        <ControlButton label="Piste précédente" glyph={PREV} palette={palette} onPress={player.previous} />
        <ControlButton
          label={status.playing ? 'Pause' : 'Lecture'}
          glyph={status.playing ? PAUSE : PLAY}
          palette={palette}
          onPress={player.toggle}
          primary
        />
        <ControlButton label="Piste suivante" glyph={NEXT} palette={palette} onPress={player.next} />
      </View>
    </View>
  );
}

type ControlProps = {
  label: string;
  glyph: string;
  palette: Palette;
  onPress: () => void;
  primary?: boolean;
};

function ControlButton({ label, glyph, palette, onPress, primary }: ControlProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.control, primary && { backgroundColor: palette.accent }]}>
      <Text style={[styles.glyph, { color: primary ? palette.onAccent : palette.text }]}>{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth },
  progressTrack: { height: 2, flexDirection: 'row' },
  progressFill: { height: 2 },
  content: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  info: { flex: 1, marginRight: 8 },
  title: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  control: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  glyph: { fontSize: 20 },
});
