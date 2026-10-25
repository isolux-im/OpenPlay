import { create } from 'zustand';
import type { LibrarySection } from '../components/MediaSwitcher';

export type TrackMenuContext = { playlistId?: string; playlistIndex?: number; queueIndex?: number };

/** Point d'appui (coordonnées écran) auquel le menu contextuel s'ancre. */
export type MenuAnchor = { x: number; y: number };

export type ContextTarget =
  | { kind: 'track'; trackId: string; context: TrackMenuContext }
  | { kind: 'album'; albumId: string }
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'video'; videoId: string; list: string[] }
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
  /** Bibliothèque : section affichée (sélecteur Musique | Vidéos), gardée pendant la session. */
  librarySection: LibrarySection;
  setLibrarySection: (s: LibrarySection) => void;
  playerMode: PlayerMode;
  playerOptions: boolean;
  setPlayerMode: (m: PlayerMode) => void;
  openPlayerOptions: () => void;
  menu: { target: ContextTarget; anchor: MenuAnchor | null } | null;
  playlistPicker: string[] | null;
  prompt: (PromptRequest & { id: number }) | null;
  sleepSheet: boolean;
  toast: string | null;
  openTrackMenu: (trackId: string, context?: TrackMenuContext, anchor?: MenuAnchor | null) => void;
  openAlbumMenu: (albumId: string, anchor?: MenuAnchor | null) => void;
  openPlaylistMenu: (playlistId: string, anchor?: MenuAnchor | null) => void;
  openVideoMenu: (videoId: string, list: string[], anchor?: MenuAnchor | null) => void;
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
  librarySection: 'music',
  setLibrarySection: (librarySection) => set({ librarySection }),
  playerMode: 'artwork',
  playerOptions: false,
  setPlayerMode: (playerMode) => set({ playerMode, playerOptions: false }),
  openPlayerOptions: () => set({ menu: null, playerOptions: true }),
  menu: null,
  playlistPicker: null,
  prompt: null,
  sleepSheet: false,
  toast: null,
  openTrackMenu: (trackId, context = {}, anchor = null) => set({ menu: { target: { kind: 'track', trackId, context }, anchor } }),
  openAlbumMenu: (albumId, anchor = null) => set({ menu: { target: { kind: 'album', albumId }, anchor } }),
  openPlaylistMenu: (playlistId, anchor = null) => set({ menu: { target: { kind: 'playlist', playlistId }, anchor } }),
  openVideoMenu: (videoId, list, anchor = null) => set({ menu: { target: { kind: 'video', videoId, list }, anchor } }),
  openInfo: (title, text, anchor = null) => set({ menu: { target: { kind: 'info', title, text }, anchor } }),
  openPlaylistPicker: (trackIds) => set({ menu: null, playerOptions: false, playlistPicker: trackIds }),
  openPrompt: (prompt) => set({ menu: null, playlistPicker: null, prompt: { ...prompt, id: ++promptCounter } }),
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
  closeAll: () => set({ menu: null, playerOptions: false, playlistPicker: null, prompt: null, sleepSheet: false }),
}));
