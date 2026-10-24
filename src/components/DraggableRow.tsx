import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { tap } from '../ui/haptics';
import { Icon } from '../ui/Icon';

type Props = {
  index: number;
  count: number;
  rowHeight: number;
  onMove: (from: number, to: number) => void;
  handleColor: string;
  children: ReactNode;
};

/**
 * Ligne réordonnable : on fait glisser la poignée « ≡ » ; la position d'arrivée est calculée
 * au relâchement à partir du déplacement vertical.
 */
export function DraggableRow({ index, count, rowHeight, onMove, handleColor, children }: Props) {
  const dy = useSharedValue(0);
  const lifted = useSharedValue(0);

  const finish = (offset: number) => {
    const to = Math.max(0, Math.min(count - 1, index + Math.round(offset / rowHeight)));
    if (to !== index) {
      tap('selection');
      onMove(index, to);
    }
  };

  const pan = Gesture.Pan()
    .activateAfterLongPress(120)
    .onStart(() => {
      lifted.set(withSpring(1));
    })
    .onUpdate((e) => {
      dy.set(e.translationY);
    })
    .onEnd((e) => {
      runOnJS(finish)(e.translationY);
    })
    .onFinalize(() => {
      dy.set(0);
      lifted.set(withSpring(0));
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: dy.get() }, { scale: 1 + lifted.get() * 0.02 }],
    zIndex: lifted.get() > 0 ? 10 : 0,
    shadowOpacity: lifted.get() * 0.25,
    elevation: lifted.get() * 8,
  }));

  return (
    <Animated.View style={[styles.row, style]}>
      <View style={{ flex: 1 }}>{children}</View>
      <GestureDetector gesture={pan}>
        <View style={styles.handle} accessibilityLabel="Maintenir et faire glisser pour réordonner">
          <Icon name="reorder-three" size={26} color={handleColor} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  handle: { paddingHorizontal: 14, paddingVertical: 10 },
});
