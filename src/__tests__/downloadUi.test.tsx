import { act, fireEvent, render, screen } from '@testing-library/react-native';

import App from '../App';
import { demoTiming, resetDemoDownloads } from '../download/backend';
import { openSharedText } from '../download/intake';
import { SimulatedEngine } from '../player/PlaybackEngine';
import { pollDownloadsNow, stopDownloadPolling, useDownloads } from '../store/downloads';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { useVideoPlayer } from '../store/videoPlayer';
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
  useDownloads.setState({ items: [] });
  resetDemoDownloads();
  demoTiming.durationMs = 60_000;
});
afterEach(async () => {
  stopDownloadPolling();
  useUi.getState().hideToast();
  await act(async () => useVideoPlayer.getState().close());
});

async function renderApp() {
  await render(<App engineFactory={engine} />);
  await act(async () => {
    await useLibrary.getState().scan(30);
  });
}

async function openDownloadLink() {
  await fireEvent.press(screen.getByRole('tab', { name: 'Recherche' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Télécharger par lien' }));
  return screen.findByLabelText('Lien à analyser');
}

describe('Recherche › Télécharger par lien', () => {
  it('la recherche locale reste intacte à côté du nouveau bloc', async () => {
    await renderApp();
    await fireEvent.press(screen.getByRole('tab', { name: 'Recherche' }));
    expect(await screen.findByRole('button', { name: 'Télécharger par lien' })).toBeTruthy();
    expect(screen.getByText('Parcourir les genres')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Rechercher dans OpenPlay'), 'neon');
    expect(await screen.findByText('Meilleur résultat')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Télécharger par lien' })).toBeNull(); // masqué pendant une recherche
    expect(screen.getAllByRole('tab').map((t) => t.props.accessibilityLabel)).toEqual(['Vidéos', 'Audios', 'Recherche', 'Paramètres']); // aucun onglet ajouté
  });

  it('MP4 direct : analyse, qualités (actives et grisées avec raison), téléchargement, ajout à Vidéos et lecture', async () => {
    await renderApp();
    const field = await openDownloadLink();
    // Lien invalide : message, pas de plantage.
    await fireEvent.changeText(field, 'http://exemple.org/a.mp4');
    await fireEvent.press(screen.getByRole('button', { name: 'Analyser le lien' }));
    expect(await screen.findByText('Lien non sécurisé (http) : seuls les liens https sont acceptés.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Lien à analyser'), 'https://exemple.org/videos/Concert live.mp4');
    await fireEvent.press(screen.getByRole('button', { name: 'Analyser le lien' }));
    expect(await screen.findByText('Concert live')).toBeTruthy();
    expect(screen.getByText(/exemple\.org · MP4 · 3:34 · 1080p · 52,4 Mo/)).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'MP4 (vidéo)' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('radio', { name: 'Originale' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole('radio', { name: '2160p, indisponible' }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText(/2160p indisponible : la source accessible est en 1080p/)).toBeTruthy();
    expect(screen.getAllByText('Source').length).toBeGreaterThan(0);
    // MP3 depuis une vidéo : désactivé et expliqué, bouton Télécharger inactif.
    await fireEvent.press(screen.getByRole('radio', { name: 'MP3 (audio)' }));
    expect(screen.getAllByText(/extraction audio vers MP3 indisponible/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Télécharger' }).props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByRole('radio', { name: 'MP4 (vidéo)' }));
    expect(screen.getByText(/Enregistré dans Movies\/OpenPlay, puis ajouté à Vidéos/)).toBeTruthy();

    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Télécharger' }));
    });
    expect((await screen.findAllByText('Mes téléchargements')).length).toBeGreaterThan(0);
    expect(useUi.getState().toast).toBe('Téléchargement lancé');
    expect(useDownloads.getState().items[0]).toMatchObject({ fileName: 'Concert live.mp4', status: 'running', method: 'DIRECT' });
    expect(await screen.findByRole('progressbar')).toBeTruthy();
    // Serveur acceptant la reprise : Pause, puis Reprendre.
    await act(async () => {
      await pollDownloadsNow();
    });
    await act(async () => {
      await fireEvent.press(await screen.findByRole('button', { name: 'Pause : Concert live.mp4' }));
    });
    expect(useDownloads.getState().items[0].status).toBe('paused');
    expect(screen.getByText(/En pause · .*reprise là où il s’est arrêté/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Reprendre : Concert live.mp4' }));
    expect(useDownloads.getState().items[0].status).toBe('running');

    demoTiming.durationMs = 1;
    await act(async () => {
      await pollDownloadsNow();
    });
    expect(await screen.findByText('Terminés')).toBeTruthy();
    const mediaId = useDownloads.getState().items[0].mediaId!;
    expect(useVideos.getState().byId[mediaId]).toMatchObject({ title: 'Concert live', folder: 'Movies/OpenPlay' });
    await fireEvent.press(screen.getByRole('button', { name: 'Ouvrir : Concert live.mp4' }));
    expect(useVideoPlayer.getState().session?.id).toBe(mediaId); // lecture avec le lecteur MP4 existant
  });

  it('lien YouTube : explication, aucun bouton Télécharger', async () => {
    await renderApp();
    await fireEvent.changeText(await openDownloadLink(), 'https://www.youtube.com/watch?v=abc');
    await fireEvent.press(screen.getByRole('button', { name: 'Analyser le lien' }));
    expect(await screen.findByText('Lien YouTube reconnu')).toBeTruthy();
    expect(screen.getByText('Téléchargement direct indisponible pour cette source')).toBeTruthy();
    expect(screen.getByText(/aucune conversion YouTube → MP3/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ouvrir YouTube' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Télécharger' })).toBeNull();
  });

  it('page web : téléchargement direct indisponible', async () => {
    await renderApp();
    await fireEvent.changeText(await openDownloadLink(), 'https://exemple.org/article');
    await fireEvent.press(screen.getByRole('button', { name: 'Analyser le lien' }));
    expect(await screen.findByText(/aucun fichier audio ou vidéo direct autorisé/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Télécharger' })).toBeNull();
  });

  it('lien partagé depuis une autre application : ouvert et analysé, sans téléchargement automatique', async () => {
    await renderApp();
    await act(async () => openSharedText('Écoute ça https://exemple.org/musique/titre.mp3 !'));
    expect(await screen.findByDisplayValue('https://exemple.org/musique/titre.mp3')).toBeTruthy();
    expect(await screen.findByText('titre')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'MP3 (audio)' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(useDownloads.getState().items).toHaveLength(0);
  });
});
