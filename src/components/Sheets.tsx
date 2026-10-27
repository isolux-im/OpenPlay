import { useMemo, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEFAULT_ROOT, MEDIA_ROOTS, isValidDestination, newFolderPath } from '../library/fileOps';
import { compareText, pluralize } from '../library/text';
import { useFolders } from '../store/folders';
import { useLibrary } from '../store/library';
import { describePlaylist, resolvePlaylist, useVideoPlaylists } from '../store/videoPlaylists';
import { useVideos } from '../store/videos';
import { useSeriesIndex } from '../video/useSeries';
import { VideoThumb } from '../video/VideoThumb';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { useUser } from '../store/user';
import { tap } from '../ui/haptics';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';
import { useNow } from '../ui/useNow';
import { Mosaic } from './Artwork';

function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.grabber, { backgroundColor: colors.tertiaryText }]} />
        {children}
      </View>
    </Modal>
  );
}

function SheetAction({ icon, label, onPress, destructive }: { icon: IconName; label: string; onPress: () => void; destructive?: boolean }) {
  const { colors } = useTheme();
  const color = destructive ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={() => {
        tap('selection');
        onPress();
      }}
      style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.fill }]}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Text variant="body" color={color} style={{ flex: 1 }}>
        {label}
      </Text>
      <Icon name={icon} size={22} color={destructive ? colors.danger : colors.text} />
    </Pressable>
  );
}

