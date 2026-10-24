import { demoTracks } from '../library/demoLibrary';
import { buildIndex } from '../library/indexLibrary';
import { SimulatedEngine } from '../player/PlaybackEngine';
import { connectPlayer, disconnectPlayer, usePlayer } from '../store/player';
import { useUser } from '../store/user';

const index = buildIndex(demoTracks());
const ids = index.albums.find((a) => a.title === 'Racines')!.trackIds;
let engine: SimulatedEngine;
let clock = 1_000_000;

const state = () => usePlayer.getState();
const nativeOrder = () => engine.items.map((i) => i.id);

beforeEach(() => {
  clock = 1_000_000;
  usePlayer.setState({ queue: [], originalQueue: [], index: -1, isPlaying: false, positionSec: 0, durationSec: 0, shuffle: false, repeat: 'off', sourceLabel: null, sleep: { endsAt: null, atTrackEnd: false } });
  useUser.setState({ history: [], playCounts: {}, session: null });
  engine = new SimulatedEngine((id) => index.byId[id].durationSec, 0);
  connectPlayer(engine, (id) => index.byId[id], { clock: () => clock });
});

afterEach(() => disconnectPlayer());

describe('store du lecteur', () => {
  it('lance une liste à partir du morceau choisi', () => {
    state().playTracks(ids, 2, { label: 'Racines' });
    expect(state().index).toBe(2);
    expect(state().isPlaying).toBe(true);
    expect(state().sourceLabel).toBe('Racines');
    expect(nativeOrder()).toEqual(ids);
    expect(engine.index).toBe(2);
    expect(engine.nowPlaying?.item.id).toBe(ids[2]);
  });

  it('ignore les identifiants inconnus', () => {
    state().playTracks(['absent', ids[0]], 1);
    expect(state().queue).toEqual([ids[0]]);
  });

  it('suit les changements de piste venant du moteur (notification, Bluetooth)', () => {
    state().playTracks(ids, 0);
    engine.next();
    expect(state().index).toBe(1);
    expect(engine.nowPlaying?.item.id).toBe(ids[1]);
  });

  it('« précédent » relance la piste après 3 s, sinon recule', () => {
    state().playTracks(ids, 2);
    engine.seekTo(42);
    state().previous();
    expect(engine.position).toBe(0);
    expect(state().index).toBe(2);
    state().previous();
    expect(state().index).toBe(1);
  });

  it("n'avance pas au-delà de la dernière piste sans répétition", () => {
    state().playTracks(ids, ids.length - 1);
    state().next();
    expect(state().index).toBe(ids.length - 1);
    state().cycleRepeat();
    expect(state().repeat).toBe('all');
    expect(engine.repeat).toBe('all');
    state().next();
    expect(state().index).toBe(0);
  });

  it('active et désactive l’aléatoire sans changer la piste en cours, file native synchronisée', () => {
    state().playTracks(ids, 3);
    const current = ids[3];
    state().toggleShuffle();
    expect(state().shuffle).toBe(true);
    expect(state().queue[state().index]).toBe(current);
    expect(state().index).toBe(0);
    expect([...state().queue].sort()).toEqual([...ids].sort());
    expect(nativeOrder()).toEqual(state().queue);
    expect(engine.index).toBe(state().index);

    state().toggleShuffle();
    expect(state().queue).toEqual(ids);
    expect(state().index).toBe(3);
    expect(nativeOrder()).toEqual(ids);
    expect(engine.index).toBe(3);
  });

  it('lancement aléatoire : file mélangée complète', () => {
    state().playTracks(ids, undefined, { shuffle: true });
    expect(state().shuffle).toBe(true);
    expect([...state().queue].sort()).toEqual([...ids].sort());
    expect(nativeOrder()).toEqual(state().queue);
  });

  it('« lire ensuite » et « ajouter à la file » gardent les deux files alignées', () => {
    state().playTracks(ids.slice(0, 3), 0);
    const extra = index.tracks.find((t) => !ids.includes(t.id))!.id;
    state().playNext([extra]);
    expect(state().queue[1]).toBe(extra);
    state().addToQueue([ids[5]]);
    expect(state().queue[state().queue.length - 1]).toBe(ids[5]);
    expect(nativeOrder()).toEqual(state().queue);
    state().toggleShuffle();
    state().toggleShuffle();
    expect(state().queue).toEqual([ids[0], extra, ids[1], ids[2], ids[5]]);
  });

  it('déplace et retire des morceaux à venir', () => {
    state().playTracks(ids, 1);
    state().moveInQueue(5, 2);
    expect(state().queue.slice(0, 3)).toEqual([ids[0], ids[1], ids[5]]);
    expect(nativeOrder()).toEqual(state().queue);
    state().removeAt(0);
    expect(state().index).toBe(0);
    expect(state().queue[0]).toBe(ids[1]);
    expect(nativeOrder()).toEqual(state().queue);
    state().removeAt(state().index);
    expect(state().queue[state().index]).toBe(ids[1]);
    state().clearUpcoming();
    expect(state().queue).toEqual([ids[1]]);
    expect(nativeOrder()).toEqual([ids[1]]);
  });

  it('compte une écoute après 30 s, une seule fois par lecture', () => {
    state().playTracks(ids, 0);
    engine.seekTo(10);
    expect(useUser.getState().playCounts[ids[0]]).toBeUndefined();
    engine.seekTo(31);
    engine.seekTo(60);
    expect(useUser.getState().playCounts[ids[0]]).toBe(1);
    expect(useUser.getState().history[0].trackId).toBe(ids[0]);
  });

  it('met en pause à l’échéance de la minuterie', () => {
    state().playTracks(ids, 0);
    state().setSleepTimer(15);
    clock += 14 * 60_000;
    engine.seekTo(5);
    expect(state().isPlaying).toBe(true);
    clock += 2 * 60_000;
    engine.seekTo(6);
    expect(state().isPlaying).toBe(false);
    expect(state().sleep.endsAt).toBeNull();
  });

  it('s’arrête à la fin du morceau en cours si demandé', () => {
    state().playTracks(ids, 0);
    state().setSleepTimer(null, true);
    engine.next();
    expect(state().isPlaying).toBe(false);
    expect(state().sleep.atTrackEnd).toBe(false);
  });

  it('enregistre puis restaure la session (en pause, à la même position)', () => {
    state().playTracks(ids, 2, { label: 'Racines' });
    engine.seekTo(42);
    state().pause();
    const session = useUser.getState().session!;
    expect(session).toMatchObject({ index: 2, positionSec: 42, sourceLabel: 'Racines' });

    disconnectPlayer();
    usePlayer.setState({ queue: [], originalQueue: [], index: -1 });
    engine = new SimulatedEngine((id) => index.byId[id].durationSec, 0);
    connectPlayer(engine, (id) => index.byId[id]);
    state().restoreSession(session, (id) => id !== ids[0]);
    expect(state().queue).toEqual(ids.slice(1));
    expect(state().queue[state().index]).toBe(ids[2]);
    expect(state().positionSec).toBe(42);
    expect(state().isPlaying).toBe(false);
    expect(engine.position).toBe(42);
    expect(engine.playing).toBe(false);
  });
});
