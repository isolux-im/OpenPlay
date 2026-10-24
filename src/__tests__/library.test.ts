import type { NativeTrack } from '../../modules/openplay-media';
import { demoTracks } from '../library/demoLibrary';
import { buildIndex } from '../library/indexLibrary';
import { searchLibrary } from '../library/search';
import { folderOf, splitTrackNumber, trackFromNative, UNKNOWN_ALBUM, UNKNOWN_ARTIST, UNKNOWN_GENRE } from '../library/trackFromNative';

const native = (o: Partial<NativeTrack> = {}): NativeTrack => ({
  id: '1',
  uri: 'content://media/external/audio/media/1',
  title: 'Titre',
  artist: 'Artiste',
  albumArtist: null,
  album: 'Album',
  albumId: '10',
  genre: 'Jazz',
  durationMs: 185000,
  trackNumber: 1003,
  year: 2020,
  dateAdded: 1700000000,
  filename: 'x.mp3',
  mimeType: 'audio/mpeg',
  size: 1,
  path: '/storage/emulated/0/Music/Jazz/x.mp3',
  ...o,
});

describe('trackFromNative', () => {
  it('convertit les métadonnées MediaStore', () => {
    const t = trackFromNative(native());
    expect(t).toMatchObject({ title: 'Titre', artist: 'Artiste', albumArtist: 'Artiste', album: 'Album', genre: 'Jazz', durationSec: 185, discNumber: 1, trackNumber: 3, year: 2020, folder: 'Music/Jazz', addedAt: 1700000000000 });
  });

  it('utilise des valeurs de repli pour les étiquettes manquantes', () => {
    const t = trackFromNative(native({ title: null, artist: '<unknown>', album: null, genre: null, year: 0, filename: 'Nora Vale - Aube.mp3' }));
    expect(t.title).toBe('Aube');
    expect(t.artist).toBe('Nora Vale');
    expect(t.album).toBe(UNKNOWN_ALBUM);
    expect(t.genre).toBe(UNKNOWN_GENRE);
    expect(t.year).toBeNull();
    const anon = trackFromNative(native({ artist: null, filename: 'enregistrement.m4a', title: null }));
    expect(anon.artist).toBe(UNKNOWN_ARTIST);
  });

  it('extrait le dossier relatif', () => {
    expect(folderOf('/storage/emulated/0/Music/Afro/a.mp3')).toBe('Music/Afro');
    expect(folderOf('/storage/1A2B-3C4D/Podcasts/b.mp3')).toBe('Podcasts');
    expect(folderOf('/storage/emulated/0/c.mp3')).toBe('Stockage interne');
    expect(folderOf(null)).toBe('Inconnu');
  });

  it('sépare disque et piste', () => {
    expect(splitTrackNumber(2005)).toEqual({ disc: 2, track: 5 });
    expect(splitTrackNumber(7)).toEqual({ disc: 1, track: 7 });
    expect(splitTrackNumber(0)).toEqual({ disc: 1, track: 0 });
  });
});

describe('buildIndex', () => {
  const index = buildIndex(demoTracks());

  it('regroupe albums, artistes, genres et dossiers', () => {
    expect(index.tracks).toHaveLength(37);
    expect(index.albums).toHaveLength(8);
    expect(index.artists.map((a) => a.name)).toEqual(['Ayo Mensah', 'Élise Moreau', 'Kairo', 'MC Lagos', 'Nora Vale', 'The Quiet Room']);
    expect(index.artistsById['nora vale'].albumIds).toHaveLength(2);
    expect(index.genres.map((g) => g.name)).toContain('Afrobeat');
    expect(index.folders.find((f) => f.path === 'Music/Jazz')?.trackIds).toHaveLength(4);
  });

  it('trie les pistes d’un album par numéro', () => {
    const album = index.albums.find((a) => a.title === 'Racines')!;
    expect(album.trackIds.map((id) => index.byId[id].trackNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(album.durationSec).toBeGreaterThan(0);
  });

  it('place « Artiste inconnu » en dernier', () => {
    const t = demoTracks();
    t[0] = { ...t[0], albumArtist: UNKNOWN_ARTIST, artist: UNKNOWN_ARTIST };
    const idx = buildIndex(t);
    expect(idx.artists[idx.artists.length - 1].name).toBe(UNKNOWN_ARTIST);
  });
});

describe('searchLibrary', () => {
  const index = buildIndex(demoTracks());

  it('trouve morceaux, artistes et albums sans tenir compte des accents', () => {
    const r = searchLibrary(index, [], 'ganvie');
    expect(r.tracks.map((t) => t.title)).toEqual(['Ganvié']);
    expect(r.top).toMatchObject({ kind: 'track' });
  });

  it('met l’artiste en meilleur résultat quand il correspond exactement', () => {
    const r = searchLibrary(index, [], 'kairo');
    expect(r.top).toMatchObject({ kind: 'artist', item: { name: 'Kairo' } });
    expect(r.tracks.length).toBe(5);
  });

  it('combine plusieurs mots (titre + artiste)', () => {
    const r = searchLibrary(index, [], 'aube nora');
    expect(r.tracks[0].title).toBe('Aube');
  });

  it('cherche aussi dans les playlists', () => {
    const r = searchLibrary(index, [{ id: 'p', name: 'Soirée à Cotonou', description: '', trackIds: [], createdAt: 0, updatedAt: 0 }], 'soiree');
    expect(r.playlists).toHaveLength(1);
  });

  it('renvoie un résultat vide pour une requête vide ou sans correspondance', () => {
    expect(searchLibrary(index, [], '   ').top).toBeNull();
    expect(searchLibrary(index, [], 'zzzz').tracks).toHaveLength(0);
  });
});
