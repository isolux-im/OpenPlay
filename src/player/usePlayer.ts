import { useCallback, useEffect, useRef, useState } from 'react';

import type { Track } from '../types';
import { ExpoAudioEngine, type EngineStatus, type PlaybackEngine } from './PlaybackEngine';
import { EMPTY_QUEUE, currentTrack, nextIndex, previousAction, startQueue, type QueueState } from './queue';

export const IDLE_STATUS: EngineStatus = {
  playing: false,
  isLoaded: false,
  isBuffering: false,
  positionSec: 0,
  durationSec: 0,
  didJustFinish: false,
};

export type Player = {
  track: Track | null;
  status: EngineStatus;
  hasQueue: boolean;
  playFrom: (tracks: Track[], startId: string) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
};

const defaultEngine = (): PlaybackEngine => new ExpoAudioEngine();

export function usePlayer(createEngine: () => PlaybackEngine = defaultEngine): Player {
  const engineRef = useRef<PlaybackEngine | null>(null);
  const createEngineRef = useRef(createEngine);
  const queueRef = useRef<QueueState>(EMPTY_QUEUE);
  const statusRef = useRef<EngineStatus>(IDLE_STATUS);
  const [queue, setQueue] = useState<QueueState>(EMPTY_QUEUE);
  const [status, setStatus] = useState<EngineStatus>(IDLE_STATUS);

  const goTo = useCallback((q: QueueState) => {
    queueRef.current = q;
    setQueue(q);
    const t = currentTrack(q);
    const engine = engineRef.current;
    if (!t || !engine) return;
    engine.load(t.uri);
    engine.play();
  }, []);

  const next = useCallback(() => {
    const q = queueRef.current;
    const i = nextIndex(q);
    if (i !== null) goTo({ ...q, index: i });
  }, [goTo]);

  useEffect(() => {
    const engine = createEngineRef.current();
    engineRef.current = engine;
    const off = engine.onStatus((s) => {
      statusRef.current = s;
      setStatus(s);
      if (!s.didJustFinish) return;
      const q = queueRef.current;
      const i = nextIndex(q);
      if (i !== null) {
        goTo({ ...q, index: i });
      } else {
        // Fin de file : on revient au début de la dernière piste, à l'arrêt.
        engine.pause();
        engine.seekTo(0).catch(() => {});
      }
    });
    return () => {
      off();
      engine.release();
      engineRef.current = null;
    };
  }, [goTo]);

  const playFrom = useCallback(
    (tracks: Track[], startId: string) => goTo(startQueue(tracks, startId)),
    [goTo],
  );

  const toggle = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !currentTrack(queueRef.current)) return;
    if (statusRef.current.playing) engine.pause();
    else engine.play();
  }, []);

  const previous = useCallback(() => {
    const q = queueRef.current;
    if (!currentTrack(q)) return;
    const action = previousAction(q, statusRef.current.positionSec);
    if (action.type === 'goto') goTo({ ...q, index: action.index });
    else engineRef.current?.seekTo(0).catch(() => {});
  }, [goTo]);

  return {
    track: currentTrack(queue),
    status,
    hasQueue: queue.tracks.length > 0,
    playFrom,
    toggle,
    next,
    previous,
  };
}
