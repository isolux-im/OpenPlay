import * as MediaLibrary from 'expo-media-library/legacy';
import { Alert, Platform, Share } from 'react-native';

import { OpenPlayMedia } from '../../modules/openplay-media';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { useUser } from '../store/user';
import type { Album, Playlist, Track } from '../types';
import { pluralize } from './text';

/** Partage le fichier audio (feuille de partage Android) ; à défaut, son titre en texte. */
export async function shareTrack(track: Track) {
  try {
    if (OpenPlayMedia?.shareAudioAsync && Platform.OS === 'android') {
      await OpenPlayMedia.shareAudioAsync(track.id, track.mimeType || 'audio/*', track.title);
      return;
    }
    await Share.share({ title: track.title, message: `${track.title} — ${track.artist}` });
  } catch {
    useUi.getState().showToast('Partage impossible');
  }
}

export async function shareAlbum(album: Album) {
  await Share.share({ title: album.title, message: `${album.title} — ${album.artist} (${pluralize(album.trackIds.length, 'titre')})` }).catch(() => undefined);
}

export async function sharePlaylist(playlist: Playlist, byId: Record<string, Track>) {
  const lines = playlist.trackIds
    .map((id) => byId[id])
    .filter(Boolean)
    .map((t, i) => `${i + 1}. ${t.title} — ${t.artist}`);
  await Share.share({ title: playlist.name, message: [playlist.name, '', ...lines].join('\n') }).catch(() => undefined);
}

function confirm(title: string, message: string, label: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
      { text: label, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

/**
 * Supprime définitivement des fichiers audio de l'appareil, après confirmation.
 * Android 11 et plus affiche en outre sa propre demande d'autorisation système.
 */
export async function deleteTracksFromDevice(tracks: Track[], what: string): Promise<boolean> {
  const { showToast } = useUi.getState();
  if (!tracks.length) return false;
  const player = usePlayer.getState();
  const current = player.queue[player.index];
  if (tracks.some((t) => t.id === current)) {
    showToast('Passez au morceau suivant avant de supprimer celui en cours');
    return false;
  }
  const ok = await confirm(
    `Supprimer ${what} ?`,
    `${pluralize(tracks.length, 'fichier')} ${tracks.length > 1 ? 'seront supprimés' : 'sera supprimé'} de l'appareil. Cette action est irréversible.`,
    'Supprimer',
  );
  if (!ok) return false;
  const ids = tracks.map((t) => t.id);
  try {
    // Hors Android (aperçu web, tests), seule la bibliothèque de démonstration est modifiée.
    if (OpenPlayMedia) {
      const done = await MediaLibrary.deleteAssetsAsync(ids);
      if (!done) throw new Error('refus');
    }
  } catch {
    showToast(Platform.OS === 'android' && Number(Platform.Version) < 30 ? 'Suppression non prise en charge sur cette version d’Android' : 'Suppression annulée ou impossible');
    return false;
  }
  // La file d'attente doit rester identique côté moteur : retrait un par un, de la fin vers le début.
  const { queue, removeAt } = usePlayer.getState();
  const gone = new Set(ids);
  for (let i = queue.length - 1; i >= 0; i--) if (gone.has(queue[i])) removeAt(i);
  useUser.getState().forgetTracks(ids);
  useLibrary.getState().removeTracks(ids);
  showToast(tracks.length > 1 ? 'Fichiers supprimés' : 'Fichier supprimé');
  return true;
}
