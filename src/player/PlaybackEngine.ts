import { createAudioPlaylist, requestNotificationPermissionsAsync, setAudioModeAsync, type AudioPlaylist } from 'expo-audio';
import { Platform } from 'react-native';

import { describeError, recordDiagnostic } from '../diagnostics/crashReports';
import type { RepeatMode } from '../types';

export type EngineItem = {
  id: string;
  uri: string;
  title: string;
  artist: string;
  album: string;
};

/** Échec de lecture d'un élément de la file (fichier absent, illisible, format non pris en charge). */
export type EngineError = { index: number; message: string };

export type EngineStatus = {
  playing: boolean;
  isBuffering: boolean;
  positionSec: number;
  durationSec: number;
  index: number;
};

/**
 * Moteur de lecture : une file native (ExoPlayer via expo-audio AudioPlaylist) qui continue
 * en arrière-plan et répond à la notification, à l'écran de verrouillage et aux boutons
 * Bluetooth (lecture, pause, suivant, précédent). L'ordre de la file native est toujours
 * identique à celui du store `player`.
 */
export interface PlaybackEngine {
  load(items: EngineItem[], startIndex: number, startPositionSec: number, autoplay: boolean): void;
  play(): void;
  pause(): void;
  next(): void;
  previous(): void;
  skipTo(index: number): void;
  seekTo(seconds: number): void;
  insert(item: EngineItem, index: number): void;
  remove(index: number): void;
  setRepeat(mode: RepeatMode): void;
  /** Vitesse de lecture (0,5 à 2), sans changement de hauteur du son. */
  setRate(rate: number): void;
  setNowPlaying(item: EngineItem, artworkUri: string | null): void;
  onStatus(listener: (status: EngineStatus) => void): () => void;
  onTrackChanged(listener: (index: number) => void): () => void;
  /**
   * Échec de lecture. Après une erreur, ExoPlayer reste à l'arrêt : le moteur repart alors d'un
   * lecteur neuf à la prochaine commande de lecture (play, skipTo, next, previous, load).
   */
  onError(listener: (error: EngineError) => void): () => void;
  release(): void;
}

const LOOP: Record<RepeatMode, 'none' | 'all' | 'single'> = { off: 'none', all: 'all', one: 'single' };

function source(item: EngineItem) {
  return { uri: item.uri, name: item.title };
}

export class ExpoPlaylistEngine implements PlaybackEngine {
  private playlist: AudioPlaylist;
  private subscriptions: { remove: () => void }[] = [];
  private statusListeners = new Set<(s: EngineStatus) => void>();
  private trackListeners = new Set<(i: number) => void>();
  private errorListeners = new Set<(e: EngineError) => void>();
  /** Copie de la file native, pour reconstruire un lecteur neuf après une erreur. */
  private items: EngineItem[] = [];
  private current = 0;
  private failed = false;
  private repeat: RepeatMode = 'off';
  private rate = 1;
  private lockScreenActive = false;
  private nowPlaying: { item: EngineItem; artworkUri: string | null } | null = null;
  private notificationsAsked = false;
  private released = false;
  private lastError: string | null = null;

  constructor() {
    this.playlist = this.create();
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch((e: unknown) => recordDiagnostic('Mode audio non appliqué', describeError(e)));
  }

  /**
   * Lecteur natif, chargé de toute la file en un seul appel, et relais de ses événements vers les
   * écouteurs du moteur (conservés d'un lecteur à l'autre).
   */
  private create(items: EngineItem[] = []): AudioPlaylist {
    const playlist = createAudioPlaylist({ sources: items.map(source), updateInterval: 500, loop: LOOP[this.repeat] });
    if (this.rate !== 1) {
      const rate = this.rate;
      this.guard('vitesse', () => {
        playlist.playbackRate = rate;
      });
    }
    this.subscriptions = [
      playlist.addListener('playlistStatusUpdate', (s) => {
        if (s.currentIndex >= 0) this.current = s.currentIndex;
        const status = { playing: s.playing, isBuffering: s.isBuffering, positionSec: s.currentTime, durationSec: s.duration, index: s.currentIndex };
        this.statusListeners.forEach((l) => l(status));
        // ExoPlayer signale ses échecs dans la mise à jour d'état (champ « error », absent des types publiés).
        const error = (s as { error?: { message?: string | null } | string | null }).error;
        if (!error) return;
        const message = (typeof error === 'string' ? error : error.message) || 'Erreur de lecture';
        const key = `${s.currentIndex}:${message}`;
        if (key === this.lastError) return;
        this.lastError = key;
        this.failed = true;
        this.errorListeners.forEach((l) => l({ index: s.currentIndex, message }));
      }),
      playlist.addListener('trackChanged', (e) => {
        this.lastError = null;
        this.current = e.currentIndex;
        this.trackListeners.forEach((l) => l(e.currentIndex));
      }),
    ];
    return playlist;
  }

