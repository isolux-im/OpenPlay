import { HISTORY_LIMIT, RECENT_SEARCH_LIMIT, useUser } from '../store/user';

const u = () => useUser.getState();

beforeEach(() => useUser.setState({ favorites: [], playlists: [], history: [], playCounts: {}, recentSearches: [], lyrics: {} }));

describe('données utilisateur', () => {
  it('ajoute et retire un favori (le plus récent en tête)', () => {
    u().toggleFavorite('a');
    u().toggleFavorite('b');
    expect(u().favorites).toEqual(['b', 'a']);
    u().toggleFavorite('a');
    expect(u().favorites).toEqual(['b']);
    expect(u().isFavorite('b')).toBe(true);
  });

  it('crée, renomme, remplit, réordonne et supprime une playlist', () => {
    const p = u().createPlaylist('  Route  ', ['x']);
    expect(u().playlists[0]).toMatchObject({ id: p.id, name: 'Route', trackIds: ['x'] });
    u().renamePlaylist(p.id, 'Voyage', 'Pour la route');
    u().renamePlaylist(p.id, '   ');
    expect(u().playlists[0]).toMatchObject({ name: 'Voyage', description: 'Pour la route' });
    u().addToPlaylist(p.id, ['y', 'z']);
    u().movePlaylistTrack(p.id, 2, 0);
    expect(u().playlists[0].trackIds).toEqual(['z', 'x', 'y']);
    u().movePlaylistTrack(p.id, 0, 9);
    expect(u().playlists[0].trackIds).toEqual(['z', 'x', 'y']);
    u().removeFromPlaylist(p.id, 1);
    expect(u().playlists[0].trackIds).toEqual(['z', 'y']);
    u().deletePlaylist(p.id);
    expect(u().playlists).toHaveLength(0);
  });

  it('donne un nom par défaut à une playlist sans nom', () => {
    expect(u().createPlaylist('').name).toBe('Nouvelle playlist');
  });

  it("limite l'historique et compte les écoutes", () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) u().recordPlay(`t${i % 3}`, i);
    expect(u().history).toHaveLength(HISTORY_LIMIT);
    expect(u().history[0].at).toBe(HISTORY_LIMIT + 4);
    expect(u().playCounts.t0 + u().playCounts.t1 + u().playCounts.t2).toBe(HISTORY_LIMIT + 5);
    u().clearHistory();
    expect(u().history).toHaveLength(0);
    expect(u().playCounts).toEqual({});
  });

  it('dédoublonne les recherches récentes', () => {
    for (let i = 0; i < RECENT_SEARCH_LIMIT + 3; i++) u().addRecentSearch(`q${i}`);
    u().addRecentSearch('Q0');
    u().addRecentSearch('   ');
    expect(u().recentSearches).toHaveLength(RECENT_SEARCH_LIMIT);
    expect(u().recentSearches[0]).toBe('Q0');
  });

  it('associe et retire des paroles importées', () => {
    u().setLyrics('t', '[00:01]A');
    expect(u().lyrics.t).toBe('[00:01]A');
    u().setLyrics('t', null);
    expect(u().lyrics.t).toBeUndefined();
  });
});
