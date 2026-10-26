import { useEffect, useState } from 'react';

import { OpenPlayMedia } from '../../modules/openplay-media';
import { recordDiagnostic } from '../diagnostics/crashReports';
import { pluralize } from '../library/text';
import { useSubtitles, type SubtitleLink } from '../store/subtitles';
import { useUi } from '../store/ui';
import { parseSubtitles, type Cue } from './subtitles';
import type { Video } from './types';

/** Répliques déjà lues (évite de relire le fichier à chaque ouverture de la vidéo). */
const cache = new Map<string, Cue[]>();
const CACHE_LIMIT = 8;

function remember(uri: string, cues: Cue[]) {
  cache.delete(uri);
  cache.set(uri, cues);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
}

/** Le module natif n'existe que sur Android (absent sur le web et sous Jest). */
export function canImportSubtitles(): boolean {
  return !!OpenPlayMedia?.pickSubtitleAsync && !!OpenPlayMedia.readSubtitleAsync;
}

export type SubtitleLoadError = 'unreadable' | 'too-large' | 'empty';

export class SubtitleError extends Error {
  constructor(readonly kind: SubtitleLoadError) {
    super(kind);
  }
}

export function subtitleErrorMessage(kind: SubtitleLoadError): string {
  switch (kind) {
    case 'too-large':
      return 'Fichier trop volumineux pour des sous-titres.';
    case 'empty':
      return 'Aucun sous-titre reconnu : formats SRT ou WebVTT uniquement.';
    default:
      return 'Fichier de sous-titres inaccessible (déplacé, supprimé ou accès retiré). Importez-le à nouveau.';
  }
}

export async function loadCues(uri: string): Promise<Cue[]> {
  const hit = cache.get(uri);
  if (hit) return hit;
  if (!OpenPlayMedia?.readSubtitleAsync) throw new SubtitleError('unreadable');
  let text: string;
  try {
    text = await OpenPlayMedia.readSubtitleAsync(uri);
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    throw new SubtitleError(code === 'ERR_SUBTITLE_TOO_LARGE' ? 'too-large' : 'unreadable');
  }
  const cues = parseSubtitles(text);
  if (!cues.length) throw new SubtitleError('empty');
  remember(uri, cues);
  return cues;
}

function release(uris: string[]) {
  for (const uri of uris) {
    cache.delete(uri);
    void OpenPlayMedia?.releaseSubtitleAsync?.(uri).catch(() => {});
  }
}

/**
 * Sélecteur Android → lecture → association à la vidéo. Seul le fichier choisi est lu ;
 * aucun dossier n'est parcouru. Renvoie true si des sous-titres ont été associés.
 */
export async function importSubtitles(video: Pick<Video, 'id'>): Promise<boolean> {
  const { showToast } = useUi.getState();
  if (!canImportSubtitles()) {
    showToast('Import de sous-titres disponible sur Android uniquement');
    return false;
  }
  let picked;
  try {
    picked = await OpenPlayMedia!.pickSubtitleAsync!();
  } catch {
    showToast('Sélecteur de fichiers indisponible');
    return false;
  }
  if (!picked) return false;
  try {
    cache.delete(picked.uri);
    const cues = await loadCues(picked.uri);
    release(useSubtitles.getState().link(video.id, { uri: picked.uri, name: picked.name, persistent: picked.persistent }, Date.now()));
    showToast(`Sous-titres associés (${pluralize(cues.length, 'réplique')})`);
    return true;
  } catch (e) {
    const kind = e instanceof SubtitleError ? e.kind : 'unreadable';
    recordDiagnostic('Sous-titres illisibles', `${picked.name} : ${kind}`);
    if (picked.persistent && !Object.values(useSubtitles.getState().byVideo).some((l) => l.uri === picked.uri)) release([picked.uri]);
    showToast(subtitleErrorMessage(kind));
    return false;
  }
}

export function unlinkSubtitles(videoId: string) {
  release(useSubtitles.getState().unlink(videoId));
}

export type ExternalSubtitles = { status: 'none' | 'loading' | 'ready' | 'error'; cues: Cue[]; error: SubtitleLoadError | null };

/** Répliques du fichier associé à la vidéo, chargées à la demande. */
export function useExternalSubtitles(link: SubtitleLink | undefined): ExternalSubtitles {
  const uri = link?.uri;
  const [state, setState] = useState<{ uri: string; cues: Cue[]; error: SubtitleLoadError | null } | null>(null);
  useEffect(() => {
    if (!uri) return;
    let alive = true;
    loadCues(uri).then(
      (cues) => alive && setState({ uri, cues, error: null }),
      (e) => alive && setState({ uri, cues: [], error: e instanceof SubtitleError ? e.kind : 'unreadable' }),
    );
    return () => {
      alive = false;
    };
  }, [uri]);
  if (!uri) return { status: 'none', cues: [], error: null };
  if (!state || state.uri !== uri) {
    const cached = cache.get(uri);
    return cached ? { status: 'ready', cues: cached, error: null } : { status: 'loading', cues: [], error: null };
  }
  return { status: state.error ? 'error' : 'ready', cues: state.cues, error: state.error };
}
