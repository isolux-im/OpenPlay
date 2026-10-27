import { create } from 'zustand';

import type { LanguageCode, ProviderId } from '../lyrics/transcription';
import type { VideoFitMode } from '../video/display';
import type { SubtitleContrast, SubtitleSize } from '../video/subtitles';
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
  /** Vidéo : glissement vertical à gauche pour la luminosité, à droite pour le volume. */
  videoSwipe: boolean;
  /** Vidéo : glissement horizontal pour avancer / reculer dans la vidéo (comme VLC). */
  videoSeekSwipe: boolean;
  /** Vidéo : épisode suivant d'une série lancé après un compte à rebours. */
  videoAutoNext: boolean;
  /** Fin de saison : enchaîner sur le premier épisode de la saison suivante. */
  videoAutoNextSeason: boolean;
  /** Vidéo : repérage du générique de début des séries (analyse du son sur l'appareil). */
  videoIntroDetect: boolean;
  /** Vidéo : générique repéré passé sans appui. */
  videoIntroAutoSkip: boolean;
  /**
   * Vidéo : orientation pendant la lecture. `sensor` (comme VLC) : suit la position du téléphone ; `keep` : portrait ;
   * `landscape` : toujours en paysage ; `video` : selon la vidéo.
   */
  videoOrientation: 'keep' | 'video' | 'landscape' | 'sensor';
  /** Accueil des autorisations audio + vidéo déjà présenté (une seule fois, réponse ou « Plus tard »). */
  mediaOnboarded: boolean;
  /** Vidéo : format d'affichage (conservé d'une vidéo à l'autre, comme dans VLC). */
  videoFit: VideoFitMode;
  videoSort: VideoSort;
  videoLayout: 'grid' | 'list';
  /** Sous-titres importés (SRT / WebVTT) : taille et contraste d'affichage. */
  subtitleSize: SubtitleSize;
  subtitleContrast: SubtitleContrast;
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
  videoSwipe: true,
  videoFit: 'best',
  mediaOnboarded: false,
  videoOrientation: 'sensor',
  videoSeekSwipe: true,
  videoAutoNext: true,
  videoAutoNextSeason: true,
  videoIntroDetect: true,
  videoIntroAutoSkip: false,
  videoSort: 'name',
  videoLayout: 'grid',
  subtitleSize: 'medium',
  subtitleContrast: 'shadow',
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
  // v3 : vidéos et films par ordre alphabétique par défaut (l'ancien défaut « Date » passe à « Nom »).
  if (version < 3 && s.videoSort === 'date') s.videoSort = 'name';
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
      // L'accueil des autorisations n'est pas représenté après une remise à zéro des réglages.
      reset: () => set((s) => ({ ...DEFAULT_SETTINGS, mediaOnboarded: s.mediaOnboarded })),
    }),
    {
      name: 'openplay.settings.v1',
      storage: persistStorage,
      version: 3,
      migrate: (persisted, version) => migrateSettings(persisted, version) as SettingsState,
    },
  ),
);
