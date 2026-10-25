import type { ReactNode } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { MenuAnchor } from '../store/ui';
import type { Track } from '../types';
import { tap } from '../ui/haptics';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';
import { Artwork, Mosaic } from './Artwork';
import { PressableScale } from './PressableScale';

export function SectionHeader({ title, onPress, actionLabel = 'Tout voir' }: { title: string; onPress?: () => void; actionLabel?: string }) {
  const { colors } = useTheme();
  const content = (
    <View style={styles.sectionHeader}>
      <Text variant="title3" weight="bold" style={{ flex: 1 }} numberOfLines={1}>
        {title}
      </Text>
      {onPress ? (
        <View style={styles.sectionAction}>
          <Text variant="subhead" tone="secondary">
            {actionLabel}
          </Text>
          <Icon name="chevron-forward" size={15} color={colors.secondaryText} />
        </View>
      ) : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}, tout voir`}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

type CardProps = {
  title: string;
  subtitle?: string;
  track?: Pick<Track, 'id' | 'albumId'> | null;
  mosaic?: Pick<Track, 'id' | 'albumId'>[];
  circle?: boolean;
  width?: number;
  onPress: () => void;
  /** Appui long : ouvre le menu contextuel ancré au point d'appui. */
  onLongPress?: (anchor: MenuAnchor) => void;
};

export function MediaCard({ title, subtitle, track, mosaic, circle, width = 160, onPress, onLongPress }: CardProps) {
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress ? (e) => { tap(); onLongPress({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }); } : undefined}
      delayLongPress={320}
      style={{ width }}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}>
      {mosaic ? <Mosaic tracks={mosaic} size={width} rounded={radius.lg} /> : <Artwork track={track} size={width} circle={circle} rounded={radius.lg} />}
      <Text variant="subhead" weight="semibold" numberOfLines={1} style={[styles.cardTitle, circle && styles.centerText]}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="footnote" tone="secondary" numberOfLines={1} style={circle && styles.centerText}>
          {subtitle}
        </Text>
      ) : null}
    </PressableScale>
  );
}

export function Carousel<T>({ data, keyOf, render, gap = 14 }: { data: T[]; keyOf: (x: T) => string; render: (x: T) => ReactNode; gap?: number }) {
  return (
    <FlatList
      horizontal
      data={data}
      keyExtractor={keyOf}
      renderItem={({ item }) => <>{render(item)}</>}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: GUTTER, gap }}
      decelerationRate="fast"
    />
  );
}

/** Grille à deux colonnes de cartes (albums). */
export function Grid<T>({ data, keyOf, render }: { data: T[]; keyOf: (x: T) => string; render: (x: T, width: number) => ReactNode }) {
  return (
    <View style={styles.grid}>
      {data.map((x) => (
        <View key={keyOf(x)} style={styles.gridCell}>
          {render(x, 0)}
        </View>
      ))}
    </View>
  );
}

/** « Lire tout » en pilule pleine, puis boutons ronds contourés (aléatoire, ajout à une playlist). */
export function PlayShuffleButtons({ onPlay, onShuffle, onAdd, disabled, style }: { onPlay: () => void; onShuffle: () => void; onAdd?: () => void; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const round = (icon: IconName, label: string, onPress: () => void) => (
    <PressableScale haptic disabled={disabled} onPress={onPress} style={[styles.round, { borderColor: colors.separator, backgroundColor: colors.card }]} accessibilityRole="button" accessibilityLabel={label}>
      <Icon name={icon} size={20} color={colors.text} />
    </PressableScale>
  );
  return (
    <View style={[styles.pills, { opacity: disabled ? 0.5 : 1 }, style]}>
      <PressableScale haptic disabled={disabled} onPress={onPlay} style={[styles.pill, { backgroundColor: colors.accent }]} accessibilityRole="button" accessibilityLabel="Lire tout">
        <Icon name="play" size={17} color={colors.onAccent} />
        <Text variant="subhead" weight="semibold" color={colors.onAccent}>
          Lire tout
        </Text>
      </PressableScale>
      {round('shuffle-outline', 'Aléatoire', onShuffle)}
      {onAdd ? round('add-outline', 'Ajouter à une playlist', onAdd) : null}
    </View>
  );
}

/** Carte de raccourci de la bibliothèque (grille 2 × 2) : icône dans une pastille, libellé et nombre. */
export function QuickTile({ icon, label, count, onPress }: { icon: IconName; label: string; count?: number; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} scaleTo={0.97} style={[styles.quick, { backgroundColor: colors.card }]} accessibilityRole="button" accessibilityLabel={count !== undefined ? `${label}, ${count}` : label}>
      <View style={[styles.quickIcon, { backgroundColor: colors.fill }]}>
        <Icon name={icon} size={19} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="subhead" weight="semibold" numberOfLines={1}>
          {label}
        </Text>
        {count !== undefined ? (
          <Text variant="footnote" tone="secondary">
            {count}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

/** Rangée de filtres en pilules (Playlists, tri des titres). */
export function Chips<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              tap('selection');
              onChange(o.key);
            }}
            style={[styles.chip, { backgroundColor: on ? colors.accent : colors.card, borderColor: on ? colors.accent : colors.separator }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}>
            <Text variant="footnote" weight="semibold" color={on ? colors.onAccent : colors.text}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function MenuRow({ icon, label, detail, onPress, last, tint }: { icon: IconName; label: string; detail?: string; onPress: () => void; last?: boolean; tint?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.fill }}
      style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: colors.fill }]}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <View style={styles.menuIcon}>
        <Icon name={icon} size={22} color={tint ?? colors.text} />
      </View>
      <View style={[styles.menuText, { borderBottomColor: last ? 'transparent' : colors.separator }]}>
        <Text variant="body" style={{ flex: 1 }}>
          {label}
        </Text>
        {detail ? (
          <Text variant="subhead" tone="secondary" style={{ marginRight: 6 }}>
            {detail}
          </Text>
        ) : null}
        <Icon name="chevron-forward" size={18} color={colors.tertiaryText} />
      </View>
    </Pressable>
  );
}

export function EmptyState({ icon, title, message, action, style }: { icon: IconName; title: string; message?: string; action?: { label: string; onPress: () => void }; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, style]}>
      <Icon name={icon} size={52} color={colors.tertiaryText} />
      <Text variant="title3" style={styles.centerText}>
        {title}
      </Text>
      {message ? (
        <Text variant="subhead" tone="secondary" style={styles.centerText}>
          {message}
        </Text>
      ) : null}
      {action ? (
        <PressableScale onPress={action.onPress} style={[styles.cta, { backgroundColor: colors.accent }]} accessibilityRole="button">
          <Text variant="headline" color={colors.onAccent}>
            {action.label}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

export function Footnote({ children }: { children: ReactNode }) {
  return (
    <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: GUTTER, paddingTop: 14 }}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: GUTTER, marginTop: 30, marginBottom: 12 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  cardTitle: { marginTop: 8 },
  centerText: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GUTTER - 7 },
  gridCell: { width: '50%', paddingHorizontal: 7, marginBottom: 22 },
  pills: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER, marginVertical: 16 },
  pill: { flex: 1, height: 46, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  round: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  quick: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, minHeight: 72 },
  quickIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  chips: { gap: 8, paddingHorizontal: GUTTER, paddingVertical: 4 },
  chip: { paddingHorizontal: 14, height: 34, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1 },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: GUTTER, height: 52 },
  menuIcon: { width: 32 },
  menuText: { flex: 1, flexDirection: 'row', alignItems: 'center', height: '100%', borderBottomWidth: StyleSheet.hairlineWidth, marginLeft: 8, paddingRight: GUTTER },
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: 40, paddingVertical: 48 },
  cta: { marginTop: 12, paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.pill },
});
