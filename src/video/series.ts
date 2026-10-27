import { compareText, normalizeText } from '../library/text';
import { isFinished, resumePosition } from './library';
import type { Video, VideoHistoryEntry } from './types';

/**
 * Épisode reconnu dans le nom d'un fichier. `episodeEnd` : dernier numéro d'un fichier qui couvre
 * plusieurs épisodes (« S01E01E02 »), absent sinon. La saison 0 regroupe les épisodes spéciaux.
 */
export type EpisodeInfo = { name: string; season: number; episode: number; episodeEnd?: number };

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
  // « S01E02 », « s1e2 », « S01.E02 », « S01 E02 », « S01E01E02 » / « S01E01-E02 » (plusieurs épisodes)
  { re: /^(.*?)\bs(\d{1,2})\s*e(\d{1,3})(?!\d)(?:\s*-?\s*e(\d{1,3})(?!\d))?/i, season: null },
  // « S02 Episode 02 », « S2 Ep 3 » (« Ma_Serie_S02_Episode_02 »)
  { re: /^(.*?)\bs(\d{1,2})\W+(?:[ée]pisode|ep)\.?\s*(\d{1,4})(?!\d)/i, season: null },
  // « 1x02 » (pas « 1920x1080 »)
  { re: /^(.*?)\b(\d{1,2})x(\d{2,3})\b/i, season: null },
  // « Saison 1 Épisode 2 », « Season 1 Ep 2 »
  { re: /^(.*?)\b(?:saison|season)\s*(\d{1,2})\W*(?:[ée]pisode|ep)\.?\s*(\d{1,3})(?!\d)/i, season: null },
  // « Épisode 3 », « Ep. 3 », « E03 » (pas « E 2019 » : le « E » seul doit toucher le numéro)
  { re: /^(.*?)(?:[ée]pisode\s*|\bep\.?\s*|\be)(\d{1,4})(?!\d)/i, season: 1 },
];

/** Fichier qui ne porte que le numéro (« 01.mp4 », « 02 - Titre.mkv ») : accepté seulement dans un dossier de saison. */
const BARE_NUMBER = /^(\d{1,3})(?!\d)(?:\s*[-–—]\s*.*|\s*)$/;

/**
 * Dossiers génériques du téléphone : leur nom n'est jamais pris pour celui d'une série
 * (« Download/Episode 01.mp4 » reste une vidéo isolée).
 */
const GENERIC_FOLDERS = new Set(
  ['download', 'downloads', 'telechargements', 'movies', 'movie', 'films', 'videos', 'video', 'dcim', 'camera', 'pictures', 'documents', 'whatsapp video', 'whatsapp', 'telegram', 'telegram video', 'bluetooth', 'screenrecorder', 'screen recordings', 'enregistrements', 'series', 'tv', 'tv shows', 'autres', 'other'].map((n) => normalizeText(n)),
);

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

/** Le dossier n'est qu'un dossier de saison (« Saison 1 », « S01 », « Season 2 ») ? */
function isSeasonFolder(folder: string): boolean {
  return /^(?:saison|season|s)\s*\d{1,2}$/i.test(folderName(folder).replace(/[._-]+/g, ' ').trim());
}

/**
 * Nom de série tiré des dossiers : le parent d'un dossier de saison, sinon le dossier lui-même.
 * Jamais un dossier générique (Download, Movies, DCIM…) ni un dossier de saison sans parent connu.
 */
function seriesNameFromFolders(folder: string): string | null {
  const parts = folder.split('/').filter(Boolean);
  const name = isSeasonFolder(folder) ? parts[parts.length - 2] : parts[parts.length - 1];
  if (!name || GENERIC_FOLDERS.has(normalizeText(name))) return null;
  return cleanName(name.replace(/[._]+/g, ' ')) || null;
}

/**
 * Reconnaît « Nom S01E02 », « Nom 1x02 », « Nom Saison 1 Épisode 2 » ou « Nom Épisode 2 ».
 * Sans nom devant le numéro, la série prend le nom du dossier (ou du dossier parent pour « Saison 1 »).
 */
