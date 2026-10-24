import type { RepeatMode } from '../types';

/** En deçà de ce seuil, « précédent » change de piste ; au-delà, il revient au début. */
export const RESTART_THRESHOLD_SEC = 3;

export function shouldRestart(positionSec: number, index: number, repeat: RepeatMode): boolean {
  if (positionSec > RESTART_THRESHOLD_SEC) return true;
  return index <= 0 && repeat !== 'all';
}

export function nextRepeat(mode: RepeatMode): RepeatMode {
  return mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off';
}

/** Mélange de Fisher-Yates ; `random` est injectable pour les tests. */
export function shuffled<T>(items: T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Ordre aléatoire qui garde la piste courante en tête. */
export function shuffleAround(ids: string[], currentIndex: number, random?: () => number): string[] {
  if (currentIndex < 0 || currentIndex >= ids.length) return shuffled(ids, random);
  const current = ids[currentIndex];
  const rest = ids.filter((_, i) => i !== currentIndex);
  return [current, ...shuffled(rest, random)];
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) return items;
  const out = [...items];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

/** Nouvel index courant après déplacement d'un élément de la file. */
export function indexAfterMove(current: number, from: number, to: number): number {
  if (from === current) return to;
  if (from < current && to >= current) return current - 1;
  if (from > current && to <= current) return current + 1;
  return current;
}

/** Nouvel index courant après suppression ; -1 si la file devient vide. */
export function indexAfterRemove(current: number, removed: number, length: number): number {
  if (length <= 1) return -1;
  if (removed < current) return current - 1;
  if (removed === current) return Math.min(current, length - 2);
  return current;
}
