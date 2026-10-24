/** Minuscules sans accents ni ponctuation superflue : base de la recherche et des tris. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const ARTICLES = /^(the|le|la|les|l)\s+/;

/** Clé de tri : ignore les accents, la casse et les articles initiaux (« The Beatles » → « beatles »). */
export function sortKey(value: string): string {
  return normalizeText(value).replace(ARTICLES, '');
}

export function compareText(a: string, b: string): number {
  return sortKey(a).localeCompare(sortKey(b), 'fr');
}

/** Lettre d'index (A–Z, ou « # » pour les chiffres et symboles). */
export function indexLetter(value: string): string {
  const first = sortKey(value).charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSec) ? totalSec : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Durée totale lisible : « 52 min », « 1 h 07 min ». */
export function formatTotalDuration(totalSec: number): string {
  const minutes = Math.round(Math.max(0, totalSec) / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  return `${h} h ${String(minutes % 60).padStart(2, '0')} min`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count > 1 ? plural : singular}`;
}