function PlaylistPickerSheet() {
  const { colors } = useTheme();
  const trackIds = useUi((s) => s.playlistPicker);
  const closeAll = useUi((s) => s.closeAll);
  const openPrompt = useUi((s) => s.openPrompt);
  const showToast = useUi((s) => s.showToast);
  const playlists = useUser((s) => s.playlists);
  const addToPlaylist = useUser((s) => s.addToPlaylist);
  const createPlaylist = useUser((s) => s.createPlaylist);
  const byId = useLibrary((s) => s.index.byId);

  return (
    <BottomSheet visible={!!trackIds} onClose={closeAll}>
      <Text variant="headline" style={styles.sheetTitle}>
        Ajouter à une playlist
      </Text>
      <ScrollView style={{ maxHeight: 420 }}>
        <Pressable
          style={styles.pickRow}
          onPress={() =>
            openPrompt({
              title: 'Nouvelle playlist',
              placeholder: 'Nom de la playlist',
              confirmLabel: 'Créer',
              onSubmit: (name) => {
                createPlaylist(name, trackIds ?? []);
                showToast('Playlist créée');
              },
            })
          }
          accessibilityRole="button">
          <View style={[styles.newTile, { backgroundColor: colors.fill }]}>
            <Icon name="add" size={30} color={colors.accent} />
          </View>
          <Text variant="body" tone="accent">
            Nouvelle playlist…
          </Text>
        </Pressable>
        {playlists.map((p) => (
          <Pressable
            key={p.id}
            style={({ pressed }) => [styles.pickRow, pressed && { backgroundColor: colors.fill }]}
            onPress={() => {
              closeAll();
              addToPlaylist(p.id, trackIds ?? []);
              tap('success');
              showToast(`Ajouté à « ${p.name} »`);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Ajouter à ${p.name}`}>
            <Mosaic tracks={p.trackIds.map((id) => byId[id]).filter(Boolean)} size={52} rounded={8} />
            <View style={{ flex: 1 }}>
              <Text variant="body" numberOfLines={1}>
                {p.name}
              </Text>
              <Text variant="subhead" tone="secondary">
                {pluralize(p.trackIds.length, 'morceau', 'morceaux')}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

/** Ajout de séries ou de vidéos à une playlist vidéo (ou à une nouvelle). */
function VideoPlaylistPickerSheet() {
  const { colors } = useTheme();
  const items = useUi((s) => s.videoPlaylistPicker);
  const closeAll = useUi((s) => s.closeAll);
  const openPrompt = useUi((s) => s.openPrompt);
  const showToast = useUi((s) => s.showToast);
  const playlists = useVideoPlaylists((s) => s.playlists);
  const videosById = useVideos((s) => s.byId);
  const { byKey } = useSeriesIndex();

  return (
    <BottomSheet visible={!!items} onClose={closeAll}>
      <Text variant="headline" style={styles.sheetTitle}>
        Ajouter à une playlist vidéo
      </Text>
      <ScrollView style={{ maxHeight: 420 }}>
        <Pressable
          style={styles.pickRow}
          onPress={() =>
            openPrompt({
              title: 'Nouvelle playlist vidéo',
              placeholder: 'Nom (ex. Animés, Policier…)',
              confirmLabel: 'Créer',
              onSubmit: (name) => {
                useVideoPlaylists.getState().create(name, items ?? []);
                showToast('Playlist créée');
              },
            })
          }
          accessibilityRole="button">
          <View style={[styles.newTile, { backgroundColor: colors.fill }]}>
            <Icon name="add" size={30} color={colors.accent} />
          </View>
          <Text variant="body" tone="accent">
            Nouvelle playlist…
          </Text>
        </Pressable>
        {playlists.map((p) => {
          const resolved = resolvePlaylist(p, byKey, videosById);
          const first = resolved[0];
          const cover = first ? (first.kind === 'series' ? first.series.episodes[0] : first.video) : null;
          return (
            <Pressable
              key={p.id}
              style={({ pressed }) => [styles.pickRow, pressed && { backgroundColor: colors.fill }]}
              onPress={() => {
                closeAll();
                const added = useVideoPlaylists.getState().addItems(p.id, items ?? []);
                tap('success');
                showToast(added ? `Ajouté à « ${p.name} »` : `Déjà dans « ${p.name} »`);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Ajouter à ${p.name}`}>
              {cover ? <VideoThumb video={cover} width={52} style={{ borderRadius: 8 }} /> : <View style={[styles.newTile, { backgroundColor: colors.fill }]}><Icon name="film-outline" size={24} color={colors.secondaryText} /></View>}
              <View style={{ flex: 1 }}>
                <Text variant="body" numberOfLines={1}>
                  {p.name}
                </Text>
                <Text variant="subhead" tone="secondary">
                  {describePlaylist(resolved)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

/** Dossier de destination pour copier ou déplacer : dossiers existants (racines autorisées par Android) ou nouveau. */
function FolderPickerSheet() {
  const { colors } = useTheme();
  const request = useUi((s) => s.folderPicker);
  const closeAll = useUi((s) => s.closeAll);
  const openPrompt = useUi((s) => s.openPrompt);
  const tracks = useLibrary((s) => s.allTracks);
  const videos = useVideos((s) => s.videos);
  const created = useFolders((s) => s.created);
  const kind = request?.kind ?? 'video';
  const folders = useMemo(() => {
    const all = [...(kind === 'video' ? videos.map((v) => v.folder) : tracks.map((t) => t.folder)), ...created[kind]];
    return [...new Set(all)].filter((f) => isValidDestination(kind, f)).sort(compareText);
  }, [kind, videos, tracks, created]);

  const pick = (folder: string) => {
    const run = request?.onPick;
    closeAll();
    run?.(folder);
  };

  return (
    <BottomSheet visible={!!request} onClose={closeAll}>
      <Text variant="headline" style={styles.sheetTitle}>
        {request?.title}
      </Text>
      <ScrollView style={{ maxHeight: 440 }}>
        <Pressable
          style={styles.pickRow}
          onPress={() => {
            const run = request?.onPick;
            openPrompt({
              title: 'Nouveau dossier',
              message: `Créé dans « ${DEFAULT_ROOT[kind]} » (ou saisissez un chemin commençant par ${MEDIA_ROOTS[kind].join(', ')}).`,
              placeholder: 'Nom du dossier',
              confirmLabel: 'Choisir',
              onSubmit: (name) => {
                const path = newFolderPath(kind, name);
                if (path) run?.(path);
              },
            });
          }}
          accessibilityRole="button">
          <View style={[styles.newTile, { backgroundColor: colors.fill }]}>
            <Icon name="folder-open-outline" size={26} color={colors.accent} />
          </View>
          <Text variant="body" tone="accent">
            Nouveau dossier…
          </Text>
        </Pressable>
        {folders.map((f) => (
          <Pressable
            key={f}
            style={({ pressed }) => [styles.pickRow, pressed && { backgroundColor: colors.fill }]}
            onPress={() => pick(f)}
            accessibilityRole="button"
            accessibilityLabel={`Dossier ${f}${f === request?.current ? ' (actuel)' : ''}`}>
            <View style={[styles.newTile, { backgroundColor: colors.fill }]}>
              <Icon name="folder-outline" size={24} color={colors.secondaryText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="body" numberOfLines={1}>
                {f.split('/').pop()}
              </Text>
              <Text variant="subhead" tone="secondary" numberOfLines={1}>
                {f === request?.current ? `${f} · actuel` : f}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

const SLEEP_OPTIONS = [5, 15, 30, 45, 60, 90];

function SleepTimerSheet() {
  const { colors } = useTheme();
  const visible = useUi((s) => s.sleepSheet);
  const closeAll = useUi((s) => s.closeAll);
  const showToast = useUi((s) => s.showToast);
  const sleep = usePlayer((s) => s.sleep);
  const setSleepTimer = usePlayer((s) => s.setSleepTimer);
  const now = useNow(15_000);
  const remaining = sleep.endsAt ? Math.max(0, Math.round((sleep.endsAt - now) / 60000)) : null;
  return (
    <BottomSheet visible={visible} onClose={closeAll}>
      <Text variant="headline" style={styles.sheetTitle}>
        Minuterie de sommeil
      </Text>
      {sleep.endsAt || sleep.atTrackEnd ? (
        <Text variant="subhead" tone="secondary" style={styles.sheetSubtitle}>
          {sleep.atTrackEnd ? 'Arrêt à la fin du morceau en cours' : `Arrêt dans ${remaining} min`}
        </Text>
      ) : null}
      <View style={[styles.group, { backgroundColor: colors.elevated }]}>
        {SLEEP_OPTIONS.map((m) => (
          <SheetAction key={m} icon="moon-outline" label={m < 60 ? `${m} minutes` : `${m / 60} h${m % 60 ? ' 30' : ''}`} onPress={() => { setSleepTimer(m); closeAll(); showToast(`Arrêt dans ${m} min`); }} />
        ))}
        <SheetAction icon="musical-note-outline" label="Fin du morceau en cours" onPress={() => { setSleepTimer(null, true); closeAll(); showToast('Arrêt à la fin du morceau'); }} />
        {sleep.endsAt || sleep.atTrackEnd ? (
          <SheetAction icon="close-circle-outline" label="Désactiver la minuterie" destructive onPress={() => { setSleepTimer(null); closeAll(); }} />
        ) : null}
      </View>
    </BottomSheet>
  );
}

function PromptDialog() {
  const prompt = useUi((s) => s.prompt);
  // La clé recrée le formulaire (et sa valeur initiale) à chaque nouvelle demande.
  return <PromptForm key={prompt?.id ?? 0} prompt={prompt} />;
}

function PromptForm({ prompt }: { prompt: ReturnType<typeof useUi.getState>['prompt'] }) {
  const { colors } = useTheme();
  const closeAll = useUi((s) => s.closeAll);
  const [value, setValue] = useState(prompt?.initialValue ?? '');
  const submit = () => {
    const v = value.trim();
    if (!v || !prompt) return;
    closeAll();
    prompt.onSubmit(v);
  };
  return (
    <Modal visible={!!prompt} transparent animationType="fade" onRequestClose={closeAll} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.dialogWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeAll} />
        <View style={[styles.dialog, { backgroundColor: colors.card }]}>
          <Text variant="headline" style={{ textAlign: 'center' }}>
            {prompt?.title}
          </Text>
          {prompt?.message ? (
            <Text variant="footnote" tone="secondary" style={{ textAlign: 'center', marginTop: 4 }}>
              {prompt.message}
            </Text>
          ) : null}
          <TextInput
            autoFocus
            value={value}
            onChangeText={setValue}
            onSubmitEditing={submit}
            placeholder={prompt?.placeholder}
            placeholderTextColor={colors.tertiaryText}
            style={[styles.input, { color: colors.text, backgroundColor: colors.fill }]}
            returnKeyType="done"
            secureTextEntry={prompt?.secure}
            autoCapitalize={prompt?.secure ? 'none' : 'sentences'}
            autoCorrect={!prompt?.secure}
            accessibilityLabel={prompt?.placeholder ?? prompt?.title}
          />
          <View style={styles.dialogButtons}>
            <Pressable onPress={closeAll} style={styles.dialogButton} accessibilityRole="button">
              <Text variant="body" tone="accent">
                Annuler
              </Text>
            </Pressable>
            <Pressable onPress={submit} style={styles.dialogButton} accessibilityRole="button" disabled={!value.trim()}>
              <Text variant="headline" tone="accent" style={{ opacity: value.trim() ? 1 : 0.4 }}>
                {prompt?.confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Toast() {
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useUi((s) => s.toast);
  if (!toast) return null;
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(16)}
      exiting={FadeOutDown}
      pointerEvents="none"
      style={[styles.toast, { top: insets.top + 8, backgroundColor: dark ? '#2C2C2E' : '#FFFFFF', shadowColor: colors.shadow }]}>
      <Icon name="checkmark-circle" size={20} color={colors.accent} />
      <Text variant="subhead" weight="medium">
        {toast}
      </Text>
    </Animated.View>
  );
}

export function SheetHost() {
  return (
    <>
      <PlaylistPickerSheet />
      <VideoPlaylistPickerSheet />
      <FolderPickerSheet />
      <SleepTimerSheet />
      <PromptDialog />
      <Toast />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: 8, opacity: 0.6 },
  group: { marginHorizontal: 12, marginTop: 10, borderRadius: radius.lg, overflow: 'hidden' },
  action: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 50 },
  sheetTitle: { textAlign: 'center', paddingVertical: 8 },
  sheetSubtitle: { textAlign: 'center', marginBottom: 4 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: GUTTER, paddingVertical: 8 },
  newTile: { width: 52, height: 52, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dialogWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  dialog: { width: '100%', maxWidth: 340, borderRadius: radius.xl, paddingTop: 20 },
  input: { marginHorizontal: 16, marginTop: 14, borderRadius: 10, paddingHorizontal: 12, height: 44, fontSize: 16 },
  dialogButtons: { flexDirection: 'row', marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.3)' },
  dialogButton: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
