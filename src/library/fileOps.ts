import * as MediaLibrary from 'expo-media-library/legacy';
import { Alert, Platform } from 'react-native';

import { OpenPlayMedia } from '../../modules/openplay-media';
import { describeError, recordDiagnostic } from '../diagnostics/crashReports';
import { useFolders } from '../store/folders';
import { useLibrary } from '../store/library';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { useVideoHistory } from '../store/videoHistory';
import { useVideos } from '../store/videos';
import type { Track } from '../types';
import type { Video } from '../video/types';
import { normalizeText, pluralize } from './text';

/**
 * Renommer, copier, déplacer, supprimer des fichiers audio et vidéo de l'appareil (MediaStore).
 * Le fichier garde son identifiant après un renommage ou un déplacement : favoris, playlists, historique,
 * positions de reprise et sous-titres associés le suivent. Sans module natif (web, tests), seule la
 * bibliothèque de démonstration est modifiée.
 */
export type MediaKind = 'audio' | 'video';
export type FileOp = 'rename' | 'move' | 'copy';

/** Dossiers racine qu'Android accepte pour chaque type de fichier (MediaStore). */
export const MEDIA_ROOTS: Record<MediaKind, string[]> = {
  audio: ['Music', 'Podcasts', 'Audiobooks', 'Alarms', 'Notifications', 'Ringtones'],
  video: ['Movies', 'DCIM', 'Pictures'],
};
/** Dossier où sont créés les nouveaux dossiers. */
export const DEFAULT_ROOT: Record<MediaKind, string> = { audio: 'Music', video: 'Movies' };

const isDemo = () => !OpenPlayMedia;
const toast = (m: string) => useUi.getState().showToast(m);

export function isValidDestination(kind: MediaKind, folder: string): boolean {
  const root = folder.split('/').filter(Boolean)[0];
  return !!root && MEDIA_ROOTS[kind].includes(root);
}

