import { act, fireEvent, render, screen } from '@testing-library/react-native';

import App from '../App';
import { SimulatedEngine } from '../player/PlaybackEngine';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { useUser } from '../store/user';
import { useVideoPlayer } from '../store/videoPlayer';

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

// Le minuteur du toast ne doit pas survivre au test.
afterEach(() => useUi.getState().hideToast());

async function renderApp() {
  await render(<App engineFactory={engine} />);
  await act(async () => {
    await useLibrary.getState().scan(30);
  });
}

describe('application', () => {
  it('affiche les cinq onglets et l’accueil avec la bibliothèque', async () => {
    await renderApp();
    // Ordre de la maquette.
    expect(screen.getAllByRole('tab').map((t) => t.props.accessibilityLabel)).toEqual(['Accueil', 'Bibliothèque', 'Vidéos', 'Recherche', 'Playlists', 'Paramètres']);
    expect(await screen.findByText('Mix pour vous')).toBeTruthy();
    expect(screen.getAllByText('Lumières du Sud').length).toBeGreaterThan(0);
  });

  it('navigue vers un album, lance un morceau et ouvre le lecteur plein écran', async () => {
    await renderApp();
    await fireEvent.press(screen.getByRole('tab', { name: 'Bibliothèque' }));
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
    await fireEvent.changeText(await screen.findByLabelText('Rechercher dans la bibliothèque'), 'neon');
    expect(await screen.findByText('Meilleur résultat')).toBeTruthy();
    expect(screen.getAllByText('Neon Drift').length).toBeGreaterThan(0);
  });

  it('ouvre le menu contextuel vitré par appui long et ajoute aux favoris', async () => {
    useUser.setState({ favorites: [] });
    await renderApp();
    await fireEvent.press(screen.getByRole('tab', { name: 'Bibliothèque' }));
    await fireEvent.press(await screen.findByRole('button', { name: /^Albums/ }));
    await fireEvent.press((await screen.findAllByRole('button', { name: /^Racines/ }))[0]);
    const row = await screen.findByRole('button', { name: /^Lire Lagune/ });
    await fireEvent(row, 'longPress', { nativeEvent: { pageX: 200, pageY: 300 } });
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
    await fireEvent.press(await screen.findByRole('button', { name: /^Ouvrir le lecteur/ }));
    await fireEvent.press(await screen.findByRole('button', { name: "Plus d'options de lecture" }));
    await fireEvent.press(await screen.findByRole('menuitem', { name: 'Qualité audio' }));
    expect(await screen.findByText('MP3')).toBeTruthy();
    expect(screen.getByText(/^≈ \d+ kbit\/s$/)).toBeTruthy();
  });

  it('ouvre « À découvrir » depuis la bibliothèque', async () => {
    useUser.setState({ playCounts: {}, lastPlayed: {}, history: [] });
    await renderApp();
    await fireEvent.press(screen.getByRole('tab', { name: 'Bibliothèque' }));
    await fireEvent.press((await screen.findAllByRole('button', { name: /^À découvrir, \d+$/ }))[0]);
    expect(await screen.findByRole('radio', { name: 'Oubliés' })).toBeTruthy();
    expect(screen.getAllByText('Jamais écouté dans OpenPlay').length).toBeGreaterThan(0);
  });

  it('affiche le bouton « Transcrire » sans icône dans les paroles', async () => {
    useSettings.setState({ onlineLyrics: false });
    await renderApp();
    const t = useLibrary.getState().index.tracks[0];
    await act(async () => usePlayer.getState().playTracks([t.id], 0));
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
    await fireEvent.press(screen.getByRole('tab', { name: 'Bibliothèque' }));
    await fireEvent.press((await screen.findAllByRole('button', { name: /^Titres, \d+$/ }))[0]);
    const strip = await screen.findByRole('adjustable', { name: 'Index alphabétique' });
    await fireEvent(strip, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(strip).toBeTruthy();
  });

  it('affiche l’onglet Vidéos, ouvre le menu d’une vidéo et le lecteur', async () => {
    await renderApp();
    await fireEvent.press(screen.getByRole('tab', { name: 'Vidéos' }));
    const video = (await screen.findAllByRole('button', { name: /^Lire Concert au Bénin/ }))[0];
    await fireEvent(video, 'longPress', { nativeEvent: { pageX: 100, pageY: 300 } });
    for (const label of ['Lire', 'Ajouter aux favoris', 'Informations', 'Partager', 'Ouvrir avec…']) {
      expect(await screen.findByRole('menuitem', { name: label })).toBeTruthy();
    }
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Lire' }));
    expect(await screen.findByRole('button', { name: 'Fermer la vidéo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vitesse 1×' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Vitesse 1×' }));
    expect(screen.getByRole('button', { name: 'Vitesse 1,25×' })).toBeTruthy();
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
    await fireEvent.press(screen.getByRole('tab', { name: 'Vidéos' }));
    await fireEvent.press(await screen.findByRole('radio', { name: 'Séries' }));
    await fireEvent.press(await screen.findByRole('button', { name: /^Série Lagune Blues, 3 épisodes/ }));
    expect(await screen.findByRole('button', { name: 'Commencer : S01E01' })).toBeTruthy();
    expect(screen.getByText('S01E03')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Commencer : S01E01' }));
    expect(useVideoPlayer.getState().session?.list).toEqual(['demo-video-9', 'demo-video-10', 'demo-video-11']);
    await fireEvent.press(screen.getByRole('button', { name: 'Fermer la vidéo' }));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Retour' }).at(-1)!);
    await fireEvent.press(await screen.findByRole('button', { name: 'Bilan de visionnage' }));
    expect(await screen.findByText('Pas encore de bilan')).toBeTruthy();
  });
});
