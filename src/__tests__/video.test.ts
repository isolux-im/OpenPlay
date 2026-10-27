import { SimulatedEngine } from '../player/PlaybackEngine';
import { registerVideoPauser } from '../player/mediaFocus';
import { demoTracks } from '../library/demoLibrary';
import { buildIndex } from '../library/indexLibrary';
import { connectPlayer, disconnectPlayer, usePlayer } from '../store/player';
import { VIDEO_HISTORY_LIMIT, useVideoHistory } from '../store/videoHistory';
import { useVideoPlayer } from '../store/videoPlayer';
import { FIT_MODES, nextFitMode, preferredOrientation, seekSwipeDelta, swipeLevel, videoFrame, volumeStep } from '../video/display';
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

  it('classe par nom uniquement (ordre alphabétique), et cherche sans accents', () => {
    expect(sortVideos(videos)[0].title).toBe('Anniversaire');
    expect(sortVideos(videos).at(-1)!.title).toBe('Mariage de Koffi');
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

describe('affichage vidéo (formats, orientation, glissement)', () => {
  const portraitScreen = { width: 400, height: 800 };
  const landscapeScreen = { width: 800, height: 400 };
  const fullHd = { width: 1920, height: 1080 };

  it('cadre la vidéo selon le format choisi, sans toucher à sa définition', () => {
    expect(videoFrame('best', portraitScreen, fullHd, 3)).toEqual({ width: 400, height: 800, fit: 'contain' });
    expect(videoFrame('fill', landscapeScreen, fullHd, 3).fit).toBe('cover');
    expect(videoFrame('stretch', landscapeScreen, fullHd, 3).fit).toBe('fill');
    expect(videoFrame('16:9', portraitScreen, fullHd, 3)).toEqual({ width: 400, height: 225, fit: 'fill' });
    expect(videoFrame('4:3', landscapeScreen, fullHd, 3)).toEqual({ width: 533, height: 400, fit: 'fill' });
    // Taille d'origine : 1 pixel vidéo = 1 pixel écran, réduite seulement si elle dépasse.
    expect(videoFrame('original', landscapeScreen, { width: 640, height: 360 }, 2)).toEqual({ width: 320, height: 180, fit: 'contain' });
    expect(videoFrame('original', landscapeScreen, fullHd, 2)).toEqual({ width: 711, height: 400, fit: 'contain' });
    expect(videoFrame('original', landscapeScreen, { width: 0, height: 0 }, 2).fit).toBe('contain');
    expect(FIT_MODES.map((m) => m.key).reduce((mode) => nextFitMode(mode), 'best' as const)).toBe('best');
  });

  it('choisit l’orientation d’après la vidéo, rotation comprise', () => {
    expect(preferredOrientation(fullHd)).toBe('landscape');
    expect(preferredOrientation({ width: 1080, height: 1920 })).toBe('portrait');
    expect(preferredOrientation({ width: 1000, height: 1000 })).toBeNull();
    expect(preferredOrientation({ width: 0, height: 0 })).toBeNull();
    const rotated = videoFromNative({ id: '9', uri: '', title: 'Selfie', filename: 'a.mp4', durationMs: 1000, size: 1, dateAdded: 0, dateModified: 0, width: 1920, height: 1080, mimeType: 'video/mp4', folder: 'DCIM/Camera', path: null, rotation: 90 });
    expect(rotated).toMatchObject({ width: 1080, height: 1920 });
  });

  it('convertit le glissement vertical en niveau, par crans pour le volume', () => {
    expect(swipeLevel(0.5, -280, 800)).toBe(1);
    expect(swipeLevel(0.5, 280, 800)).toBe(0);
    expect(swipeLevel(0.5, -56, 800)).toBeCloseTo(0.6);
    expect(volumeStep(0.52, 15)).toBeCloseTo(8 / 15);
    expect(volumeStep(0.52, 0)).toBe(0.52);
  });

  it('convertit le glissement horizontal en déplacement progressif', () => {
    // Épisode de 45 min, écran de 400 points.
    expect(seekSwipeDelta(0, 400, 2700)).toBe(0);
    expect(seekSwipeDelta(40, 400, 2700)).toBe(16);
    expect(seekSwipeDelta(-40, 400, 2700)).toBe(-16);
    expect(seekSwipeDelta(200, 400, 2700)).toBe(214);
    expect(seekSwipeDelta(400, 400, 2700)).toBe(765);
    // Au-delà de la largeur : plafonné ; film de 3 h : un quart plafonné à 15 min.
    expect(seekSwipeDelta(900, 400, 2700)).toBe(765);
    expect(seekSwipeDelta(400, 400, 10_800)).toBe(990);
    // Clip de 3 min : déplacement limité, la position reste bornée par le lecteur.
    expect(seekSwipeDelta(400, 400, 180)).toBe(135);
  });
});
