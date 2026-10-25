import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type FlatListProps, type ScrollViewProps } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppNavigation } from '../navigation/ref';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { BOTTOM_INSET, GUTTER, useTheme } from '../ui/theme';

export const NAV_BAR_HEIGHT = 48;

type HeaderProps = {
  title: string;
  back?: boolean;
  backLabel?: string;
  right?: ReactNode;
  /** Défilement (px) à partir duquel le petit titre apparaît dans la barre. */
  titleThreshold?: number;
};

function TopBar({ y, title, back, backLabel, right, titleThreshold = 44 }: HeaderProps & { y: SharedValue<number> }) {
  const insets = useSafeAreaInsets();
  const { colors, dark } = useTheme();
  const navigation = useAppNavigation();
  const chrome = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [titleThreshold - 24, titleThreshold], [0, 1], 'clamp') }));
  const smallTitle = useAnimatedStyle(() => ({
    opacity: interpolate(y.get(), [titleThreshold, titleThreshold + 16], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(y.get(), [titleThreshold, titleThreshold + 16], [6, 0], 'clamp') }],
  }));

  return (
    <View style={[styles.topBar, { paddingTop: insets.top, height: insets.top + NAV_BAR_HEIGHT }]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, chrome]} pointerEvents="none">
        {Platform.OS === 'web' ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.chrome }]} />
        ) : (
          <BlurView intensity={60} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.chrome, opacity: 0.6 }]} />
        <View style={[styles.hairline, { backgroundColor: colors.separator }]} />
      </Animated.View>
      <View style={styles.barRow} pointerEvents="box-none">
        <View style={styles.side}>
          {back ? (
            <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.back} accessibilityRole="button" accessibilityLabel="Retour">
              <Icon name="chevron-back" size={26} color={colors.text} />
              {backLabel ? (
                <Text variant="body" numberOfLines={1} style={styles.backLabel}>
                  {backLabel}
                </Text>
              ) : null}
            </Pressable>
          ) : null}
        </View>
        <Animated.View style={[styles.center, smallTitle]} pointerEvents="none">
          <Text variant="headline" numberOfLines={1}>
            {title}
          </Text>
        </Animated.View>
        <View style={[styles.side, styles.right]}>{right}</View>
      </View>
    </View>
  );
}

export function LargeTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.largeTitle}>
      <View style={{ flex: 1 }}>
        <Text variant="largeTitle" accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="subhead" tone="secondary" style={{ marginTop: 2 }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.titleActions}>{right}</View> : null}
    </View>
  );
}

type ScrollScreenProps = HeaderProps &
  Omit<ScrollViewProps, 'children'> & {
    children: ReactNode;
    largeTitle?: boolean;
    subtitle?: string;
    titleRight?: ReactNode;
    /** Contenu affiché sous la barre (pas de marge haute), ex. en-tête d'album. */
    fullBleed?: boolean;
    /** Fond « groupé » gris des réglages iOS. */
    grouped?: boolean;
  };

export function ScrollScreen({ title, back, backLabel, right, titleThreshold, children, largeTitle = true, subtitle, titleRight, fullBleed = false, grouped = false, contentContainerStyle, ...rest }: ScrollScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.set(e.contentOffset.y);
  });
  return (
    <View style={[styles.fill, { backgroundColor: grouped ? colors.groupedBackground : colors.background }]}>
      <Animated.ScrollView
        {...rest}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[{ paddingTop: fullBleed ? 0 : insets.top + NAV_BAR_HEIGHT, paddingBottom: BOTTOM_INSET }, contentContainerStyle]}>
        {largeTitle && !fullBleed ? <LargeTitle title={title} subtitle={subtitle} right={titleRight} /> : null}
        {children}
      </Animated.ScrollView>
      <TopBar y={y} title={title} back={back} backLabel={backLabel} right={right} titleThreshold={titleThreshold ?? (largeTitle ? 44 : 0)} />
    </View>
  );
}

type ListScreenProps<T> = HeaderProps &
  Omit<FlatListProps<T>, 'ListHeaderComponent' | 'CellRendererComponent'> & {
    largeTitle?: boolean;
    subtitle?: string;
    titleRight?: ReactNode;
    header?: ReactNode;
  };

export function ListScreen<T>({ title, back, backLabel, right, titleThreshold, largeTitle = true, subtitle, titleRight, header, contentContainerStyle, data, ...rest }: ListScreenProps<T>) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.set(e.contentOffset.y);
  });
  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <Animated.FlatList
        {...rest}
        data={data}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[{ paddingTop: insets.top + NAV_BAR_HEIGHT, paddingBottom: BOTTOM_INSET }, contentContainerStyle]}
        ListHeaderComponent={
          <>
            {largeTitle ? <LargeTitle title={title} subtitle={subtitle} right={titleRight} /> : null}
            {header}
          </>
        }
      />
      <TopBar y={y} title={title} back={back} backLabel={backLabel} right={right} titleThreshold={titleThreshold ?? (largeTitle ? 44 : 0)} />
    </View>
  );
}

/** Bouton rond discret des en-têtes (recherche, ajout, profil). */
export function HeaderButton({ icon, onPress, label }: { icon: Parameters<typeof Icon>[0]['name']; onPress: () => void; label: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.headerButton, { backgroundColor: colors.fill, opacity: pressed ? 0.6 : 1 }]}>
      <Icon name={icon} size={19} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  hairline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  barRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  right: { justifyContent: 'flex-end', paddingRight: 8, gap: 10 },
  center: { flex: 2, alignItems: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', marginLeft: -4 },
  backLabel: { marginLeft: -2, maxWidth: 120 },
  largeTitle: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: GUTTER, paddingBottom: 14, paddingTop: 4 },
  titleActions: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  headerButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
