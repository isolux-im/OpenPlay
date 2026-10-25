import { OpenPlayMedia } from '../../modules/openplay-media';
import { recordDiagnostic } from '../diagnostics/crashReports';
import { useIntros, type IntroInfo } from '../store/intros';
import { nextEpisode, previousEpisode, type Series } from './series';
import type { Video } from './types';

/** Partie de chaque épisode analysée : le générique de début se trouve presque toujours dans les 6 premières minutes. */
export const INTRO_WINDOW_SEC = 360;
export const MIN_INTRO_SEC = 15;
export const MAX_INTRO_SEC = 180;

const running = new Set<string>();

export function canDetectIntro(): boolean {
  return !!OpenPlayMedia?.findCommonIntroAsync;
}

type Match = { startA: number; endA: number; startB: number; endB: number };

export function plausibleIntro(m: Match): boolean {
  const a = m.endA - m.startA;
  const b = m.endB - m.startB;
  return a >= MIN_INTRO_SEC && a <= MAX_INTRO_SEC && Math.abs(a - b) < 3 && m.startA >= 0 && m.startB >= 0 && m.startA < INTRO_WINDOW_SEC && m.startB < INTRO_WINDOW_SEC;
}

/** Générique en cours à `positionSec` : il reste au moins 2 s à passer. */
export function inIntro(info: IntroInfo | undefined, positionSec: number): info is { start: number; end: number } {
  return !!info && 'start' in info && positionSec >= info.start - 0.5 && positionSec < info.end - 2;
}

/**
 * Compare le son du début de l'épisode avec celui de l'épisode voisin (suivant, sinon précédent).
 * Un passage commun de 15 s à 3 min est retenu comme générique pour les deux épisodes.
 */
export async function detectIntro(series: Series, video: Video): Promise<void> {
  if (!canDetectIntro() || useIntros.getState().byVideo[video.id]) return;
  const partner = nextEpisode(series, video.id) ?? previousEpisode(series, video.id);
  if (!partner || running.has(video.id)) return;
  running.add(video.id);
  try {
    const m = await OpenPlayMedia!.findCommonIntroAsync!(video.id, `${video.id}-${video.sizeBytes}`, partner.id, `${partner.id}-${partner.sizeBytes}`, INTRO_WINDOW_SEC);
    const known = useIntros.getState().byVideo;
    if (m && plausibleIntro(m)) {
      const entries: Record<string, IntroInfo> = { [video.id]: { start: m.startA, end: m.endA } };
      if (!known[partner.id] || !('start' in known[partner.id])) entries[partner.id] = { start: m.startB, end: m.endB };
      useIntros.getState().set(entries);
    } else {
      useIntros.getState().set({ [video.id]: { none: true, partner: partner.id, at: Date.now() } });
    }
  } catch (e) {
    recordDiagnostic('Générique non analysé', `${video.filename} : ${e instanceof Error ? e.message : String(e)}`);
    useIntros.getState().set({ [video.id]: { none: true, partner: partner.id, at: Date.now() } });
  } finally {
    running.delete(video.id);
  }
}
