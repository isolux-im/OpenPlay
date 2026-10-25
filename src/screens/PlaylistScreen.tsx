import { useRoute, type RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Mosaic } from '../components/Artwork';
import { EmptyState, PlayShuffleButtons } from '../components/Blocks';
import { DraggableRow } from '../components/DraggableRow';
import { HeaderButton, ScrollScreen } from '../components/Screen';
import { TRACK_ROW_HEIGHT, TrackRow } from '../components/TrackRow';
import { useAppNavigation } from '../navigation/ref';
import type { SharedStackParams } from '../navigation/types';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useUser } from '../store/user';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';
import { ArtworkGlow, CollectionHeader, collectionMeta, usePlayList } from './common';

export function PlaylistScreen() {
  const { params } = useRoute<RouteProp<SharedStackParams, 'Playlist'>>();
  const navigation = useAppNavigation();
  const { colors } = useTheme();
  const playlist = useUser((s) => s.playlists.find((p) => p.id === params.id));
  const { renamePlaylist, deletePlaylist, movePlaylistTrack, removeFromPlaylist } = useUser.getState();
  const byId = useLibrary((s) => s.index.byId);
  const openPrompt = useUi((s) => s.openPrompt);
  const openPlaylistMenu = useUi((s) => s.openPlaylistMenu);
  const [editing, setEditing] = useState(false);
  const entries = playlist ? playlist.trackIds.map((id, i) => ({ track: byId[id], i })).filter((e) => e.track) : [];
  const tracks = entries.map((e) => e.track);
  const { playAt, play, shuffle } = usePlayList(tracks, playlist?.name ?? null);

  if (!playlist) return <ScrollScreen title="Playlist" back largeTitle={false}><EmptyState icon="list" title="Playlist supprimée" /></ScrollScreen>;

  const rename = () =>
    openPrompt({ title: 'Renommer la playlist', initialValue: playlist.name, confirmLabel: 'Enregistrer', placeholder: 'Nom', onSubmit: (v) => renamePlaylist(playlist.id, v) });
  const remove = () =>
    Alert.alert('Supprimer la playlist ?', `« ${playlist.name} » sera supprimée. Les morceaux restent sur l'appareil.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          navigation.goBack();
          deletePlaylist(playlist.id);
        },
      },
    ]);

  return (
    <ScrollScreen
      title={playlist.name}
      back
      largeTitle={false}
      fullBleed
      titleThreshold={170}
      right={
        <>
          <Pressable onPress={() => setEditing((e) => !e)} hitSlop={10} accessibilityRole="button">
            <Text variant="headline">{editing ? 'OK' : 'Modifier'}</Text>
          </Pressable>
          {editing ? null : <HeaderButton icon="ellipsis-horizontal" label="Options de la playlist" onPress={() => openPlaylistMenu(playlist.id)} />}
        </>
      }>
      <ArtworkGlow track={tracks[0]} height={360}>
        <CollectionHeader
          art={<Mosaic tracks={tracks} size={124} rounded={16} />}
          title={playlist.name}
          byline={
            playlist.description ? (
              <Text variant="subhead" tone="secondary" numberOfLines={2} style={{ marginTop: 2 }}>
                {playlist.description}
              </Text>
            ) : undefined
          }
          meta={collectionMeta(tracks)}
        />
        {editing ? (
          <View style={styles.editActions}>
            <EditAction icon="create-outline" label="Renommer" onPress={rename} />
            <EditAction icon="add" label="Ajouter" onPress={() => navigation.navigate('AddSongs', { playlistId: playlist.id })} />
            <EditAction icon="trash-outline" label="Supprimer" onPress={remove} danger />
          </View>
        ) : tracks.length ? (
          <PlayShuffleButtons onPlay={play} onShuffle={shuffle} onAdd={() => navigation.navigate('AddSongs', { playlistId: playlist.id })} />
        ) : null}
      </ArtworkGlow>

      {entries.length === 0 ? (
        <EmptyState icon="musical-notes" title="Playlist vide" message="Ajoutez des morceaux depuis la bibliothèque ou ici." action={{ label: 'Ajouter des morceaux', onPress: () => navigation.navigate('AddSongs', { playlistId: playlist.id }) }} />
      ) : editing ? (
        entries.map((e, k) => (
          <DraggableRow key={`${e.track.id}-${e.i}`} index={e.i} count={playlist.trackIds.length} rowHeight={TRACK_ROW_HEIGHT} handleColor={colors.tertiaryText} onMove={(from, to) => movePlaylistTrack(playlist.id, from, to)}>
            <View style={styles.editRow}>
              <Pressable onPress={() => removeFromPlaylist(playlist.id, e.i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Retirer ${e.track.title}`} style={{ paddingLeft: GUTTER }}>
                <Icon name="remove-circle" size={24} color={colors.danger} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <TrackRow track={e.track} onPress={() => playAt(k)} accessory={<View />} />
              </View>
            </View>
          </DraggableRow>
        ))
      ) : (
        entries.map((e, k) => <TrackRow key={`${e.track.id}-${e.i}`} track={e.track} number={k + 1} artwork showDuration onPress={() => playAt(k)} menuContext={{ playlistId: playlist.id, playlistIndex: e.i }} />)
      )}
    </ScrollScreen>
  );
}

function EditAction({ icon, label, onPress, danger }: { icon: 'create-outline' | 'add' | 'trash-outline'; label: string; onPress: () => void; danger?: boolean }) {
  const { colors } = useTheme();
  const color = danger ? colors.danger : colors.text;
  return (
    <Pressable onPress={onPress} style={[styles.editAction, { backgroundColor: colors.fill }]} accessibilityRole="button" accessibilityLabel={label}>
      <Icon name={icon} size={20} color={color} />
      <Text variant="subhead" weight="semibold" color={color}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  editActions: { flexDirection: 'row', gap: 10, paddingHorizontal: GUTTER, marginVertical: 16 },
  editAction: { flex: 1, height: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  editRow: { flexDirection: 'row', alignItems: 'center' },
});
