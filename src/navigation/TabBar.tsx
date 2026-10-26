import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '../components/Artwork';
import { PressableScale } from '../components/PressableScale';
import { miniSwipeAction } from '../player/gestures';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { tap } from '../ui/haptics';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';

const TABS: Record<string, { label: string; icon: IconName; activeIcon: IconName }> = {
  HomeTab: { label: 'Accueil', icon: 'home-outline', activeIcon: 'home' },
  LibraryTab: { label: 'Bibliothèque', icon: 'library-outline', activeIcon: 'library' },
  SearchTab: { label: 'Recherche', icon: 'search-outline', activeIcon: 'search' },
  PlaylistsTab: { label: 'Playlists', icon: 'list-outline', activeIcon: 'list' },
  SettingsTab: { label: 'Paramètres', icon: 'settings-outline', activeIcon: 'settings' },
};

/** Écrans vidéo enregistrés dans toutes les piles : jamais de mini-lecteur musical. */
const VIDEO_ROUTES = new Set(['VideoFolder', 'VideoSeries', 'VideoStats']);

/**
 * Le mini-lecteur musical n'apparaît que dans Accueil et Bibliothèque › Musique (sous-écrans compris),
 * qu'un morceau soit en lecture ou en pause. Ailleurs, seule son interface est masquée : la lecture continue.
 */
export function miniPlayerVisible(tab: string | undefined, screen: string | undefined, librarySection: 'music' | 'videos'): boolean {
  if (screen && VIDEO_ROUTES.has(screen)) return false;
  if (tab === 'HomeTab') return true;
  if (tab !== 'LibraryTab') return false;
  // Racine de la Bibliothèque : dépend du sélecteur Musique | Vidéos ; sous-écrans musicaux : visibles.
  return !screen || screen === 'Library' ? librarySection === 'music' : true;
}

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

/** Dernier glissement du mini-lecteur : l'appui qui le termine n'ouvre pas le lecteur plein écran. */
let lastMiniSwipe = 0;

function markMiniSwipe() {
  lastMiniSwipe = Date.now();
}

function swipedRecently() {
  return Date.now() - lastMiniSwipe < 400;
}

