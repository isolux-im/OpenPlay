import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { miniPlayerVisible } from '../navigation/TabBar';
import { MediaOnboardingScreen, needsMediaOnboarding, requestMediaAccess } from '../onboarding/MediaOnboarding';
import { useLibrary } from '../store/library';
import { useVideos } from '../store/videos';
import { ThemeProvider } from '../ui/theme';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

describe('visibilité du mini-lecteur musical', () => {
  it('suit l’onglet, jamais la lecture ou la pause', () => {
    expect(miniPlayerVisible('MusicTab', 'Music')).toBe(true);
    expect(miniPlayerVisible('MusicTab', undefined)).toBe(true);
    // Sous-écrans musicaux (Titres, À découvrir, Bilan, Playlists…).
    for (const s of ['Songs', 'Discover', 'Stats', 'MusicPlaylists', 'Album']) expect(miniPlayerVisible('MusicTab', s)).toBe(true);
    // Écrans vidéo, où qu'ils soient ouverts.
    for (const s of ['VideoFolder', 'VideoSeries', 'VideoStats', 'VideoPlaylist']) expect(miniPlayerVisible('MusicTab', s)).toBe(false);
    for (const tab of ['VideosTab', 'SearchTab', 'SettingsTab', 'HomeTab', 'LibraryTab', 'PlaylistsTab']) expect(miniPlayerVisible(tab, undefined)).toBe(false);
  });
});

describe('accueil des autorisations audio et vidéo', () => {
  it('n’est présenté qu’une fois, et seulement s’il manque un accès', () => {
    const base = { done: false, demo: false, audio: 'granted', video: 'granted' } as const;
    expect(needsMediaOnboarding(base)).toBe(false);
    expect(needsMediaOnboarding({ ...base, video: 'undetermined' })).toBe(true);
    expect(needsMediaOnboarding({ ...base, audio: 'undetermined' })).toBe(true);
    expect(needsMediaOnboarding({ ...base, audio: 'denied', video: 'denied' })).toBe(true);
    expect(needsMediaOnboarding({ ...base, video: 'undetermined', done: true })).toBe(false);
    expect(needsMediaOnboarding({ ...base, video: 'undetermined', demo: true })).toBe(false);
  });

  it('demande l’audio puis la vidéo, avec les fenêtres d’Android', async () => {
    const calls: string[] = [];
    useLibrary.setState({
      requestPermission: async () => {
        calls.push('audio');
      },
    });
    useVideos.setState({
      requestPermission: async () => {
        calls.push('video');
      },
    });
    await requestMediaAccess();
    expect(calls).toEqual(['audio', 'video']);
  });

  it('explique l’accès et propose Continuer ou Plus tard', async () => {
    const onContinue = jest.fn(async () => {});
    const onLater = jest.fn();
    await render(
      <ThemeProvider>
        <MediaOnboardingScreen onContinue={onContinue} onLater={onLater} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Autoriser l’accès à vos médias')).toBeTruthy();
    expect(screen.getByText(/OpenPlay utilise les fichiers audio et vidéo de votre téléphone/)).toBeTruthy();
    expect(screen.getByText('Musique et audio')).toBeTruthy();
    expect(screen.getByText('Vidéos')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continuer' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Plus tard' }));
    expect(onLater).toHaveBeenCalledTimes(1);
  });

  it('premier lancement : la demande d’Android s’ouvre d’elle-même, sans attendre « Continuer »', async () => {
    let answer: () => void = () => {};
    const onContinue = jest.fn(() => new Promise<void>((resolve) => (answer = resolve)));
    await render(
      <ThemeProvider>
        <MediaOnboardingScreen autoStart onContinue={onContinue} onLater={jest.fn()} />
      </ThemeProvider>,
    );
    expect(onContinue).toHaveBeenCalledTimes(1); // fenêtres système ouvertes aussitôt
    expect(screen.getByRole('button', { name: 'Continuer' }).props.accessibilityState).toMatchObject({ busy: true });
    await act(async () => answer());
    // Après la réponse d'Android, « Continuer » permet de redemander.
    expect(screen.getByRole('button', { name: 'Continuer' }).props.accessibilityState).toMatchObject({ busy: false });
  });
});
