import { Pressable, StyleSheet, View } from 'react-native';

import { tap } from '../ui/haptics';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, useTheme } from '../ui/theme';

export type LibrarySection = 'music' | 'videos';

const OPTIONS: { key: LibrarySection; label: string; icon: IconName }[] = [
  { key: 'music', label: 'Musique', icon: 'musical-notes' },
  { key: 'videos', label: 'Vidéos', icon: 'film' },
];

/** Sélecteur horizontal Musique | Vidéos en tête de la Bibliothèque. */
export function MediaSwitcher({ value, onChange }: { value: LibrarySection; onChange: (v: LibrarySection) => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: colors.fill }]} accessibilityRole="radiogroup" accessibilityLabel="Contenu de la bibliothèque">
      {OPTIONS.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              if (on) return;
              tap('selection');
              onChange(o.key);
            }}
            style={[styles.segment, on && [styles.segmentOn, { backgroundColor: colors.card }]]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}>
            <Icon name={o.icon} size={16} color={on ? colors.text : colors.secondaryText} />
            <Text variant="subhead" weight={on ? 'semibold' : 'medium'} color={on ? colors.text : colors.secondaryText}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', marginHorizontal: GUTTER, marginBottom: 12, padding: 3, borderRadius: 12 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 9 },
  segmentOn: { boxShadow: '0px 1px 4px rgba(0,0,0,0.12)' },
});
