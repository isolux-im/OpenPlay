import { SimulatedEngine } from '../player/PlaybackEngine';
import { registerVideoPauser } from '../player/mediaFocus';
import { demoTracks } from '../library/demoLibrary';
import { buildIndex } from '../library/indexLibrary';
import { connectPlayer, disconnectPlayer, usePlayer } from '../store/player';
import { VIDEO_HISTORY_LIMIT, useVideoHistory } from '../store/videoHistory';
import { useVideoPlayer } from '../store/videoPlayer';
import { continueWatching, demoVideos, formatResolution, isFinished, recentlyWatched, resumePosition, searchVideos, sortVideos, videoFolders, videoFromNative } from '../video/library';

const videos = demoVideos();
const [a, b, c] = videos;
const entry = (positionSec: number, durationSec: number, watchedAt: number, finished = false) => ({ positionSec, durationSec, watchedAt, finished });

describe('vidéothèque', () => {
  it('convertit les données MediaStore (titre de secours, dossier, unités)', () => {
    const v = videoFromNative({ id: '7', uri: 'content://x/7', title: null, filename: 'Mon clip.mp4', durationMs: 90_500, size: 10, dateAdded: 1_700_000_000, dateModified: 0, width: 1280, height: 720, mimeType: null, folder: 'Movies/Clips/', path: null });
    expect(v).toMatchObject({ title: 'Mon clip', durationSec: 90.5, addedAt: 1_700_000_000_000, mimeType: 'video/mp4', folder: 'Movies/Clips/' });
    expect(videoFromNative({ ...{ id: '8', uri: '', title: '  ', filename: null, durationMs: 0, size: 0, dateAdded: 0, dateModified: 0, width: 0, height: 0, mimeType: 'video/webm', folder: null, path: null } }).folder).toBe('Autres');
    expect(formatResolution({ width: 1920, height: 1080 })).toBe('1920 × 1080 (1080p)');
    expect(formatResolution({ width: 0, height: 0 })).toBeNull();
  });

  it('trie par nom, date, durée et taille, et cherche sans accents', () => {
    expect(sortVideos(videos, 'duration')[0].title).toBe('Mariage de Koffi');
    expect(sortVideos(videos, 'size')[0].title).toBe('Mariage de Koffi');
    expect(sortVideos(videos, 'name')[0].title).toBe('Anniversaire');
    expect(sortVideos(videos, 'date')[0].id).toBe(a.id);
    expect(searchVideos(videos, 'ganvie').map((v) => v.title)).toEqual(['Documentaire Ganvié']);
    expect(videoFolders(videos).find((f) => f.folder === 'Movies/Cours')?.count).toBe(2);
  });

  it('reprend une vidéo commencée, jamais au-delà de la fin', () => {
    expect(isFinished(3600, 3700)).toBe(true);
    expect(resumePosition(entry(5, 100, 1), 100)).toBe(0);
    expect(resumePosition(entry(42, 100, 1), 100)).toBe(42);
    expect(resumePosition(entry(98, 100, 1), 100)).toBe(0);
    expect(resumePosition(entry(42, 100, 1, true), 100)).toBe(0);
  });

  it('« Continuer à regarder » et « Récentes » suivent l’historique vidéo', () => {
    const history = { [a.id]: entry(600, a.durationSec, 10), [b.id]: entry(b.durationSec, b.durationSec, 30, true), [c.id]: entry(120, c.durationSec, 20) };
    expect(continueWatching(videos, history).map((v) => v.id)).toEqual([c.id, a.id]);
    expect(recentlyWatched(videos, history).map((v) => v.id)).toEqual([b.id, c.id, a.id]);
  });
});

describe('historique et lecteur vidéo', () => {
  afterEach(() => {
    useVideoHistory.setState({ entries: {}, favorites: [] });
    useVideoPlayer.getState().close();
  });

  it('enregistre la position, marque la fin et borne la taille', () => {
    useVideoHistory.getState().savePosition('v', 50, 100, 1);
    expect(useVideoHistory.getState().entries.v).toEqual({ positionSec: 50, durationSec: 100, watchedAt: 1, finished: false });
    useVideoHistory.getState().savePosition('v', 99, 100, 2);
    expect(useVideoHistory.getState().entries.v.finished).toBe(true);
    for (let i = 0; i < VIDEO_HISTORY_LIMIT + 3; i++) useVideoHistory.getState().savePosition(`x${i}`, 10, 100, 10 + i);
    expect(Object.keys(useVideoHistory.getState().entries)).toHaveLength(VIDEO_HISTORY_LIMIT);
    useVideoHistory.getState().remove('x300');
    expect(useVideoHistory.getState().entries.x300).toBeUndefined();
  });

  it('passe à la vidéo précédente ou suivante de la liste d’origine', () => {
    const { open, step } = useVideoPlayer.getState();
    open(b.id, [a.id, b.id, c.id]);
    const first = useVideoPlayer.getState().session!.seq;
    step(1);
    expect(useVideoPlayer.getState().session).toMatchObject({ id: c.id, restart: false });
    expect(useVideoPlayer.getState().session!.seq).toBeGreaterThan(first);
    step(1);
    expect(useVideoPlayer.getState().session!.id).toBe(c.id);
    step(-1);
    step(-1);
    expect(useVideoPlayer.getState().session!.id).toBe(a.id);
  });

  it('met la vidéo en pause quand la musique démarre', () => {
    const index = buildIndex(demoTracks());
    connectPlayer(new SimulatedEngine(() => 100, 0), (id) => index.byId[id]);
    const pause = jest.fn();
    registerVideoPauser(pause);
    usePlayer.getState().playTracks([index.tracks[0].id], 0);
    expect(pause).toHaveBeenCalledTimes(1);
    usePlayer.getState().pause();
    usePlayer.getState().play();
    expect(pause).toHaveBeenCalledTimes(2);
    registerVideoPauser(null);
    disconnectPlayer();
  });
});
