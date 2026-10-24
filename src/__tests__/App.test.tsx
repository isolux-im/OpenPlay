import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import App from '../App';
import { IDLE_STATUS } from '../player/usePlayer';

const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockGetAssets = jest.fn();

jest.mock('expo-media-library/legacy', () => ({
  MediaType: { audio: 'audio' },
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissions(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
  getAssetsAsync: (...args: unknown[]) => mockGetAssets(...args),
}));

const mockPlayer = {
  replace: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn(() => Promise.resolve()),
  remove: jest.fn(),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};

jest.mock('expo-audio', () => ({
  createAudioPlayer: () => mockPlayer,
  setAudioModeAsync: () => Promise.resolve(),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: View,
  };
});

const asset = (id: string, filename: string) => ({
  id,
  uri: `file:///music/${filename}`,
  filename,
  duration: 200,
  creationTime: 0,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAssets.mockResolvedValue({
    assets: [asset('1', 'Artiste B - Second.mp3'), asset('2', 'Artiste A - Premier.mp3')],
    hasNextPage: false,
    endCursor: '2',
    totalCount: 2,
  });
});

describe('App', () => {
  it('demande l’accès à la musique si la permission manque', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissions.mockResolvedValue({ status: 'granted' });
    await render(<App />);
    await fireEvent.press(await screen.findByText("Autoriser l'accès"));
    expect(mockRequestPermissions).toHaveBeenCalledWith(false, ['audio']);
    expect(await screen.findByText('Premier')).toBeTruthy();
  });

  it('affiche la bibliothèque triée, lit un morceau et gère les favoris', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'granted' });
    await render(<App />);

    expect(await screen.findByText('Premier')).toBeTruthy();
    expect(screen.getByText('Bibliothèque (2)')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Lire Second'));
    expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: 'file:///music/Artiste B - Second.mp3' });
    expect(mockPlayer.play).toHaveBeenCalled();
    expect(screen.getByLabelText('Lecture')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Ajouter Premier aux favoris'));
    await waitFor(() => expect(screen.getByText('Favoris (1)')).toBeTruthy());

    await fireEvent.press(screen.getByText('Favoris (1)'));
    // « Second » reste visible dans la barre de lecture, mais plus dans la liste.
    expect(screen.queryByLabelText('Lire Second')).toBeNull();
    expect(screen.getByLabelText('Lire Premier')).toBeTruthy();
  });

  it('signale une bibliothèque vide', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'granted' });
    mockGetAssets.mockResolvedValue({ assets: [], hasNextPage: false, endCursor: '', totalCount: 0 });
    await render(<App />);
    expect(await screen.findByText('Aucun fichier audio trouvé sur cet appareil.')).toBeTruthy();
  });

  it('utilise le statut initial au repos', () => {
    expect(IDLE_STATUS.playing).toBe(false);
  });
});
