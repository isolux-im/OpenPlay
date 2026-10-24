import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useFavorites } from './favorites/useFavorites';
import { useLibrary } from './library/useLibrary';
import { usePlayer } from './player/usePlayer';
import type { Track } from './types';
import { PermissionGate } from './ui/PermissionGate';
import { PlayerBar } from './ui/PlayerBar';
import { TrackList } from './ui/TrackList';
import { usePalette, type Palette } from './ui/theme';

type Tab = 'library' | 'favorites';

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const palette = usePalette();
  const library = useLibrary();
  const favorites = useFavorites();
  const player = usePlayer();
  const [tab, setTab] = useState<Tab>('library');

  const { isFavorite } = favorites;
  const favoriteTracks = useMemo(
    () => library.tracks.filter((t) => isFavorite(t.id)),
    [library.tracks, isFavorite],
  );
  const visible = tab === 'library' ? library.tracks : favoriteTracks;

  const { playFrom } = player;
  const onPlay = useCallback((t: Track) => playFrom(visible, t.id), [playFrom, visible]);

  let body;
  if (library.permission === null) {
    body = <ActivityIndicator style={styles.fill} color={palette.accent} />;
  } else if (library.permission !== 'granted') {
    body = <PermissionGate permission={library.permission} palette={palette} onRequest={library.requestPermission} />;
  } else {
    body = (
      <TrackList
        tracks={visible}
        currentId={player.track?.id ?? null}
        isFavorite={isFavorite}
        palette={palette}
        emptyMessage={
          library.error ??
          (library.loading
            ? 'Chargement de la bibliothèque…'
            : tab === 'library'
              ? 'Aucun fichier audio trouvé sur cet appareil.'
              : 'Aucun favori. Touchez ☆ sur un morceau pour l’ajouter.')
        }
        onPlay={onPlay}
        onToggleFavorite={favorites.toggle}
        refreshing={library.loading}
        onRefresh={tab === 'library' ? library.refresh : undefined}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: palette.background }]} edges={['top', 'bottom']}>
      <StatusBar style="auto" />
      <Text style={[styles.header, { color: palette.text }]}>OpenPlay</Text>
      <View style={[styles.tabs, { borderBottomColor: palette.border }]}>
        <TabButton label={`Bibliothèque (${library.tracks.length})`} active={tab === 'library'} palette={palette} onPress={() => setTab('library')} />
        <TabButton label={`Favoris (${favoriteTracks.length})`} active={tab === 'favorites'} palette={palette} onPress={() => setTab('favorites')} />
      </View>
      <View style={styles.fill}>{body}</View>
      <PlayerBar player={player} palette={palette} />
    </SafeAreaView>
  );
}

type TabProps = { label: string; active: boolean; palette: Palette; onPress: () => void };

function TabButton({ label, active, palette, onPress }: TabProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.tab, active && { borderBottomColor: palette.accent }]}>
      <Text style={[styles.tabText, { color: active ? palette.accent : palette.muted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { fontSize: 28, fontWeight: '700', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8 },
  tab: { paddingHorizontal: 8, paddingVertical: 10, marginRight: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 15, fontWeight: '600' },
});
