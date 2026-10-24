import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

function Bar({ playing, color, delay, max }: { playing: boolean; color: string; delay: number; max: number }) {
  const h = useSharedValue(0.35);
  useEffect(() => {
    if (playing) {
      h.set(
        withRepeat(withSequence(withTiming(1, { duration: 320 + delay }), withTiming(0.25, { duration: 280 + delay })), -1, true),
      );
    } else {
      cancelAnimation(h);
      h.set(withTiming(0.35, { duration: 200 }));
    }
  }, [playing, delay, h]);
  const style = useAnimatedStyle(() => ({ height: max * h.get() }));
  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
}

/** Égaliseur animé signalant le morceau en cours. */
export function NowPlayingBars({ playing, color, size = 14 }: { playing: boolean; color: string; size?: number }) {
  return (
    <View style={[styles.row, { height: size, width: size }]} accessibilityLabel={playing ? 'En cours de lecture' : 'En pause'}>
      <Bar playing={playing} color={color} delay={0} max={size} />
      <Bar playing={playing} color={color} delay={90} max={size} />
      <Bar playing={playing} color={color} delay={40} max={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  bar: { width: 3, borderRadius: 1.5 },
});
