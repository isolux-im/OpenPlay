import type { ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Track } from '../types';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';
import { Artwork, Mosaic } from './Artwork';
import { PressableScale } from './PressableScale';

export function SectionHeader({ title, onPress, actionLabel }: { title: string; onPress?: () => void; actionLabel?: string }) {
  const { colors } = useTheme();
  const content = (
    <View style={styles.sectionHeader}>
      <Text variant="title2">{title}</Text>
      {onPress ? <Icon name="chevron-forward" size={20} color={colors.secondaryText} /> : null}
      <View style={{ flex: 1 }} />
      {actionLabel && onPress ? <Text variant="subhead" tone="accent">{actionLabel}</Text> : null}
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
  onLongPress?: () => void;
};

export function MediaCard({ title, subtitle, track, mosaic, circle, width = 160, onPress, onLongPress }: CardProps) {
  return (
    <PressableScale onPress={onPress} onLongPress={onLongPress} style={{ width }} accessibilityRole="button" accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}>
      {mosaic ? <Mosaic tracks={mosaic} size={width} rounded={radius.md} /> : <Artwork track={track} size={width} circle={circle} rounded={radius.md} />}
      <Text variant="subhead" weight="medium" numberOfLines={1} style={[styles.cardTitle, circle && styles.centerText]}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="subhead" tone="secondary" numberOfLines={1} style={circle && styles.centerText}>
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

export function PlayShuffleButtons({ onPlay, onShuffle, disabled }: { onPlay: () => void; onShuffle: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const btn = (icon: IconName, label: string, onPress: () => void) => (
    <PressableScale
      haptic
      disabled={disabled}
      onPress={onPress}
      style={[styles.pill, { backgroundColor: colors.fill, opacity: disabled ? 0.5 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Icon name={icon} size={18} color={colors.accent} />
      <Text variant="headline" tone="accent">
        {label}
      </Text>
    </PressableScale>
  );
  return (
    <View style={styles.pills}>
      {btn('play', 'Lecture', onPlay)}
      {btn('shuffle', 'Aléatoire', onShuffle)}
    </View>
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
        <Icon name={icon} size={24} color={tint ?? colors.accent} />
      </View>
      <View style={[styles.menuText, { borderBottomColor: last ? 'transparent' : colors.separator }]}>
        <Text variant="title3" weight="regular" style={{ flex: 1 }}>
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
          <Text variant="headline" color="#FFFFFF">
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: GUTTER, marginTop: 28, marginBottom: 12 },
  cardTitle: { marginTop: 8 },
  centerText: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GUTTER - 7 },
  gridCell: { width: '50%', paddingHorizontal: 7, marginBottom: 20 },
  pills: { flexDirection: 'row', gap: 14, paddingHorizontal: GUTTER, marginVertical: 16 },
  pill: { flex: 1, height: 48, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: GUTTER, height: 52 },
  menuIcon: { width: 32 },
  menuText: { flex: 1, flexDirection: 'row', alignItems: 'center', height: '100%', borderBottomWidth: StyleSheet.hairlineWidth, marginLeft: 8, paddingRight: GUTTER },
  empty: { alignItems: 'center', gap: 10, paddingHorizontal: 40, paddingVertical: 48 },
  cta: { marginTop: 12, paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.pill },
});
