import { compareText, normalizeText } from '../library/text';
import { isFinished, resumePosition } from './library';
import type { Video, VideoHistoryEntry } from './types';

/** Épisode reconnu dans le nom d'un fichier. */
export type EpisodeInfo = { name: string; season: number; episode: number };

export type Series = {
  key: string;
  name: string;
  /** Triés par saison puis par épisode. */
  episodes: Video[];
  info: Record<string, EpisodeInfo>;
  seasons: number[];
};

// Ordre important : du plus explicite au plus ambigu.
const PATTERNS: { re: RegExp; season: number | null }[] = [
  // « S01E02 », « s1e2 », « S01.E02 », « S01 E02 »
  { re: /^(.*?)\bs(\d{1,2})\s*e(\d{1,3})(?!\d)/i, season: null },
  // « 1x02 » (pas « 1920x1080 »)
  { re: /^(.*?)\b(\d{1,2})x(\d{2,3})\b/i, season: null },
  // « Saison 1 Épisode 2 », « Season 1 Ep 2 »
  { re: /^(.*?)\b(?:saison|season)\s*(\d{1,2})\W*(?:[ée]pisode|ep)\.?\s*(\d{1,3})(?!\d)/i, season: null },
  // « Épisode 3 », « Ep. 3 », « E03 »
  { re: /^(.*?)(?:[ée]pisode|\bep\.?|\be)\s*(\d{1,4})(?!\d)/i, season: 1 },
];

function cleanName(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/[-–—:,]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[-–—:,]+$/g, '')
    .trim();
}

function folderName(folder: string): string {
  return folder.split('/').filter(Boolean).pop() ?? folder;
}

/** Saison indiquée par le dossier (« Saison 2 », « Season 02 », « S2 »). */
function seasonFromFolder(folder: string): number | null {
  const m = /(?:saison|season|\bs)\s*(\d{1,2})\b/i.exec(folderName(folder));
  return m ? Number(m[1]) : null;
}

/**
 * Reconnaît « Nom S01E02 », « Nom 1x02 », « Nom Saison 1 Épisode 2 » ou « Nom Épisode 2 ».
 * Sans nom devant le numéro, la série prend le nom du dossier (ou du dossier parent pour « Saison 1 »).
 */
export function parseEpisode(filename: string, folder: string): EpisodeInfo | null {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ');
  for (const { re, season } of PATTERNS) {
    const m = re.exec(base);
    if (!m) continue;
    const episode = Number(season === null ? m[3] : m[2]);
    if (!(episode > 0)) continue;
    const s = season === null ? Number(m[2]) : (seasonFromFolder(folder) ?? season);
    let name = cleanName(m[1]);
    if (!name) {
      const parts = folder.split('/').filter(Boolean);
      const last = parts[parts.length - 1] ?? '';
      name = seasonFromFolder(folder) !== null && parts.length > 1 ? parts[parts.length - 2] : last;
    }
    if (!name) return null;
    return { name, season: s, episode };
  }
  return null;
}

/** Séries d'au moins deux épisodes, par ordre alphabétique. */
export function buildSeries(videos: Video[]): Series[] {
  const groups = new Map<string, Series>();
  for (const v of videos) {
    const info = parseEpisode(v.filename, v.folder);
    if (!info) continue;
    const key = normalizeText(info.name);
    if (!key) continue;
    let s = groups.get(key);
    if (!s) {
      s = { key, name: info.name, episodes: [], info: {}, seasons: [] };
      groups.set(key, s);
    }
    // Deux fichiers pour le même épisode (doublon, autre qualité) : les deux restent visibles.
    s.episodes.push(v);
    s.info[v.id] = info;
  }
  const list: Series[] = [];
  for (const s of groups.values()) {
    if (s.episodes.length < 2) continue;
    s.episodes.sort((a, b) => s.info[a.id].season - s.info[b.id].season || s.info[a.id].episode - s.info[b.id].episode || compareText(a.filename, b.filename));
    s.seasons = [...new Set(s.episodes.map((e) => s.info[e.id].season))];
    list.push(s);
  }
  return list.sort((a, b) => compareText(a.name, b.name));
}

