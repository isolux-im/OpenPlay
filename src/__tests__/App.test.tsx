import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, BackHandler, Platform, StyleSheet } from 'react-native';
import * as ExpoVideo from 'expo-video';

import App from '../App';
import { SimulatedEngine } from '../player/PlaybackEngine';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { usePlaybackPosition, usePlaybackSession } from '../store/session';
import { useUser } from '../store/user';
import { useVideoPlayer } from '../store/videoPlayer';
import { useVideoPlaylists } from '../store/videoPlaylists';
import { useSelection } from '../store/selection';
import { useFolders } from '../store/folders';
import { useVideos } from '../store/videos';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: View,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
    SafeAreaInsetsContext: { Consumer: ({ children }: { children: (i: typeof insets) => React.ReactNode }) => children(insets) },
    initialWindowMetrics: { insets, frame: { x: 0, y: 0, width: 390, height: 844 } },
  };
});

const engine = () => new SimulatedEngine(() => 200, 0);

beforeEach(() => {
  usePlayer.setState({ queue: [], originalQueue: [], index: -1, isPlaying: false, expanded: false });
});

/**
 * Onglet Musique. Toucher un onglet déjà actif revient à la racine de sa pile de façon asynchrone et pourrait
 * refermer l'écran ouvert juste après : on ne le touche que s'il n'est pas actif.
 */
async function openLibrary() {
  const tab = screen.getByRole('tab', { name: 'Audios' });
  if (!tab.props.accessibilityState?.selected) await fireEvent.press(tab);
  await screen.findAllByRole('button', { name: /^Titres, \d+$/ });
}

/** Onglet Vidéo, à sa racine, attendue jusqu'à l'affichage de sa recherche et de ses sous-menus. */
async function openVideos() {
  const tab = screen.getByRole('tab', { name: 'Vidéos' });
  if (!tab.props.accessibilityState?.selected) await fireEvent.press(tab);
  // Onglet déjà actif : retour explicite à la racine (le retour en tête différé de l'onglet refermerait l'écran ouvert ensuite).
  for (let i = 0; i < 6 && !screen.queryByLabelText('Rechercher une vidéo'); i++) {
    const back = screen.queryAllByRole('button', { name: 'Retour' }).at(-1);
    if (!back) break;
    await fireEvent.press(back);
  }
  await screen.findByLabelText('Rechercher une vidéo');
}

/** Rubrique « Parcourir » de l'onglet Vidéo (Toutes les vidéos, Séries, Playlists, Dossiers), comme dans Musique. */
async function openVideoBrowse(label: 'Toutes les vidéos' | 'Séries' | 'Playlists' | 'Dossiers') {
  await openVideos();
  await fireEvent.press((await screen.findAllByRole('button', { name: label }))[0]);
}

// Le minuteur du toast ne doit pas survivre au test.
afterEach(() => useUi.getState().hideToast());

async function renderApp() {
  await render(<App engineFactory={engine} />);
  await act(async () => {
    await useLibrary.getState().scan(30);
  });
}

