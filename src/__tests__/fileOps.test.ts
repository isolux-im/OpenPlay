import { Alert } from 'react-native';

import { createEmptyFolder, deleteEmptyFolder, knownFolders, newFolderPath, copyTracks, copyVideos, deleteVideosFromDevice, isValidDestination, moveTracks, moveVideos, renameTrack, renameVideo, renamedFile, cleanFileName, trackFileName } from '../library/fileOps';
import { useFolders } from '../store/folders';
import { useLibrary } from '../store/library';
import { compareText } from '../library/text';
import { migrateSettings } from '../store/settings';
import { sortVideos } from '../video/library';
import { useUi } from '../store/ui';
import { useVideoHistory } from '../store/videoHistory';
import { describePlaylist, playlistVideoIds, resolvePlaylist, useVideoPlaylists } from '../store/videoPlaylists';
import { useVideos } from '../store/videos';
import { seriesIndex } from '../video/useSeries';

const toast = () => useUi.getState().toast;
const video = (id: string) => useVideos.getState().byId[id];

beforeEach(async () => {
  await useVideos.getState().scan();
  await useLibrary.getState().scan(30);
  useVideoPlaylists.setState({ playlists: [] });
  useVideoHistory.setState({ entries: {}, favorites: [] });
});
afterEach(() => useUi.getState().hideToast());

describe('noms de fichiers', () => {
  it('garde l’extension, retire les caractères interdits', () => {
    expect(renamedFile('Clip — Lagune.mp4', 'Lagune (live)')).toBe('Lagune (live).mp4');
    expect(renamedFile('a.mp4', 'b.MP4')).toBe('b.mp4');
    expect(renamedFile('a.mp4', 'Mon: film/2?')).toBe('Mon film 2.mp4');
    expect(renamedFile('a.mp4', '  ...  ')).toBeNull();
    expect(cleanFileName('  x\u0001y  ')).toBe('x y');
  });

  it('n’accepte que les dossiers racine autorisés par Android', () => {
    expect(isValidDestination('video', 'Movies/Séries')).toBe(true);
    expect(isValidDestination('video', 'DCIM/Camera')).toBe(true);
    expect(isValidDestination('video', 'Music/Jazz')).toBe(false);
    expect(isValidDestination('audio', 'Music/Jazz')).toBe(true);
    expect(isValidDestination('audio', 'Download')).toBe(false);
    expect(newFolderPath('video', 'Animés')).toBe('Movies/Animés');
    expect(newFolderPath('video', 'DCIM/Vacances 2026')).toBe('DCIM/Vacances 2026');
    expect(newFolderPath('audio', 'Jazz/Live')).toBe('Music/Jazz/Live');
    expect(newFolderPath('audio', ' / ')).toBeNull();
  });
});

