import { useIntros } from '../store/intros';
import { useVideoStats } from '../store/videoStats';
import { detectIntro, inIntro, plausibleIntro } from '../video/intro';
import { demoVideos } from '../video/library';
import { buildSeries, episodeLabel, episodeTitle, nextEpisode, parseEpisode, previousEpisode, seriesProgress } from '../video/series';
import type { Video } from '../video/types';
import { summarizeWatching } from '../video/watchStats';

jest.mock('../../modules/openplay-media', () => ({ OpenPlayMedia: { findCommonIntroAsync: jest.fn() } }));
const mockNative = jest.requireMock<{ OpenPlayMedia: { findCommonIntroAsync: jest.Mock } }>('../../modules/openplay-media').OpenPlayMedia;

const video = (id: string, filename: string, folder = 'Movies', durationSec = 1500): Video => ({
  id,
  uri: '',
  title: filename.replace(/\.[^.]+$/, ''),
  filename,
  durationSec,
  sizeBytes: 1000,
  addedAt: 0,
  width: 1920,
  height: 1080,
  mimeType: 'video/mp4',
  folder,
});

describe('reconnaissance des séries', () => {
  it('lit les formats d’épisode courants', () => {
    expect(parseEpisode('Breaking.Bad.S01E02.720p.mkv', 'Movies')).toEqual({ name: 'Breaking Bad', season: 1, episode: 2 });
    expect(parseEpisode('the_office_s3e10.mp4', 'Movies')).toEqual({ name: 'the office', season: 3, episode: 10 });
    expect(parseEpisode('Lupin - 2x05 - Titre.mp4', 'Movies')).toEqual({ name: 'Lupin', season: 2, episode: 5 });
    expect(parseEpisode('Plus belle la vie Saison 4 Épisode 12.mp4', 'Movies')).toEqual({ name: 'Plus belle la vie', season: 4, episode: 12 });
    expect(parseEpisode('Kirikou - Episode 3.mp4', 'Movies')).toEqual({ name: 'Kirikou', season: 1, episode: 3 });
    expect(parseEpisode('Kirikou - Épisode 4.mp4', 'Movies')).toEqual({ name: 'Kirikou', season: 1, episode: 4 });
    expect(parseEpisode('[Team] One Piece - Ep. 1071 (1080p).mkv', 'Anime')).toEqual({ name: 'One Piece', season: 1, episode: 1071 });
  });

  it('prend le nom du dossier quand le fichier ne porte que le numéro', () => {
    expect(parseEpisode('Episode 4.mp4', 'Movies/Séries/Akwaba')).toEqual({ name: 'Akwaba', season: 1, episode: 4 });
    expect(parseEpisode('E02.mp4', 'Séries/Akwaba/Saison 2')).toEqual({ name: 'Akwaba', season: 2, episode: 2 });
  });

  it('ignore les vidéos qui ne sont pas des épisodes', () => {
    expect(parseEpisode('Concert 1920x1080.mp4', 'Movies')).toBeNull();
    expect(parseEpisode('Mariage de Koffi.mp4', 'DCIM/Camera')).toBeNull();
    expect(parseEpisode('VID_20260101_120000.mp4', 'DCIM/Camera')).toBeNull();
  });

  it('regroupe, trie et suit la progression', () => {
    const eps = [video('3', 'Akwaba S01E10.mp4'), video('1', 'Akwaba S01E02.mp4'), video('2', 'akwaba s2e1.mp4'), video('4', 'Seul S01E01.mp4'), video('5', 'Autre.mp4')];
    const [s] = buildSeries(eps);
    expect(buildSeries(eps)).toHaveLength(1);
    expect(s.name).toBe('Akwaba');
    expect(s.episodes.map((e) => e.id)).toEqual(['1', '3', '2']);
    expect(s.seasons).toEqual([1, 2]);
    expect(episodeLabel(s.info['2'])).toBe('S02E01');
    expect(nextEpisode(s, '3')?.id).toBe('2');
    expect(nextEpisode(s, '2')).toBeNull();
    expect(previousEpisode(s, '1')).toBeNull();

    const fresh = seriesProgress(s, {});
    expect(fresh).toMatchObject({ watched: 0, total: 3, finished: false, resumeAt: 0 });
    expect(fresh.next?.id).toBe('1');
    const history = {
      '1': { positionSec: 1500, durationSec: 1500, watchedAt: 10, finished: true },
      '3': { positionSec: 600, durationSec: 1500, watchedAt: 20, finished: false },
    };
    const p = seriesProgress(s, history);
    expect(p).toMatchObject({ watched: 1, resumeAt: 600, lastWatchedAt: 20 });
    expect(p.next?.id).toBe('3');
    history['3'] = { positionSec: 1500, durationSec: 1500, watchedAt: 30, finished: true };
    expect(seriesProgress(s, history).next?.id).toBe('2');
  });

  it('épure le titre de l’épisode', () => {
    const t = (f: string, folder = 'Movies') => episodeTitle(video('x', f, folder), parseEpisode(f, folder)!);
    expect(t('Breaking.Bad.S01E02.Cat.in.the.Bag.720p.x264.mkv')).toBe('Cat in the Bag');
    expect(t('Lupin - 2x05 - Le Chapitre.mp4')).toBe('Le Chapitre');
    expect(t('Akwaba S01E03.mp4')).toBe('Épisode 3');
    expect(t('Episode 4.mp4', 'Séries/Akwaba')).toBe('Épisode 4');
  });

  it('reconnaît la série de démonstration', () => {
    expect(buildSeries(demoVideos()).map((s) => [s.name, s.episodes.length])).toEqual([['Lagune Blues', 3]]);
  });
});

