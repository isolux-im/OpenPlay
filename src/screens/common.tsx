import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_BAR_HEIGHT } from '../components/Screen';
import { useArtwork, fallbackColors } from '../library/artwork';
import { usePlayer } from '../store/player';
import type { Track } from '../types';
import { useTheme } from '../ui/theme';

/** Lance une liste de morceaux à partir de l'un d'eux, avec l'étiquette de provenance. */
export function usePlayList(tracks: Track[], label: string | null) {
  const playTracks = usePlayer((s) => s.playTracks);
  const ids = tracks.map((t) => t.id);
  const key = ids.join('|');
  return {
    playAt: useCallback((i: number) => playTracks(ids, i, { label }), [key, label]), // eslint-disable-line react-hooks/exhaustive-deps
    play: useCallback(() => playTracks(ids, 0, { label }), [key, label]), // eslint-disable-line react-hooks/exhaustive-deps
    shuffle: useCallback(() => playTracks(ids, undefined, { shuffle: true, label }), [key, label]), // eslint-disable-line react-hooks/exhaustive-deps
  };
}

/** Halo coloré en haut des pages de détail, tiré de la pochette. */
export function ArtworkGlow({ track, height = 420, children }: { track: Pick<Track, 'id' | 'albumId'> | null | undefined; height?: number; children?: ReactNode }) {
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const info = useArtwork(track ?? null);
  const palette = info?.colors ?? fallbackColors(track?.albumId || track?.id || 'openplay');
  return (
    <View>
      <LinearGradient
        colors={[`${palette.vibrant}${dark ? '66' : '40'}`, `${palette.dominant}${dark ? '22' : '14'}`, colors.background]}
        locations={[0, 0.55, 1]}
        style={[StyleSheet.absoluteFill, { height }]}
        pointerEvents="none"
      />
      <View style={{ height: insets.top + NAV_BAR_HEIGHT }} />
      {children}
    </View>
  );
}