export function parseEpisode(filename: string, folder: string): EpisodeInfo | null {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').trim();
  for (const { re, season } of PATTERNS) {
    const m = re.exec(base);
    if (!m) continue;
    const episode = Number(season === null ? m[3] : m[2]);
    if (!(episode > 0)) continue;
    const s = season === null ? Number(m[2]) : (seasonFromFolder(folder) ?? season);
    const name = cleanName(m[1]) || seriesNameFromFolders(folder);
    if (!name) return null;
    const end = season === null && m[4] ? Number(m[4]) : 0;
    return end > episode ? { name, season: s, episode, episodeEnd: end } : { name, season: s, episode };
  }
  // « Ma Serie/Saison 1/01.mp4 », « Ma Serie/S01/02.mp4 » : le numéro seul suffit dans un dossier de saison.
  const bare = BARE_NUMBER.exec(base);
  const season = seasonFromFolder(folder);
  if (bare && season !== null && isSeasonFolder(folder) && Number(bare[1]) > 0) {
    const name = seriesNameFromFolders(folder);
    if (name) return { name, season, episode: Number(bare[1]) };
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
    // Tri numérique (épisode 2 avant épisode 10) ; épisodes spéciaux (saison 0) après les saisons.
    const order = (season: number) => (season === 0 ? Number.MAX_SAFE_INTEGER : season);
    s.episodes.sort((a, b) => order(s.info[a.id].season) - order(s.info[b.id].season) || s.info[a.id].episode - s.info[b.id].episode || compareText(a.filename, b.filename));
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
    .replace(/\bs\d{1,2}\W+(?:[ée]pisode|ep)\.?\s*\d{1,4}\b|\bs\d{1,2}\s*e\d{1,4}(?:\s*-?\s*e\d{1,4})?\b|\b\d{1,2}x\d{2,3}\b|\b(?:saison|season)\s*\d{1,2}\W*(?:[ée]pisode|ep)\.?\s*\d{1,4}|(?:[ée]pisode|\bep\.?|\be)\s*\d{1,4}\b/gi, ' ')
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
  // « 01.mp4 » dans un dossier de saison : le numéro seul n'est pas un titre.
  return title && !/^\d+$/.test(title) ? title : `Épisode ${info.episode}`;
}

export function seasonLabel(season: number): string {
  return season === 0 ? 'Épisodes spéciaux' : `Saison ${season}`;
}

/**
 * Épisode suivant disponible, dans l'ordre saison puis épisode. Les copies du même épisode (autre
 * format, autre qualité) et les numéros déjà couverts par un fichier multi-épisodes sont sautés.
 * `crossSeason: false` s'arrête à la fin de la saison ; un épisode régulier n'enchaîne jamais sur les
 * épisodes spéciaux. Après le dernier épisode : null (pas de reprise au début, pas d'autre série).
 */
export function nextEpisode(series: Series, videoId: string, options: { crossSeason?: boolean } = {}): Video | null {
  const i = series.episodes.findIndex((e) => e.id === videoId);
  const cur = series.info[videoId];
  if (i < 0 || !cur) return null;
  const last = cur.episodeEnd ?? cur.episode;
  for (const candidate of series.episodes.slice(i + 1)) {
    const info = series.info[candidate.id];
    if (info.season === cur.season && info.episode <= last) continue;
    if (info.season !== cur.season && (options.crossSeason === false || (info.season === 0 && cur.season !== 0))) return null;
    return candidate;
  }
  return null;
}

export function previousEpisode(series: Series, videoId: string): Video | null {
  const i = series.episodes.findIndex((e) => e.id === videoId);
  const cur = series.info[videoId];
  if (i <= 0 || !cur) return null;
  for (const candidate of series.episodes.slice(0, i).reverse()) {
    const info = series.info[candidate.id];
    if (info.season === cur.season && info.episode >= cur.episode) continue;
    return candidate;
  }
  return null;
}

/** Numéros sautés entre deux épisodes de la même saison (« S01E04, S01E05 » manquants), sinon null. */
export function missingBetween(series: Series, fromId: string, toId: string): string | null {
  const a = series.info[fromId];
  const b = series.info[toId];
  if (!a || !b || a.season !== b.season) return null;
  const from = (a.episodeEnd ?? a.episode) + 1;
  if (b.episode <= from) return null;
  const missing = Array.from({ length: b.episode - from }, (_, k) => episodeLabel({ name: a.name, season: a.season, episode: from + k }));
  return missing.length > 3 ? `${missing[0]} à ${missing[missing.length - 1]}` : missing.join(', ');
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