  /**
   * Les commandes natives sont appelées depuis des gestes : une exception y serait fatale pour
   * l'application. Elle est consignée dans le journal de diagnostic au lieu de fermer OpenPlay.
   */
  private guard(action: string, run: () => void) {
    if (this.released) return;
    try {
      run();
    } catch (e) {
      recordDiagnostic(`Commande audio « ${action} » en échec`, describeError(e));
    }
  }

  /**
   * Remplace le lecteur natif par un lecteur neuf chargé de `this.items`, positionné sur `index`
   * (sans lancer la lecture). Sert au chargement d'une file et à la reprise après une erreur.
   * Charger la file à la création évite un appel synchrone au fil principal, un événement d'état et
   * un recalcul de la file ExoPlayer pour chaque morceau (des milliers pour « Tous les titres »).
   */
  private rebuild(index: number) {
    this.subscriptions.forEach((sub) => sub.remove());
    this.subscriptions = [];
    this.guard('remplacement du lecteur', () => this.playlist.destroy());
    this.lockScreenActive = false;
    this.failed = false;
    this.lastError = null;
    try {
      this.playlist = this.create(this.items);
    } catch (e) {
      recordDiagnostic('Recréation du lecteur en échec', describeError(e));
      return;
    }
    const target = Math.max(0, Math.min(index, this.items.length - 1));
    this.current = target;
    if (target > 0) this.guard('aller au morceau', () => this.playlist.skipTo(target));
    const item = this.items[target];
    if (item) this.setNowPlaying(item, this.nowPlaying?.item.id === item.id ? this.nowPlaying.artworkUri : null);
  }

  load(items: EngineItem[], startIndex: number, startPositionSec: number, autoplay: boolean) {
    this.items = [...items];
    this.rebuild(startIndex);
    if (items.length === 0) return;
    if (startPositionSec > 0) this.seekTo(startPositionSec);
    if (autoplay) this.play();
  }

  play() {
    if (this.failed) this.rebuild(this.current);
    if (!this.notificationsAsked && Platform.OS === 'android') {
      this.notificationsAsked = true;
      // Android 13+ : sans cette autorisation, la notification de lecture n'apparaît pas.
      requestNotificationPermissionsAsync().catch(() => {});
    }
    this.guard('lecture', () => this.playlist.play());
  }

  pause() {
    this.guard('pause', () => this.playlist.pause());
  }

  next() {
    if (this.failed) return this.rebuild(this.current + 1 < this.items.length ? this.current + 1 : this.repeat === 'all' ? 0 : this.current);
    this.guard('suivant', () => this.playlist.next());
  }

  previous() {
    if (this.failed) return this.rebuild(this.current > 0 ? this.current - 1 : this.repeat === 'all' ? this.items.length - 1 : 0);
    this.guard('précédent', () => this.playlist.previous());
  }

  skipTo(index: number) {
    if (this.failed) return this.rebuild(index);
    this.current = index;
    this.guard('aller au morceau', () => this.playlist.skipTo(index));
  }

  seekTo(seconds: number) {
    this.guard('position', () => {
      this.playlist.seekTo(seconds).catch((e: unknown) => recordDiagnostic('Déplacement dans le morceau en échec', describeError(e)));
    });
  }

  insert(item: EngineItem, index: number) {
    this.items.splice(Math.min(index, this.items.length), 0, item);
    if (index <= this.current && this.items.length > 1) this.current += 1;
    this.guard('insertion', () => {
      if (index >= this.playlist.trackCount) this.playlist.add(source(item));
      else this.playlist.insert(source(item), index);
    });
  }

  remove(index: number) {
    if (index >= 0 && index < this.items.length) this.items.splice(index, 1);
    if (index < this.current) this.current -= 1;
    this.guard('retrait', () => this.playlist.remove(index));
  }

  setRepeat(mode: RepeatMode) {
    this.repeat = mode;
    this.guard('répétition', () => {
      this.playlist.loop = LOOP[mode];
    });
  }

  setRate(rate: number) {
    this.rate = rate;
    this.guard('vitesse', () => {
      this.playlist.playbackRate = rate;
    });
  }

  setNowPlaying(item: EngineItem, artworkUri: string | null) {
    this.nowPlaying = { item, artworkUri };
    const metadata = {
      title: item.title,
      artist: item.artist,
      albumTitle: item.album,
      ...(artworkUri ? { artworkUrl: artworkUri } : {}),
    };
    this.guard('écran de verrouillage', () => {
      if (!this.lockScreenActive) {
        this.playlist.setActiveForLockScreen(true, metadata, { showNextTrack: true, showPreviousTrack: true });
        this.lockScreenActive = true;
      } else {
        this.playlist.updateLockScreenMetadata(metadata);
      }
    });
  }

