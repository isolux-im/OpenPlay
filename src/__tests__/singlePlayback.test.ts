import { createAudioPlaylist } from 'expo-audio';

import { demoTracks } from '../library/demoLibrary';
import { buildIndex } from '../library/indexLibrary';
import { ExpoPlaylistEngine, SimulatedEngine } from '../player/PlaybackEngine';
import { registerVideoPauser } from '../player/mediaFocus';
import { connectPlayer, disconnectPlayer, musicWantsToPlay, usePlayer } from '../store/player';

/**
 * Double du lecteur natif expo-audio 58 (AudioModule.kt / AudioPlaylist.kt), fidèle sur un point
 * décisif : `destroy()` retire seulement les commandes de l'écran de verrouillage — l'ExoPlayer
 * continue de jouer tant que l'objet n'est pas libéré par `release()` (ou par le ramasse-miettes,
 * à un moment imprévisible).
 */
class FakeNativePlaylist {
  static all: FakeNativePlaylist[] = [];
  playing = false;
  released = false;
  destroyed = false;
  currentIndex = 0;
  loop = 'none';
  playbackRate = 1;
  private listeners = new Map<string, Set<(e: unknown) => void>>();
  constructor(public sources: { uri: string }[]) {
    FakeNativePlaylist.all.push(this);
  }
  get trackCount() {
    return this.sources.length;
  }
  addListener(name: string, fn: (e: unknown) => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(fn);
    return { remove: () => this.listeners.get(name)?.delete(fn) };
  }
  emitStatus(extra: object = {}) {
    const s = { playing: this.playing, isBuffering: false, currentTime: 1, duration: 180, currentIndex: this.currentIndex, ...extra };
    this.listeners.get('playlistStatusUpdate')?.forEach((l) => l(s));
  }
  play() {
    if (!this.released) this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  skipTo(i: number) {
    this.currentIndex = i;
  }
  next() {
    this.currentIndex += 1;
  }
  previous() {
    this.currentIndex = Math.max(0, this.currentIndex - 1);
  }
  seekTo() {
    return Promise.resolve();
  }
  add(s: { uri: string }) {
    this.sources.push(s);
  }
  insert(s: { uri: string }, i: number) {
    this.sources.splice(i, 0, s);
  }
  remove(i: number) {
    this.sources.splice(i, 1);
  }
  setActiveForLockScreen() {}
  updateLockScreenMetadata() {}
  /** Comme le natif : ne met ni en pause ni ne libère l'ExoPlayer. */
  destroy() {
    this.destroyed = true;
  }
  release() {
    this.released = true;
    this.playing = false;
  }
}

const audible = () => FakeNativePlaylist.all.filter((p) => p.playing && !p.released);

const index = buildIndex(demoTracks());
const album = index.albums.find((a) => a.title === 'Racines')!.trackIds;
const all = index.tracks.map((t) => t.id);
const state = () => usePlayer.getState();

describe('moteur ExoPlayer : une seule lecture audible', () => {
  let engine: ExpoPlaylistEngine;
  beforeEach(() => {
    FakeNativePlaylist.all = [];
    (createAudioPlaylist as jest.Mock).mockImplementation(({ sources }: { sources: { uri: string }[] }) => new FakeNativePlaylist([...sources]));
    usePlayer.setState({ queue: [], originalQueue: [], index: -1, isPlaying: false, positionSec: 0, durationSec: 0, shuffle: false, repeat: 'off', sourceLabel: null, sleep: { endsAt: null, atTrackEnd: false } });
    engine = new ExpoPlaylistEngine();
    connectPlayer(engine, (id) => index.byId[id]);
  });
  afterEach(() => disconnectPlayer());

  it('lancer A, puis B, puis C aussitôt : un seul lecteur audible, les anciens libérés', () => {
    state().playTracks(album, 0);
    state().playTracks(all, 3);
    state().playTracks(album, 2);
    expect(audible()).toHaveLength(1);
    expect(audible()[0]).toBe(FakeNativePlaylist.all.at(-1));
    // Tous les lecteurs remplacés sont réellement libérés (pas d'ExoPlayer orphelin).
    expect(FakeNativePlaylist.all.slice(0, -1).every((p) => p.released && !p.playing)).toBe(true);
    expect(state().queue[state().index]).toBe(album[2]);
  });

  it('vingt sélections rapides : jamais deux sons, un seul lecteur vivant', () => {
    for (let i = 0; i < 20; i++) state().playTracks(i % 2 ? album : all, i % 4);
    expect(audible()).toHaveLength(1);
    expect(FakeNativePlaylist.all.filter((p) => !p.released)).toHaveLength(1);
  });

  it('Pause coupe réellement le son après un changement de morceau', () => {
    state().playTracks(album, 0);
    state().playTracks(album, 1);
    state().pause();
    expect(audible()).toHaveLength(0);
    expect(state().isPlaying).toBe(false);
  });

  it('un état « en lecture » arrivé en retard après Pause ne relance pas le son', () => {
    state().playTracks(album, 0);
    const live = FakeNativePlaylist.all.at(-1)!;
    state().pause();
    // Mise à jour émise par le natif avant la pause, reçue après : rejetée et pause réappliquée.
    live.playing = true;
    live.emitStatus();
    expect(live.playing).toBe(false);
    expect(state().isPlaying).toBe(false);
    expect(musicWantsToPlay()).toBe(false);
  });

  it('les événements d’un lecteur remplacé sont ignorés', () => {
    state().playTracks(album, 0);
    const old = FakeNativePlaylist.all.at(-1)!;
    state().playTracks(album, 2);
    state().pause();
    old.playing = true;
    old.emitStatus({ currentIndex: 0 });
    expect(state().isPlaying).toBe(false);
    expect(state().index).toBe(2);
  });

  it('fichier illisible pendant la lecture : morceau suivant sur un lecteur neuf, l’ancien libéré', () => {
    state().playTracks(album, 0);
    const failed = FakeNativePlaylist.all.at(-1)!;
    // Erreur survenue bien après le lancement (hors de la fenêtre qui suit une commande).
    const later = Date.now() + 60_000;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => later);
    failed.playing = false; // ExoPlayer s'arrête sur l'erreur
    failed.emitStatus({ error: { message: 'Source error' } });
    clock.mockRestore();
    expect(state().index).toBe(1);
    expect(state().isPlaying).toBe(true);
    expect(failed.released).toBe(true);
    expect(audible()).toEqual([FakeNativePlaylist.all.at(-1)]);
    expect(FakeNativePlaylist.all.at(-1)!.currentIndex).toBe(1);
  });

  it('la reprise après Pause repart du même lecteur, à la même position', () => {
    state().playTracks(album, 1);
    const live = FakeNativePlaylist.all.at(-1)!;
    state().pause();
    state().play();
    expect(FakeNativePlaylist.all.at(-1)).toBe(live);
    expect(audible()).toEqual([live]);
    expect(live.currentIndex).toBe(1);
  });

  it('la libération finale coupe le son', () => {
    state().playTracks(album, 0);
    disconnectPlayer();
    expect(audible()).toHaveLength(0);
  });
});

