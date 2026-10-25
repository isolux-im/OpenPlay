import { demoTracks } from '../library/demoLibrary';
import { buildIndex } from '../library/indexLibrary';
import { SimulatedEngine } from '../player/PlaybackEngine';
import { LONG_TRACK_SEC, connectPlayer, disconnectPlayer, usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { RESUME_LIMIT, useUser } from '../store/user';

const base = demoTracks();
// Deux « livres audio » d'une heure et un morceau court.
const tracks = [
  { ...base[0], id: 'book-1', durationSec: 3600 },
  { ...base[1], id: 'book-2', durationSec: 3600 },
  { ...base[2], id: 'song', durationSec: 200 },
];
const index = buildIndex(tracks);
let engine: SimulatedEngine;
const state = () => usePlayer.getState();

beforeEach(() => {
  usePlayer.setState({ queue: [], originalQueue: [], index: -1, isPlaying: false, positionSec: 0, durationSec: 0, shuffle: false, repeat: 'off', sourceLabel: null });
  useUser.setState({ history: [], playCounts: {}, lastPlayed: {}, resumePositions: {}, session: null });
  useSettings.setState({ playbackRate: 1, resumeLongTracks: true });
  engine = new SimulatedEngine((id) => index.byId[id].durationSec, 0);
  connectPlayer(engine, (id) => index.byId[id]);
});

afterEach(() => disconnectPlayer());

describe('vitesse de lecture', () => {
  it('applique la vitesse au moteur et la retient', () => {
    state().setRate(1.5);
    expect(engine.rate).toBe(1.5);
    expect(useSettings.getState().playbackRate).toBe(1.5);
    disconnectPlayer();
    const other = new SimulatedEngine(() => 100, 0);
    connectPlayer(other, (id) => index.byId[id]);
    expect(other.rate).toBe(1.5);
  });
});

describe('reprise des fichiers longs', () => {
  it('reprend un fichier long là où il a été quitté', () => {
    expect(LONG_TRACK_SEC).toBe(1200);
    state().playTracks(['book-1', 'book-2'], 0);
    engine.seekTo(754);
    state().pause();
    expect(useUser.getState().resumePositions['book-1']).toBe(754);
    state().playTracks(['song'], 0);
    state().playTracks(['book-1'], 0);
    expect(engine.position).toBe(754);
    expect(state().positionSec).toBe(754);
  });

  it('retient la position en passant au fichier suivant et reprend à la réécoute', () => {
    state().playTracks(['book-1', 'book-2'], 0);
    engine.seekTo(300);
    state().next();
    expect(useUser.getState().resumePositions['book-1']).toBe(300);
    state().previous();
    expect(engine.position).toBe(300);
  });

  it('oublie la position d’un fichier écouté jusqu’au bout, et ignore les morceaux courts', () => {
    useUser.getState().setResumePosition('book-1', 600);
    state().playTracks(['book-1', 'song'], 0);
    engine.seekTo(3590);
    state().pause();
    expect(useUser.getState().resumePositions['book-1']).toBeUndefined();
    state().playTracks(['song'], 0);
    engine.seekTo(120);
    state().pause();
    expect(useUser.getState().resumePositions.song).toBeUndefined();
  });

  it('respecte le réglage et borne le nombre de positions', () => {
    useSettings.setState({ resumeLongTracks: false });
    useUser.getState().setResumePosition('book-1', 600);
    state().playTracks(['book-1'], 0);
    expect(engine.position).toBe(0);
    for (let i = 0; i < RESUME_LIMIT + 5; i++) useUser.getState().setResumePosition(`t${i}`, 100);
    expect(Object.keys(useUser.getState().resumePositions)).toHaveLength(RESUME_LIMIT);
    expect(useUser.getState().resumePositions.t0).toBeUndefined();
  });
});
