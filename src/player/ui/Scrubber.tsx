import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { formatDuration } from '../../library/text';
import { Text } from '../../ui/Text';

type Props = {
  position: number;
  duration: number;
  onSeek: (sec: number) => void;
  color: string;
  trackColor: string;
  textColor: string;
};

/** Barre de progression interactive : se glisse ou se touche, s'épaissit pendant le geste. */
export function Scrubber({ position, duration, onSeek, color, trackColor, textColor }: Props) {
  const [width, setWidth] = useState(0);
  const [dragLabel, setDragLabel] = useState<number | null>(null);
  const progress = useSharedValue(0);
  const active = useSharedValue(0);
  const dragging = useSharedValue(false);

  useEffect(() => {
    if (!dragging.get()) progress.set(duration > 0 ? Math.min(1, position / duration) : 0);
  }, [position, duration, progress, dragging]);

  const commit = (ratio: number) => {
    setDragLabel(null);
    onSeek(ratio * duration);
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      dragging.set(true);
      active.set(withTiming(1, { duration: 120 }));
      if (width > 0) progress.set(Math.min(1, Math.max(0, e.x / width)));
      runOnJS(setDragLabel)(progress.get() * duration);
    })
    .onUpdate((e) => {
      if (width > 0) progress.set(Math.min(1, Math.max(0, e.x / width)));
      runOnJS(setDragLabel)(progress.get() * duration);
    })
    .onFinalize(() => {
      if (!dragging.get()) return;
      dragging.set(false);
      active.set(withTiming(0, { duration: 160 }));
      runOnJS(commit)(progress.get());
    });

  const fill = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
  const bar = useAnimatedStyle(() => ({ height: 5 + active.get() * 5, borderRadius: 4 }));

  const shown = dragLabel ?? position;
  return (
    <View>
      <GestureDetector gesture={pan}>
        <View style={styles.hit} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="adjustable" accessibilityLabel="Position de lecture" accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(position), text: formatDuration(position) }}>
          <Animated.View style={[styles.track, { backgroundColor: trackColor }, bar]}>
            <Animated.View style={[styles.fill, { backgroundColor: color }, fill]} />
          </Animated.View>
        </View>
      </GestureDetector>
      <View style={styles.times}>
        <Text variant="caption" color={textColor}>
          {formatDuration(shown)}
        </Text>
        <Text variant="caption" color={textColor}>
          -{formatDuration(Math.max(0, duration - shown))}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 28, justifyContent: 'center' },
  track: { width: '100%', overflow: 'hidden' },
  fill: { height: '100%' },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
});
