export type LyricLine = { timeSec: number | null; text: string };

export type Lyrics = { synced: boolean; lines: LyricLine[] };

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const META_TAG = /^\[(ar|ti|al|au|by|length|offset|re|ve|#):/i;

/** Analyse un fichier .lrc (paroles synchronisées) ou un texte brut (paroles non synchronisées). */
export function parseLyrics(raw: string): Lyrics {
  const offsetMatch = raw.match(/\[offset:\s*([+-]?\d+)\]/i);
  const offsetSec = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
  const timed: LyricLine[] = [];
  const plain: LyricLine[] = [];

  for (const rawLine of raw.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim();
    if (META_TAG.test(line)) continue;
    const times: number[] = [];
    let m: RegExpExecArray | null;
    TIME_TAG.lastIndex = 0;
    while ((m = TIME_TAG.exec(line))) {
      const frac = m[3] ? Number(m[3]) / 10 ** m[3].length : 0;
      times.push(Number(m[1]) * 60 + Number(m[2]) + frac);
    }
    const text = line.replace(TIME_TAG, '').trim();
    if (times.length) {
      for (const t of times) timed.push({ timeSec: Math.max(0, t - offsetSec), text });
    } else if (line) {
      plain.push({ timeSec: null, text });
    }
  }

  if (timed.length) {
    timed.sort((a, b) => (a.timeSec ?? 0) - (b.timeSec ?? 0));
    return { synced: true, lines: timed };
  }
  return { synced: false, lines: plain };
}

/** Index de la ligne en cours (-1 avant la première ligne). Recherche dichotomique. */
export function activeLineIndex(lines: LyricLine[], positionSec: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((lines[mid].timeSec ?? Infinity) <= positionSec) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