describe('commandes de lecture (moteur simulé)', () => {
  let engine: SimulatedEngine;
  beforeEach(() => {
    jest.useFakeTimers();
    usePlayer.setState({ queue: [], originalQueue: [], index: -1, isPlaying: false, positionSec: 0, durationSec: 0, shuffle: false, repeat: 'off', sourceLabel: null, sleep: { endsAt: null, atTrackEnd: false } });
    engine = new SimulatedEngine(() => 3, 500);
    connectPlayer(engine, (id) => index.byId[id]);
  });
  afterEach(() => {
    disconnectPlayer();
    registerVideoPauser(null);
    jest.useRealTimers();
  });

  it('le bouton affiche « Pause » dès le lancement, et un appui met bien en pause', () => {
    state().playTracks(album, 0);
    expect(state().isPlaying).toBe(true);
    state().toggle();
    expect(engine.playing).toBe(false);
    jest.advanceTimersByTime(5000);
    expect(engine.playing).toBe(false);
    expect(state().index).toBe(0); // pas d'enchaînement après une pause manuelle
  });

  it('Pause pendant le chargement : pas de reprise spontanée', () => {
    state().playTracks(album, 0);
    state().pause();
    // Le moteur signale ensuite la fin de son chargement : la pause tient.
    engine.seekTo(0);
    jest.advanceTimersByTime(10_000);
    expect(engine.playing).toBe(false);
    expect(state().isPlaying).toBe(false);
  });

  it('une erreur après une pause manuelle ne relance pas la lecture', () => {
    state().playTracks(album, 0);
    state().pause();
    engine.fail();
    expect(engine.playing).toBe(false);
    expect(state().isPlaying).toBe(false);
  });

  it('une vidéo qui démarre met la musique en pause même pendant son chargement', () => {
    state().playTracks(album, 0);
    usePlayer.setState({ isPlaying: false, isBuffering: true }); // chargement : pas encore « en lecture »
    expect(musicWantsToPlay()).toBe(true);
    state().pause();
    expect(engine.playing).toBe(false);
  });

  it('fin naturelle : un seul passage au suivant par fin de morceau, dans les trois modes', () => {
    const changes: number[] = [];
    engine.onTrackChanged((i) => changes.push(i));
    state().playTracks(album, 0);
    jest.advanceTimersByTime(3500);
    expect(changes).toEqual([1]);
    expect(state().index).toBe(1);
    state().cycleRepeat(); // all
    state().jumpTo(album.length - 1);
    changes.length = 0;
    jest.advanceTimersByTime(3500);
    expect(changes).toEqual([0]);
    state().cycleRepeat(); // one
    changes.length = 0;
    jest.advanceTimersByTime(7000);
    expect(changes).toEqual([]);
    expect(state().index).toBe(0);
    expect(state().isPlaying).toBe(true);
  });

  it('aléatoire : l’enchaînement suit la file mélangée', () => {
    state().playTracks(album, undefined, { shuffle: true });
    const queue = state().queue;
    jest.advanceTimersByTime(3500);
    expect(state().queue[state().index]).toBe(queue[1]);
    expect(engine.items[engine.index].id).toBe(queue[1]);
  });

  it('pause juste avant la fin : pas de passage au morceau suivant', () => {
    state().playTracks(album, 0);
    jest.advanceTimersByTime(2500);
    state().pause();
    jest.advanceTimersByTime(10_000);
    expect(state().index).toBe(0);
    expect(engine.playing).toBe(false);
    state().play();
    expect(engine.position).toBeGreaterThanOrEqual(2.5); // reprise à la position conservée
  });

  it('pause et lecture depuis la notification ou un casque : l’interface suit, sans reprise spontanée', () => {
    state().playTracks(album, 0);
    jest.advanceTimersByTime(2000);
    engine.pause(); // commande extérieure (notification, écran verrouillé, Bluetooth)
    expect(state().isPlaying).toBe(false);
    expect(musicWantsToPlay()).toBe(false);
    jest.advanceTimersByTime(10_000);
    expect(engine.playing).toBe(false);
    engine.play();
    expect(state().isPlaying).toBe(true);
    state().toggle(); // le bouton de l'application reste cohérent
    expect(engine.playing).toBe(false);
  });

  it('la musique met la vidéo en pause', () => {
    const pauseVideo = jest.fn();
    registerVideoPauser(pauseVideo);
    state().playTracks(album, 0);
    expect(pauseVideo).toHaveBeenCalled();
  });
});