describe('générique', () => {
  const [s] = buildSeries([video('1', 'Akwaba S01E01.mp4'), video('2', 'Akwaba S01E02.mp4')]);
  beforeEach(() => {
    useIntros.setState({ byVideo: {} });
    mockNative.findCommonIntroAsync.mockReset();
  });

  it('n’accepte qu’un passage commun de 15 s à 3 min', () => {
    expect(plausibleIntro({ startA: 60, endA: 120, startB: 5, endB: 65 })).toBe(true);
    expect(plausibleIntro({ startA: 0, endA: 10, startB: 0, endB: 10 })).toBe(false);
    expect(plausibleIntro({ startA: 0, endA: 300, startB: 0, endB: 300 })).toBe(false);
    expect(plausibleIntro({ startA: 0, endA: 60, startB: 0, endB: 30 })).toBe(false);
  });

  it('propose de passer le générique tant qu’il en reste plus de 2 s', () => {
    const info = { start: 60, end: 120 };
    expect(inIntro(info, 59)).toBe(false);
    expect(inIntro(info, 59.6)).toBe(true);
    expect(inIntro(info, 117.9)).toBe(true);
    expect(inIntro(info, 118.5)).toBe(false);
    expect(inIntro({ none: true, partner: 'x', at: 0 }, 70)).toBe(false);
    expect(inIntro(undefined, 70)).toBe(false);
  });

  it('enregistre le générique des deux épisodes comparés', async () => {
    mockNative.findCommonIntroAsync.mockResolvedValue({ startA: 62, endA: 122, startB: 4, endB: 64, density: 0.9 });
    await detectIntro(s, s.episodes[0]);
    expect(mockNative.findCommonIntroAsync).toHaveBeenCalledWith('1', '1-1000', '2', '2-1000', 360);
    expect(useIntros.getState().byVideo).toEqual({ '1': { start: 62, end: 122 }, '2': { start: 4, end: 64 } });
    // Déjà connu : pas de nouvelle analyse.
    await detectIntro(s, s.episodes[1]);
    expect(mockNative.findCommonIntroAsync).toHaveBeenCalledTimes(1);
  });

  it('retient l’absence de générique pour ne pas relancer l’analyse', async () => {
    mockNative.findCommonIntroAsync.mockResolvedValue(null);
    await detectIntro(s, s.episodes[1]);
    expect(useIntros.getState().byVideo['2']).toMatchObject({ none: true, partner: '1' });
    mockNative.findCommonIntroAsync.mockRejectedValue(new Error('codec'));
    await detectIntro(s, s.episodes[0]);
    expect(useIntros.getState().byVideo['1']).toMatchObject({ none: true, partner: '2' });
  });
});

describe('bilan de visionnage', () => {
  const now = new Date(2026, 9, 25, 21, 0).getTime();
  beforeEach(() => useVideoStats.setState({ since: null, days: {} }));

  it('cumule le temps par jour, par heure et par vidéo, et compte une fin par jour', () => {
    const { addWatching, addFinished } = useVideoStats.getState();
    addWatching('a', now, 1800);
    addWatching('b', now, 30);
    addWatching('a', now - 86_400_000, 600);
    addWatching('a', now, 0);
    addFinished('a', now);
    addFinished('a', now);
    const days = useVideoStats.getState().days;
    const byId = { a: video('a', 'A.mp4'), b: video('b', 'B.mp4') };
    const sum = summarizeWatching(days, byId, 'week', now);
    expect(sum).toMatchObject({ totalSec: 2430, activeDays: 2, distinct: 1, finished: 1, peakHour: 21 });
    expect(sum.top.map((t) => [t.video.id, t.sec])).toEqual([['a', 2400]]);
    expect(useVideoStats.getState().since).toBe(now);
    // Hors période.
    expect(summarizeWatching(days, byId, 'week', now + 30 * 86_400_000).totalSec).toBe(0);
  });
});
