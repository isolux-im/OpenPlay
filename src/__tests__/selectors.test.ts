import { demoTracks } from '../library/demoLibrary';
import { buildIndex } from '../library/indexLibrary';
import { favoriteGenre, greeting, groupHistory, mostPlayed, recentlyAddedAlbums, recentlyPlayed, rediscover, sortTracks } from '../library/selectors';

const index = buildIndex(demoTracks());
const NOW = new Date(2026, 9, 24, 20, 0).getTime();
const DAY = 86_400_000;

describe('sélecteurs', () => {
  it('liste les morceaux écoutés récemment sans doublon', () => {
    const h = [{ trackId: 'demo-2', at: 3 }, { trackId: 'demo-1', at: 2 }, { trackId: 'demo-2', at: 1 }, { trackId: 'absent', at: 0 }];
    expect(recentlyPlayed(h, index.byId).map((t) => t.id)).toEqual(['demo-2', 'demo-1']);
  });

  it('classe les plus écoutés', () => {
    expect(mostPlayed({ 'demo-3': 5, 'demo-1': 9, 'demo-2': 0 }, index.byId).map((t) => t.id)).toEqual(['demo-1', 'demo-3']);
  });

  it('propose les morceaux non écoutés depuis 30 jours', () => {
    const h = [{ trackId: 'demo-1', at: NOW - DAY }, { trackId: 'demo-2', at: NOW - 40 * DAY }];
    const ids = rediscover(index, h, NOW).map((t) => t.id);
    expect(ids).not.toContain('demo-1');
    expect(ids).toContain('demo-2');
  });

  it('trie les albums par date d’ajout', () => {
    expect(recentlyAddedAlbums(index, 1)[0].title).toBe('Lumières du Sud');
  });

  it('détermine le genre favori en pondérant les écoutes', () => {
    const jazz = index.genresById['jazz'].trackIds;
    expect(favoriteGenre(index, Object.fromEntries(jazz.map((id) => [id, 10])))).toBe('Jazz');
  });

  it('trie les titres selon le critère choisi', () => {
    expect(sortTracks(index.tracks, 'artist')[0].artist).toBe('Ayo Mensah');
    expect(sortTracks(index.tracks, 'added')[0].title).toBe('Aube');
  });

  it("regroupe l'historique par jour", () => {
    const h = [{ trackId: 'demo-1', at: NOW - 1000 }, { trackId: 'demo-2', at: NOW - DAY }, { trackId: 'demo-3', at: NOW - 3 * DAY }];
    expect(groupHistory(h, index.byId, NOW).map((g) => g.label)).toEqual(["Aujourd'hui", 'Hier', 'Cette semaine']);
  });

  it('salue selon l’heure', () => {
    expect(greeting(new Date(2026, 0, 1, 9).getTime())).toBe('Bonjour');
    expect(greeting(new Date(2026, 0, 1, 21).getTime())).toBe('Bonsoir');
  });
});
