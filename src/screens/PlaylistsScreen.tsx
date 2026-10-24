import { Pressable, StyleSheet, View } from 'react-native';

import { Mosaic } from '../components/Artwork';
import { EmptyState, SectionHeader } from '../components/Blocks';
import { HeaderButton, ScrollScreen } from '../components/Screen';
import { pluralize } from '../library/text';
import { useAppNavigation } from '../navigation/ref';
import type { SmartPlaylistKind } from '../navigation/types';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useUser } from '../store/user';
import type { Playlist } from '../types';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';
import { SMART_PLAYLISTS, useSmartPlaylist } from './LibraryScreens';

function SmartRow({ kind, last }: { kind: SmartPlaylistKind; last?: boolean }) {
  const navigation = useAppNavigation();
  const { colors } = useTheme();
  const tracks = useSmartPlaylist(kind);
  const meta = SMART_PLAYLISTS[kind];
  return (
    <Pressable onPress={() => navigation.navigate('SmartPlaylist', { kind })} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]} accessibilityRole="button" accessibilityLabel={meta.title}>
      <View style={[styles.smartIcon, { backgroundColor: colors.accentSoft }]}>
        <Icon name={meta.icon} size={26} color={colors.accent} />
      </View>
      <View style={[styles.text, { borderBottomColor: last ? 'transparent' : colors.separator }]}>
        <View style={{ flex: 1 }}>
          <Text variant="body">{meta.title}</Text>
          <Text variant="footnote" tone="secondary">
            Automatique · {pluralize(tracks.length, 'morceau', 'morceaux')}
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.tertiaryText} />
      </View>
    </Pressable>
  );
}

function PlaylistRow({ playlist, last }: { playlist: Playlist; last?: boolean }) {
  const navigation = useAppNavigation();
  const { colors } = useTheme();
  const byId = useLibrary((s) => s.index.byId);
  return (
    <Pressable onPress={() => navigation.push('Playlist', { id: playlist.id })} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]} accessibilityRole="button" accessibilityLabel={playlist.name}>
      <Mosaic tracks={playlist.trackIds.map((id) => byId[id]).filter(Boolean)} size={64} rounded={8} />
      <View style={[styles.text, { borderBottomColor: last ? 'transparent' : colors.separator }]}>
        <View style={{ flex: 1 }}>
          <Text variant="body" numberOfLines={1}>
            {playlist.name}
          </Text>
          <Text variant="footnote" tone="secondary">
            {pluralize(playlist.trackIds.length, 'morceau', 'morceaux')}
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.tertiaryText} />
      </View>
    </Pressable>
  );
}

export function PlaylistsScreen() {
  const navigation = useAppNavigation();
  const { colors } = useTheme();
  const playlists = useUser((s) => s.playlists);
  const createPlaylist = useUser((s) => s.createPlaylist);
  const openPrompt = useUi((s) => s.openPrompt);
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

  return (
    <ScrollScreen title="Playlists" right={<HeaderButton icon="add" label="Nouvelle playlist" onPress={create} />}>
      <Pressable onPress={create} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.fill }]} accessibilityRole="button" accessibilityLabel="Nouvelle playlist">
        <View style={[styles.newTile, { backgroundColor: colors.fill }]}>
          <Icon name="add" size={34} color={colors.accent} />
        </View>
        <View style={[styles.text, { borderBottomColor: 'transparent' }]}>
          <Text variant="body" tone="accent">
            Nouvelle playlist…
          </Text>
        </View>
      </Pressable>

      <SectionHeader title="Automatiques" />
      <SmartRow kind="favorites" />
      <SmartRow kind="mostPlayed" />
      <SmartRow kind="recentlyAdded" />
      <SmartRow kind="rediscover" last />

      <SectionHeader title="Mes playlists" />
      {playlists.length === 0 ? (
        <EmptyState icon="list" title="Aucune playlist" message="Créez une playlist puis ajoutez-y des morceaux depuis leur menu « … »." />
      ) : (
        playlists.map((p, i) => <PlaylistRow key={p.id} playlist={p} last={i === playlists.length - 1} />)
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: GUTTER, height: 80 },
  text: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 14, height: '100%', borderBottomWidth: StyleSheet.hairlineWidth, paddingRight: GUTTER },
  newTile: { width: 64, height: 64, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  smartIcon: { width: 64, height: 64, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
