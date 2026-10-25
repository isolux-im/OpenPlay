import { demoTracks } from '../library/demoLibrary';
import { applyEdit, diffEdit } from '../library/trackEdits';
import { useLibrary } from '../store/library';
import { useUser } from '../store/user';

const [t] = demoTracks();
const full = (over: Partial<Record<'title' | 'artist' | 'album' | 'genre', string>> = {}) => ({ title: t.title, artist: t.artist, album: t.album, genre: t.genre, ...over });

describe('correction des infos d’un morceau', () => {
  afterEach(() => useUser.setState({ trackEdits: {} }));

  it('ne garde que les champs réellement modifiés, nettoyés', () => {
    expect(diffEdit(t, full())).toBeNull();
    expect(diffEdit(t, full({ title: '  Nouveau   titre ' }))).toEqual({ title: 'Nouveau titre' });
    // Un champ vidé reprend la valeur d'origine.
    expect(diffEdit(t, full({ artist: '   ' }))).toBeNull();
  });

  it('corrige aussi l’artiste de l’album et regroupe par album corrigé', () => {
    const e = applyEdit(t, { artist: 'Angélique Kidjo', album: 'Ayé' });
    expect(e.artist).toBe('Angélique Kidjo');
    expect(e.albumArtist).toBe('Angélique Kidjo');
    expect(e.albumId).toBe('edit:aye|angelique kidjo');
    expect(applyEdit(t, { title: 'X' }).albumId).toBe(t.albumId);
  });

  it('met à jour la bibliothèque sans nouvelle analyse, et se rétablit', async () => {
    await useLibrary.getState().scan(0);
    useUser.getState().setTrackEdit(t.id, { title: 'Titre corrigé', artist: 'Nouvel artiste' });
    useLibrary.getState().refreshIndex();
    const { index, allTracks } = useLibrary.getState();
    expect(index.byId[t.id].title).toBe('Titre corrigé');
    expect(index.artistsById['nouvel artiste'].trackIds).toContain(t.id);
    // L'original reste disponible pour « Rétablir ».
    expect(allTracks.find((x) => x.id === t.id)!.title).toBe(t.title);
    useUser.getState().setTrackEdit(t.id, null);
    useLibrary.getState().refreshIndex();
    expect(useLibrary.getState().index.byId[t.id].title).toBe(t.title);
  });

  it('conserve les corrections après redémarrage et les oublie à la suppression du fichier', () => {
    useUser.getState().setTrackEdit('a', { title: 'A' });
    const saved = useUser.persist.getOptions().partialize!(useUser.getState()) as { trackEdits?: Record<string, unknown> };
    expect(saved.trackEdits).toEqual({ a: { title: 'A' } });
    useUser.getState().forgetTracks(['a']);
    expect(useUser.getState().trackEdits).toEqual({});
  });
});
