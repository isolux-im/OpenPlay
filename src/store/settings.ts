import { create } from 'zustand';

import type { LanguageCode, ProviderId } from '../lyrics/transcription';
import type { VideoSort } from '../video/types';
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
  /** Recherche automatique des paroles sur LRCLIB (titre, artiste, album et durée envoyés). */
  onlineLyrics: boolean;
  /** Délai (jours) au-delà duquel un morceau passe dans « À réécouter ». */
  discoverDays: 21 | 30;
  /** Dossiers masqués de la bibliothèque (chemins relatifs, sous-dossiers compris). */
  excludedFolders: string[];
  /** Vitesse de lecture (1 = normale). */
  playbackRate: number;
  /** Reprise automatique des fichiers longs (livres audio, cours, podcasts). */
  resumeLongTracks: boolean;
  /** Vidéo : passage en fenêtre flottante (PiP) en quittant OpenPlay pendant la lecture. */
  videoPip: boolean;
  /** Vidéo : double appui à gauche / à droite pour reculer / avancer de 10 s. */
  videoDoubleTap: boolean;
  videoSort: VideoSort;
  videoLayout: 'grid' | 'list';
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
  onlineLyrics: true,
  discoverDays: 30,
  excludedFolders: [],
  playbackRate: 1,
  resumeLongTracks: true,
  videoPip: true,
  videoDoubleTap: true,
  videoSort: 'date',
  videoLayout: 'grid',
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
