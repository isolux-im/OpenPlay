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

/**
 * Ordre alphabétique « naturel » : les nombres comptent pour leur valeur (« Film 2 » avant « Film 10 »,
 * « Saison 9 » avant « Saison 10 »). Indépendant du moteur JavaScript (pas d'option `numeric` d'Intl).
 */
export function compareText(a: string, b: string): number {
  const x = sortKey(a).match(/\d+|\D+/g) ?? [];
  const y = sortKey(b).match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const p = x[i];
    const q = y[i];
    const numeric = /^\d/.test(p) && /^\d/.test(q);
    const diff = numeric ? Number(p) - Number(q) || p.length - q.length : p.localeCompare(q, 'fr');
    if (diff) return diff;
  }
  return x.length - y.length;
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

const FORMATS: Record<string, string> = {
  'audio/mpeg': 'MP3',
  'audio/mp3': 'MP3',
  'audio/mp4': 'AAC (M4A)',
  'audio/x-m4a': 'AAC (M4A)',
  'audio/aac': 'AAC',
  'audio/flac': 'FLAC',
  'audio/x-flac': 'FLAC',
  'audio/ogg': 'Ogg',
  'audio/opus': 'Opus',
  'audio/wav': 'WAV',
  'audio/x-wav': 'WAV',
  'audio/amr': 'AMR',
};

/**
 * Format, taille et débit moyen d'un fichier. Le débit est une estimation (taille × 8 / durée) :
 * il inclut les métadonnées et la pochette intégrée, et n'est pas lu dans l'en-tête du flux.
 */
export function audioQuality(mimeType: string, sizeBytes: number, durationSec: number) {
  const format = FORMATS[mimeType.toLowerCase()] ?? (mimeType.replace(/^audio\//, '').toUpperCase() || 'Inconnu');
  const size = sizeBytes > 0 ? `${(sizeBytes / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} Mo` : 'Inconnue';
  const kbps = sizeBytes > 0 && durationSec > 0 ? Math.round((sizeBytes * 8) / durationSec / 1000) : null;
  return { format, size, bitrate: kbps ? `≈ ${kbps} kbit/s` : 'Inconnu' };
}

/**
 * Lettres présentes dans une liste déjà triée et position de la première entrée de chacune
 * (même règle que le tri : accents, casse et articles initiaux ignorés).
 */
export function alphabetIndex(keys: string[]): { letters: string[]; first: Record<string, number> } {
  const letters: string[] = [];
  const first: Record<string, number> = {};
  keys.forEach((k, i) => {
    const l = indexLetter(k);
    if (first[l] === undefined) {
      first[l] = i;
      letters.push(l);
    }
  });
  return { letters, first };
}