describe('opérations sur les vidéos (bibliothèque de démonstration)', () => {
  it('renomme : nom et titre suivent, l’identifiant est conservé (historique, favoris)', async () => {
    useVideoHistory.getState().toggleFavorite('demo-video-4');
    expect(await renameVideo(video('demo-video-4'), 'Lagune — version live')).toBe(true);
    expect(video('demo-video-4')).toMatchObject({ filename: 'Lagune — version live.mp4', title: 'Lagune — version live', folder: 'Movies/Clips' });
    expect(useVideoHistory.getState().favorites).toContain('demo-video-4');
    expect(toast()).toBe('Vidéo renommée');
  });

  it('refuse un nom déjà pris dans le même dossier', async () => {
    expect(await renameVideo(video('demo-video-4'), 'Clip — Neon Drift')).toBe(false);
    expect(toast()).toBe('Un fichier porte déjà ce nom dans ce dossier');
    expect(video('demo-video-4').filename).toBe('Clip — Lagune.mp4');
  });

  it('déplace une série entière : elle reste reconnue, dans son nouveau dossier', async () => {
    const before = seriesIndex(useVideos.getState().videos).list[0];
    expect(await moveVideos(before.episodes, 'Movies/Animés')).toBe(3);
    const after = seriesIndex(useVideos.getState().videos).byKey[before.key];
    expect(after.episodes.map((e) => e.folder)).toEqual(['Movies/Animés', 'Movies/Animés', 'Movies/Animés']);
    expect(toast()).toBe('3 fichiers déplacés vers « Animés »');
  });

  it('refuse une destination invalide, un dossier identique ou un nom déjà présent', async () => {
    expect(await moveVideos([video('demo-video-1')], 'Music/Concerts')).toBe(0);
    expect(await moveVideos([video('demo-video-1')], 'Movies/Concerts')).toBe(0);
    expect(toast()).toBe('Déjà dans ce dossier');
    await copyVideos([video('demo-video-4')], 'Movies/Concerts');
    expect(await moveVideos([video('demo-video-4')], 'Movies/Concerts')).toBe(0);
    expect(toast()).toBe('« Clip — Lagune.mp4 » existe déjà dans ce dossier');
  });

  it('copie : l’original reste en place, la copie est une nouvelle vidéo', async () => {
    const count = useVideos.getState().videos.length;
    expect(await copyVideos([video('demo-video-2'), video('demo-video-3')], 'DCIM/Cours')).toBe(2);
    expect(useVideos.getState().videos).toHaveLength(count + 2);
    expect(video('demo-video-2').folder).toBe('Movies/Cours');
    expect(useVideos.getState().videos.filter((v) => v.folder === 'DCIM/Cours').map((v) => v.filename)).toEqual(['Cours de guitare — leçon 1.mp4', 'Cours de guitare — leçon 2.mp4']);
  });

  it('supprime après confirmation et oublie l’historique', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
    useVideoHistory.getState().savePosition('demo-video-8', 120, 2890, 1);
    expect(await deleteVideosFromDevice([video('demo-video-8')], '« Documentaire »')).toBe(true);
    expect(video('demo-video-8')).toBeUndefined();
    expect(useVideoHistory.getState().entries['demo-video-8']).toBeUndefined();
    alert.mockRestore();
  });
});

describe('opérations sur la musique (bibliothèque de démonstration)', () => {
  const track = () => useLibrary.getState().index.tracks[0];

  it('renomme le fichier sans toucher aux infos du morceau', async () => {
    const t = track();
    expect(await renameTrack(t, 'Nouveau nom')).toBe(true);
    const after = useLibrary.getState().index.byId[t.id];
    expect(trackFileName(after)).toBe('Nouveau nom.mp3');
    expect(after.title).toBe(t.title);
  });

  it('déplace et copie un morceau', async () => {
    const t = track();
    expect(await moveTracks([t], 'Music/Favoris')).toBe(1);
    expect(useLibrary.getState().index.byId[t.id].folder).toBe('Music/Favoris');
    const count = useLibrary.getState().allTracks.length;
    expect(await copyTracks([useLibrary.getState().index.byId[t.id]], 'Podcasts')).toBe(1);
    expect(useLibrary.getState().allTracks).toHaveLength(count + 1);
    expect(await moveTracks([t], 'Movies')).toBe(0); // pas de musique dans Movies
  });
});

