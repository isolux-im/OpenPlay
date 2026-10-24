import { create } from 'zustand';

export type TrackMenuContext = { playlistId?: string; playlistIndex?: number; queueIndex?: number };

export type PromptRequest = {
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel: string;
  onSubmit: (value: string) => void;
};

type UiState = {
  trackMenu: { trackId: string; context: TrackMenuContext } | null;
  playlistPicker: string[] | null;
  prompt: (PromptRequest & { id: number }) | null;
  sleepSheet: boolean;
  toast: string | null;
  openTrackMenu: (trackId: string, context?: TrackMenuContext) => void;
  openPlaylistPicker: (trackIds: string[]) => void;
  openPrompt: (p: PromptRequest) => void;
  openSleepSheet: () => void;
  showToast: (message: string) => void;
  closeAll: () => void;
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let promptCounter = 0;

export const useUi = create<UiState>()((set) => ({
  trackMenu: null,
  playlistPicker: null,
  prompt: null,
  sleepSheet: false,
  toast: null,
  openTrackMenu: (trackId, context = {}) => set({ trackMenu: { trackId, context } }),
  openPlaylistPicker: (trackIds) => set({ trackMenu: null, playlistPicker: trackIds }),
  openPrompt: (prompt) => set({ trackMenu: null, playlistPicker: null, prompt: { ...prompt, id: ++promptCounter } }),
  openSleepSheet: () => set({ sleepSheet: true }),
  showToast: (toast) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast });
    toastTimer = setTimeout(() => set({ toast: null }), 2200);
  },
  closeAll: () => set({ trackMenu: null, playlistPicker: null, prompt: null, sleepSheet: false }),
}));
