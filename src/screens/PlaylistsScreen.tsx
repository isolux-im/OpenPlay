import { useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { Mosaic } from '../components/Artwork';
import { Chips, EmptyState } from '../components/Blocks';
import { PressableScale } from '../components/PressableScale';
import { HeaderButton, ScrollScreen } from '../components/Screen';
import { goToTab, useAppNavigation } from '../navigation/ref';
import type { SmartPlaylistKind } from '../navigation/types';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { useUser } from '../store/user';
import type { Playlist, Track } from '../types';
import { tap } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';
import { collectionMeta } from './common';
import { SMART_PLAYLISTS, useSmartPlaylist } from './LibraryScreens';

type Filter = 'all' | 'mine' | 'auto';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'mine', label: 'Mes playlists' },
  { key: 'auto', label: 'Automatiques' },
];
const SMART: SmartPlaylistKind[] = ['favorites', 'mostPlayed', 'recentlyAdded', 'rediscover'];

const anchorOf = (e: GestureResponderEvent) => ({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });

function Row({ title, tracks, onPress, onMenu, label }: { title: string; tracks: Track[]; onPress: () => void; onMenu?: (e: GestureResponderEvent) => void; label?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={
        onMenu
          ? (e) => {
              tap();
              onMenu(e);
            }
          : undefined
      }
      delayLongPress={320}
      android_ripple={{ color: colors.fill }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]}
      accessibilityRole="button"
      accessibilityLabel={title}>
      <Mosaic tracks={tracks} size={56} rounded={12} />
      <View style={styles.rowText}>
        <Text variant="callout" weight="medium" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {label ? `${label} · ` : ''}
          {collectionMeta(tracks)}
        </Text>
      </View>
      {onMenu ? (
        <Pressable onPress={onMenu} hitSlop={10} style={styles.more} accessibilityRole="button" accessibilityLabel={`Options pour ${title}`}>
          <Icon name="ellipsis-vertical" size={18} color={colors.secondaryText} />
        </Pressable>
      ) : (
        <View style={styles.chevron}>
          <Icon name="chevron-forward" size={17} color={colors.tertiaryText} />
        </View>
      )}
    </Pressable>
  );
}

function SmartRow({ kind }: { kind: SmartPlaylistKind }) {
  const navigation = useAppNavigation();
  const tracks = useSmartPlaylist(kind);
  return <Row title={SMART_PLAYLISTS[kind].title} label="Automatique" tracks={tracks} onPress={() => (kind === 'rediscover' ? navigation.navigate('Discover') : navigation.navigate('SmartPlaylist', { kind }))} />;
}

function PlaylistRow({ playlist }: { playlist: Playlist }) {
  const navigation = useAppNavigation();
  const byId = useLibrary((s) => s.index.byId);
  const openMenu = useUi((s) => s.openPlaylistMenu);
  const tracks = playlist.trackIds.map((id) => byId[id]).filter(Boolean);
  return <Row title={playlist.name} tracks={tracks} onPress={() => navigation.push('Playlist', { id: playlist.id })} onMenu={(e) => openMenu(playlist.id, anchorOf(e))} />;
}

/** Carte vedette : la dernière playlist modifiée, ou à défaut les titres les plus écoutés. */
function Featured({ playlist }: { playlist: Playlist | undefined }) {
  const navigation = useAppNavigation();
  const { colors } = useTheme();
  const byId = useLibrary((s) => s.index.byId);
  const fallback = useSmartPlaylist('mostPlayed');
  const recent = useSmartPlaylist('recentlyAdded');
  const playTracks = usePlayer((s) => s.playTracks);
  const tracks = playlist ? playlist.trackIds.map((id) => byId[id]).filter(Boolean) : fallback.length ? fallback : recent;
  const title = playlist ? playlist.name : fallback.length ? SMART_PLAYLISTS.mostPlayed.title : SMART_PLAYLISTS.recentlyAdded.title;
  if (!tracks.length) return null;
  const open = () => (playlist ? navigation.push('Playlist', { id: playlist.id }) : navigation.navigate('SmartPlaylist', { kind: fallback.length ? 'mostPlayed' : 'recentlyAdded' }));
  return (
    <PressableScale onPress={open} scaleTo={0.98} style={[styles.featured, { backgroundColor: colors.card }]} accessibilityRole="button" accessibilityLabel={`${title}, à la une`}>
      <Mosaic tracks={tracks} size={112} rounded={14} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" tone="secondary">
          À LA UNE
        </Text>
        <Text variant="title3" weight="bold" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="footnote" tone="secondary">
          {collectionMeta(tracks)}
        </Text>
      </View>
      <PressableScale
        haptic
        onPress={() => playTracks(tracks.map((t) => t.id), 0, { label: title })}
        style={[styles.featuredPlay, { backgroundColor: colors.accent }]}
        accessibilityRole="button"
        accessibilityLabel={`Lire ${title}`}>
        <Icon name="play" size={20} color={colors.onAccent} />
      </PressableScale>
    </PressableScale>
  );
}

export function PlaylistsScreen() {
  const navigation = useAppNavigation();
  const { colors } = useTheme();
  const playlists = useUser((s) => s.playlists);
  const createPlaylist = useUser((s) => s.createPlaylist);
  const openPrompt = useUi((s) => s.openPrompt);
  const [filter, setFilter] = useState<Filter>('all');
  const create = () =>
    openPrompt({
      title: 'Nouvelle playlist',
      placeholder: 'Nom de la playlist',
      confirmLabel: 'Créer',
      onSubmit: (name) => {
        const p = createPlaylist(name);
        navigation.push('Playlist', { id: p.id });
      },
    });
  const latest = [...playlists].filter((p) => p.trackIds.length).sort((a, b) => b.updatedAt - a.updatedAt)[0];

  return (
    <ScrollScreen
      title="Playlists"
      titleRight={
        <>
          <HeaderButton icon="search-outline" label="Rechercher" onPress={() => goToTab('SearchTab')} />
          <HeaderButton icon="add" label="Nouvelle playlist" onPress={create} />
        </>
      }>
      <Chips options={FILTERS} value={filter} onChange={setFilter} />

      {filter === 'all' ? (
        <View style={styles.featuredWrap}>
          <Featured playlist={latest} />
        </View>
      ) : null}

      {filter !== 'auto' ? (
        <>
          <Pressable onPress={create} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]} accessibilityRole="button" accessibilityLabel="Nouvelle playlist">
            <View style={[styles.newTile, { borderColor: colors.separator }]}>
              <Icon name="add" size={26} color={colors.text} />
            </View>
            <View style={styles.rowText}>
              <Text variant="callout" weight="medium">
                Nouvelle playlist…
              </Text>
            </View>
          </Pressable>
          {playlists.map((p) => (
            <PlaylistRow key={p.id} playlist={p} />
          ))}
          {playlists.length === 0 && filter === 'mine' ? <EmptyState icon="list-outline" title="Aucune playlist" message="Créez une playlist, puis ajoutez-y des morceaux par un appui long." /> : null}
        </>
      ) : null}

      {filter !== 'mine' ? SMART.map((k) => <SmartRow key={k} kind={k} />) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: GUTTER, height: 76 },
  rowText: { flex: 1, marginLeft: 14, gap: 2 },
  more: { paddingLeft: 12, paddingVertical: 8 },
  chevron: { marginLeft: 8 },
  newTile: { width: 56, height: 56, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  featuredWrap: { paddingHorizontal: GUTTER, paddingTop: 14, paddingBottom: 8 },
  featured: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: radius.xl },
  featuredPlay: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
});
