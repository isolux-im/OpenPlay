/** Sous-titres SRT (SubRip) et WebVTT, lus et affichés par OpenPlay (taille, contraste et décalage réglables). */

export type Cue = { start: number; end: number; text: string };

export type SubtitleFormat = 'srt' | 'vtt';

/** Garde-fou contre un fichier qui n'est pas un sous-titre (ou anormalement long). */
export const MAX_CUES = 20_000;

const TIMING = /^\s*((?:\d+:)?\d{1,2}:\d{1,2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{1,2}[.,]\d{1,3})/;

/** « 01:02:03,456 », « 01:02:03.456 » ou « 02:03.456 » (WebVTT) → secondes. */
export function parseTimestamp(value: string): number | null {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/.exec(value.trim());
  if (!m) return null;
  const [, h, min, s, frac] = m;
  if (Number(min) > 59 || Number(s) > 59) return null;
  return Number(h ?? 0) * 3600 + Number(min) * 60 + Number(s) + Number(frac.padEnd(3, '0')) / 1000;
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&lrm;': '', '&rlm;': '', '&quot;': '"', '&#39;': "'" };

/** Retire balises (<i>, <c.x>, <v Nom>, horodatages), codes ASS ({\an8}) et entités HTML. */
export function cleanCueText(lines: string[]): string {
  return lines
    .map((l) =>
      l
        .replace(/\{\\[^}]*\}/g, '')
        .replace(/<[^>]*>/g, '')
        .replace(/&(?:amp|lt|gt|nbsp|lrm|rlm|quot|#39);/g, (e) => ENTITIES[e] ?? e)
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}

export function detectFormat(text: string, name = ''): SubtitleFormat {
  if (/^﻿?WEBVTT/.test(text) || /\.vtt$/i.test(name)) return 'vtt';
  return 'srt';
}

/**
 * Lit un fichier SRT ou WebVTT. Les blocs sans ligne de minutage (en-tête, NOTE, STYLE, REGION)
 * et les minutages invalides sont ignorés ; le résultat est trié par heure de début.
 */
export function parseSubtitles(text: string): Cue[] {
  const blocks = text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0 || at > 1) continue;
    const m = TIMING.exec(lines[at]);
    if (!m) continue;
    const start = parseTimestamp(m[1]);
    const end = parseTimestamp(m[2]);
    if (start === null || end === null || end <= start) continue;
    const body = cleanCueText(lines.slice(at + 1));
    if (!body) continue;
    cues.push({ start, end, text: body });
    if (cues.length >= MAX_CUES) break;
  }
  return cues.sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Texte affiché à `timeSec` de la vidéo. `offsetSec` positif retarde les sous-titres
 * (à utiliser quand ils arrivent trop tôt), négatif les avance.
 */
export function cueTextAt(cues: Cue[], timeSec: number, offsetSec = 0): string | null {
  const t = timeSec - offsetSec;
  // Dernière réplique commencée avant t (recherche dichotomique).
  let lo = 0;
  let hi = cues.length - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) {
      last = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const active: string[] = [];
  // Répliques superposées : on remonte quelques entrées.
  for (let i = last; i >= 0 && i > last - 8; i--) {
    if (cues[i].end > t) active.unshift(cues[i].text);
  }
  return active.length ? active.join('\n') : null;
}

export const OFFSET_STEP = 0.5;
export const MAX_OFFSET = 60;

export function clampOffset(sec: number): number {
  return Math.round(Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, sec)) * 10) / 10;
}

export function formatOffset(sec: number): string {
  if (sec === 0) return '0 s';
  const abs = Math.abs(sec).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  return `${sec > 0 ? '+' : '−'}${abs} s`;
}

export type SubtitleSize = 'small' | 'medium' | 'large' | 'xlarge';
export type SubtitleContrast = 'shadow' | 'box' | 'yellow';

export const SUBTITLE_SIZES: { key: SubtitleSize; label: string; fontSize: number }[] = [
  { key: 'small', label: 'Petite', fontSize: 15 },
  { key: 'medium', label: 'Moyenne', fontSize: 19 },
  { key: 'large', label: 'Grande', fontSize: 24 },
  { key: 'xlarge', label: 'Très grande', fontSize: 30 },
];

export const SUBTITLE_CONTRASTS: { key: SubtitleContrast; label: string }[] = [
  { key: 'shadow', label: 'Ombre' },
  { key: 'box', label: 'Fond noir' },
  { key: 'yellow', label: 'Jaune sur noir' },
];
