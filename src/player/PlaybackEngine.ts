import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';

export type EngineStatus = {
  playing: boolean;
  isLoaded: boolean;
  isBuffering: boolean;
  positionSec: number;
  durationSec: number;
  didJustFinish: boolean;
};

/**
 * Moteur de lecture isolé derrière une interface : l'étape « arrière-plan et commandes
 * multimédias » (setActiveForLockScreen, ou un module natif Media3) ne touchera que
 * l'implémentation, pas les écrans ni la logique de file.
 */
export interface PlaybackEngine {
  load(uri: string): void;
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
  onStatus(listener: (status: EngineStatus) => void): () => void;
  release(): void;
}

export function toEngineStatus(s: AudioStatus): EngineStatus {
  return {
    playing: s.playing,
    isLoaded: s.isLoaded,
    isBuffering: s.isBuffering,
    positionSec: s.currentTime,
    durationSec: s.duration,
    didJustFinish: s.didJustFinish,
  };
}

export class ExpoAudioEngine implements PlaybackEngine {
  private player: AudioPlayer;

  constructor() {
    this.player = createAudioPlayer(null, { updateInterval: 500 });
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'doNotMix',
    }).catch(() => {
      // Mode audio non appliqué : la lecture reste possible avec le mode par défaut.
    });
  }

  load(uri: string) {
    this.player.replace({ uri });
  }

  play() {
    this.player.play();
  }

  pause() {
    this.player.pause();
  }

  seekTo(seconds: number) {
    return this.player.seekTo(seconds);
  }

  onStatus(listener: (status: EngineStatus) => void) {
    const sub = this.player.addListener('playbackStatusUpdate', (s) => listener(toEngineStatus(s)));
    return () => sub.remove();
  }

  release() {
    this.player.remove();
  }
}
