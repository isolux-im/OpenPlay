import { demoTracks } from '../library/demoLibrary';
import { buildIndex } from '../library/indexLibrary';
import { recentlyPlayedAlbums } from '../library/selectors';
import { audioQuality } from '../library/text';
import { useLibrary } from '../store/library';
import { DEFAULT_SETTINGS, migrateSettings } from '../store/settings';
import { useUser } from '../store/user';
import { buildTheme } from '../ui/theme';

describe('palette neutre', () => {
  it('passe l’ancien corail par défaut au graphite et garde un choix explicite', () => {
    expect(DEFAULT_SETTINGS.accent).toBe('graphite');
    expect(migrateSettings({ accent: 'coral', coloredPlayer: true, haptics: false }, 1)).toEqual({ accent: 'graphite', coloredPlayer: false, haptics: false });
    expect(migrateSettings({ accent: 'ocean' }, 1).accent).toBe('ocean');
    expect(migrateSettings({ accent: 'coral', coloredPlayer: true }, 2)).toEqual({ accent: 'coral', coloredPlayer: true });
  });

  it('garde un texte lisible sur l’accent dans les deux modes', () => {
    expect(buildTheme(false, 'graphite').colors.onAccent).toBe('#FFFFFF');
    expect(buildTheme(true, 'graphite').colors.onAccent).toBe('#111113');
    expect(buildTheme(true, 'ocean').colors.onAccent).toBe('#FFFFFF');
  });
});

describe('qualité audio', () => {
  it('donne le format, la taille et un débit moyen estimé', () => {
    expect(audioQuality('audio/mpeg', 7_200_000, 180)).toEqual({ format: 'MP3', size: '7,2 Mo', bitrate: '≈ 320 kbit/s' });
    expect(audioQuality('audio/x-flac', 0, 200)).toEqual({ format: 'FLAC', size: 'Inconnue', bitrate: 'Inconnu' });
    expect(audioQuality('audio/weird', 1_000_000, 0).format).toBe('WEIRD');
  });
});

describe('bibliothèque', () => {
  it('liste les albums écoutés récemment sans doublon', () => {
    const index = buildIndex(demoTracks());
    const [a, b] = index.albums;
    const history = [
      { trackId: a.trackIds[0], at: 3 },
      { trackId: a.trackIds[1] ?? a.trackIds[0], at: 2 },
      { trackId: b.trackIds[0], at: 1 },
      { trackId: 'inconnu', at: 0 },
    ];
    expect(recentlyPlayedAlbums(history, index).map((x) => x.id)).toEqual([a.id, b.id]);
  });

  it('oublie partout les morceaux supprimés de l’appareil', () => {
    const tracks = demoTracks();
    useLibrary.setState({ index: buildIndex(tracks) });
    const [x, y] = tracks;
    useUser.setState({
      favorites: [x.id, y.id],
      playlists: [{ id: 'p', name: 'P', description: '', trackIds: [x.id, y.id, x.id], createdAt: 0, updatedAt: 0 }],
      history: [{ trackId: x.id, at: 1 }, { trackId: y.id, at: 0 }],
      playCounts: { [x.id]: 3, [y.id]: 1 },
      lyrics: { [x.id]: 'la la' },
    });
    useUser.getState().forgetTracks([x.id]);
    useLibrary.getState().removeTracks([x.id]);
    const u = useUser.getState();
    expect(u.favorites).toEqual([y.id]);
    expect(u.playlists[0].trackIds).toEqual([y.id]);
    expect(u.history.map((h) => h.trackId)).toEqual([y.id]);
    expect(u.playCounts).toEqual({ [y.id]: 1 });
    expect(u.lyrics).toEqual({});
    expect(useLibrary.getState().index.byId[x.id]).toBeUndefined();
    expect(useLibrary.getState().index.tracks).toHaveLength(tracks.length - 1);
  });
});