  onStatus(listener: (status: EngineStatus) => void) {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  onTrackChanged(listener: (index: number) => void) {
    this.trackListeners.add(listener);
    return () => {
      this.trackListeners.delete(listener);
    };
  }

  onError(listener: (error: EngineError) => void) {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  release() {
    if (this.released) return;
    this.released = true;
    this.subscriptions.forEach((sub) => sub.remove());
    try {
      this.playlist.destroy();
    } catch (e) {
      recordDiagnostic('Libération du lecteur en échec', describeError(e));
    }
  }
}

/**
 * Moteur simulé (aperçu web, tests) : avance le temps sans produire de son.
 */
export class SimulatedEngine implements PlaybackEngine {
  items: EngineItem[] = [];
  index = 0;
  position = 0;
  playing = false;
  repeat: RepeatMode = 'off';
  nowPlaying: { item: EngineItem; artworkUri: string | null } | null = null;
  private statusListeners = new Set<(s: EngineStatus) => void>();
  private trackListeners = new Set<(i: number) => void>();
  private errorListeners = new Set<(e: EngineError) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private durationOf: (id: string) => number = () => 180, private tickMs = 500) {}

  private emit() {
    const s: EngineStatus = {
      playing: this.playing,
      isBuffering: false,
      positionSec: this.position,
      durationSec: this.items[this.index] ? this.durationOf(this.items[this.index].id) : 0,
      index: this.index,
    };
    this.statusListeners.forEach((l) => l(s));
  }

  private changeTrack(i: number) {
    this.index = i;
    this.position = 0;
    this.trackListeners.forEach((l) => l(i));
    this.emit();
  }

  private tick = () => {
    if (!this.playing || !this.items.length) return;
    this.position += this.tickMs / 1000;
    if (this.position >= this.durationOf(this.items[this.index].id)) {
      if (this.repeat === 'one') this.position = 0;
      else if (this.index < this.items.length - 1) return this.changeTrack(this.index + 1);
      else if (this.repeat === 'all') return this.changeTrack(0);
      else {
        this.playing = false;
        this.position = 0;
      }
    }
    this.emit();
  };

  load(items: EngineItem[], startIndex: number, startPositionSec: number, autoplay: boolean) {
    this.items = [...items];
    this.index = Math.max(0, Math.min(startIndex, items.length - 1));
    this.position = startPositionSec;
    this.playing = false;
    if (autoplay) this.play();
    else this.emit();
  }
  play() {
    if (!this.items.length) return;
    this.playing = true;
    if (!this.timer && this.tickMs > 0) this.timer = setInterval(this.tick, this.tickMs);
    this.emit();
  }
  pause() {
    this.playing = false;
    this.emit();
  }
  next() {
    if (this.index < this.items.length - 1) this.changeTrack(this.index + 1);
    else if (this.repeat === 'all' && this.items.length) this.changeTrack(0);
  }
  previous() {
    if (this.index > 0) this.changeTrack(this.index - 1);
    else if (this.repeat === 'all' && this.items.length) this.changeTrack(this.items.length - 1);
  }
  skipTo(index: number) {
    if (index >= 0 && index < this.items.length) this.changeTrack(index);
  }
  seekTo(seconds: number) {
    this.position = seconds;
    this.emit();
  }
  insert(item: EngineItem, index: number) {
    this.items.splice(index, 0, item);
    if (index <= this.index && this.items.length > 1) this.index += 1;
  }
  remove(index: number) {
    this.items.splice(index, 1);
    if (index < this.index) this.index -= 1;
  }
  setRepeat(mode: RepeatMode) {
    this.repeat = mode;
  }
  rate = 1;
  setRate(rate: number) {
    this.rate = rate;
  }
  setNowPlaying(item: EngineItem, artworkUri: string | null) {
    this.nowPlaying = { item, artworkUri };
  }
  onStatus(listener: (s: EngineStatus) => void) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }
  onTrackChanged(listener: (i: number) => void) {
    this.trackListeners.add(listener);
    return () => this.trackListeners.delete(listener);
  }
  onError(listener: (e: EngineError) => void) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }
  /** Tests : lecture continue de `seconds` secondes, par pas de 0,5 s. */
  advance(seconds: number) {
    for (let t = 0; t < seconds; t += 0.5) {
      this.position += 0.5;
      this.emit();
    }
  }
  /** Tests : simule un fichier illisible sur l'élément courant (le lecteur s'arrête, comme ExoPlayer). */
  fail(message = 'Source error') {
    this.playing = false;
    this.errorListeners.forEach((l) => l({ index: this.index, message }));
    this.emit();
  }
  release() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
