import { useEffect, useState, type ReactNode } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deleteTracksFromDevice, shareAlbum, sharePlaylist, shareTrack } from '../library/actions';
import { copyTracks, copyVideos, deleteVideosFromDevice, moveTracks, moveVideos, renameTrack, renameVideo, splitName, trackFileName, type MediaKind } from '../library/fileOps';
import { describePlaylist, playlistVideoIds, resolvePlaylist, useVideoPlaylists } from '../store/videoPlaylists';
import { seriesProgress } from '../video/series';
import { useSeriesIndex } from '../video/useSeries';
import { formatDuration, formatTotalDuration, pluralize } from '../library/text';
import { useSubtitles } from '../store/subtitles';
import { useVideoHistory } from '../store/videoHistory';
import { useVideoPlayer } from '../store/videoPlayer';
import { useVideos } from '../store/videos';
import { formatResolution, resumePosition } from '../video/library';
import { formatSize } from '../video/VideoList';
import { VideoThumb } from '../video/VideoThumb';
import { openVideoWith, shareVideo } from '../video/actions';
import { canImportSubtitles, importSubtitles, unlinkSubtitles } from '../video/subtitleFiles';
import { navigateInCurrentTab } from '../navigation/ref';
import type { SharedStackParams } from '../navigation/types';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUi, type ContextTarget, type MenuAnchor, type VideoPlaylistContext } from '../store/ui';
import { useUser } from '../store/user';
import type { Track } from '../types';
import { tap } from '../ui/haptics';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';
import { Artwork, Mosaic } from './Artwork';
import { Glass } from './Glass';

type Item = { icon: IconName; label: string; onPress: () => void; destructive?: boolean; keepOpen?: boolean };
type Model = { header: ReactNode; groups: Item[][]; body?: ReactNode };

const MENU_WIDTH = 288;

/** Ouvre un écran de la bibliothèque ; depuis le lecteur plein écran, le réduit d'abord pour le montrer. */
function goTo<K extends keyof SharedStackParams>(screen: K, params: SharedStackParams[K]) {
  usePlayer.getState().setExpanded(false);
  navigateInCurrentTab(screen, params);
}
const EDGE = 14;