describe('application', () => {
  it('affiche quatre onglets (Vidéos, Audios, Recherche, Paramètres), sans Bibliothèque, et s’ouvre sur Vidéos', async () => {
    await renderApp();
    expect(screen.getAllByRole('tab').map((t) => t.props.accessibilityLabel)).toEqual(['Vidéos', 'Audios', 'Recherche', 'Paramètres']);
    expect(screen.getByRole('tab', { name: 'Vidéos' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(await screen.findByLabelText('Rechercher une vidéo')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Bibliothèque' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Playlists' })).toBeNull();
    // Musique : « Mix pour vous » (ancien Accueil) en tête.
    await openLibrary();
    expect(await screen.findByText('Mix pour vous')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lancer Mix aléatoire' })).toBeTruthy();
    expect(screen.getAllByText('Lumières du Sud').length).toBeGreaterThan(0);
  });

  it('navigue vers un album, lance un morceau et ouvre le lecteur plein écran', async () => {
    await renderApp();
    await openLibrary();
    await fireEvent.press(await screen.findByRole('button', { name: 'Albums' }));
    await fireEvent.press((await screen.findAllByRole('button', { name: /^Racines/ }))[0]);
    await fireEvent.press(await screen.findByRole('button', { name: /^Lire Lagune/ }));
    expect(usePlayer.getState().queue[usePlayer.getState().index]).toBe(useLibrary.getState().index.tracks.find((t) => t.title === 'Lagune')!.id);
    await fireEvent.press(await screen.findByRole('button', { name: /^Ouvrir le lecteur/ }));
    expect(usePlayer.getState().expanded).toBe(true);
    expect(await screen.findByRole('button', { name: 'Réduire le lecteur' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: "File d'attente" }));
    expect(await screen.findByText('À suivre')).toBeTruthy();
  });

  it('recherche instantanément dans la bibliothèque', async () => {
    await renderApp();
    await fireEvent.press(screen.getByRole('tab', { name: 'Recherche' }));
    await fireEvent.changeText(await screen.findByLabelText('Rechercher dans OpenPlay'), 'neon');
    expect(await screen.findByText('Meilleur résultat')).toBeTruthy();
    expect(screen.getAllByText('Neon Drift').length).toBeGreaterThan(0);
  });

  it('ouvre le menu contextuel vitré par « ⋮ » et ajoute aux favoris', async () => {
    useUser.setState({ favorites: [] });
    await renderApp();
    await openLibrary();
    await fireEvent.press(await screen.findByRole('button', { name: /^Albums/ }));
    await fireEvent.press((await screen.findAllByRole('button', { name: /^Racines/ }))[0]);
    await fireEvent.press((await screen.findAllByRole('button', { name: /^Options pour Lagune/ }))[0], { nativeEvent: { pageX: 200, pageY: 300 } });
    for (const label of ['Lire', 'Lire ensuite', 'Ajouter à une playlist', 'Ajouter aux favoris', 'Partager', 'Supprimer']) {
      expect(await screen.findByRole('menuitem', { name: label })).toBeTruthy();
    }
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Ajouter aux favoris' }));
    const lagune = useLibrary.getState().index.tracks.find((t) => t.title === 'Lagune')!;
    expect(useUser.getState().favorites).toEqual([lagune.id]);
    expect(useUi.getState().menu).toBeNull();
  });

  it('affiche la qualité audio dans le panneau « … » du lecteur', async () => {
    await renderApp();
    const t = useLibrary.getState().index.tracks[0];
    await act(async () => usePlayer.getState().playTracks([t.id], 0));
    await openLibrary(); // le mini-lecteur musical s'affiche dans l'onglet Musique
    await fireEvent.press(await screen.findByRole('button', { name: /^Ouvrir le lecteur/ }));
    await fireEvent.press(await screen.findByRole('button', { name: "Plus d'options de lecture" }));
    await fireEvent.press(await screen.findByRole('menuitem', { name: 'Qualité audio' }));
    expect(await screen.findByText('MP3')).toBeTruthy();
    expect(screen.getByText(/^≈ \d+ kbit\/s$/)).toBeTruthy();
  });

  it('ouvre « À découvrir » depuis la bibliothèque', async () => {
    useUser.setState({ playCounts: {}, lastPlayed: {}, history: [] });
    await renderApp();
    await openLibrary();
    await fireEvent.press((await screen.findAllByRole('button', { name: /^À découvrir, \d+$/ }))[0]);
    expect(await screen.findByRole('radio', { name: 'Oubliés' })).toBeTruthy();
    expect(screen.getAllByText('Jamais écouté dans OpenPlay').length).toBeGreaterThan(0);
  });

  it('affiche le bouton « Transcrire » sans icône dans les paroles', async () => {
    useSettings.setState({ onlineLyrics: false });
    await renderApp();
    const t = useLibrary.getState().index.tracks[0];
    await act(async () => usePlayer.getState().playTracks([t.id], 0));
    await openLibrary(); // le mini-lecteur musical s'affiche dans l'onglet Musique
    await fireEvent.press(await screen.findByRole('button', { name: /^Ouvrir le lecteur/ }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Paroles' }));
    const button = await screen.findByRole('button', { name: 'Transcrire' });
    expect(screen.getByText('Transcrire')).toBeTruthy();
    expect(screen.queryByText(/✦/)).toBeNull();
    expect(button).toBeTruthy();
    useSettings.setState({ onlineLyrics: true });
  });

  it('affiche l’index A–Z sur la liste des titres et y saute', async () => {
    await renderApp();
    await openLibrary();
    await fireEvent.press((await screen.findAllByRole('button', { name: /^Titres, \d+$/ }))[0]);
    const strip = await screen.findByRole('adjustable', { name: 'Index alphabétique' });
    await fireEvent(strip, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(strip).toBeTruthy();
  });

  it('Musique et Vidéo : deux onglets complets, chacun avec ses playlists', async () => {
    await renderApp();
    await openLibrary();
    const musicTiles = [/^Récents/, /^Favoris/, /^Playlists/, /^Titres, \d+$/, /^À découvrir, \d+$/, /^Bilan/];
    for (const name of musicTiles) expect((await screen.findAllByRole('button', { name })).length).toBeGreaterThan(0);
    // Playlists musicales intégrées à Musique (plus d'onglet Playlists).
    await fireEvent.press((await screen.findAllByRole('button', { name: /^Playlists, \d+$/ }))[0]);
    expect((await screen.findAllByRole('button', { name: 'Nouvelle playlist' })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('tab', { name: 'Audios' })[0].props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getAllByRole('button', { name: 'Retour' }).at(-1)!);
    // Vidéo : la vidéothèque complète (recherche, sections, séries, playlists vidéo, bilan de visionnage).
    await openVideos();
    expect(await screen.findByLabelText('Rechercher une vidéo')).toBeTruthy();
    // Mêmes sous-menus que Musique : tuiles rapides, puis « Parcourir » ; plus de « Trier par ».
    for (const name of [/^Récentes, \d+$/, /^Favoris, \d+$/, /^Playlists, \d+$/, /^Toutes, \d+$/, /^Continuer, \d+$/, /^Bilan$/, 'Toutes les vidéos', 'Séries', 'Playlists', 'Dossiers']) {
      expect(screen.getAllByRole('button', { name }).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText('Trier par')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Durée' })).toBeNull();
    // Retour à Musique : « À découvrir » et « Bilan d'écoute » toujours accessibles.
    await openLibrary();
    await fireEvent.press((await screen.findAllByRole('button', { name: /^Bilan/ }))[0]);
    expect((await screen.findAllByText('Bilan d’écoute')).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Retour' }).at(-1)!);
    await fireEvent.press((await screen.findAllByRole('button', { name: /^À découvrir, \d+$/ }))[0]);
    expect(await screen.findByRole('radio', { name: 'Oubliés' })).toBeTruthy();
  });

  it('affiche les vidéos dans l’onglet Vidéo, ouvre le menu d’une vidéo et le lecteur', async () => {
    await renderApp();
    await openVideoBrowse('Toutes les vidéos');
    await fireEvent.press((await screen.findAllByRole('button', { name: 'Options pour Concert au Bénin' }))[0], { nativeEvent: { pageX: 100, pageY: 300 } });
    for (const label of ['Lire', 'Ajouter aux favoris', 'Informations', 'Partager', 'Ouvrir avec…']) {
      expect(await screen.findByRole('menuitem', { name: label })).toBeTruthy();
    }
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Lire' }));
    expect(await screen.findByRole('button', { name: 'Fermer la vidéo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vitesse 1×' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Vitesse 1×' }));
    expect(screen.getByRole('button', { name: 'Vitesse 1,25×' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Verrouiller les commandes et la rotation' }));
    expect(screen.getByText('Commandes et rotation verrouillées')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fermer la vidéo' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Déverrouiller les commandes' }));
    expect(screen.getByRole('button', { name: 'Fermer la vidéo' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Sous-titres' }));
    expect(screen.getByRole('radio', { name: 'Désactivés' }).props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(screen.getByRole('radio', { name: 'Grande' }));
    expect(useSettings.getState().subtitleSize).toBe('large');
    await fireEvent.press(screen.getByRole('radio', { name: 'Jaune sur noir' }));
    expect(useSettings.getState().subtitleContrast).toBe('yellow');
    // Sans module natif (web, tests), pas d'import de fichier.
    expect(screen.queryByRole('button', { name: /^Importer un fichier/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('radio', { name: 'Désactivés' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Fermer la vidéo' }));
    expect(useVideoPlayer.getState().session).toBeNull();
  });

  it('regroupe les épisodes en série et affiche le bilan de visionnage', async () => {
    await renderApp();
    await openVideoBrowse('Séries');
    await fireEvent.press(await screen.findByRole('button', { name: /^Série Lagune Blues, 3 épisodes/ }));
    expect(await screen.findByRole('button', { name: 'Commencer : S01E01' })).toBeTruthy();
    expect(screen.getByText('S01E03')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Commencer : S01E01' }));
    expect(useVideoPlayer.getState().session?.list).toEqual(['demo-video-9', 'demo-video-10', 'demo-video-11']);
    await fireEvent.press(screen.getByRole('button', { name: 'Fermer la vidéo' }));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Retour' }).at(-1)!);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Retour' }).at(-1)!);
    await fireEvent.press((await screen.findAllByRole('button', { name: /^Bilan$/ }))[0]);
    expect(await screen.findByText('Pas encore de bilan')).toBeTruthy();
  });

  it('enchaîne l’épisode suivant à la fin naturelle, dans le même lecteur, et jamais après une pause', async () => {
    type FakePlayer = { emit: (event: string, payload: unknown) => void; play: jest.Mock };
    const players: FakePlayer[] = [];
    const original = ExpoVideo.useVideoPlayer;
    const spy = jest.spyOn(ExpoVideo, 'useVideoPlayer').mockImplementation(((...args: Parameters<typeof original>) => {
      const p = original(...args) as unknown as FakePlayer;
      if (!players.includes(p)) players.push(p);
      return p;
    }) as unknown as typeof original);
    useSettings.setState({ videoAutoNext: true, videoAutoNextSeason: true });
    await renderApp();
    await openVideoBrowse('Séries');
    await fireEvent.press(await screen.findByRole('button', { name: /^Série Lagune Blues, 3 épisodes/ }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Commencer : S01E01' }));
    const live = () => players.at(-1)!;

    // Pause en cours d'épisode : aucun enchaînement.
    await act(async () => live().emit('playingChange', { isPlaying: false }));
    expect(screen.queryByText(/^Épisode suivant dans/)).toBeNull();

    // Fin naturelle : proposition, puis lecture automatique après le compte à rebours.
    // Horloge avancée à la main (le compte à rebours lit Date.now toutes les 250 ms).
    let offset = 0;
    const realNow = Date.now.bind(Date);
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
    const elapse = async (ms: number) => {
      offset += ms;
      await act(() => new Promise<void>((r) => setTimeout(r, 400)));
    };
    try {
      await act(async () => live().emit('playToEnd', {}));
      expect(screen.getByText('Épisode suivant dans 10 s')).toBeTruthy();
      await elapse(10_500);
      expect(useVideoPlayer.getState().session?.id).toBe('demo-video-10');
      expect(screen.getByRole('button', { name: 'Fermer la vidéo' })).toBeTruthy(); // lecteur toujours ouvert

      // Annuler : la vidéo reste sur l'épisode terminé.
      await act(async () => live().emit('playToEnd', {}));
      await fireEvent.press(screen.getByRole('button', { name: 'Annuler l’épisode suivant' }));
      await elapse(15_000);
      expect(useVideoPlayer.getState().session?.id).toBe('demo-video-10');

      // « Lire maintenant », puis dernier épisode : arrêt propre, pas de retour au premier.
      await act(async () => live().emit('playToEnd', {}));
      await fireEvent.press(screen.getByRole('button', { name: 'Lire l’épisode suivant maintenant' }));
      expect(useVideoPlayer.getState().session?.id).toBe('demo-video-11');
      await act(async () => live().emit('playToEnd', {}));
      expect(screen.queryByText(/^Épisode suivant dans/)).toBeNull();
      await elapse(15_000);
      expect(useVideoPlayer.getState().session?.id).toBe('demo-video-11');

      // Fermeture pendant le compte à rebours : rien ne se relance.
      await fireEvent.press(screen.getByRole('button', { name: 'Fermer la vidéo' }));
      expect(useVideoPlayer.getState().session).toBeNull();
    } finally {
      clock.mockRestore();
      spy.mockRestore();
    }
  });

  it('crée une playlist vidéo depuis une série, y ajoute une vidéo et la lit', async () => {
    useVideoPlaylists.setState({ playlists: [] });
    useSettings.setState({ videoLayout: 'list' });
    await renderApp();
    await openVideoBrowse('Séries');
    await fireEvent.press(await screen.findByRole('button', { name: 'Options pour la série Lagune Blues' }));
    await fireEvent.press(await screen.findByRole('menuitem', { name: 'Ajouter à une playlist vidéo' }));
    await fireEvent.press(await screen.findByText('Nouvelle playlist…'));
    await fireEvent.changeText(await screen.findByLabelText('Nom (ex. Animés, Policier…)'), 'Mes séries');
    await fireEvent.press(screen.getByRole('button', { name: 'Créer' }));
    expect(useVideoPlaylists.getState().playlists.map((p) => p.name)).toEqual(['Mes séries']);

    // Une vidéo isolée rejoint la même playlist.
    await openVideoBrowse('Toutes les vidéos');
    await fireEvent.press((await screen.findAllByRole('button', { name: 'Options pour Concert au Bénin' }))[0]);
    await fireEvent.press(await screen.findByRole('menuitem', { name: 'Ajouter à une playlist vidéo' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Ajouter à Mes séries' }));

    await openVideoBrowse('Playlists');
    await fireEvent.press(await screen.findByRole('button', { name: 'Playlist Mes séries, 1 série · 1 vidéo' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Lire la playlist' }));
    expect(useVideoPlayer.getState().session?.list).toEqual(['demo-video-9', 'demo-video-10', 'demo-video-11', 'demo-video-1']);
    await fireEvent.press(screen.getByRole('button', { name: 'Fermer la vidéo' }));
    useSettings.setState({ videoLayout: 'grid' });
  });

  it('renomme une vidéo depuis son menu (fichier réel sur Android)', async () => {
    useSettings.setState({ videoLayout: 'list' });
    await renderApp();
    await openVideoBrowse('Toutes les vidéos');
    await fireEvent.press((await screen.findAllByRole('button', { name: 'Options pour Anniversaire' }))[0]);
    await fireEvent.press(await screen.findByRole('menuitem', { name: 'Renommer le fichier…' }));
    expect(screen.getByText('Extension conservée : .mp4')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Nom du fichier'), 'Anniversaire de Mia');
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Renommer' }));
    });
    expect(useVideos.getState().byId['demo-video-7']).toMatchObject({ filename: 'Anniversaire de Mia.mp4', title: 'Anniversaire de Mia' });
    expect(await screen.findAllByText('Anniversaire de Mia')).not.toHaveLength(0);
    useSettings.setState({ videoLayout: 'grid' });
  });

  it('crée un dossier de musique vide, puis y ajoute un morceau', async () => {
    useFolders.setState({ created: { audio: [], video: [] } });
    await renderApp();
    const track = useLibrary.getState().index.tracks.find((t) => t.id !== usePlayer.getState().queue[usePlayer.getState().index])!;
    await openLibrary();
    await fireEvent.press(await screen.findByRole('button', { name: /^Dossiers/ }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Nouveau dossier' }));
    await fireEvent.changeText(await screen.findByLabelText('Nom du dossier'), 'Favoris du soir');
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Créer' }));
    });
    // Dossier créé vide, sans aucun fichier ajouté, et ouvert.
    expect(useFolders.getState().created.audio).toEqual(['Music/Favoris du soir']);
    expect(await screen.findByText('Dossier vide')).toBeTruthy();
    expect(useLibrary.getState().allTracks.some((t) => t.folder === 'Music/Favoris du soir')).toBe(false);
    expect(screen.getByRole('button', { name: 'Supprimer le dossier' })).toBeTruthy();

    // Plus tard : « Ajouter des fichiers ».
    await fireEvent.press(screen.getByRole('button', { name: 'Ajouter des fichiers' }));
    expect(await screen.findByText('Vers « Music/Favoris du soir »')).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('checkbox', { name: track.title })[0]);
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Déplacer 1 fichier' }));
    });
    expect(useLibrary.getState().index.foldersById['Music/Favoris du soir'].trackIds).toEqual([track.id]);
    expect(await screen.findAllByText(track.title)).not.toHaveLength(0); // retour au dossier
    expect(screen.queryByRole('button', { name: 'Supprimer le dossier' })).toBeNull(); // plus vide
  });

  it('crée un dossier vidéo vide, le supprime, puis en crée un et y copie une série', async () => {
    useFolders.setState({ created: { audio: [], video: [] } });
    await renderApp();
    await openVideoBrowse('Dossiers');
    await fireEvent.press(await screen.findByRole('button', { name: 'Nouveau dossier' }));
    await fireEvent.changeText(await screen.findByLabelText('Nom du dossier'), 'Vide');
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Créer' }));
    });
    expect(await screen.findByText('Dossier vide')).toBeTruthy();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((x) => x.style === 'destructive')?.onPress?.());
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Supprimer le dossier' }));
    });
    alert.mockRestore();
    expect(useFolders.getState().created.video).toEqual([]);

    await fireEvent.press(await screen.findByRole('button', { name: 'Nouveau dossier' }));
    await fireEvent.changeText(await screen.findByLabelText('Nom du dossier'), 'Animés');
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Créer' }));
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Ajouter des fichiers' }));
    await fireEvent.press(await screen.findByRole('radio', { name: 'Copier ici' }));
    await fireEvent.changeText(screen.getByLabelText('Rechercher'), 'lagune blues');
    for (const n of ['01', '02', '03']) await fireEvent.press(screen.getByRole('checkbox', { name: `Lagune Blues S01E${n}` }));
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Copier 3 fichiers' }));
    });
    const inFolder = useVideos.getState().videos.filter((v) => v.folder === 'Movies/Animés');
    expect(inFolder.map((v) => v.filename).sort()).toEqual(['Lagune Blues S01E01.mp4', 'Lagune Blues S01E02.mp4', 'Lagune Blues S01E03.mp4']);
    expect(useVideos.getState().byId['demo-video-9'].folder).toBe('Movies/Séries/Lagune Blues'); // originaux en place
  });

  it('sélectionne un ou plusieurs morceaux, tout sélectionner, puis supprime la sélection', async () => {
    await renderApp();
    const current = usePlayer.getState().queue[usePlayer.getState().index];
    const queueBefore = usePlayer.getState().queue;
    // Morceau en cours : sa suppression est refusée ; on en prend deux autres.
    const [a, b] = useLibrary.getState().index.tracks.slice().sort((x, y) => x.title.localeCompare(y.title, 'fr')).filter((t) => t.id !== current);
    const total = useLibrary.getState().index.tracks.length;
    await openLibrary();
    await fireEvent.press((await screen.findAllByRole('button', { name: /^Titres, \d+$/ }))[0]);
    await fireEvent.press(await screen.findByRole('button', { name: 'Sélectionner' }));
    expect(await screen.findByText('Touchez les éléments à sélectionner')).toBeTruthy();
    // Pendant la sélection, toucher un morceau le coche au lieu de le lire.
    await fireEvent.press(screen.getAllByRole('checkbox', { name: a.title })[0]);
    expect(screen.getByText('1 sélectionné')).toBeTruthy();
    expect(usePlayer.getState().queue).toBe(queueBefore);
    await fireEvent.press(screen.getAllByRole('checkbox', { name: b.title })[0]);
    expect(screen.getByText('2 sélectionnés')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Renommer' }).props.accessibilityState.disabled).toBe(true); // un seul élément
    await fireEvent.press(screen.getByRole('button', { name: 'Tout sélectionner' }));
    expect(useSelection.getState().ids).toHaveLength(total);
    await fireEvent.press(screen.getByRole('button', { name: 'Tout désélectionner' }));
    expect(screen.getByText('Touchez les éléments à sélectionner')).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('checkbox', { name: a.title })[0]);
    await fireEvent.press(screen.getAllByRole('checkbox', { name: b.title })[0]);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((x) => x.style === 'destructive')?.onPress?.());
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Supprimer' }));
    });
    alert.mockRestore();
    expect(useLibrary.getState().index.byId[a.id]).toBeUndefined();
    expect(useLibrary.getState().index.byId[b.id]).toBeUndefined();
    expect(useLibrary.getState().index.tracks).toHaveLength(total - 2);
    expect(useSelection.getState().kind).toBeNull(); // la sélection se ferme après l'opération
  });

  it('sélectionne des vidéos depuis le menu et les déplace ensemble', async () => {
    useSettings.setState({ videoLayout: 'list' });
    await renderApp();
    await openVideoBrowse('Toutes les vidéos');
    await fireEvent.press((await screen.findAllByRole('button', { name: 'Options pour Clip — Lagune' }))[0]);
    await fireEvent.press(await screen.findByRole('menuitem', { name: 'Sélectionner' }));
    expect(screen.getByText('1 sélectionné')).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('checkbox', { name: 'Clip — Neon Drift' })[0]);
    expect(useVideoPlayer.getState().session).toBeNull(); // aucune lecture pendant la sélection
    await fireEvent.press(screen.getByRole('button', { name: 'Déplacer' }));
    await act(async () => {
      await fireEvent.press(await screen.findByRole('button', { name: 'Dossier Movies/Concerts' }));
    });
    const byId = useVideos.getState().byId;
    expect([byId['demo-video-4'].folder, byId['demo-video-5'].folder]).toEqual(['Movies/Concerts', 'Movies/Concerts']);
    expect(useSelection.getState().kind).toBeNull();
    useSettings.setState({ videoLayout: 'grid' });
  });

  it('toucher lance la lecture ; l’appui long sélectionne (morceaux et vidéos en grille)', async () => {
    await renderApp();
    await openLibrary();
    await fireEvent.press((await screen.findAllByRole('button', { name: /^Titres, \d+$/ }))[0]);
    const [first, second] = useLibrary.getState().index.tracks.slice().sort((x, y) => x.title.localeCompare(y.title, 'fr'));
    await fireEvent.press((await screen.findAllByRole('button', { name: `Lire ${first.title}, ${first.artist}` }))[0]);
    expect(usePlayer.getState().queue[usePlayer.getState().index]).toBe(first.id);
    await fireEvent(screen.getAllByRole('button', { name: `Lire ${second.title}, ${second.artist}` })[0], 'longPress');
    expect(useSelection.getState()).toMatchObject({ kind: 'audio', ids: [second.id] });
    expect(screen.getByText('1 sélectionné')).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull(); // plus de menu à l'appui long
    await fireEvent.press(screen.getByRole('button', { name: 'Terminer la sélection' }));

    await openVideoBrowse('Toutes les vidéos'); // grille par défaut
    await fireEvent(screen.getAllByRole('button', { name: /^Lire Anniversaire/ })[0], 'longPress');
    expect(useSelection.getState()).toMatchObject({ kind: 'video', ids: ['demo-video-7'] });
    expect(useVideoPlayer.getState().session).toBeNull();
    await fireEvent.press(screen.getAllByRole('checkbox', { name: 'Concert au Bénin' })[0]);
    expect(useSelection.getState().ids).toEqual(['demo-video-7', 'demo-video-1']);
    await fireEvent.press(screen.getByRole('button', { name: 'Terminer la sélection' }));
    // Le menu reste accessible par « ⋮ », y compris en grille.
    await fireEvent.press(screen.getAllByRole('button', { name: /^Options pour Anniversaire/ })[0]);
    expect(await screen.findByRole('menuitem', { name: 'Renommer le fichier…' })).toBeTruthy();
    await act(async () => useUi.getState().closeAll());
  });

  it('le menu contextuel défile quand il est plus haut que l’écran visible', async () => {
    await renderApp();
    await act(async () => useUi.getState().openVideoMenu('demo-video-1', ['demo-video-1']));
    // Écran visible de 420 px (barres système comprises dans la fenêtre, pas dans la zone mesurée).
    await act(async () => fireEvent(screen.getByTestId('context-menu-area'), 'layout', { nativeEvent: { layout: { width: 380, height: 420 } } }));
    const scroll = screen.getByTestId('context-menu-scroll');
    expect(StyleSheet.flatten(scroll.props.style).maxHeight).toBe(420 - 14 * 2);
    expect(scroll.props.showsVerticalScrollIndicator).toBe(false);
    await act(async () => fireEvent(scroll, 'contentSizeChange', 288, 900));
    expect(screen.getByTestId('context-menu-scroll').props.showsVerticalScrollIndicator).toBe(true);
    expect(screen.getByTestId('context-menu-scroll').props.persistentScrollbar).toBe(true);
    // Tous les choix restent accessibles en faisant défiler, jusqu'au dernier.
    expect(screen.getByRole('menuitem', { name: 'Supprimer' })).toBeTruthy();
    await act(async () => useUi.getState().closeAll());
  });

  describe('mini-lecteur vidéo', () => {
    type FakePlayer = { emit: (event: string, payload: unknown) => void; play: jest.Mock; pause: jest.Mock };
    let players: FakePlayer[] = [];
    let spy: jest.SpyInstance;
    type BackHandlerFn = Parameters<typeof BackHandler.addEventListener>[1];
    let backHandlers: BackHandlerFn[] = [];
    let backSpy: jest.SpyInstance;
    beforeEach(() => {
      players = [];
      backHandlers = [];
      const original = ExpoVideo.useVideoPlayer;
      spy = jest.spyOn(ExpoVideo, 'useVideoPlayer').mockImplementation(((...args: Parameters<typeof original>) => {
        const p = original(...args) as unknown as FakePlayer;
        if (!players.includes(p)) players.push(p);
        return p;
      }) as unknown as typeof original);
      // BackHandler n'agit pas sous Jest : on garde les gestionnaires pour simuler la touche Retour du téléphone.
      backSpy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, handler) => {
        backHandlers.push(handler);
        return { remove: () => (backHandlers = backHandlers.filter((h) => h !== handler)) };
      });
      useSettings.setState({ videoLayout: 'list', videoPip: true });
    });
    afterEach(async () => {
      spy.mockRestore();
      backSpy.mockRestore();
      useSettings.setState({ videoLayout: 'grid' });
      await act(async () => useVideoPlayer.getState().close());
    });
    /** Touche Retour système : le dernier gestionnaire inscrit d'abord, comme Android. */
    const backEvent = {} as Parameters<BackHandlerFn>[0];
    const pressBack = () => act(async () => void [...backHandlers].reverse().find((h) => h(backEvent)));

    it('Mode A : le mini-lecteur garde OpenPlay ouvert, la bibliothèque utilisable, puis revient en plein écran', async () => {
      await renderApp();
      await openVideoBrowse('Toutes les vidéos');
      await fireEvent.press((await screen.findAllByRole('button', { name: /^Lire Concert au Bénin/ }))[0]);
      expect(await screen.findByRole('button', { name: 'Fermer la vidéo' })).toBeTruthy();
      const player = players.at(-1)!;
      const seqBefore = useVideoPlayer.getState().session!.seq;

      await fireEvent.press(screen.getByRole('button', { name: 'Mini-lecteur' }));
      expect(useVideoPlayer.getState()).toMatchObject({ display: 'mini', pip: false });
      expect(screen.queryByRole('button', { name: 'Fermer la vidéo' })).toBeNull(); // plein écran retiré
      expect(screen.getByLabelText('Mini-lecteur : Concert au Bénin')).toBeTruthy();
      // La bibliothèque des vidéos est à nouveau visible et utilisable pendant la lecture.
      await fireEvent.press(screen.getAllByRole('button', { name: 'Retour' }).at(-1)!);
      await fireEvent.press((await screen.findAllByRole('button', { name: /^Favoris, \d+$/ }))[0]);
      expect(await screen.findByText('Aucun favori')).toBeTruthy();
      await fireEvent.press((await screen.findAllByRole('button', { name: 'Retour' })).at(-1)!);
      expect(screen.getByRole('tab', { name: 'Vidéos' }).props.accessibilityState).toMatchObject({ selected: true });
      // Commandes du mini-lecteur sur la même session et le même lecteur natif.
      await act(async () => player.emit('playingChange', { isPlaying: true }));
      await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
      expect(player.pause).toHaveBeenCalled();
      // Retour système en mini-lecteur : navigation normale, pas de PiP ni de fermeture.
      expect(backHandlers.at(-1)?.(backEvent)).toBe(false);

      // Mini-lecteur : petite fenêtre placée par sa position, aux proportions de la vidéo.
      const miniStyle = StyleSheet.flatten(screen.getByTestId('video-mini').props.style);
      expect(miniStyle).toMatchObject({ position: 'absolute', width: expect.any(Number), height: expect.any(Number) });
      expect(miniStyle.width).toBeLessThan(400);

      await fireEvent.press(screen.getByRole('button', { name: 'Plein écran' }));
      expect(useVideoPlayer.getState().display).toBe('fullscreen');
      expect(await screen.findByRole('button', { name: 'Fermer la vidéo' })).toBeTruthy();
      // Plein écran : tout l'écran, sans taille ni décalage hérités du mini-lecteur.
      const full = StyleSheet.flatten(screen.getByTestId('video-fullscreen').props.style);
      expect(full).toMatchObject({ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 });
      expect(full.width).toBeUndefined();
      expect(full.height).toBeUndefined();
      expect(full.transform).toBeUndefined();
      expect(players.at(-1)).toBe(player); // aucun nouveau lecteur : progression et piste conservées
      expect(useVideoPlayer.getState().session!.seq).toBe(seqBefore);

      // Fermer depuis le mini-lecteur arrête la session.
      await fireEvent.press(screen.getByRole('button', { name: 'Mini-lecteur' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Fermer le mini-lecteur' }));
      expect(useVideoPlayer.getState().session).toBeNull();
    });

    it('Mode B : la touche Retour du téléphone passe en PiP Android, puis le lecteur est restauré au retour', async () => {
      await renderApp();
      await openVideoBrowse('Toutes les vidéos');
      await fireEvent.press((await screen.findAllByRole('button', { name: /^Lire Concert au Bénin/ }))[0]);
      expect(await screen.findByRole('button', { name: 'Fermer la vidéo' })).toBeTruthy();
      const player = players.at(-1)!;
      const os = jest.replaceProperty(Platform, 'OS', 'android');
      try {
        await pressBack();
        expect(useVideoPlayer.getState()).toMatchObject({ pip: true, display: 'fullscreen' }); // PiP natif, pas le mini interne
        expect(useVideoPlayer.getState().session?.id).toBe('demo-video-1'); // la vidéo continue
        // Retour dans OpenPlay depuis la fenêtre PiP.
        await act(async () => screen.getByTestId('video-view').props.onPictureInPictureStop());
        expect(useVideoPlayer.getState()).toMatchObject({ pip: false, display: 'fullscreen' });
        expect(screen.getByRole('button', { name: 'Fermer la vidéo' })).toBeTruthy();
        expect(players.at(-1)).toBe(player);
        // Derrière le lecteur restauré (fenêtre modale), l'onglet et l'écran d'origine n'ont pas changé.
        expect(screen.getByRole('tab', { name: 'Vidéos', includeHiddenElements: true }).props.accessibilityState).toMatchObject({ selected: true });
        expect(screen.getAllByText('Concert au Bénin', { includeHiddenElements: true }).length).toBeGreaterThan(0);

        // PiP désactivé dans les réglages : repli sur le mini-lecteur interne, avec un message.
        useSettings.setState({ videoPip: false });
        await pressBack();
        expect(useVideoPlayer.getState()).toMatchObject({ pip: false, display: 'mini' });
        expect(useUi.getState().toast).toBe('Fenêtre flottante Android désactivée : mini-lecteur OpenPlay');
      } finally {
        os.restore();
      }
    });

    it('enchaîne l’épisode suivant dans le mini-lecteur, sans revenir au plein écran', async () => {
      useSettings.setState({ videoAutoNext: true });
      await renderApp();
      await act(async () => useVideoPlayer.getState().open('demo-video-9', ['demo-video-9', 'demo-video-10', 'demo-video-11']));
      expect(await screen.findByRole('button', { name: 'Fermer la vidéo' })).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Mini-lecteur' }));
      let offset = 0;
      const realNow = Date.now.bind(Date);
      const clock = jest.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
      try {
        await act(async () => players.at(-1)!.emit('playToEnd', {}));
        offset += 10_500;
        await act(() => new Promise<void>((r) => setTimeout(r, 400)));
        expect(useVideoPlayer.getState()).toMatchObject({ display: 'mini', session: { id: 'demo-video-10' } });
      } finally {
        clock.mockRestore();
      }
    });
  });

  it('enchaînement désactivé : la fin d’un épisode ne lance rien', async () => {
    useSettings.setState({ videoAutoNext: false });
    await renderApp();
    await act(async () => useVideoPlayer.getState().open('demo-video-9', ['demo-video-9', 'demo-video-10', 'demo-video-11']));
    expect(await screen.findByRole('button', { name: 'Fermer la vidéo' })).toBeTruthy();
    expect(screen.queryByText(/^Épisode suivant dans/)).toBeNull();
    useSettings.setState({ videoAutoNext: true });
    await act(async () => useVideoPlayer.getState().close());
  });

  it('range les descriptions des Paramètres derrière l’icône « ! »', async () => {
    await renderApp();
    await fireEvent.press(screen.getByRole('tab', { name: 'Paramètres' }));
    expect(screen.queryByText(/^Orientation : « Auto »/)).toBeNull();
    await fireEvent.press(await screen.findByRole('button', { name: 'En savoir plus : Vidéos' }));
    expect(await screen.findByText(/^Orientation : « Auto »/)).toBeTruthy();
    await act(async () => useUi.getState().closeAll());
    expect(screen.queryByText(/^Orientation : « Auto »/)).toBeNull();
    for (const g of ['Lecture', 'À découvrir', 'Paroles en ligne', 'Informations']) expect(screen.getByRole('button', { name: `En savoir plus : ${g}` })).toBeTruthy();
  });

  it('n’affiche le mini-lecteur musical que dans l’onglet Musique, en lecture comme en pause', async () => {
    useUser.setState({ session: null });
    usePlaybackSession.setState({ session: null, saved: true });
    usePlaybackPosition.setState({ trackId: null, positionSec: 0 });
    await renderApp();
    const mini = () => screen.queryByRole('button', { name: /^Ouvrir le lecteur/ });
    expect(mini()).toBeNull(); // aucun morceau chargé
    const t = useLibrary.getState().index.tracks[0];
    await act(async () => usePlayer.getState().playTracks([t.id], 0));
    expect(mini()).toBeNull(); // onglet Vidéo, à l'ouverture
    await openLibrary();
    expect(mini()).toBeTruthy(); // Musique
    await act(async () => usePlayer.getState().pause());
    expect(usePlayer.getState().isPlaying).toBe(false);
    expect(mini()).toBeTruthy(); // en pause, toujours visible
    for (const tab of ['Vidéos', 'Recherche', 'Paramètres']) {
      await fireEvent.press(screen.getByRole('tab', { name: tab }));
      expect(mini()).toBeNull();
    }
    await openLibrary();
    expect(mini()).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lecture' })).toBeTruthy(); // toujours en pause
    // Masquer l'interface n'arrête rien : morceau, file et position conservés.
    expect(usePlayer.getState().queue[usePlayer.getState().index]).toBe(t.id);
  });

  it('lance l’historique (Récents) avec toute la liste, pour enchaîner les morceaux', async () => {
    await renderApp();
    const tracks = useLibrary.getState().index.tracks.slice(0, 3);
    useUser.setState({ history: tracks.map((t, i) => ({ trackId: t.id, at: Date.now() - i * 60_000 })) });
    await openLibrary();
    await fireEvent.press((await screen.findAllByRole('button', { name: /^Récents/ }))[0]);
    await fireEvent.press((await screen.findAllByRole('button', { name: new RegExp(`^Lire ${tracks[1].title}`) }))[0]);
    expect(usePlayer.getState().queue).toEqual(tracks.map((t) => t.id));
    expect(usePlayer.getState().index).toBe(1);
  });
});
