import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
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
import { useUi } from '../../store/ui';
import { useUser } from '../../store/user';
import { tap } from '../../ui/haptics';
import { Icon, type IconName } from '../../ui/Icon';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';
import { LyricsPanel } from './LyricsPanel';
import { QueuePanel } from './QueuePanel';
import { Scrubber } from './Scrubber';

type Mode = 'artwork' | 'lyrics' | 'queue';

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
  const [mode, setMode] = useState<Mode>('artwork');

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
  const sleep = usePlayer((s) => s.sleep);
  const { toggle, next, previous, seek, toggleShuffle, cycleRepeat } = usePlayer.getState();
  const favorite = useUser((s) => s.favorites.includes(track.id));
  const toggleFavorite = useUser((s) => s.toggleFavorite);
  const openMenu = useUi((s) => s.openTrackMenu);
  const openSleep = useUi((s) => s.openSleepSheet);

  const palette = art?.colors ?? fallbackColors(track.albumId || track.id);
  const onColor = colored || themeDark;
  const text = onColor ? '#FFFFFF' : '#0B0B0D';
  const dim = onColor ? 'rgba(255,255,255,0.62)' : 'rgba(60,60,67,0.62)';
  const chip = onColor ? 'rgba(255,255,255,0.16)' : 'rgba(118,118,128,0.14)';
  const trackColor = onColor ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.12)';

  const artSize = Math.min(width - 56, 420);
  const artScale = useSharedValue(isPlaying ? 1 : 0.84);
  useEffect(() => {
    artScale.set(withSpring(isPlaying ? 1 : 0.84, { damping: 15, stiffness: 140 }));
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

  const bottomTab = (icon: IconName, activeIcon: IconName, label: string, target: Mode | 'sleep', badge = false) => {
    const isActive = target === mode || (target === 'sleep' && badge);
    return (
      <Pressable
        onPress={() => {
          tap('selection');
          if (target === 'sleep') openSleep();
          else setMode(mode === target ? 'artwork' : target);
        }}
        style={[styles.bottomTab, isActive && { backgroundColor: chip }]}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={label}>
        <Icon name={isActive ? activeIcon : icon} size={22} color={isActive ? text : dim} />
      </Pressable>
    );
  };

  return (
    <View style={[styles.fill, { backgroundColor: onColor ? palette.darkMuted : themeBackground }]}>
      <StatusBar style={onColor ? 'light' : 'dark'} />
      {colored ? (
        <>
          {art?.uri ? <Image source={{ uri: art.uri }} style={StyleSheet.absoluteFill} blurRadius={60} contentFit="cover" /> : null}
          <LinearGradient
            colors={[`${palette.vibrant}CC`, `${palette.dominant}D9`, `${palette.darkMuted}F2`]}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
        </>
      ) : null}

      <GestureDetector gesture={drag}>
        <View style={[styles.fill, { paddingTop: topInset + 6, paddingBottom: bottomInset + 12 }]}>
          <Pressable onPress={onClose} style={styles.grabberHit} accessibilityRole="button" accessibilityLabel="Réduire le lecteur">
            <View style={[styles.grabber, { backgroundColor: dim }]} />
          </Pressable>

          {mode === 'artwork' ? (
            <View style={styles.artArea}>
              <Animated.View style={artStyle}>
                <Artwork track={track} size={artSize} rounded={14} shadow />
              </Animated.View>
            </View>
          ) : (
            <View style={styles.compactHeader}>
              <Artwork track={track} size={60} rounded={8} />
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
                    <Text variant="title3" weight="regular" color={dim} numberOfLines={1}>
                      {track.artist}
                    </Text>
                  </Pressable>
                </View>
                <Pressable
                  onPress={() => {
                    tap('success');
                    toggleFavorite(track.id);
                  }}
                  hitSlop={8}
                  style={[styles.roundButton, { backgroundColor: chip }]}
                  accessibilityRole="button"
                  accessibilityLabel={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
                  <Icon name={favorite ? 'heart' : 'heart-outline'} size={20} color={text} />
                </Pressable>
                <Pressable onPress={() => openMenu(track.id)} hitSlop={8} style={[styles.roundButton, { backgroundColor: chip }]} accessibilityRole="button" accessibilityLabel="Plus d'options">
                  <Icon name="ellipsis-horizontal" size={20} color={text} />
                </Pressable>
              </View>
            ) : null}

            <Scrubber position={position} duration={duration} onSeek={seek} color={text} trackColor={trackColor} textColor={dim} />

            <View style={styles.transport}>
              {mode === 'artwork' ? (
                <Pressable onPress={toggleShuffle} style={styles.side} accessibilityRole="switch" accessibilityState={{ checked: shuffle }} accessibilityLabel="Lecture aléatoire">
                  <Icon name="shuffle" size={22} color={shuffle ? text : dim} />
                  {shuffle ? <View style={[styles.dot, { backgroundColor: text }]} /> : null}
                </Pressable>
              ) : (
                <View style={styles.side} />
              )}
              {control('play-back', 'Précédent', previous, 40)}
              {control(isPlaying ? 'pause' : 'play', isPlaying ? 'Pause' : 'Lecture', toggle, 56)}
              {control('play-forward', 'Suivant', next, 40)}
              {mode === 'artwork' ? (
                <Pressable onPress={cycleRepeat} style={styles.side} accessibilityRole="button" accessibilityLabel={repeat === 'one' ? 'Répéter le morceau' : repeat === 'all' ? 'Répéter tout' : 'Répétition désactivée'}>
                  <Icon name="repeat" size={22} color={repeat !== 'off' ? text : dim} />
                  {repeat === 'one' ? (
                    <Text variant="caption" weight="bold" color={text} style={styles.repeatBadge}>
                      1
                    </Text>
                  ) : null}
                  {repeat !== 'off' ? <View style={[styles.dot, { backgroundColor: text }]} /> : null}
                </Pressable>
              ) : (
                <View style={styles.side} />
              )}
            </View>

            <View style={styles.bottomRow}>
              {bottomTab('chatbubble-ellipses-outline', 'chatbubble-ellipses', 'Paroles', 'lyrics')}
              {bottomTab('moon-outline', 'moon', 'Minuterie de sommeil', 'sleep', !!(sleep.endsAt || sleep.atTrackEnd))}
              {bottomTab('list-outline', 'list', "File d'attente", 'queue')}
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
  grabberHit: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 24 },
  grabber: { width: 40, height: 5, borderRadius: 3 },
  artArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  compactHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 28, paddingTop: 12, paddingBottom: 8 },
  panelArea: { flex: 1, paddingHorizontal: 28, paddingBottom: 12 },
  controlsArea: { paddingHorizontal: 28, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  roundButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  control: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  side: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: 2 },
  repeatBadge: { position: 'absolute', top: 6, right: 6, fontSize: 9 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 },
  bottomTab: { width: 52, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
