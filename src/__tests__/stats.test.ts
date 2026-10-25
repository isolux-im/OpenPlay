import { demoTracks } from '../library/demoLibrary';
import { buildIndex } from '../library/indexLibrary';
import { formatListening, periodStart, summarize } from '../library/listeningStats';
import { SimulatedEngine } from '../player/PlaybackEngine';
import { connectPlayer, disconnectPlayer, usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { STATS_RETENTION_DAYS, dayKey, useStats } from '../store/stats';
import { useUser } from '../store/user';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 25, 21, 15).getTime();
const index = buildIndex(demoTracks());
const [a, b, c] = index.tracks;

beforeEach(() => useStats.getState().clear());

describe('bilan d’écoute', () => {
  it('cumule le temps par jour et par heure, et les écoutes par morceau', () => {
    const { addListening, addPlay } = useStats.getState();
    addListening(NOW, 120);
    addListening(NOW, 60);
    addPlay(a.id, NOW);
    addPlay(a.id, NOW);
    addPlay(b.id, NOW);
    const day = useStats.getState().days[dayKey(NOW)];
    expect(day.sec).toBe(180);
    expect(day.hours[21]).toBe(180);
    expect(day.plays).toBe(3);
    expect(day.tracks[a.id]).toBe(2);
    expect(useStats.getState().since).toBe(NOW);
  });

  it('résume une période : temps, classements, heure de pointe', () => {
    const { addListening, addPlay } = useStats.getState();
    addListening(NOW, 3600);
    addListening(NOW - 3 * DAY, 600);
    addListening(NOW - 20 * DAY, 900);
    for (let i = 0; i < 3; i++) addPlay(a.id, NOW);
    addPlay(b.id, NOW - 3 * DAY);
    addPlay(c.id, NOW - 20 * DAY);
    addPlay('supprimé', NOW);
    const week = summarize(useStats.getState().days, index.byId, 'week', NOW);
    expect(week.totalSec).toBe(4200);
    expect(week.plays).toBe(5);
    expect(week.activeDays).toBe(2);
    expect(week.topTracks.map((r) => [r.item.id, r.plays])).toEqual([[a.id, 3], [b.id, 1]]);
    expect(week.peakHour).toBe(21);
    const month = summarize(useStats.getState().days, index.byId, 'month', NOW);
    expect(month.totalSec).toBe(5100);
    expect(month.topTracks.map((r) => r.item.id)).toContain(c.id);
    expect(month.topArtists[0].item).toBe(a.albumArtist || a.artist);
  });

  it('borne les périodes et oublie les journées trop anciennes', () => {
    expect(periodStart('week', NOW)).toBe(dayKey(NOW - 6 * DAY));
    expect(periodStart('year', NOW)).toBe('2026-01-01');
    useStats.getState().addListening(NOW - (STATS_RETENTION_DAYS + 10) * DAY, 60);
    useStats.getState().addListening(NOW, 60);
    expect(Object.keys(useStats.getState().days)).toEqual([dayKey(NOW)]);
  });

  it('formate le temps d’écoute', () => {
    expect(formatListening(30)).toBe("moins d'une minute");
    expect(formatListening(47 * 60)).toBe('47 min');
    expect(formatListening(12 * 3600 + 5 * 60)).toBe('12 h 05');
  });
});

describe('enregistrement pendant la lecture', () => {
  afterEach(() => {
    disconnectPlayer();
    useSettings.setState({ playbackRate: 1 });
  });

  it('compte le temps réel (vitesse comprise) et les écoutes validées', () => {
    useUser.setState({ history: [], playCounts: {}, lastPlayed: {} });
    useSettings.setState({ playbackRate: 2 });
    const engine = new SimulatedEngine((id) => index.byId[id].durationSec, 0);
    connectPlayer(engine, (id) => index.byId[id], { clock: () => NOW });
    usePlayer.getState().playTracks([a.id], 0);
    engine.advance(60);
    usePlayer.getState().pause();
    const day = useStats.getState().days[dayKey(NOW)];
    // 60 s de morceau à 2× = 30 s d'écoute réelle.
    expect(day.sec).toBeCloseTo(30, 0);
    expect(day.tracks[a.id]).toBe(1);
  });
});