export function seriesByVideo(series: Series[]): Record<string, Series> {
  const map: Record<string, Series> = {};
  for (const s of series) for (const e of s.episodes) map[e.id] = s;
  return map;
}

export function episodeLabel(info: EpisodeInfo): string {
  return `S${String(info.season).padStart(2, '0')}E${String(info.episode).padStart(2, '0')}`;
}

/** Titre propre de l'épisode : sans le nom de la série ni le numéro (« Épisode 3 » à défaut). */
export function episodeTitle(video: Video, info: EpisodeInfo): string {
  const rest = video.filename
    .replace(/\.[^.]+$/, '')
    .replace(/[._]+/g, ' ')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\bs\d{1,2}\s*e\d{1,4}\b|\b\d{1,2}x\d{2,3}\b|\b(?:saison|season)\s*\d{1,2}\W*(?:[ée]pisode|ep)\.?\s*\d{1,4}|(?:[ée]pisode|\bep\.?|\be)\s*\d{1,4}\b/gi, ' ')
    .replace(/\b(?:480|576|720|1080|2160)p\b|\b(?:x264|x265|h264|h265|hevc|web-?dl|webrip|bluray|hdtv)\b/gi, ' ');
  const name = normalizeText(info.name);
  const words = rest.split(/\s+/).filter(Boolean);
  // Retire le nom de la série en tête.
  let i = 0;
  while (i < words.length && name.includes(normalizeText(words[i])) && normalizeText(words.slice(0, i + 1).join(' ')).length <= name.length) i += 1;
  const title = words
    .slice(i)
    .join(' ')
    .replace(/^[\s\-–—:,]+|[\s\-–—:,]+$/g, '')
    .trim();
  return title || `Épisode ${info.episode}`;
}

export function nextEpisode(series: Series, videoId: string): Video | null {
  const i = series.episodes.findIndex((e) => e.id === videoId);
  return i >= 0 && i < series.episodes.length - 1 ? series.episodes[i + 1] : null;
}

export function previousEpisode(series: Series, videoId: string): Video | null {
  const i = series.episodes.findIndex((e) => e.id === videoId);
  return i > 0 ? series.episodes[i - 1] : null;
}

export function isWatched(video: Video, history: Record<string, VideoHistoryEntry>): boolean {
  const e = history[video.id];
  return !!e && (e.finished || isFinished(e.positionSec, video.durationSec || e.durationSec));
}

export type SeriesProgress = {
  watched: number;
  total: number;
  /** Épisode à regarder : celui en cours, sinon le premier non vu après le dernier vu. */
  next: Video | null;
  /** Position de reprise de `next` (0 s'il n'est pas commencé). */
  resumeAt: number;
  finished: boolean;
  /** Dernière activité (ms), pour trier les séries en cours. */
  lastWatchedAt: number;
};

export function seriesProgress(series: Series, history: Record<string, VideoHistoryEntry>): SeriesProgress {
  const total = series.episodes.length;
  let watched = 0;
  let lastIndex = -1;
  let lastAt = 0;
  series.episodes.forEach((e, i) => {
    const h = history[e.id];
    if (isWatched(e, history)) watched += 1;
    if (h && h.watchedAt >= lastAt) {
      lastAt = h.watchedAt;
      lastIndex = i;
    }
  });
  let next: Video | null = null;
  if (lastIndex >= 0 && !isWatched(series.episodes[lastIndex], history)) next = series.episodes[lastIndex];
  else next = series.episodes.slice(lastIndex + 1).find((e) => !isWatched(e, history)) ?? series.episodes.find((e) => !isWatched(e, history)) ?? null;
  return { watched, total, next, resumeAt: next ? resumePosition(history[next.id], next.durationSec) : 0, finished: watched === total, lastWatchedAt: lastAt };
}
