import { createAudioPlaylist, requestNotificationPermissionsAsync, setAudioModeAsync, type AudioPlaylist } from 'expo-audio';
import { Platform } from 'react-native';

import type { RepeatMode } from '../types';

export type EngineItem = {
  id: string;
  uri: string;
  title: string;
  artist: string;
  album: string;
};

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
  setNowPlaying(item: EngineItem, artworkUri: string | null): void;
  onStatus(listener: (status: EngineStatus) => void): () => void;
  onTrackChanged(listener: (index: number) => void): () => void;
  release(): void;
}

const LOOP: Record<RepeatMode, 'none' | 'all' | 'single'> = { off: 'none', all: 'all', one: 'single' };

function source(item: EngineItem) {
  return { uri: item.uri, name: item.title };
}

export class ExpoPlaylistEngine implements PlaybackEngine {
  private playlist: AudioPlaylist;
  private lockScreenActive = false;
  private notificationsAsked = false;

  constructor() {
    this.playlist = createAudioPlaylist({ updateInterval: 500, loop: 'none' });
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch(() => {
      // Mode audio par défaut : la lecture reste possible au premier plan.
    });
  }

  load(items: EngineItem[], startIndex: number, startPositionSec: number, autoplay: boolean) {
    this.playlist.clear();
    for (const item of items) this.playlist.add(source(item));
    if (items.length === 0) return;
    this.playlist.skipTo(Math.max(0, Math.min(startIndex, items.length - 1)));
    if (startPositionSec > 0) this.playlist.seekTo(startPositionSec).catch(() => {});
    if (autoplay) this.play();
  }

  play() {
    if (!this.notificationsAsked && Platform.OS === 'android') {
      this.notificationsAsked = true;
      // Android 13+ : sans cette autorisation, la notification de lecture n'apparaît pas.
      requestNotificationPermissionsAsync().catch(() => {});
    }
    this.playlist.play();
  }

  pause() {
    this.playlist.pause();
  }

  next() {
    this.playlist.next();
  }

  previous() {
    this.playlist.previous();
  }

  skipTo(index: number) {
    this.playlist.skipTo(index);
  }

  seekTo(seconds: number) {
    this.playlist.seekTo(seconds).catch(() => {});
  }

  insert(item: EngineItem, index: number) {
    if (index >= this.playlist.trackCount) this.playlist.add(source(item));
    else this.playlist.insert(source(item), index);
  }

  remove(index: number) {
    this.playlist.remove(index);
  }

  setRepeat(mode: RepeatMode) {
    this.playlist.loop = LOOP[mode];
  }

  setNowPlaying(item: EngineItem, artworkUri: string | null) {
    const metadata = {
      title: item.title,
      artist: item.artist,
      albumTitle: item.album,
      ...(artworkUri ? { artworkUrl: artworkUri } : {}),
    };
    if (!this.lockScreenActive) {
      this.lockScreenActive = true;
      this.playlist.setActiveForLockScreen(true, metadata, { showNextTrack: true, showPreviousTrack: true });
    } else {
      this.playlist.updateLockScreenMetadata(metadata);
    }
  }

  onStatus(listener: (status: EngineStatus) => void) {
    const sub = this.playlist.addListener('playlistStatusUpdate', (s) =>
      listener({
        playing: s.playing,
        isBuffering: s.isBuffering,
        positionSec: s.currentTime,
        durationSec: s.duration,
        index: s.currentIndex,
      }),
    );
    return () => sub.remove();
  }

  onTrackChanged(listener: (index: number) => void) {
    const sub = this.playlist.addListener('trackChanged', (e) => listener(e.currentIndex));
    return () => sub.remove();
  }

  release() {
    this.playlist.destroy();
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
  release() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