function MenuHeader({ art, title, subtitle }: { art: ReactNode; title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      {art}
      <View style={{ flex: 1 }}>
        <Text variant="subhead" weight="semibold" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

/** Ajoute tous les morceaux aux favoris, ou les en retire s'ils y sont déjà tous. */
function favoriteItem(ids: string[], favorites: string[], toggle: (id: string) => void, showToast: (m: string) => void): Item {
  const missing = ids.filter((id) => !favorites.includes(id));
  const all = ids.length > 0 && missing.length === 0;
  return {
    icon: all ? 'heart-dislike-outline' : 'heart-outline',
    label: all ? 'Retirer des favoris' : 'Ajouter aux favoris',
    onPress: () => {
      tap('success');
      (all ? ids : missing).forEach(toggle);
      showToast(all ? 'Retiré des favoris' : 'Ajouté aux favoris');
    },
  };
}

/** Renommer, copier, déplacer : actions sur les vrais fichiers de l'appareil (Android demande l'autorisation). */
function fileItems(opts: {
  kind: MediaKind;
  what: string;
  folder?: string;
  rename?: { filename: string; run: (name: string) => void };
  copy: (folder: string) => void;
  move: (folder: string) => void;
}): Item[] {
  const { openPrompt, openFolderPicker } = useUi.getState();
  const items: Item[] = [];
  if (opts.rename) {
    const { base, ext } = splitName(opts.rename.filename);
    const run = opts.rename.run;
    items.push({
      icon: 'create-outline',
      label: 'Renommer le fichier…',
      keepOpen: true,
      onPress: () => openPrompt({ title: 'Renommer le fichier', message: ext ? `Extension conservée : ${ext}` : undefined, initialValue: base, placeholder: 'Nom du fichier', confirmLabel: 'Renommer', onSubmit: run }),
    });
  }
  items.push(
    { icon: 'copy-outline', label: `Copier ${opts.what} vers…`, keepOpen: true, onPress: () => openFolderPicker({ kind: opts.kind, title: `Copier ${opts.what} vers…`, current: opts.folder, onPick: opts.copy }) },
    { icon: 'folder-open-outline', label: `Déplacer ${opts.what} vers…`, keepOpen: true, onPress: () => openFolderPicker({ kind: opts.kind, title: `Déplacer ${opts.what} vers…`, current: opts.folder, onPick: opts.move }) },
  );
  return items;
}

/** Élément ouvert depuis une playlist vidéo : monter, descendre, retirer. */
function playlistOrderItems(ctx: VideoPlaylistContext | undefined): Item[] {
  if (!ctx) return [];
  const store = useVideoPlaylists.getState();
  return [
    ...(ctx.index > 0 ? [{ icon: 'arrow-up-outline' as const, label: 'Monter', onPress: () => store.moveItem(ctx.playlistId, ctx.index, ctx.index - 1) }] : []),
    ...(ctx.index < ctx.count - 1 ? [{ icon: 'arrow-down-outline' as const, label: 'Descendre', onPress: () => store.moveItem(ctx.playlistId, ctx.index, ctx.index + 1) }] : []),
    { icon: 'remove-circle-outline', label: 'Retirer de la playlist', destructive: true, onPress: () => store.removeItem(ctx.playlistId, ctx.index) },
  ];
}

function useMenuModel(target: ContextTarget): Model | null {
  const { colors } = useTheme();
  const index = useLibrary((s) => s.index);
  const favorites = useUser((s) => s.favorites);
  const playlists = useUser((s) => s.playlists);
  const { toggleFavorite, removeFromPlaylist, deletePlaylist, renamePlaylist } = useUser.getState();
  const { openPlaylistPicker, openPrompt, showToast } = useUi.getState();
  const player = usePlayer.getState();
  const video = useVideos((s) => (target.kind === 'video' ? s.byId[target.videoId] : undefined));
  const videoEntry = useVideoHistory((s) => (target.kind === 'video' ? s.entries[target.videoId] : undefined));
  const videoFavorite = useVideoHistory((s) => (target.kind === 'video' ? s.favorites.includes(target.videoId) : false));
  const videoSubtitles = useSubtitles((s) => (target.kind === 'video' ? s.byVideo[target.videoId] : undefined));
  const seriesIndex = useSeriesIndex();
  const videosById = useVideos((s) => s.byId);
  const videoEntries = useVideoHistory((s) => s.entries);
  const videoPlaylist = useVideoPlaylists((s) => (target.kind === 'videoPlaylist' ? s.playlists.find((p) => p.id === target.playlistId) : undefined));

  if (target.kind === 'info') {
    return {
      header: (
        <View style={styles.header}>
          <Icon name="alert-circle-outline" size={22} color={colors.text} />
          <Text variant="headline" style={{ flex: 1 }}>
            {target.title}
          </Text>
        </View>
      ),
      groups: [],
      body: (
        <Text variant="callout" tone="secondary" style={styles.info}>
          {target.text}
        </Text>
      ),
    };
  }

  if (target.kind === 'video') {
    if (!video) return null;
    const { open } = useVideoPlayer.getState();
    const history = useVideoHistory.getState();
    const resumeAt = resumePosition(videoEntry, video.durationSec);
    const details = [
      `Fichier : ${video.filename}`,
      `Dossier : ${video.folder}`,
      `Durée : ${formatDuration(video.durationSec)}`,
      video.sizeBytes ? `Taille : ${formatSize(video.sizeBytes)}` : null,
      formatResolution(video) ? `Résolution : ${formatResolution(video)}` : null,
      `Format : ${video.mimeType}`,
      video.addedAt ? `Ajoutée le ${new Date(video.addedAt).toLocaleDateString('fr-FR')}` : null,
    ].filter(Boolean);
    return {
      header: <MenuHeader art={<VideoThumb video={video} width={78} style={{ borderRadius: 8 }} />} title={video.title} subtitle={`Vidéo · ${formatDuration(video.durationSec)}`} />,
      groups: [
        resumeAt > 0
          ? [
              { icon: 'play-outline', label: `Reprendre à ${formatDuration(resumeAt)}`, onPress: () => open(video.id, target.list) },
              { icon: 'refresh-outline', label: 'Recommencer', onPress: () => open(video.id, target.list, { restart: true }) },
            ]
          : [{ icon: 'play-outline', label: 'Lire', onPress: () => open(video.id, target.list, { restart: true }) }],
        [
          {
            icon: videoFavorite ? 'heart-dislike-outline' : 'heart-outline',
            label: videoFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris',
            onPress: () => {
              tap('success');
              history.toggleFavorite(video.id);
              showToast(videoFavorite ? 'Retiré des favoris' : 'Ajouté aux favoris');
            },
          },
          { icon: 'information-circle-outline', label: 'Informations', onPress: () => Alert.alert(video.title, [...details, videoSubtitles ? `Sous-titres : ${videoSubtitles.name}` : null].filter(Boolean).join('\n')) },
          ...(canImportSubtitles() ? [{ icon: 'chatbox-ellipses-outline' as const, label: videoSubtitles ? 'Remplacer les sous-titres…' : 'Associer des sous-titres…', onPress: () => void importSubtitles(video) }] : []),
          ...(videoSubtitles
            ? [
                {
                  icon: 'chatbox-outline' as const,
                  label: 'Retirer les sous-titres',
                  onPress: () => {
                    unlinkSubtitles(video.id);
                    showToast('Sous-titres retirés');
                  },
                },
              ]
            : []),
          { icon: 'share-outline', label: 'Partager', onPress: () => void shareVideo(video) },
          { icon: 'open-outline', label: 'Ouvrir avec…', onPress: () => void openVideoWith(video) },
        ],
        [
          { icon: 'add-circle-outline', label: 'Ajouter à une playlist vidéo', keepOpen: true, onPress: () => useUi.getState().openVideoPlaylistPicker([{ kind: 'video', id: video.id }]) },
          ...playlistOrderItems(target.playlist),
        ],
        fileItems({
          kind: 'video',
          what: 'la vidéo',
          folder: video.folder,
          rename: { filename: video.filename, run: (name) => void renameVideo(video, name) },
          copy: (folder) => void copyVideos([video], folder),
          move: (folder) => void moveVideos([video], folder),
        }),
        [
          ...(videoEntry ? [{ icon: 'time-outline' as const, label: "Retirer de l'historique", destructive: true, onPress: () => history.remove(video.id) }] : []),
          { icon: 'trash-outline', label: 'Supprimer', destructive: true, onPress: () => void deleteVideosFromDevice([video], `« ${video.title} »`) },
        ],
      ],
    };
  }

  if (target.kind === 'series') {
    const series = seriesIndex.byKey[target.seriesKey];
    if (!series) return null;
    const p = seriesProgress(series, videoEntries);
    const ids = series.episodes.map((e) => e.id);
    const { open } = useVideoPlayer.getState();
    const folders = [...new Set(series.episodes.map((e) => e.folder))];
    return {
      header: <MenuHeader art={<VideoThumb video={p.next ?? series.episodes[0]} width={78} style={{ borderRadius: 8 }} />} title={series.name} subtitle={`Série · ${pluralize(p.total, 'épisode')}`} />,
      groups: [
        [
          p.next
            ? { icon: 'play-outline', label: p.watched ? 'Continuer' : 'Commencer', onPress: () => open(p.next!.id, ids) }
            : { icon: 'refresh-outline', label: 'Revoir depuis le début', onPress: () => open(series.episodes[0].id, ids, { restart: true }) },
          { icon: 'tv-outline', label: 'Afficher la série', onPress: () => goTo('VideoSeries', { key: series.key }) },
        ],
        [
          { icon: 'add-circle-outline', label: 'Ajouter à une playlist vidéo', keepOpen: true, onPress: () => useUi.getState().openVideoPlaylistPicker([{ kind: 'series', key: series.key }]) },
          ...playlistOrderItems(target.playlist),
        ],
        fileItems({
          kind: 'video',
          what: 'la série',
          folder: folders.length === 1 ? folders[0] : undefined,
          copy: (folder) => void copyVideos(series.episodes, folder),
          move: (folder) => void moveVideos(series.episodes, folder),
        }),
        [{ icon: 'trash-outline', label: 'Supprimer la série', destructive: true, onPress: () => void deleteVideosFromDevice(series.episodes, `les ${series.episodes.length} épisodes de « ${series.name} »`) }],
      ],
    };
  }

  if (target.kind === 'videoPlaylist') {
    if (!videoPlaylist) return null;
    const resolved = resolvePlaylist(videoPlaylist, seriesIndex.byKey, videosById);
    const ids = playlistVideoIds(resolved);
    const store = useVideoPlaylists.getState();
    const cover = resolved[0] ? (resolved[0].kind === 'series' ? resolved[0].series.episodes[0] : resolved[0].video) : null;
    return {
      header: <MenuHeader art={cover ? <VideoThumb video={cover} width={78} style={{ borderRadius: 8 }} /> : <Icon name="film-outline" size={28} color={colors.secondaryText} />} title={videoPlaylist.name} subtitle={`Playlist vidéo · ${describePlaylist(resolved)}`} />,
      groups: ([
        ids.length ? [{ icon: 'play-outline', label: 'Lire', onPress: () => useVideoPlayer.getState().open(ids[0], ids) }] : [],
        [
          { icon: 'create-outline', label: 'Renommer', keepOpen: true, onPress: () => openPrompt({ title: 'Renommer la playlist', initialValue: videoPlaylist.name, confirmLabel: 'Enregistrer', placeholder: 'Nom', onSubmit: (v) => store.rename(videoPlaylist.id, v) }) },
        ],
        [
          {
            icon: 'trash-outline',
            label: 'Supprimer la playlist',
            destructive: true,
            onPress: () =>
              Alert.alert('Supprimer la playlist ?', `« ${videoPlaylist.name} » sera supprimée. Les séries et vidéos restent sur l'appareil.`, [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Supprimer', style: 'destructive', onPress: () => store.remove(videoPlaylist.id) },
              ]),
          },
        ],
      ] as Item[][]).filter((g) => g.length > 0),
    };
  }

  const playItems = (ids: string[], label: string | null, shuffle: boolean): Item[] => [
    { icon: 'play-outline', label: 'Lire', onPress: () => player.playTracks(ids, 0, { label }) },
    ...(shuffle ? [{ icon: 'shuffle-outline' as const, label: 'Lecture aléatoire', onPress: () => player.playTracks(ids, undefined, { shuffle: true, label }) }] : []),
    { icon: 'return-down-forward-outline', label: 'Lire ensuite', onPress: () => { player.playNext(ids); showToast('Lu ensuite'); } },
    { icon: 'list-outline', label: "Ajouter à la file d'attente", onPress: () => { player.addToQueue(ids); showToast("Ajouté à la file d'attente"); } },
  ];

  if (target.kind === 'track') {
    const track = index.byId[target.trackId];
    if (!track) return null;
    const { context } = target;
    const removal: Item[] = [];
    if (context.playlistId !== undefined && context.playlistIndex !== undefined) {
      removal.push({ icon: 'remove-circle-outline', label: 'Retirer de la playlist', destructive: true, onPress: () => removeFromPlaylist(context.playlistId!, context.playlistIndex!) });
    }
    if (context.queueIndex !== undefined) {
      removal.push({ icon: 'remove-circle-outline', label: 'Retirer de la file', destructive: true, onPress: () => player.removeAt(context.queueIndex!) });
    }
    removal.push({ icon: 'trash-outline', label: 'Supprimer', destructive: true, onPress: () => void deleteTracksFromDevice([track], `« ${track.title} »`) });
    return {
      header: <MenuHeader art={<Artwork track={track} size={44} rounded={8} />} title={track.title} subtitle={`${track.artist} · ${formatDuration(track.durationSec)}`} />,
      groups: [
        playItems([track.id], null, false),
        [
          { icon: 'add-circle-outline', label: 'Ajouter à une playlist', keepOpen: true, onPress: () => openPlaylistPicker([track.id]) },
          favoriteItem([track.id], favorites, toggleFavorite, showToast),
          { icon: 'share-outline', label: 'Partager', onPress: () => void shareTrack(track) },
        ],
        [
          { icon: 'albums-outline', label: "Afficher l'album", onPress: () => goTo('Album', { id: track.albumId }) },
          { icon: 'person-outline', label: "Afficher l'artiste", onPress: () => goTo('Artist', { id: track.albumArtist.toLowerCase() }) },
          { icon: 'create-outline', label: 'Modifier les infos', onPress: () => goTo('EditTrack', { id: track.id }) },
        ],
        fileItems({
          kind: 'audio',
          what: 'le fichier',
          folder: track.folder,
          rename: { filename: trackFileName(track), run: (name) => void renameTrack(track, name) },
          copy: (folder) => void copyTracks([track], folder),
          move: (folder) => void moveTracks([track], folder),
        }),
        removal,
      ],
    };
  }

  if (target.kind === 'album') {
    const album = index.albumsById[target.albumId];
    if (!album) return null;
    const tracks = album.trackIds.map((id) => index.byId[id]).filter(Boolean) as Track[];
    return {
      header: <MenuHeader art={<Artwork track={tracks[0]} size={44} rounded={8} />} title={album.title} subtitle={`Album · ${pluralize(tracks.length, 'titre')}`} />,
      groups: [
        playItems(album.trackIds, album.title, true),
        [
          { icon: 'add-circle-outline', label: 'Ajouter à une playlist', keepOpen: true, onPress: () => openPlaylistPicker(album.trackIds) },
          favoriteItem(album.trackIds, favorites, toggleFavorite, showToast),
          { icon: 'share-outline', label: 'Partager', onPress: () => void shareAlbum(album) },
        ],
        [{ icon: 'person-outline', label: "Afficher l'artiste", onPress: () => goTo('Artist', { id: album.artist.toLowerCase() }) }],
        fileItems({
          kind: 'audio',
          what: "l'album",
          folder: [...new Set(tracks.map((t) => t.folder))].length === 1 ? tracks[0]?.folder : undefined,
          copy: (folder) => void copyTracks(tracks, folder),
          move: (folder) => void moveTracks(tracks, folder),
        }),
        [{ icon: 'trash-outline', label: "Supprimer l'album", destructive: true, onPress: () => void deleteTracksFromDevice(tracks, `l'album « ${album.title} »`) }],
      ],
    };
  }

  const playlist = playlists.find((p) => p.id === target.playlistId);
  if (!playlist) return null;
  const tracks = playlist.trackIds.map((id) => index.byId[id]).filter(Boolean) as Track[];
  const ids = tracks.map((t) => t.id);
  const total = tracks.reduce((s, t) => s + t.durationSec, 0);
  return {
    header: <MenuHeader art={<Mosaic tracks={tracks} size={44} rounded={8} />} title={playlist.name} subtitle={`${pluralize(tracks.length, 'titre')} · ${formatTotalDuration(total)}`} />,
    groups: ([
      ids.length ? playItems(ids, playlist.name, true) : [],
      [
        { icon: 'create-outline', label: 'Renommer', keepOpen: true, onPress: () => openPrompt({ title: 'Renommer la playlist', initialValue: playlist.name, confirmLabel: 'Enregistrer', placeholder: 'Nom', onSubmit: (v) => renamePlaylist(playlist.id, v) }) },
        ...(ids.length ? [favoriteItem(ids, favorites, toggleFavorite, showToast)] : []),
        { icon: 'share-outline', label: 'Partager', onPress: () => void sharePlaylist(playlist, index.byId) },
      ],
      [
        {
          icon: 'trash-outline',
          label: 'Supprimer la playlist',
          destructive: true,
          onPress: () =>
            Alert.alert('Supprimer la playlist ?', `« ${playlist.name} » sera supprimée. Les morceaux restent sur l'appareil.`, [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Supprimer', style: 'destructive', onPress: () => deletePlaylist(playlist.id) },
            ]),
        },
      ],
    ] as Item[][]).filter((g) => g.length > 0),
  };
}

function MenuRow({ item, first }: { item: Item; first: boolean }) {
  const { colors } = useTheme();
  const closeAll = useUi((s) => s.closeAll);
  const color = item.destructive ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={() => {
        tap('selection');
        if (!item.keepOpen) closeAll();
        item.onPress();
      }}
      style={({ pressed }) => [styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassSeparator }, pressed && { backgroundColor: colors.fill }]}
      accessibilityRole="menuitem"
      accessibilityLabel={item.label}>
      <Text variant="body" color={color} style={{ flex: 1 }} numberOfLines={1}>
        {item.label}
      </Text>
      <Icon name={item.icon} size={20} color={color} />
    </Pressable>
  );
}

