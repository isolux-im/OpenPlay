import type { Track } from '../types';

export type QueueState = {
  tracks: Track[];
  /** -1 lorsque la file est vide. */
  index: number;
};

export const EMPTY_QUEUE: QueueState = { tracks: [], index: -1 };

/** En deçà de ce seuil, « précédent » change de piste ; au-delà, il revient au début. */
export const RESTART_THRESHOLD_SEC = 3;

export function currentTrack(q: QueueState): Track | null {
  return q.index >= 0 && q.index < q.tracks.length ? q.tracks[q.index] : null;
}

export function startQueue(tracks: Track[], startId: string): QueueState {
  if (tracks.length === 0) return EMPTY_QUEUE;
  const i = tracks.findIndex((t) => t.id === startId);
  return { tracks, index: i < 0 ? 0 : i };
}

export function hasNext(q: QueueState): boolean {
  return q.index >= 0 && q.index < q.tracks.length - 1;
}

/** Renvoie null en fin de file (pas de répétition dans cette version). */
export function nextIndex(q: QueueState): number | null {
  return hasNext(q) ? q.index + 1 : null;
}

export type PreviousAction = { type: 'restart' } | { type: 'goto'; index: number };

export function previousAction(q: QueueState, positionSec: number): PreviousAction {
  if (positionSec > RESTART_THRESHOLD_SEC || q.index <= 0) return { type: 'restart' };
  return { type: 'goto', index: q.index - 1 };
}
