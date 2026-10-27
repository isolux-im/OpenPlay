import { useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { deleteTracksFromDevice } from '../library/actions';
import { copyTracks, copyVideos, deleteVideosFromDevice, moveTracks, moveVideos, renameTrack, renameVideo, splitName, trackFileName } from '../library/fileOps';
import { pluralize } from '../library/text';
import { useLibrary } from '../store/library';
import { useSelection } from '../store/selection';
import { useUi } from '../store/ui';
import { useVideos } from '../store/videos';
import type { Track } from '../types';
import { tap } from '../ui/haptics';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import type { Video } from '../video/types';
import { useTheme } from '../ui/theme';

function Action({ icon, label, onPress, disabled, destructive }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; destructive?: boolean }) {
  const { colors } = useTheme();
  const color = destructive ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={() => {
        tap('selection');
        onPress();
      }}
      disabled={disabled}
      style={[styles.action, disabled && { opacity: 0.35 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}>
      <Icon name={icon} size={22} color={color} />
      <Text variant="caption" color={color} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Barre de la sélection multiple (à la place du mini-lecteur) : nombre d'éléments, tout sélectionner,
 * puis ajouter à une playlist, copier, déplacer, renommer (un seul élément) et supprimer.
 */
export function SelectionBar() {
  const { colors } = useTheme();
  const kind = useSelection((s) => s.kind);
  const ids = useSelection((s) => s.ids);
  const available = useSelection((s) => (s.kind ? s.available[s.kind] : []));
  const { clear, setAll } = useSelection.getState();
  const tracksById = useLibrary((s) => s.index.byId);
  const videosById = useVideos((s) => s.byId);

  // Retour Android : quitte la sélection.
  useEffect(() => {
    if (!kind) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      clear();
      return true;
    });
    return () => sub.remove();
  }, [kind, clear]);

  if (!kind) return null;
  // « Tout » seulement si l'écran affiché a déclaré ses éléments (et que la sélection en vient).
  const canSelectAll = available.length > 0 && ids.every((id) => available.includes(id));
  const allSelected = canSelectAll && available.every((id) => ids.includes(id));
  const n = ids.length;
  const { openPlaylistPicker, openVideoPlaylistPicker, openFolderPicker, openPrompt } = useUi.getState();
  const done = (count: number | boolean) => {
    if (count) clear();
  };

  const tracks = () => ids.map((id) => tracksById[id]).filter((t): t is Track => !!t);
  const videos = () => ids.map((id) => videosById[id]).filter((v): v is Video => !!v);
  const what = kind === 'audio' ? pluralize(n, 'morceau', 'morceaux') : pluralize(n, 'vidéo');

  const addToPlaylist = () => (kind === 'audio' ? openPlaylistPicker(ids) : openVideoPlaylistPicker(ids.map((id) => ({ kind: 'video' as const, id }))));
  const transfer = (op: 'copy' | 'move') =>
    openFolderPicker({
      kind,
      title: `${op === 'copy' ? 'Copier' : 'Déplacer'} ${what} vers…`,
      onPick: (folder) => {
        if (kind === 'audio') void (op === 'copy' ? copyTracks(tracks(), folder) : moveTracks(tracks(), folder)).then(done);
        else void (op === 'copy' ? copyVideos(videos(), folder) : moveVideos(videos(), folder)).then(done);
      },
    });
  const rename = () => {
    const track = kind === 'audio' ? tracks()[0] : undefined;
    const video = kind === 'video' ? videos()[0] : undefined;
    const filename = track ? trackFileName(track) : video?.filename;
    if (!filename) return;
    const { base, ext } = splitName(filename);
    openPrompt({
      title: 'Renommer le fichier',
      message: ext ? `Extension conservée : ${ext}` : undefined,
      initialValue: base,
      placeholder: 'Nom du fichier',
      confirmLabel: 'Renommer',
      onSubmit: (name) => void (track ? renameTrack(track, name) : renameVideo(video!, name)).then(done),
    });
  };
  const remove = () => {
    if (kind === 'audio') void deleteTracksFromDevice(tracks(), n > 1 ? `ces ${n} morceaux` : `« ${tracks()[0]?.title} »`).then(done);
    else void deleteVideosFromDevice(videos(), n > 1 ? `ces ${n} vidéos` : `« ${videos()[0]?.title} »`).then(done);
  };

  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOutDown} style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.separator }]} accessibilityLabel="Sélection">
      <View style={styles.top}>
        <Pressable onPress={clear} hitSlop={10} accessibilityRole="button" accessibilityLabel="Terminer la sélection">
          <Icon name="close" size={22} />
        </Pressable>
        <Text variant="subhead" weight="semibold" style={{ flex: 1 }} accessibilityLiveRegion="polite">
          {n ? `${n} sélectionné${n > 1 ? 's' : ''}` : 'Touchez les éléments à sélectionner'}
        </Text>
        {canSelectAll ? (
          <Pressable onPress={() => setAll(!allSelected)} hitSlop={10} accessibilityRole="button">
            <Text variant="subhead" tone="accent" weight="semibold">
              {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Action icon="add-circle-outline" label="Playlist" onPress={addToPlaylist} disabled={!n} />
        <Action icon="copy-outline" label="Copier" onPress={() => transfer('copy')} disabled={!n} />
        <Action icon="folder-open-outline" label="Déplacer" onPress={() => transfer('move')} disabled={!n} />
        <Action icon="create-outline" label="Renommer" onPress={rename} disabled={n !== 1} />
        <Action icon="trash-outline" label="Supprimer" onPress={remove} disabled={!n} destructive />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 12, marginBottom: 10, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingTop: 10, paddingBottom: 6, boxShadow: '0px 8px 24px rgba(0,0,0,0.14)' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 6 },
  actions: { flexDirection: 'row', justifyContent: 'space-around' },
  action: { alignItems: 'center', gap: 2, paddingVertical: 6, paddingHorizontal: 6, minWidth: 58 },
});
