import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tap } from '../ui/haptics';
import { Text } from '../ui/Text';
import { BOTTOM_INSET, useTheme } from '../ui/theme';

type Props = { letters: string[]; topOffset: number; onSelect: (letter: string) => void };

/** Barre A–Z sur le bord droit : toucher ou glisser pour sauter à une lettre. */
export function AlphabetIndex({ letters, topOffset, onSelect }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const strip = useRef<ComponentRef<typeof View>>(null);
  const frame = useRef({ top: 0, height: 1 });
  const lastLetter = useRef<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  // Lettre annoncée par les lecteurs d'écran (réglage par balayage haut/bas).
  const [current, setCurrent] = useState<string | null>(null);

  const pick = (pageY: number) => {
    const { top, height } = frame.current;
    const i = Math.min(letters.length - 1, Math.max(0, Math.floor(((pageY - top) / height) * letters.length)));
    const letter = letters[i];
    if (letter === lastLetter.current) return;
    lastLetter.current = letter;
    tap('selection');
    setActive(letter);
    setCurrent(letter);
    onSelect(letter);
  };
  const release = () => {
    lastLetter.current = null;
    setActive(null);
  };
  const step = (delta: number) => {
    const i = Math.min(letters.length - 1, Math.max(0, letters.indexOf(current ?? letters[0]) + delta));
    setCurrent(letters[i]);
    onSelect(letters[i]);
  };

  return (
    <>
      <View
        ref={strip}
        style={[styles.strip, { top: topOffset + 8, bottom: BOTTOM_INSET - 30 + insets.bottom }]}
        onLayout={() => strip.current?.measureInWindow((_x, y, _w, h) => (frame.current = { top: y, height: Math.max(1, h) }))}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e: GestureResponderEvent) => pick(e.nativeEvent.pageY)}
        onResponderMove={(e: GestureResponderEvent) => pick(e.nativeEvent.pageY)}
        onResponderRelease={release}
        onResponderTerminate={release}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Index alphabétique"
        accessibilityValue={{ text: current ?? letters[0] }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
        {letters.map((l) => (
          <Text key={l} variant="caption" weight="semibold" color={l === active ? colors.text : colors.secondaryText} style={styles.letter}>
            {l}
          </Text>
        ))}
      </View>
      {active ? (
        <View pointerEvents="none" style={[styles.bubble, { backgroundColor: colors.card, borderColor: colors.separator }]}>
          <Text variant="largeTitle">{active}</Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  strip: { position: 'absolute', right: 2, width: 22, alignItems: 'center', justifyContent: 'space-evenly' },
  letter: { fontSize: 11, lineHeight: 13 },
  bubble: { position: 'absolute', alignSelf: 'center', top: '42%', width: 76, height: 76, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 8px 24px rgba(0,0,0,0.16)' },
});
