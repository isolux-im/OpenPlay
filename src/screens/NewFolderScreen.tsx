import { useRoute, type RouteProp } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Artwork } from '../components/Artwork';
import { Chips } from '../components/Blocks';
import { ListScreen } from '../components/Screen';
import { DEFAULT_ROOT, copyTracks, copyVideos, fileOpUnavailable, moveTracks, moveVideos, newFolderPath, type MediaKind } from '../library/fileOps';
import { searchLibrary } from '../library/search';
import { formatDuration, normalizeText, pluralize } from '../library/text';
import { useAppNavigation } from '../navigation/ref';
import type { SharedStackParams } from '../navigation/types';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useVideos } from '../store/videos';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, useTheme } from '../ui/theme';
import { VideoThumb } from '../video/VideoThumb';

type Mode = 'move' | 'copy';
const MODES: { key: Mode; label: string }[] = [
  { key: 'move', label: 'Déplacer ici' },
  { key: 'copy', label: 'Copier ici' },
];

/**
 * « Nouveau dossier… » (Musique › Dossiers, Vidéos › Dossiers). Android ne garde pas de dossier vide :
 * après le nom, on choisit les fichiers à y déplacer ou à y copier.
 */
export function NewFolderRow({ kind }: { kind: MediaKind }) {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const create = () => {
    const reason = fileOpUnavailable('move') && fileOpUnavailable('copy');
    if (reason) {
      useUi.getState().showToast(reason);
      return;
    }
    useUi.getState().openPrompt({
      title: 'Nouveau dossier',
      message: `Créé dans « ${DEFAULT_ROOT[kind]} ». Vous choisirez ensuite les fichiers à y mettre.`,
      placeholder: 'Nom du dossier',
      confirmLabel: 'Choisir les fichiers',
      onSubmit: (name) => {
        const folder = newFolderPath(kind, name);
        if (folder) navigation.push('NewFolder', { kind, folder });
      },
    });
  };
  return (
    <Pressable onPress={create} style={({ pressed }) => [styles.newRow, pressed && { backgroundColor: colors.fill }]} accessibilityRole="button" accessibilityLabel="Nouveau dossier">
      <View style={[styles.newIcon, { backgroundColor: colors.fill }]}>
        <Icon name="folder-open-outline" size={22} color={colors.accent} />
      </View>
      <Text variant="body" tone="accent">
        Nouveau dossier…
      </Text>
    </Pressable>
  );
}

type Entry = { id: string; title: string; detail: string; folder: string };

/** Choix des fichiers qui rempliront le nouveau dossier (déplacés ou copiés). */
export function NewFolderScreen() {
  const { params } = useRoute<RouteProp<SharedStackParams, 'NewFolder'>>();
  const { kind, folder } = params;
  const navigation = useAppNavigation();
  const { colors } = useTheme();
  const index = useLibrary((s) => s.index);
  const videos = useVideos((s) => s.videos);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('move');
  const [busy, setBusy] = useState(false);

  const entries = useMemo<Entry[]>(() => {
    if (kind === 'audio') {
      const tracks = query.trim() ? searchLibrary(index, [], query, 500).tracks : index.tracks;
      return tracks.filter((t) => t.folder !== folder).map((t) => ({ id: t.id, title: t.title, detail: `${t.artist} · ${t.folder}`, folder: t.folder }));
    }
    const q = normalizeText(query);
    return videos
      .filter((v) => v.folder !== folder && (!q || normalizeText(`${v.title} ${v.filename} ${v.folder}`).includes(q)))
      .map((v) => ({ id: v.id, title: v.title, detail: `${formatDuration(v.durationSec)} · ${v.folder}`, folder: v.folder }));
  }, [kind, query, index, videos, folder]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const confirm = async () => {
    if (!selected.length || busy) return;
    setBusy(true);
    let done = 0;
    if (kind === 'audio') {
      const tracks = selected.map((id) => useLibrary.getState().allTracks.find((t) => t.id === id)).filter((t) => !!t);
      done = mode === 'move' ? await moveTracks(tracks, folder) : await copyTracks(tracks, folder);
    } else {
      const byId = useVideos.getState().byId;
      const list = selected.map((id) => byId[id]).filter((v) => !!v);
      done = mode === 'move' ? await moveVideos(list, folder) : await copyVideos(list, folder);
    }
    setBusy(false);
    if (!done) return;
    // Le nouveau dossier s'ouvre à la place de l'écran de sélection.
    if (kind === 'audio') navigation.replace('Folder', { id: folder });
    else navigation.replace('VideoFolder', { folder });
  };

  const renderItem = ({ item }: { item: Entry }) => {
    const on = selected.includes(item.id);
    const track = kind === 'audio' ? index.byId[item.id] : undefined;
    const video = kind === 'video' ? useVideos.getState().byId[item.id] : undefined;
    return (
      <Pressable onPress={() => toggle(item.id)} style={styles.row} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={item.title}>
        {track ? <Artwork track={track} size={44} rounded={6} /> : video ? <VideoThumb video={video} width={78} /> : null}
        <View style={[styles.text, { borderBottomColor: colors.separator }]}>
          <View style={{ flex: 1 }}>
            <Text variant="body" numberOfLines={1}>
              {item.title}
            </Text>
            <Text variant="subhead" tone="secondary" numberOfLines={1}>
              {item.detail}
            </Text>
          </View>
          <Icon name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? colors.accent : colors.tertiaryText} />
        </View>
      </Pressable>
    );
  };

  const action = mode === 'move' ? 'Déplacer' : 'Copier';
  return (
    <ListScreen
      title={folder.split('/').pop() || folder}
      back
      subtitle={`Nouveau dossier · ${folder}`}
      right={
        <Pressable onPress={() => void confirm()} hitSlop={10} disabled={!selected.length || busy} accessibilityRole="button" accessibilityLabel={selected.length ? `${action} ${pluralize(selected.length, 'fichier')}` : action}>
          <Text variant="headline" tone="accent" style={{ opacity: selected.length && !busy ? 1 : 0.4 }}>
            {selected.length ? `${action} (${selected.length})` : action}
          </Text>
        </Pressable>
      }
      data={entries}
      keyExtractor={(e) => e.id}
      renderItem={renderItem}
      keyboardShouldPersistTaps="handled"
      header={
        <View>
          <Text variant="footnote" tone="secondary" style={styles.hint}>
            Choisissez les fichiers à mettre dans ce dossier : il est créé avec eux (Android ne garde pas de dossier vide).
          </Text>
          <Chips options={MODES} value={mode} onChange={setMode} />
          <View style={[styles.search, { backgroundColor: colors.fill }]}>
            <Icon name="search" size={18} color={colors.secondaryText} />
            <TextInput value={query} onChangeText={setQuery} placeholder={kind === 'audio' ? 'Rechercher un morceau' : 'Rechercher une vidéo'} placeholderTextColor={colors.secondaryText} style={[styles.input, { color: colors.text }]} accessibilityLabel="Rechercher" />
          </View>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  newRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER, height: 60 },
  newIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: GUTTER, height: 64 },
  text: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 12, height: '100%', borderBottomWidth: StyleSheet.hairlineWidth, paddingRight: GUTTER },
  hint: { paddingHorizontal: GUTTER, paddingBottom: 8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: GUTTER, marginTop: 6, marginBottom: 12, paddingHorizontal: 10, height: 38, borderRadius: 10 },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
});