export function MiniPlayer() {
  const { colors } = useTheme();
  const trackId = usePlayer((s) => s.queue[s.index]);
  const track = useLibrary((s) => (trackId ? s.index.byId[trackId] : undefined));
  const isPlaying = usePlayer((s) => s.isPlaying);
  const progress = usePlayer((s) => (s.durationSec > 0 ? Math.min(1, s.positionSec / s.durationSec) : 0));
  const { toggle, next, previous, setExpanded } = usePlayer.getState();
  const progressStyle = useAnimatedStyle(() => ({ width: `${progress * 100}%` }), [progress]);
  const dragX = useSharedValue(0);
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dragX.get() }], opacity: 1 - Math.min(0.35, Math.abs(dragX.get()) / 400) }));

  const finish = (tx: number, ty: number, vx: number, vy: number) => {
    const action = miniSwipeAction(tx, ty, vx, vy);
    if (!action) return;
    tap('selection');
    if (action === 'open') return setExpanded(true);
    // Même règle que les boutons : la file et le mode de répétition réels décident.
    const { index, queue, repeat } = usePlayer.getState();
    if (action === 'next') {
      if (index >= queue.length - 1 && repeat !== 'all') useUi.getState().showToast('Dernier morceau de la file');
      else next();
    } else previous();
  };

  const endSwipe = (tx: number, ty: number, vx: number, vy: number) => {
    markMiniSwipe();
    finish(tx, ty, vx, vy);
  };

  // Glisser horizontalement : suivant / précédent ; vers le haut : ouvrir. Un simple appui ouvre le lecteur.
  // Rappels sur le fil JavaScript : le geste marque le glissement avant que l'appui ne se termine.
  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-12, 12])
    .activeOffsetY([-12, 10_000])
    .onStart(markMiniSwipe)
    .onUpdate((e) => {
      dragX.set(Math.abs(e.translationX) > Math.abs(e.translationY) ? e.translationX * 0.6 : 0);
    })
    .onEnd((e) => endSwipe(e.translationX, e.translationY, e.velocityX, e.velocityY))
    .onFinalize(() => {
      dragX.set(withSpring(0, { damping: 18, stiffness: 220 }));
    });

  const openPlayer = () => {
    if (!swipedRecently()) setExpanded(true);
  };

  if (!track) return null;
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOutDown} style={styles.miniWrap}>
      <GestureDetector gesture={swipe}>
      <Animated.View style={dragStyle}>
      <PressableScale
        scaleTo={0.98}
        onPress={openPlayer}
        style={[styles.mini, { backgroundColor: colors.card, borderColor: colors.separator }]}
        accessibilityRole="button"
        accessibilityLabel={`Ouvrir le lecteur : ${track.title}, ${track.artist}`}
        accessibilityHint="Glisser à gauche ou à droite pour changer de morceau"
        accessibilityActions={[
          { name: 'activate', label: 'Ouvrir le lecteur' },
          { name: 'nextTrack', label: 'Morceau suivant' },
          { name: 'previousTrack', label: 'Morceau précédent' },
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'nextTrack') next();
          else if (e.nativeEvent.actionName === 'previousTrack') previous();
          else setExpanded(true);
        }}>
        <Artwork track={track} size={44} rounded={10} />
        <View style={styles.miniText}>
          <Text variant="subhead" weight="semibold" numberOfLines={1}>
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
          hitSlop={6}
          style={[styles.miniPlay, { backgroundColor: colors.accent }]}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Lecture'}>
          <Icon name={isPlaying ? 'pause' : 'play'} size={18} color={colors.onAccent} />
        </Pressable>
        <Pressable onPress={next} hitSlop={8} style={styles.miniButton} accessibilityRole="button" accessibilityLabel="Suivant">
          <Icon name="play-forward" size={22} />
        </Pressable>
        <View style={[styles.miniProgressTrack, { backgroundColor: colors.fill }]}>
          <Animated.View style={[styles.miniProgress, { backgroundColor: colors.text }, progressStyle]} />
        </View>
      </PressableScale>
      </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const librarySection = useUi((s) => s.librarySection);
  const tab = state.routes[state.index];
  const stack = tab?.state;
  const screen = stack && typeof stack.index === 'number' ? stack.routes[stack.index]?.name : undefined;
  const showMini = miniPlayerVisible(tab?.name, screen, librarySection);
  return (
    <View style={styles.container} pointerEvents="box-none">
      {showMini ? <MiniPlayer /> : null}
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <Chrome />
        <View style={[styles.hairline, { backgroundColor: colors.separator }]} />
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const meta = TABS[route.name];
          const color = focused ? colors.text : colors.secondaryText;
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
              <Icon name={focused ? meta.activeIcon : meta.icon} size={23} color={color} />
              <Text variant="caption" weight={focused ? 'bold' : 'medium'} color={color} style={styles.tabLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
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
  bar: { flexDirection: 'row', paddingTop: 8 },
  hairline: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabLabel: { fontSize: 10, marginTop: 1, paddingHorizontal: 2 },
  miniWrap: { marginHorizontal: 12, marginBottom: 10, borderRadius: 20, boxShadow: '0px 8px 24px rgba(0,0,0,0.14)' },
  mini: { flexDirection: 'row', alignItems: 'center', height: 64, paddingLeft: 10, paddingRight: 8, borderRadius: 20, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  miniText: { flex: 1, marginHorizontal: 12 },
  miniPlay: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  miniButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  miniProgressTrack: { position: 'absolute', left: 20, right: 20, bottom: 0, height: 2, borderRadius: 1 },
  miniProgress: { height: 2, borderRadius: 1 },
});
