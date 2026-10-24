import { act, fireEvent, render, screen } from '@testing-library/react-native';

import App from '../App';
import { SimulatedEngine } from '../player/PlaybackEngine';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';

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

async function renderApp() {
  await render(<App engineFactory={engine} />);
  await act(async () => {
    await useLibrary.getState().scan(30);
  });
}

describe('application', () => {
  it('affiche les cinq onglets et l’accueil avec la bibliothèque', async () => {
    await renderApp();
    for (const label of ['Accueil', 'Bibliothèque', 'Playlists', 'Recherche', 'Paramètres']) {
      expect(screen.getByRole('tab', { name: label })).toBeTruthy();
    }
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
});
