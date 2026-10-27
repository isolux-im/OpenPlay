import { create } from 'zustand';
import type { MediaKind } from '../library/fileOps';
import type { VideoPlaylistItem } from './videoPlaylists';

export type TrackMenuContext = { playlistId?: string; playlistIndex?: number; queueIndex?: number };

/** Élément ouvert depuis une playlist vidéo : permet de le retirer ou de le déplacer. */
export type VideoPlaylistContext = { playlistId: string; index: number; count: number };

/** Choix d'un dossier de destination (copier, déplacer). */
export type FolderPickerRequest = { kind: MediaKind; title: string; current?: string; onPick: (folder: string) => void };

/** Point d'appui (coordonnées écran) auquel le menu contextuel s'ancre. */
export type MenuAnchor = { x: number; y: number };

export type ContextTarget =
  | { kind: 'track'; trackId: string; context: TrackMenuContext }
  | { kind: 'album'; albumId: string }
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'video'; videoId: string; list: string[]; playlist?: VideoPlaylistContext }
  | { kind: 'series'; seriesKey: string; playlist?: VideoPlaylistContext }
  | { kind: 'videoPlaylist'; playlistId: string }
  /** Description d'une section (icône « ! »), affichée à la demande. */
  | { kind: 'info'; title: string; text: string };

export type PromptRequest = {
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel: string;
  /** Saisie masquée (clé API). */
  secure?: boolean;
  onSubmit: (value: string) => void;
};

export type PlayerMode = 'artwork' | 'lyrics' | 'queue';

type UiState = {
  playerMode: PlayerMode;
  playerOptions: boolean;
  setPlayerMode: (m: PlayerMode) => void;
  openPlayerOptions: () => void;
  menu: { target: ContextTarget; anchor: MenuAnchor | null } | null;
  playlistPicker: string[] | null;
  videoPlaylistPicker: VideoPlaylistItem[] | null;
  folderPicker: FolderPickerRequest | null;
  prompt: (PromptRequest & { id: number }) | null;
  sleepSheet: boolean;
  toast: string | null;
  openTrackMenu: (trackId: string, context?: TrackMenuContext, anchor?: MenuAnchor | null) => void;
  openAlbumMenu: (albumId: string, anchor?: MenuAnchor | null) => void;
  openPlaylistMenu: (playlistId: string, anchor?: MenuAnchor | null) => void;
  openVideoMenu: (videoId: string, list: string[], anchor?: MenuAnchor | null, playlist?: VideoPlaylistContext) => void;
  openSeriesMenu: (seriesKey: string, anchor?: MenuAnchor | null, playlist?: VideoPlaylistContext) => void;
  openVideoPlaylistMenu: (playlistId: string, anchor?: MenuAnchor | null) => void;
  openVideoPlaylistPicker: (items: VideoPlaylistItem[]) => void;
  openFolderPicker: (request: FolderPickerRequest) => void;
  openInfo: (title: string, text: string, anchor?: MenuAnchor | null) => void;
  openPlaylistPicker: (trackIds: string[]) => void;
  openPrompt: (p: PromptRequest) => void;
  openSleepSheet: () => void;
  showToast: (message: string) => void;
  hideToast: () => void;
  closeAll: () => void;
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let promptCounter = 0;

export const useUi = create<UiState>()((set) => ({
  playerMode: 'artwork',
  playerOptions: false,
  setPlayerMode: (playerMode) => set({ playerMode, playerOptions: false }),
  openPlayerOptions: () => set({ menu: null, playerOptions: true }),
  menu: null,
  playlistPicker: null,
  videoPlaylistPicker: null,
  folderPicker: null,
  prompt: null,
  sleepSheet: false,
  toast: null,
  openTrackMenu: (trackId, context = {}, anchor = null) => set({ menu: { target: { kind: 'track', trackId, context }, anchor } }),
  openAlbumMenu: (albumId, anchor = null) => set({ menu: { target: { kind: 'album', albumId }, anchor } }),
  openPlaylistMenu: (playlistId, anchor = null) => set({ menu: { target: { kind: 'playlist', playlistId }, anchor } }),
  openVideoMenu: (videoId, list, anchor = null, playlist) => set({ menu: { target: { kind: 'video', videoId, list, ...(playlist ? { playlist } : {}) }, anchor } }),
  openSeriesMenu: (seriesKey, anchor = null, playlist) => set({ menu: { target: { kind: 'series', seriesKey, ...(playlist ? { playlist } : {}) }, anchor } }),
  openVideoPlaylistMenu: (playlistId, anchor = null) => set({ menu: { target: { kind: 'videoPlaylist', playlistId }, anchor } }),
  openVideoPlaylistPicker: (items) => set({ menu: null, videoPlaylistPicker: items }),
  openFolderPicker: (folderPicker) => set({ menu: null, folderPicker }),
  openInfo: (title, text, anchor = null) => set({ menu: { target: { kind: 'info', title, text }, anchor } }),
  openPlaylistPicker: (trackIds) => set({ menu: null, playerOptions: false, playlistPicker: trackIds }),
  openPrompt: (prompt) => set({ menu: null, playlistPicker: null, videoPlaylistPicker: null, folderPicker: null, prompt: { ...prompt, id: ++promptCounter } }),
  openSleepSheet: () => set({ menu: null, playerOptions: false, sleepSheet: true }),
  showToast: (toast) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast });
    toastTimer = setTimeout(() => set({ toast: null }), 2200);
  },
  hideToast: () => {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    set({ toast: null });
  },
  closeAll: () => set({ menu: null, playerOptions: false, playlistPicker: null, videoPlaylistPicker: null, folderPicker: null, prompt: null, sleepSheet: false }),
}));