describe('playlists vidéo', () => {
  it('range des séries et des vidéos, sans doublon, dans l’ordre choisi', () => {
    const store = useVideoPlaylists.getState();
    const { list, byKey } = seriesIndex(useVideos.getState().videos);
    const series = list[0];
    const p = store.create('Animés', [{ kind: 'series', key: series.key }, { kind: 'series', key: series.key }]);
    expect(useVideoPlaylists.getState().playlists[0].items).toHaveLength(1);
    expect(store.addItems(p.id, [{ kind: 'video', id: 'demo-video-1' }, { kind: 'series', key: series.key }])).toBe(1);
    store.create('Famille');
    expect(useVideoPlaylists.getState().playlists.map((x) => x.name)).toEqual(['Famille', 'Animés']);

    const animés = () => useVideoPlaylists.getState().playlists.find((x) => x.id === p.id)!;
    let resolved = resolvePlaylist(animés(), byKey, useVideos.getState().byId);
    expect(describePlaylist(resolved)).toBe('1 série · 1 vidéo');
    expect(playlistVideoIds(resolved)).toEqual(['demo-video-9', 'demo-video-10', 'demo-video-11', 'demo-video-1']);

    store.moveItem(p.id, 1, 0);
    resolved = resolvePlaylist(animés(), byKey, useVideos.getState().byId);
    expect(playlistVideoIds(resolved)[0]).toBe('demo-video-1');
    store.removeItem(p.id, 0);
    store.rename(p.id, 'Animés japonais');
    expect(animés()).toMatchObject({ name: 'Animés japonais', items: [{ kind: 'series', key: series.key }] });
  });

  it('masque une vidéo disparue sans la retirer de la playlist', () => {
    const p = useVideoPlaylists.getState().create('Films', [{ kind: 'video', id: 'demo-video-1' }, { kind: 'video', id: 'absente' }]);
    const { byKey } = seriesIndex(useVideos.getState().videos);
    expect(resolvePlaylist(p, byKey, useVideos.getState().byId)).toHaveLength(1);
    expect(useVideoPlaylists.getState().playlists[0].items).toHaveLength(2);
  });
});

describe('dossiers vides', () => {
  beforeEach(() => useFolders.setState({ created: { audio: [], video: [] } }));

  it('crée un dossier sans fichier, visible comme destination ; refuse un doublon', async () => {
    expect(await createEmptyFolder('video', 'Movies/Animés')).toBe(true);
    expect(useFolders.getState().created.video).toEqual(['Movies/Animés']);
    expect(knownFolders('video')).toContain('Movies/Animés');
    expect(useVideos.getState().videos.some((v) => v.folder === 'Movies/Animés')).toBe(false);
    expect(await createEmptyFolder('video', 'Movies/animés')).toBe(true);
    expect(toast()).toBe('Le dossier « animés » existe déjà');
    expect(useFolders.getState().created.video).toHaveLength(1);
    expect(await createEmptyFolder('video', 'Music/Animés')).toBe(false); // pas de vidéos dans Music
  });

  it('ne supprime un dossier que s’il est vide', async () => {
    await createEmptyFolder('audio', 'Music/Soirée');
    await moveTracks([useLibrary.getState().index.tracks[0]], 'Music/Soirée');
    expect(await deleteEmptyFolder('audio', 'Music/Soirée')).toBe(false);
    expect(toast()).toBe('« Soirée » n\'est pas vide : supprimez d\'abord ses fichiers');
    await createEmptyFolder('audio', 'Music/Vide');
    expect(await deleteEmptyFolder('audio', 'Music/Vide')).toBe(true);
    expect(useFolders.getState().created.audio).toEqual(['Music/Soirée']);
  });
});

describe('ordre alphabétique et numérique', () => {
  it('range les nombres selon leur valeur (2 avant 10), sans tenir compte des accents ni de la casse', () => {
    expect(['Film 10', 'film 2', 'Film 1', 'Épisode', 'Zorro', 'avatar'].sort(compareText)).toEqual(['avatar', 'Épisode', 'Film 1', 'film 2', 'Film 10', 'Zorro']);
    expect(['Saison 10', 'Saison 9', 'Saison 1'].sort(compareText)).toEqual(['Saison 1', 'Saison 9', 'Saison 10']);
  });

  it('classe les vidéos par nom dès l’import, sans réglage « Trier par » (ancien réglage retiré)', () => {
    expect(migrateSettings({ videoSort: 'date', videoLayout: 'list' }, 3)).toEqual({ videoLayout: 'list' });
    const titles = useVideos.getState().videos.map((v) => v.title);
    expect(titles).toEqual(sortVideos(useVideos.getState().videos, 'name').map((v) => v.title));
    expect(titles.indexOf('Cours de guitare — leçon 1')).toBeLessThan(titles.indexOf('Cours de guitare — leçon 2'));
    expect(titles[0]).toBe('Anniversaire');
  });
});
