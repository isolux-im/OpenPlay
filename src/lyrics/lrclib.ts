import Constants from 'expo-constants';

import { UNKNOWN_ALBUM, UNKNOWN_ARTIST } from '../library/trackFromNative';
import { normalizeText } from '../library/text';
import { NetError, messageFor, readJson, request } from '../net/http';
import type { Track } from '../types';

/**
 * LRCLIB (https://lrclib.net) : base libre de paroles, accès anonyme sans clé.
 * Format vérifié dans le code source public du service (routes get_lyrics_by_metadata et search_lyrics).
 */
export const LRCLIB_BASE = 'https://lrclib.net';
const SERVICE = 'LRCLIB';
const TIMEOUT_MS = 12_000;
/** Écart de durée toléré entre le fichier local et la fiche LRCLIB. */
export const DURATION_TOLERANCE_SEC = 3;
/** Pause appliquée après un 429 sans en-tête Retry-After. */
const DEFAULT_BACKOFF_SEC = 60;

export type LrclibRecord = {
  id: number;
  trackName: string | null;
  artistName: string | null;
  albumName: string | null;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

export type LrclibResult =
  | { kind: 'synced' | 'plain'; text: string; recordId: number }
  | { kind: 'instrumental'; recordId: number }
  | { kind: 'none' };

type TrackInfo = Pick<Track, 'title' | 'artist' | 'album' | 'durationSec'>;

/** Titre sans mentions annexes : « Song (Remastered 2011) - Live » → « song ». */
export function cleanTitle(title: string): string {
  return normalizeText(
    title
      .replace(/\s*[([].*?[)\]]\s*/g, ' ')
      .replace(/\s+-\s+(live|remaster(ed)?|radio edit|version|mono|stereo|edit|acoustic|bonus).*$/i, '')
      .replace(/\s+(feat\.?|ft\.?|featuring)\s+.*$/i, ''),
  );
}

function artistTokens(artist: string): string[] {
  return artist
    .split(/\s*(?:,|&|\/|;|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bx\b|\bet\b|\band\b)\s*/i)
    .map(normalizeText)
    .filter(Boolean);
}

/**
 * Correspondance stricte : même titre (sans mentions annexes), au moins un artiste commun et,
 * quand les deux durées sont connues, un écart d'au plus quelques secondes.
 */
export function isGoodMatch(track: TrackInfo, rec: LrclibRecord): boolean {
  if (!rec.trackName || !rec.artistName) return false;
  if (cleanTitle(rec.trackName) !== cleanTitle(track.title)) return false;
  const local = artistTokens(track.artist);
  const remote = artistTokens(rec.artistName);
  const sharesArtist = local.some((a) => remote.some((b) => a === b || (a.length > 3 && b.length > 3 && (a.includes(b) || b.includes(a)))));
  if (!sharesArtist) return false;
  if (track.durationSec > 0 && rec.duration && rec.duration > 0) return Math.abs(track.durationSec - rec.duration) <= DURATION_TOLERANCE_SEC;
  return true;
}

/** Meilleure fiche : correspondance stricte, paroles synchronisées d'abord, puis durée la plus proche. */
export function pickBest(track: TrackInfo, records: LrclibRecord[]): LrclibRecord | null {
  const score = (r: LrclibRecord) => (r.syncedLyrics ? 0 : r.plainLyrics ? 1 : r.instrumental ? 2 : 3) * 1000 + Math.abs((r.duration ?? track.durationSec) - track.durationSec);
  return records.filter((r) => isGoodMatch(track, r) && (r.syncedLyrics || r.plainLyrics || r.instrumental)).sort((a, b) => score(a) - score(b))[0] ?? null;
}

export function toResult(rec: LrclibRecord | null): LrclibResult {
  if (!rec) return { kind: 'none' };
  if (rec.syncedLyrics?.trim()) return { kind: 'synced', text: rec.syncedLyrics, recordId: rec.id };
  if (rec.plainLyrics?.trim()) return { kind: 'plain', text: rec.plainLyrics, recordId: rec.id };
  if (rec.instrumental) return { kind: 'instrumental', recordId: rec.id };
  return { kind: 'none' };
}

let blockedUntil = 0;

/** Tests : remet à zéro la pause imposée par un 429. */
export function resetLrclibBackoff() {
  blockedUntil = 0;
}

function headers() {
  // LRCLIB demande d'identifier l'application cliente.
  return { 'User-Agent': `OpenPlay/${Constants.expoConfig?.version ?? 'dev'} (https://github.com/isolux-im/OpenPlay)`, Accept: 'application/json' };
}

type FetchOptions = { signal?: AbortSignal; fetchImpl?: typeof fetch; now?: () => number };

/**
 * Cherche les paroles d'un morceau : correspondance exacte (/api/get), sinon recherche (/api/search)
 * filtrée strictement. Ne fabrique jamais de paroles : sans fiche fiable, renvoie « none ».
 */
export async function fetchLyrics(track: TrackInfo, { signal, fetchImpl, now = Date.now }: FetchOptions = {}): Promise<LrclibResult> {
  // Sans artiste connu, une homonymie de titre donnerait facilement de fausses paroles.
  if (!track.title.trim() || !track.artist.trim() || track.artist === UNKNOWN_ARTIST) return { kind: 'none' };
  const wait = (blockedUntil - now()) / 1000;
  if (wait > 0) throw new NetError('rate-limit', messageFor('rate-limit', SERVICE, 429, wait), 429, wait);

  const call = async (path: string, params: Record<string, string>, accept: number[] = []) => {
    const url = `${LRCLIB_BASE}${path}?${Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&')}`;
    try {
      return await request(url, { service: SERVICE, timeoutMs: TIMEOUT_MS, headers: headers(), acceptStatuses: accept, signal, ...(fetchImpl ? { fetchImpl } : {}) });
    } catch (e) {
      if (e instanceof NetError && e.kind === 'rate-limit') blockedUntil = now() + (e.retryAfterSec ?? DEFAULT_BACKOFF_SEC) * 1000;
      throw e;
    }
  };

  const exact: Record<string, string> = { track_name: track.title, artist_name: track.artist };
  if (track.album && track.album !== UNKNOWN_ALBUM) exact.album_name = track.album;
  if (track.durationSec >= 1) exact.duration = String(Math.round(track.durationSec));

  const res = await call('/api/get', exact, [404]);
  if (res.status !== 404) {
    const rec = await readJson<LrclibRecord>(res, SERVICE);
    if (rec && isGoodMatch(track, rec)) return toResult(rec);
  }

  const search = await call('/api/search', { track_name: track.title, artist_name: track.artist });
  const list = await readJson<unknown>(search, SERVICE);
  if (!Array.isArray(list)) throw new NetError('bad-response', messageFor('bad-response', SERVICE), search.status);
  return toResult(pickBest(track, list as LrclibRecord[]));
}
