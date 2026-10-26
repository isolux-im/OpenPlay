import { demoTracks } from '../library/demoLibrary';
import { buildIndex } from '../library/indexLibrary';
import { SimulatedEngine } from '../player/PlaybackEngine';
import { connectPlayer, disconnectPlayer, usePlayer } from '../store/player';
import { usePlaybackPosition } from '../store/session';
import { useUser } from '../store/user';

const index = buildIndex(demoTracks());
const album = index.albums.find((a) => a.title === 'Racines')!.trackIds;
const all = index.tracks.map((t) => t.id);
let engine: SimulatedEngine;
let clock = 1_000_000;
const state = () => usePlayer.getState();

beforeEach(() => {
  jest.useFakeTimers();
  clock = 1_000_000;
  usePlayer.setState({ queue: [], originalQueue: [], index: -1, isPlaying: false, positionSec: 0, durationSec: 0, shuffle: false, repeat: 'off', sourceLabel: null, sleep: { endsAt: null, atTrackEnd: false } });
  useUser.setState({ history: [], playCounts: {}, session: null });
  // Morceaux de 3 s, horloge de 0,5 s : la fin de morceau arrive vite.
  engine = new SimulatedEngine(() => 3, 500);
  connectPlayer(engine, (id) => index.byId[id], { clock: () => clock });
});

afterEach(() => {
  disconnectPlayer();
  jest.useRealTimers();
});

const playFor = (sec: number) => {
  for (let t = 0; t < sec; t += 0.5) {
    clock += 500;
    jest.advanceTimersByTime(500);
  }
};

describe('enchaînement automatique', () => {
  it('passe au morceau suivant à la fin, sans intervention, et s’arrête après le dernier', () => {
    state().playTracks(album, 0);
    playFor(3.5);
    expect(state().index).toBe(1);
    expect(state().isPlaying).toBe(true);
    expect(engine.nowPlaying?.item.id).toBe(album[1]); // notification et écran de verrouillage suivent
    playFor(3 * (album.length - 1) + 1);
    expect(state().index).toBe(album.length - 1);
    expect(state().isPlaying).toBe(false);
  });

  it('répéter la liste revient au premier morceau ; répéter le morceau le rejoue', () => {
    state().playTracks(album, album.length - 1);
    state().cycleRepeat(); // all
    expect(state().repeat).toBe('all');
    playFor(3.5);
    expect(state().index).toBe(0);
    state().cycleRepeat(); // one
    expect(state().repeat).toBe('one');
    playFor(7);
    expect(state().index).toBe(0);
    expect(state().isPlaying).toBe(true);
  });

  it('suit l’ordre aléatoire actif', () => {
    state().playTracks(album, 0, { shuffle: true });
    const order = state().queue;
    playFor(3.5);
    expect(state().queue[state().index]).toBe(order[1]);
  });
});

describe('file longue et aléatoire', () => {
  it('recharge la file en un appel sans changer de morceau ni perdre la position', () => {
    expect(all.length).toBeGreaterThan(30);
    state().playTracks(all, 5);
    playFor(1.5);
    const current = state().queue[state().index];
    state().toggleShuffle();
    expect(state().queue[state().index]).toBe(current);
    expect(engine.items.map((i) => i.id)).toEqual(state().queue);
    expect(engine.index).toBe(state().index);
    expect(engine.position).toBeGreaterThan(1);
    expect(engine.playing).toBe(true);
    state().toggleShuffle();
    expect(state().queue).toEqual(all);
    expect(state().queue[state().index]).toBe(current);
  });
});

describe('écritures pendant la lecture', () => {
  it('ne réécrit pas les données utilisateur pour retenir la position', () => {
    state().playTracks(album, 0);
    const before = useUser.getState();
    usePlaybackPosition.setState({ trackId: null, positionSec: 0 });
    playFor(1);
    clock += 16_000; // au-delà de l'intervalle de 15 s
    playFor(0.5);
    expect(useUser.getState().session).toBeNull();
    expect(useUser.getState().playlists).toBe(before.playlists);
    expect(usePlaybackPosition.getState().trackId).toBe(album[0]);
  });
});