function Panel({ target, anchor }: { target: ContextTarget; anchor: MenuAnchor | null }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const model = useMenuModel(target);
  const [height, setHeight] = useState(0);
  if (!model) return null;

  const width = Math.min(W - EDGE * 2, MENU_WIDTH);
  const minTop = insets.top + EDGE;
  const maxBottom = H - insets.bottom - EDGE;
  const maxHeight = maxBottom - minTop;
  const h = Math.min(height, maxHeight);
  let left = (W - width) / 2;
  let top = (H - h) / 2;
  if (anchor) {
    left = Math.min(Math.max(anchor.x - width / 2, EDGE), W - width - EDGE);
    // Sous le doigt s'il y a la place, sinon au-dessus.
    top = anchor.y + 10 + h <= maxBottom ? anchor.y + 10 : anchor.y - 10 - h;
  }
  top = Math.min(Math.max(top, minTop), maxBottom - h);

  return (
    <Animated.View
      entering={ZoomIn.duration(170)}
      exiting={ZoomOut.duration(120)}
      style={[styles.panel, { width, left, top, opacity: height ? 1 : 0 }]}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      accessibilityRole="menu"
      accessibilityViewIsModal>
      <Glass radius={22}>
        <ScrollView style={{ maxHeight }} bounces={false} showsVerticalScrollIndicator={false}>
          {model.header}
          {model.body}
          {model.groups.map((group, g) => (
            <View key={g} style={{ borderTopWidth: 6, borderTopColor: colors.glassSeparator }}>
              {group.map((item, i) => (
                <MenuRow key={item.label} item={item} first={i === 0} />
              ))}
            </View>
          ))}
        </ScrollView>
      </Glass>
    </Animated.View>
  );
}

/** Menu contextuel vitré (appui long sur un morceau, un album ou une playlist), ancré au point d'appui. */
export function ContextMenuHost() {
  const { dark } = useTheme();
  const menu = useUi((s) => s.menu);
  const closeAll = useUi((s) => s.closeAll);

  useEffect(() => {
    if (!menu) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeAll();
      return true;
    });
    return () => sub.remove();
  }, [menu, closeAll]);

  if (!menu) return null;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.16)' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeAll} accessibilityLabel="Fermer le menu" />
      </Animated.View>
      <Panel key={JSON.stringify(menu)} target={menu.target} anchor={menu.anchor} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 46 },
  info: { paddingHorizontal: 16, paddingBottom: 16 },
});
