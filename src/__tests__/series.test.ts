import { useIntros } from '../store/intros';
import { useVideoStats } from '../store/videoStats';
import { detectIntro, inIntro, plausibleIntro } from '../video/intro';
import { demoVideos } from '../video/library';
import { buildSeries, episodeLabel, episodeTitle, missingBetween, nextEpisode, parseEpisode, previousEpisode, seasonLabel, seriesProgress } from '../video/series';
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

describe('classement des séries (cahier de correction)', () => {
  const ep = (name: string, season: number, episode: number) => ({ name, season, episode });

  it('reconnaît tous les nommages du cahier', () => {
    const cases: [string, string, ReturnType<typeof ep>][] = [
      ['Ma.Serie.S01E01.mp4', 'Movies', ep('Ma Serie', 1, 1)],
      ['Ma.Serie.S01E02.mkv', 'Movies', ep('Ma Serie', 1, 2)],
      ['Ma Serie S1E3.mp4', 'Movies', ep('Ma Serie', 1, 3)],
      ['Ma Serie 1x04.mp4', 'Movies', ep('Ma Serie', 1, 4)],
      ['Ma Serie 1x05.mkv', 'Movies', ep('Ma Serie', 1, 5)],
      ['Ma Serie - Saison 1 Episode 06.mp4', 'Movies', ep('Ma Serie', 1, 6)],
      ['Ma Serie - Saison 1 Épisode 07.mp4', 'Movies', ep('Ma Serie', 1, 7)],
      ['Ma Serie Season 2 Episode 1.mp4', 'Movies', ep('Ma Serie', 2, 1)],
      ['Ma_Serie_S02_Episode_02.mp4', 'Movies', ep('Ma Serie', 2, 2)],
      ['Ma Serie - S03E10 - Finale.mp4', 'Movies', ep('Ma Serie', 3, 10)],
      ['Serie.S01E10.mp4', 'Movies', ep('Serie', 1, 10)],
      ['Serie.1x02.mp4', 'Movies', ep('Serie', 1, 2)],
      ['Serie.Saison.2.Episode.03.mp4', 'Movies', ep('Serie', 2, 3)],
      ['Serie.Season.3.Episode.04.mp4', 'Movies', ep('Serie', 3, 4)],
      ['Serie S01E120.mp4', 'Movies', ep('Serie', 1, 120)],
      ['Serie S00E01 Spécial.mp4', 'Movies', ep('Serie', 0, 1)],
    ];
    for (const [file, folder, expected] of cases) expect([file, parseEpisode(file, folder)]).toEqual([file, expected]);
    expect(parseEpisode('Serie.S01E01E02.mkv', 'Movies')).toEqual({ name: 'Serie', season: 1, episode: 1, episodeEnd: 2 });
  });

  it('utilise les dossiers Ma Serie/Saison 1 et Ma Serie/S01', () => {
    expect(parseEpisode('Episode 01.mp4', 'Videos/Ma Serie/Saison 1')).toEqual(ep('Ma Serie', 1, 1));
    expect(parseEpisode('Episode 01.mp4', 'Videos/Ma Serie/Saison 2')).toEqual(ep('Ma Serie', 2, 1));
    expect(parseEpisode('01.mp4', 'Series/Ma Serie/S01')).toEqual(ep('Ma Serie', 1, 1));
    expect(parseEpisode('02 - Le retour.mp4', 'Series/Ma Serie/S01')).toEqual(ep('Ma Serie', 1, 2));
  });

  it('n’invente pas de série pour les fichiers ambigus', () => {
    expect(parseEpisode('Episode 01.mp4', 'Download')).toBeNull();
    expect(parseEpisode('Video 123.mp4', 'Movies')).toBeNull();
    expect(parseEpisode('01.mp4', 'Download')).toBeNull();
    expect(parseEpisode('01.mp4', 'Movies/Vacances')).toBeNull(); // numéro seul hors dossier de saison
    expect(parseEpisode('Episode 01.mp4', 'Saison 1')).toBeNull(); // dossier de saison sans parent connu
    expect(parseEpisode('Film E 2019.mp4', 'Movies')).toBeNull();
  });

  it('regroupe les variantes et trie numériquement, saisons puis épisodes, spéciaux à part', () => {
    const files = ['Ma Serie - S03E10 - Finale.mp4', 'Ma.Serie.S01E10.mp4', 'Ma_Serie_S02_Episode_02.mp4', 'Ma Serie S1E3.mp4', 'Ma.Serie.S01E01.mp4', 'Ma Serie S01E02.mp4', 'Ma Serie S01E09.mp4', 'Ma Serie Season 2 Episode 1.mp4', 'Ma Serie S00E01.mp4', 'Autre Serie S01E01.mp4', 'Autre Serie S01E02.mp4'];
    const list = buildSeries(files.map((f, i) => video(String(i), f)));
    expect(list.map((s) => s.name)).toEqual(['Autre Serie', 'Ma Serie']); // deux séries distinctes, jamais fusionnées
    const s = list[1];
    expect(s.episodes.map((e) => episodeLabel(s.info[e.id]))).toEqual(['S01E01', 'S01E02', 'S01E03', 'S01E09', 'S01E10', 'S02E01', 'S02E02', 'S03E10', 'S00E01']);
    expect(s.seasons).toEqual([1, 2, 3, 0]);
    expect(seasonLabel(0)).toBe('Épisodes spéciaux');
    expect(episodeTitle(s.episodes[6], s.info[s.episodes[6].id])).toBe('Épisode 2');
  });

  it('épisode suivant : S01E01 → S01E02 → S01E03 → S02E01 → S02E02, puis arrêt', () => {
    const files = ['X S02E02.mp4', 'X S01E03.mp4', 'X S01E01.mp4', 'X S02E01.mp4', 'X S01E02.mp4', 'X S00E01.mp4'];
    const [s] = buildSeries(files.map((f) => video(f, f)));
    const chain: string[] = [];
    for (let cur: string | undefined = 'X S01E01.mp4'; cur; cur = nextEpisode(s, cur)?.id) chain.push(episodeLabel(s.info[cur]));
    expect(chain).toEqual(['S01E01', 'S01E02', 'S01E03', 'S02E01', 'S02E02']); // pas d'épisode spécial, pas de retour au début
    expect(nextEpisode(s, 'X S01E03.mp4', { crossSeason: false })).toBeNull();
    expect(previousEpisode(s, 'X S02E01.mp4')?.id).toBe('X S01E03.mp4');
  });

  it('saute les copies du même épisode et les numéros d’un fichier multi-épisodes ; signale les absents', () => {
    const files = ['Y S01E01.mp4', 'Y S01E01.mkv', 'Y S01E02E03.mkv', 'Y S01E04.mp4', 'Y S01E07.mp4'];
    const [s] = buildSeries(files.map((f) => video(f, f)));
    expect(nextEpisode(s, 'Y S01E01.mkv')?.id).toBe('Y S01E02E03.mkv');
    expect(nextEpisode(s, 'Y S01E01.mp4')?.id).toBe('Y S01E02E03.mkv');
    expect(nextEpisode(s, 'Y S01E02E03.mkv')?.id).toBe('Y S01E04.mp4');
    expect(nextEpisode(s, 'Y S01E04.mp4')?.id).toBe('Y S01E07.mp4'); // épisodes manquants : le prochain disponible
    expect(missingBetween(s, 'Y S01E04.mp4', 'Y S01E07.mp4')).toBe('S01E05, S01E06');
    expect(missingBetween(s, 'Y S01E02E03.mkv', 'Y S01E04.mp4')).toBeNull();
    expect(nextEpisode(s, 'Y S01E07.mp4')).toBeNull();
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
