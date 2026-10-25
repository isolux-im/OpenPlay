import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '../../components/Artwork';
import { PressableScale } from '../../components/PressableScale';
import { fallbackColors, useArtwork } from '../../library/artwork';
import { navigateInCurrentTab } from '../../navigation/ref';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useSettings } from '../../store/settings';
import { useUi, type PlayerMode } from '../../store/ui';
import { useUser } from '../../store/user';
import { tap } from '../../ui/haptics';
import { Icon, type IconName } from '../../ui/Icon';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';
import { LyricsPanel } from './LyricsPanel';
import { QueuePanel } from './QueuePanel';
import { Scrubber } from './Scrubber';

type Mode = PlayerMode;

/** Lecteur plein écran : feuille qui monte depuis le mini-lecteur et se ferme d'un glissement vers le bas. */
export function FullPlayer() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const expanded = usePlayer((s) => s.expanded);
  const setExpanded = usePlayer((s) => s.setExpanded);
  const trackId = usePlayer((s) => s.queue[s.index]);
  const track = useLibrary((s) => (trackId ? s.index.byId[trackId] : undefined));
  const mounted = usePlayer((s) => s.playerMounted);
  const onPlayerClosed = usePlayer((s) => s.onPlayerClosed);
  const mode = useUi((s) => s.playerMode);
  const setMode = useUi((s) => s.setPlayerMode);

  const translate = useSharedValue(height);

  useEffect(() => {
    if (expanded) {
      translate.set(withSpring(0, { damping: 26, stiffness: 220, mass: 0.9 }));
    } else {
      translate.set(
        withTiming(height, { duration: 280, easing: Easing.in(Easing.cubic) }, (done) => {
          if (done) runOnJS(onPlayerClosed)();
        }),
      );
    }
  }, [expanded, height, translate, onPlayerClosed]);

  useEffect(() => {
    if (!expanded) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setExpanded(false);
      return true;
    });
    return () => sub.remove();
  }, [expanded, setExpanded]);

  const close = () => setExpanded(false);

  // Dans les vues Paroles et File d'attente, le glissement vertical sert au défilement des listes.
  const drag = Gesture.Pan()
    .enabled(mode === 'artwork')
    .activeOffsetY(12)
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      translate.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 140 || e.velocityY > 900) runOnJS(close)();
      else translate.set(withSpring(0, { damping: 22, stiffness: 240 }));
    });

  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: translate.get() }],
    borderTopLeftRadius: interpolate(translate.get(), [0, 60], [0, 24], 'clamp'),
    borderTopRightRadius: interpolate(translate.get(), [0, 60], [0, 24], 'clamp'),
  }));

  if (!mounted || !track) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.sheet, sheet]} accessibilityViewIsModal>
      <PlayerContent
        track={track}
        mode={mode}
        setMode={setMode}
        onClose={close}
        width={width}
        topInset={insets.top}
        bottomInset={insets.bottom}
        drag={drag}
        themeBackground={theme.colors.background}
        themeDark={theme.dark}
      />
    </Animated.View>
  );
}

type ContentProps = {
  track: NonNullable<ReturnType<typeof useLibrary.getState>['index']['byId'][string]>;
  mode: Mode;
  setMode: (m: Mode) => void;
  onClose: () => void;
  width: number;
  topInset: number;
  bottomInset: number;
  drag: ReturnType<typeof Gesture.Pan>;
  themeBackground: string;
  themeDark: boolean;
};

