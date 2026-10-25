import { create } from 'zustand';

import type { LanguageCode, ProviderId } from '../lyrics/transcription';
import { persist } from 'zustand/middleware';

import { persistStorage } from './storage';

export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentKey = 'graphite' | 'coral' | 'violet' | 'ocean' | 'emerald' | 'amber';
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
  accent: 'graphite',
  coloredPlayer: false,
  minDurationSec: 30,
  resumeOnLaunch: true,
  songSort: 'title',
  haptics: true,
  aiProvider: 'groq',
  aiLanguage: 'auto',
};

/**
 * v2 : palette neutre. L'ancien corail par défaut passe au graphite (un autre choix explicite est conservé)
 * et le lecteur adopte le fond gris flouté de la maquette (réactivable dans les réglages).
 */
export function migrateSettings(persisted: unknown, version: number): Partial<Settings> {
  const s = { ...((persisted ?? {}) as Partial<Settings>) };
  if (version < 2) {
    if (s.accent === undefined || s.accent === 'coral') s.accent = 'graphite';
    s.coloredPlayer = false;
  }
  return s;
}

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
    {
      name: 'openplay.settings.v1',
      storage: persistStorage,
      version: 2,
      migrate: (persisted, version) => migrateSettings(persisted, version) as SettingsState,
    },
  ),
);