/** Nom de fichier sans caractères interdits par Android (/ \ : * ? " < > |), espaces et points superflus retirés. */
export function cleanFileName(input: string): string {
  return input
    .replace(/[/\\:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 120);
}

/** Nom de dossier saisi : mêmes règles, un seul niveau. */
export function cleanFolderName(input: string): string {
  return cleanFileName(input).replace(/\.+$/, '');
}

/** Chemin saisi pour un nouveau dossier : sous le dossier racine par défaut, sauf s'il commence par une racine valide. */
export function newFolderPath(kind: MediaKind, input: string): string | null {
  const parts = input.split('/').map(cleanFolderName).filter(Boolean);
  if (!parts.length) return null;
  const path = parts.join('/');
  return isValidDestination(kind, path) ? path : `${DEFAULT_ROOT[kind]}/${path}`;
}

export function splitName(filename: string): { base: string; ext: string } {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? { base: filename.slice(0, dot), ext: filename.slice(dot) } : { base: filename, ext: '' };
}

export function trackFileName(t: Track): string {
  const fromPath = t.path?.split('/').pop();
  return fromPath || `${t.title}.${t.mimeType.split('/')[1] === 'mpeg' ? 'mp3' : t.mimeType.split('/')[1] || 'mp3'}`;
}

/** Nouveau nom complet : l'extension d'origine est conservée (et ajoutée si l'utilisateur l'a retirée). */
export function renamedFile(original: string, input: string): string | null {
  const { ext } = splitName(original);
  let base = cleanFileName(input);
  if (ext && base.toLowerCase().endsWith(ext.toLowerCase())) base = base.slice(0, -ext.length).trim();
  if (!base) return null;
  return base + ext;
}

/** Raison pour laquelle l'opération est indisponible sur cet appareil, ou null. */
export function fileOpUnavailable(op: FileOp): string | null {
  if (isDemo()) return null;
  const native = op === 'rename' ? OpenPlayMedia?.renameMediaAsync : op === 'move' ? OpenPlayMedia?.moveMediaAsync : OpenPlayMedia?.copyMediaAsync;
  if (!native || Platform.OS !== 'android') return 'Fonction indisponible dans cette version d’OpenPlay';
  const minimum = op === 'copy' ? 29 : 30;
  if (Number(Platform.Version) < minimum) return `Nécessite Android ${op === 'copy' ? '10' : '11'} ou plus récent`;
  return null;
}

function checkAvailable(op: FileOp): boolean {
  const reason = fileOpUnavailable(op);
  if (reason) toast(reason);
  return !reason;
}

/** Nouvelle analyse après une opération réelle : noms, dossiers, séries et albums à jour. */
async function rescan(kind: MediaKind) {
  if (kind === 'video') await useVideos.getState().scan();
  else await useLibrary.getState().scan(useSettings.getState().minDurationSec);
}

function failed(action: string, e: unknown) {
  recordDiagnostic(`Fichiers : ${action} en échec`, describeError(e));
  toast(`${action[0].toUpperCase()}${action.slice(1)} impossible`);
}

const sameName = (a: string, b: string) => normalizeText(a) === normalizeText(b);

// ——— Renommer ———

async function renameOne(kind: MediaKind, id: string, displayName: string): Promise<boolean> {
  if (isDemo()) return true;
  const ok = await OpenPlayMedia!.renameMediaAsync!(kind, id, displayName);
  if (!ok) toast('Renommage annulé');
  return ok;
}

export async function renameVideo(video: Video, input: string): Promise<boolean> {
  if (!checkAvailable('rename')) return false;
  const name = renamedFile(video.filename, input);
  if (!name) return false;
  if (name === video.filename) return true;
  if (useVideos.getState().videos.some((v) => v.id !== video.id && v.folder === video.folder && sameName(v.filename, name))) {
    toast('Un fichier porte déjà ce nom dans ce dossier');
    return false;
  }
  try {
    if (!(await renameOne('video', video.id, name))) return false;
    if (isDemo()) useVideos.getState().applyFileChanges([{ ...video, filename: name, title: splitName(name).base }]);
    else await rescan('video');
    toast('Vidéo renommée');
    return true;
  } catch (e) {
    failed('renommage', e);
    return false;
  }
}

export async function renameTrack(track: Track, input: string): Promise<boolean> {
  if (!checkAvailable('rename')) return false;
  const current = trackFileName(track);
  const name = renamedFile(current, input);
  if (!name) return false;
  if (name === current) return true;
  if (useLibrary.getState().allTracks.some((t) => t.id !== track.id && t.folder === track.folder && sameName(trackFileName(t), name))) {
    toast('Un fichier porte déjà ce nom dans ce dossier');
    return false;
  }
  try {
    if (!(await renameOne('audio', track.id, name))) return false;
    const dir = track.path?.split('/').slice(0, -1).join('/');
    if (isDemo()) useLibrary.getState().applyFileChanges([{ ...track, path: dir ? `${dir}/${name}` : track.path }]);
    else await rescan('audio');
    toast('Fichier renommé');
    return true;
  } catch (e) {
    failed('renommage', e);
    return false;
  }
}

// ——— Déplacer / copier ———

type Entry = { id: string; name: string; folder: string };

/** Fichiers dont le nom existe déjà dans le dossier de destination (le déplacement les écraserait). */
function conflicts(entries: Entry[], existing: Entry[], folder: string): Entry[] {
  const moving = new Set(entries.map((e) => e.id));
  return entries.filter((e) => e.folder !== folder && existing.some((x) => !moving.has(x.id) && x.folder === folder && sameName(x.name, e.name)));
}

async function transfer(kind: MediaKind, op: 'move' | 'copy', entries: Entry[], existing: Entry[], folder: string): Promise<number> {
  const dest = folder.split('/').filter(Boolean).join('/');
  if (!entries.length || !checkAvailable(op)) return 0;
  if (!isValidDestination(kind, dest)) {
    toast(`Choisissez un dossier dans ${MEDIA_ROOTS[kind].slice(0, 3).join(', ')}…`);
    return 0;
  }
  const todo = op === 'move' ? entries.filter((e) => e.folder !== dest) : entries;
  if (!todo.length) {
    toast('Déjà dans ce dossier');
    return 0;
  }
  if (op === 'move') {
    const clash = conflicts(todo, existing, dest);
    if (clash.length) {
      toast(`« ${clash[0].name} » existe déjà dans ce dossier`);
      return 0;
    }
  }
  const ids = todo.map((e) => e.id);
  const label = dest.split('/').pop() ?? dest;
  try {
    if (op === 'copy' && todo.length > 0) toast(todo.length > 1 ? `Copie de ${todo.length} fichiers…` : 'Copie en cours…');
    let done = todo.length;
    if (!isDemo()) {
      const result = op === 'move' ? await OpenPlayMedia!.moveMediaAsync!(kind, ids, dest) : await OpenPlayMedia!.copyMediaAsync!(kind, ids, dest);
      if (result === false) {
        toast('Déplacement annulé');
        return 0;
      }
      done = result;
      await rescan(kind);
    }
    toast(op === 'move' ? `${pluralize(done, 'fichier')} déplacé${done > 1 ? 's' : ''} vers « ${label} »` : `${pluralize(done, 'copie')} dans « ${label} »`);
    return done;
  } catch (e) {
    failed(op === 'move' ? 'déplacement' : 'copie', e);
    return 0;
  }
}

const videoEntry = (v: Video): Entry => ({ id: v.id, name: v.filename, folder: v.folder });
const trackEntry = (t: Track): Entry => ({ id: t.id, name: trackFileName(t), folder: t.folder });

let copyCounter = 0;

export async function moveVideos(videos: Video[], folder: string): Promise<number> {
  const done = await transfer('video', 'move', videos.map(videoEntry), useVideos.getState().videos.map(videoEntry), folder);
  if (done && isDemo()) useVideos.getState().applyFileChanges(videos.map((v) => ({ ...v, folder })));
  return done;
}

export async function copyVideos(videos: Video[], folder: string): Promise<number> {
  const done = await transfer('video', 'copy', videos.map(videoEntry), [], folder);
  if (done && isDemo()) useVideos.getState().applyFileChanges([], videos.map((v) => ({ ...v, id: `${v.id}-copie-${++copyCounter}`, folder, addedAt: Date.now() })));
  return done;
}

export async function moveTracks(tracks: Track[], folder: string): Promise<number> {
  const done = await transfer('audio', 'move', tracks.map(trackEntry), useLibrary.getState().allTracks.map(trackEntry), folder);
  if (done && isDemo()) useLibrary.getState().applyFileChanges(tracks.map((t) => ({ ...t, folder, path: `/storage/emulated/0/${folder}/${trackFileName(t)}` })));
  return done;
}

export async function copyTracks(tracks: Track[], folder: string): Promise<number> {
  const done = await transfer('audio', 'copy', tracks.map(trackEntry), [], folder);
  if (done && isDemo()) {
    useLibrary.getState().applyFileChanges([], tracks.map((t) => ({ ...t, id: `${t.id}-copie-${++copyCounter}`, folder, path: `/storage/emulated/0/${folder}/${trackFileName(t)}`, addedAt: Date.now() })));
  }
  return done;
}

// ——— Dossiers vides ———

/** Raison pour laquelle la création ou la suppression d'un dossier est indisponible, ou null. */
export function folderOpUnavailable(): string | null {
  if (isDemo()) return null;
  if (!OpenPlayMedia?.createFolderAsync || Platform.OS !== 'android') return 'Fonction indisponible dans cette version d’OpenPlay';
  if (Number(Platform.Version) < 30) return 'Nécessite Android 11 ou plus récent';
  return null;
}

/** Dossiers d'un type connus d'OpenPlay : ceux des fichiers indexés et ceux créés vides. */
export function knownFolders(kind: MediaKind): string[] {
  const fromFiles = kind === 'video' ? useVideos.getState().videos.map((v) => v.folder) : useLibrary.getState().allTracks.map((t) => t.folder);
  return [...new Set([...fromFiles, ...useFolders.getState().created[kind]])];
}

/** Crée un dossier vide (« Movies/Animés ») ; il reste visible dans Dossiers même sans fichier. */
export async function createEmptyFolder(kind: MediaKind, folder: string): Promise<boolean> {
  const reason = folderOpUnavailable();
  if (reason) {
    toast(reason);
    return false;
  }
  if (!isValidDestination(kind, folder)) {
    toast(`Choisissez un dossier dans ${MEDIA_ROOTS[kind].slice(0, 3).join(', ')}…`);
    return false;
  }
  const label = folder.split('/').pop() ?? folder;
  if (knownFolders(kind).some((f) => sameName(f, folder))) {
    toast(`Le dossier « ${label} » existe déjà`);
    return true;
  }
  try {
    if (!isDemo() && !(await OpenPlayMedia!.createFolderAsync!(folder))) throw new Error('mkdirs');
    useFolders.getState().add(kind, folder);
    toast(`Dossier « ${label} » créé`);
    return true;
  } catch (e) {
    failed('création du dossier', e);
    return false;
  }
}

/** Supprime un dossier vide (jamais ses fichiers : un dossier qui en contient encore est conservé). */
export async function deleteEmptyFolder(kind: MediaKind, folder: string): Promise<boolean> {
  const label = folder.split('/').pop() ?? folder;
  const hasFiles = kind === 'video' ? useVideos.getState().videos.some((v) => v.folder === folder) : useLibrary.getState().allTracks.some((t) => t.folder === folder);
  if (hasFiles) {
    toast(`« ${label} » n'est pas vide : supprimez d'abord ses fichiers`);
    return false;
  }
  const reason = folderOpUnavailable();
  try {
    if (!isDemo() && !reason && !(await OpenPlayMedia!.deleteEmptyFolderAsync!(folder))) {
      toast(`« ${label} » contient encore des fichiers (d'autres applications)`);
      return false;
    }
  } catch (e) {
    failed('suppression du dossier', e);
    return false;
  }
  useFolders.getState().remove(kind, folder);
  toast(`Dossier « ${label} » supprimé`);
  return true;
}

// ——— Supprimer (vidéos ; les morceaux ont déjà leur suppression) ———

function confirm(title: string, message: string, label: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
      { text: label, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

/** Supprime définitivement des vidéos, après confirmation (Android 11+ affiche aussi sa propre demande). */
export async function deleteVideosFromDevice(videos: Video[], what: string): Promise<boolean> {
  if (!videos.length) return false;
  const ok = await confirm(
    `Supprimer ${what} ?`,
    `${pluralize(videos.length, 'fichier')} ${videos.length > 1 ? 'seront supprimés' : 'sera supprimé'} de l'appareil. Cette action est irréversible.`,
    'Supprimer',
  );
  if (!ok) return false;
  const ids = videos.map((v) => v.id);
  try {
    if (!isDemo()) {
      const done = await MediaLibrary.deleteAssetsAsync(ids);
      if (!done) throw new Error('refus');
    }
  } catch {
    toast(Platform.OS === 'android' && Number(Platform.Version) < 30 ? 'Suppression non prise en charge sur cette version d’Android' : 'Suppression annulée ou impossible');
    return false;
  }
  const history = useVideoHistory.getState();
  for (const id of ids) {
    history.remove(id);
    if (history.favorites.includes(id)) history.toggleFavorite(id);
  }
  useVideos.getState().removeVideos(ids);
  toast(videos.length > 1 ? 'Vidéos supprimées' : 'Vidéo supprimée');
  return true;
}
