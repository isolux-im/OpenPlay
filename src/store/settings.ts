import { create } from 'zustand';

import type { LanguageCode, ProviderId } from '../lyrics/transcription';
import { persist } from 'zustand/middleware';

import { persistStorage } from './storage';

export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentKey = 'coral' | 'violet' | 'ocean' | 'emerald' | 'amber';
export type SongSort = 'title' | 'artist' | 'album' | 'added';

export type Settings = {
  theme: ThemeMode;
  accent: AccentKey;
  coloredPlayer: boolean;
  minDurationSec: number;
  resumeOnLaunch: boolean;
  songSort: SongSort;
  haptics: boolean;
  aiProvider: ProviderId;
  aiLanguage: LanguageCode;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: 'coral',
  coloredPlayer: true,
  minDurationSec: 30,
  resumeOnLaunch: true,
  songSort: 'title',
  haptics: true,
  aiProvider: 'groq',
  aiLanguage: 'auto',
};

type SettingsState = Settings & {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    { name: 'openplay.settings.v1', storage: persistStorage, version: 1 },
  ),
);
