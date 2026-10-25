import { demoTracks } from '../library/demoLibrary';
import { buildIndex } from '../library/indexLibrary';
import { discoverSections, diversify, groupHistory, uniqueDiscover } from '../library/selectors';
import { migrateUser, useUser } from '../store/user';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 25, 12).getTime();
const index = buildIndex(demoTracks());
const [a, b, c, d, e] = index.tracks;
const ids = (items: { track: { id: string } }[]) => items.map((i) => i.track.id);

describe('« À découvrir »', () => {
  const counts = { [b.id]: 5, [c.id]: 4, [d.id]: 1, [e.id]: 2 };
  const last = { [b.id]: NOW - 35 * DAY, [c.id]: NOW - DAY, [d.id]: NOW - 25 * DAY, [e.id]: NOW - 40 * DAY };
  const s = discoverSections(index.tracks, counts, last, NOW, 30);

  it('classe un morceau jamais écouté dans « Jamais écoutés »', () => {
    expect(ids(s.never)).toContain(a.id);
    expect(ids(s.never)).not.toContain(b.id);
  });

  it('met dans « À réécouter » un morceau écouté il y a 35 jours (réglage 30 j), pas celui d’hier', () => {
    expect(ids(s.forgotten)).toContain(b.id);
    expect(ids(s.forgotten)).not.toContain(c.id);
    expect(ids(s.never)).not.toContain(c.id);
    expect(ids(s.rare)).not.toContain(c.id);
  });

  it('respecte le réglage de 21 jours', () => {
    const s21 = discoverSections(index.tracks, counts, last, NOW, 21);
    expect(ids(s21.forgotten)).toContain(d.id);
    expect(ids(s.forgotten)).not.toContain(d.id);
  });

  it('range dans « Peu écoutés » 1 ou 2 écoutes datant d’au moins 21 jours', () => {
    expect(ids(s.rare)).toEqual(expect.arrayContaining([d.id, e.id]));
    expect(ids(s.rare)).not.toContain(b.id);
  });

  it('ne montre chaque morceau qu’une fois dans la vue « Tout »', () => {
    const u = uniqueDiscover(s);
    const all = [...ids(u.never), ...ids(u.forgotten), ...ids(u.rare)];
    expect(new Set(all).size).toBe(all.length);
    expect(ids(u.forgotten)).toContain(e.id);
    expect(ids(u.rare)).not.toContain(e.id);
  });

  it('reclasse un morceau après une nouvelle écoute validée', () => {
    useUser.setState({ history: [], playCounts: { ...counts }, lastPlayed: { ...last } });
    useUser.getState().recordPlay(a.id, NOW);
    useUser.getState().recordPlay(b.id, NOW);
    const { playCounts, lastPlayed } = useUser.getState();
    const after = discoverSections(index.tracks, playCounts, lastPlayed, NOW, 30);
    expect(ids(after.never)).not.toContain(a.id);
    expect(ids(after.forgotten)).not.toContain(b.id);
  });

  it('ne prétend pas connaître l’ancienneté d’une écoute sans date', () => {
    const noDate = discoverSections(index.tracks, { [a.id]: 3 }, {}, NOW, 30);
    expect([...ids(noDate.never), ...ids(noDate.forgotten), ...ids(noDate.rare)]).not.toContain(a.id);
  });

  it('alterne les artistes', () => {
    const items = index.tracks.map((track) => ({ track, category: 'never' as const, plays: 0, lastAt: null }));
    const out = diversify(items);
    expect(out).toHaveLength(items.length);
    expect(out[0].track.artist).not.toBe(out[1].track.artist);
  });
});

describe('historique', () => {
  it('reconstitue la dernière écoute depuis l’historique lors de la migration, sans rien supprimer', () => {
    const v1 = { favorites: ['x'], playlists: [{ id: 'p' }], history: [{ trackId: 'x', at: 30 }, { trackId: 'y', at: 20 }, { trackId: 'x', at: 10 }], playCounts: { x: 2, y: 1 } };
    const v2 = migrateUser(v1, 1);
    expect(v2.lastPlayed).toEqual({ x: 30, y: 20 });
    expect(v2.favorites).toEqual(['x']);
    expect(v2.playlists).toEqual([{ id: 'p' }]);
    expect(v2.history).toEqual(v1.history);
  });

  it('enregistre durablement les dates d’écoute (persistance après redémarrage)', () => {
    useUser.setState({ lastPlayed: { z: 42 } });
    const saved = useUser.persist.getOptions().partialize!(useUser.getState()) as { lastPlayed?: Record<string, number> };
    expect(saved.lastPlayed).toEqual({ z: 42 });
    expect(useUser.persist.getOptions().version).toBe(2);
  });

  it('« Récents » n’affiche qu’une fois un morceau réécouté le même jour', () => {
    const h = [
      { trackId: a.id, at: NOW - 1000 },
      { trackId: b.id, at: NOW - 2000 },
      { trackId: a.id, at: NOW - 3000 },
    ];
    const groups = groupHistory(h, index.byId, NOW);
    expect(groups[0].entries.map((x) => x.trackId)).toEqual([a.id, b.id]);
    expect(groups[0].entries[0].at).toBe(NOW - 1000);
  });
});
