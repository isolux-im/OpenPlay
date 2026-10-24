import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '../components/Artwork';
import { PressableScale } from '../components/PressableScale';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { tap } from '../ui/haptics';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';

const TABS: Record<string, { label: string; icon: IconName; activeIcon: IconName }> = {
  HomeTab: { label: 'Accueil', icon: 'home-outline', activeIcon: 'home' },
  LibraryTab: { label: 'Bibliothèque', icon: 'library-outline', activeIcon: 'library' },
  PlaylistsTab: { label: 'Playlists', icon: 'musical-notes-outline', activeIcon: 'musical-notes' },
  SearchTab: { label: 'Recherche', icon: 'search-outline', activeIcon: 'search' },
  SettingsTab: { label: 'Paramètres', icon: 'settings-outline', activeIcon: 'settings' },
};

function Chrome({ radius = 0 }: { radius?: number }) {
  const { colors, dark } = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none">
      {Platform.OS !== 'web' ? <BlurView intensity={70} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} /> : null}
      {/* Sans flou (web), le fond est opaque pour rester lisible. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'web' ? (dark ? '#18181A' : '#F9F9FB') : colors.chrome }]} />
    </View>
  );
}

export function MiniPlayer() {
  const { colors } = useTheme();
  const trackId = usePlayer((s) => s.queue[s.index]);
  const track = useLibrary((s) => (trackId ? s.index.byId[trackId] : undefined));
  const isPlaying = usePlayer((s) => s.isPlaying);
  const progress = usePlayer((s) => (s.durationSec > 0 ? Math.min(1, s.positionSec / s.durationSec) : 0));
  const { toggle, next, setExpanded } = usePlayer.getState();
  const progressStyle = useAnimatedStyle(() => ({ width: `${progress * 100}%` }), [progress]);

  if (!track) return null;
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOutDown} style={[styles.miniWrap, { shadowColor: colors.shadow }]}>
      <PressableScale scaleTo={0.98} onPress={() => setExpanded(true)} style={styles.mini} accessibilityRole="button" accessibilityLabel={`Ouvrir le lecteur : ${track.title}, ${track.artist}`}>
        <Chrome radius={14} />
        <Artwork track={track} size={42} rounded={7} />
        <View style={styles.miniText}>
          <Text variant="subhead" weight="medium" numberOfLines={1}>
            {track.title}
          </Text>
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {track.artist}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            tap();
            toggle();
          }}
          hitSlop={8}
          style={styles.miniButton}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Lecture'}>
          <Icon name={isPlaying ? 'pause' : 'play'} size={26} />
        </Pressable>
        <Pressable onPress={next} hitSlop={8} style={styles.miniButton} accessibilityRole="button" accessibilityLabel="Suivant">
          <Icon name="play-forward" size={24} />
        </Pressable>
        <View style={[styles.miniProgressTrack, { backgroundColor: colors.separator }]}>
          <Animated.View style={[styles.miniProgress, { backgroundColor: colors.accent }, progressStyle]} />
        </View>
      </PressableScale>
    </Animated.View>
  );
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container} pointerEvents="box-none">
      <MiniPlayer />
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <Chrome />
        <View style={[styles.hairline, { backgroundColor: colors.separator }]} />
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const meta = TABS[route.name];
          const color = focused ? colors.accent : colors.secondaryText;
          return (
            <Pressable
              key={route.key}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                // Sur l'onglet actif, la pile native revient d'elle-même à sa racine (événement tabPress).
                if (!focused && !event.defaultPrevented) {
                  tap('selection');
                  navigation.navigate(route.name);
                }
              }}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta?.label ?? route.name}>
              <Icon name={focused ? meta.activeIcon : meta.icon} size={25} color={color} />
              <Text variant="caption" color={color} style={styles.tabLabel}>
                {meta?.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: { flexDirection: 'row', paddingTop: 6 },
  hairline: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabLabel: { fontSize: 10.5 },
  miniWrap: { marginHorizontal: 10, marginBottom: 8, borderRadius: 14, shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  mini: { flexDirection: 'row', alignItems: 'center', height: 60, paddingHorizontal: 9, borderRadius: 14, overflow: 'hidden' },
  miniText: { flex: 1, marginHorizontal: 11 },
  miniButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  miniProgressTrack: { position: 'absolute', left: 14, right: 14, bottom: 0, height: 2, borderRadius: 1 },
  miniProgress: { height: 2, borderRadius: 1 },
});