function PlayerContent({ track, mode, setMode, onClose, width, topInset, bottomInset, drag, themeBackground, themeDark }: ContentProps) {
  const art = useArtwork(track);
  const colored = useSettings((s) => s.coloredPlayer);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const position = usePlayer((s) => s.positionSec);
  const duration = usePlayer((s) => s.durationSec || track.durationSec);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const sourceLabel = usePlayer((s) => s.sourceLabel);
  const { toggle, next, previous, seek, toggleShuffle, cycleRepeat } = usePlayer.getState();
  const favorite = useUser((s) => s.favorites.includes(track.id));
  const toggleFavorite = useUser((s) => s.toggleFavorite);
  const openMenu = useUi((s) => s.openTrackMenu);
  const openOptions = useUi((s) => s.openPlayerOptions);

  const palette = art?.colors ?? fallbackColors(track.albumId || track.id);
  // Fond gris flouté (maquette) ; teintes de la pochette si l'option est activée.
  const onDark = colored || themeDark;
  const text = onDark ? '#FFFFFF' : '#111113';
  const dim = onDark ? 'rgba(255,255,255,0.62)' : 'rgba(60,60,67,0.62)';
  const chip = onDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.06)';
  const trackColor = onDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.10)';

  const artSize = Math.min(width - 56, 420);
  const artScale = useSharedValue(isPlaying ? 1 : 0.86);
  useEffect(() => {
    artScale.set(withSpring(isPlaying ? 1 : 0.86, { damping: 15, stiffness: 140 }));
  }, [isPlaying, artScale]);
  const artStyle = useAnimatedStyle(() => ({ transform: [{ scale: artScale.get() }] }));

  const openArtist = () => {
    onClose();
    navigateInCurrentTab('Artist', { id: track.albumArtist.toLowerCase() });
  };

  const control = (icon: IconName, label: string, onPress: () => void, size: number) => (
    <PressableScale haptic scaleTo={0.85} onPress={onPress} style={styles.control} accessibilityRole="button" accessibilityLabel={label}>
      <Icon name={icon} size={size} color={text} />
    </PressableScale>
  );

  const bottomTab = (icon: IconName, activeIcon: IconName, label: string, target: Mode) => {
    const isActive = target === mode;
    return (
      <Pressable
        onPress={() => {
          tap('selection');
          setMode(mode === target ? 'artwork' : target);
        }}
        style={[styles.bottomTab, isActive && { backgroundColor: chip }]}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={label}>
        <Icon name={isActive ? activeIcon : icon} size={21} color={isActive ? text : dim} />
      </Pressable>
    );
  };

  return (
    <View style={[styles.fill, { backgroundColor: colored ? palette.darkMuted : themeBackground }]}>
      <StatusBar style={onDark ? 'light' : 'dark'} />
      {art?.uri ? <Image source={{ uri: art.uri }} style={StyleSheet.absoluteFill} blurRadius={70} contentFit="cover" /> : null}
      {colored ? (
        <LinearGradient colors={[`${palette.vibrant}CC`, `${palette.dominant}D9`, `${palette.darkMuted}F2`]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      ) : (
        <LinearGradient
          colors={themeDark ? ['rgba(28,28,30,0.78)', 'rgba(12,12,13,0.92)'] : ['rgba(236,236,238,0.80)', 'rgba(246,246,247,0.94)']}
          style={StyleSheet.absoluteFill}
        />
      )}

      <GestureDetector gesture={drag}>
        <View style={[styles.fill, { paddingTop: topInset + 4, paddingBottom: bottomInset + 12 }]}>
          <View style={styles.topBar}>
            <Pressable onPress={onClose} hitSlop={10} style={[styles.topButton, { backgroundColor: chip }]} accessibilityRole="button" accessibilityLabel="Réduire le lecteur">
              <Icon name="chevron-down" size={22} color={text} />
            </Pressable>
            <View style={styles.topCenter}>
              <Text variant="caption" color={dim} numberOfLines={1}>
                {sourceLabel ? 'LECTURE DEPUIS' : 'LECTURE EN COURS'}
              </Text>
              {sourceLabel ? (
                <Text variant="footnote" weight="semibold" color={text} numberOfLines={1}>
                  {sourceLabel}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={(e) => openMenu(track.id, {}, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
              hitSlop={10}
              style={[styles.topButton, { backgroundColor: chip }]}
              accessibilityRole="button"
              accessibilityLabel="Options du morceau">
              <Icon name="ellipsis-horizontal" size={20} color={text} />
            </Pressable>
          </View>

          {mode === 'artwork' ? (
            <View style={styles.artArea}>
              <Animated.View style={artStyle}>
                <Artwork track={track} size={artSize} rounded={22} shadow />
              </Animated.View>
            </View>
          ) : (
            <View style={styles.compactHeader}>
              <Artwork track={track} size={60} rounded={12} />
              <View style={{ flex: 1 }}>
                <Text variant="headline" color={text} numberOfLines={1}>
                  {track.title}
                </Text>
                <Text variant="subhead" color={dim} numberOfLines={1}>
                  {track.artist}
                </Text>
              </View>
            </View>
          )}

          {mode !== 'artwork' ? (
            <View style={styles.panelArea}>
              {mode === 'lyrics' ? <LyricsPanel track={track} position={position} onSeek={seek} textColor={text} dimColor={dim} /> : null}
              {mode === 'queue' ? <QueuePanel textColor={text} dimColor={dim} chipColor={chip} /> : null}
            </View>
          ) : null}

          <View style={styles.controlsArea}>
            {mode === 'artwork' ? (
              <View style={styles.titleRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="title2" color={text} numberOfLines={1}>
                    {track.title}
                  </Text>
                  <Pressable onPress={openArtist} accessibilityRole="link" accessibilityLabel={`Voir ${track.artist}`}>
                    <Text variant="body" color={dim} numberOfLines={1}>
                      {track.artist}
                    </Text>
                  </Pressable>
                </View>
                <Pressable
                  onPress={() => {
                    tap('success');
                    toggleFavorite(track.id);
                  }}
                  hitSlop={10}
                  style={styles.heart}
                  accessibilityRole="button"
                  accessibilityLabel={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
                  <Icon name={favorite ? 'heart' : 'heart-outline'} size={26} color={text} />
                </Pressable>
              </View>
            ) : null}

            <Scrubber position={position} duration={duration} onSeek={seek} color={text} trackColor={trackColor} textColor={dim} />

            <View style={styles.transport}>
              <Pressable onPress={toggleShuffle} style={styles.side} accessibilityRole="switch" accessibilityState={{ checked: shuffle }} accessibilityLabel="Lecture aléatoire">
                <Icon name="shuffle-outline" size={22} color={shuffle ? text : dim} />
                {shuffle ? <View style={[styles.dot, { backgroundColor: text }]} /> : null}
              </Pressable>
              {control('play-back', 'Précédent', previous, 34)}
              <PressableScale haptic scaleTo={0.9} onPress={toggle} style={[styles.playButton, { borderColor: text }]} accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause' : 'Lecture'}>
                <Icon name={isPlaying ? 'pause' : 'play'} size={34} color={text} />
              </PressableScale>
              {control('play-forward', 'Suivant', next, 34)}
              <Pressable onPress={cycleRepeat} style={styles.side} accessibilityRole="button" accessibilityLabel={repeat === 'one' ? 'Répéter le morceau' : repeat === 'all' ? 'Répéter tout' : 'Répétition désactivée'}>
                <Icon name="repeat-outline" size={22} color={repeat !== 'off' ? text : dim} />
                {repeat === 'one' ? (
                  <Text variant="caption" weight="bold" color={text} style={styles.repeatBadge}>
                    1
                  </Text>
                ) : null}
                {repeat !== 'off' ? <View style={[styles.dot, { backgroundColor: text }]} /> : null}
              </Pressable>
            </View>

            <View style={styles.bottomRow}>
              {bottomTab('chatbubble-ellipses-outline', 'chatbubble-ellipses', 'Paroles', 'lyrics')}
              {bottomTab('list-outline', 'list', "File d'attente", 'queue')}
              <Pressable
                onPress={() => {
                  tap('selection');
                  openOptions();
                }}
                style={styles.bottomTab}
                accessibilityRole="button"
                accessibilityLabel="Plus d'options de lecture">
                <Icon name="ellipsis-horizontal" size={22} color={dim} />
              </Pressable>
            </View>
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { overflow: 'hidden', zIndex: 100, elevation: 30 },
  fill: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 6, gap: 12 },
  topButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  topCenter: { flex: 1, alignItems: 'center' },
  artArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  compactHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 28, paddingTop: 12, paddingBottom: 8 },
  panelArea: { flex: 1, paddingHorizontal: 28, paddingBottom: 12 },
  controlsArea: { paddingHorizontal: 28, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  heart: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  playButton: { width: 76, height: 76, borderRadius: 38, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  control: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  side: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: 2 },
  repeatBadge: { position: 'absolute', top: 6, right: 6, fontSize: 9 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 12 },
  bottomTab: { width: 52, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
