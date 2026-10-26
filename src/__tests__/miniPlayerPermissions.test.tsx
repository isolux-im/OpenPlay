import { fireEvent, render, screen } from '@testing-library/react-native';

import { miniPlayerVisible } from '../navigation/TabBar';
import { MediaOnboardingScreen, needsMediaOnboarding, requestMediaAccess } from '../onboarding/MediaOnboarding';
import { useLibrary } from '../store/library';
import { useVideos } from '../store/videos';
import { ThemeProvider } from '../ui/theme';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

describe('visibilité du mini-lecteur musical', () => {
  it('suit l’onglet et la section, jamais la lecture ou la pause', () => {
    expect(miniPlayerVisible('HomeTab', 'Home', 'videos')).toBe(true);
    expect(miniPlayerVisible('HomeTab', 'Album', 'music')).toBe(true);
    expect(miniPlayerVisible('LibraryTab', 'Library', 'music')).toBe(true);
    expect(miniPlayerVisible('LibraryTab', undefined, 'music')).toBe(true);
    expect(miniPlayerVisible('LibraryTab', 'Library', 'videos')).toBe(false);
    // Sous-écrans musicaux de la Bibliothèque (Titres, À découvrir, Bilan…).
    expect(miniPlayerVisible('LibraryTab', 'Songs', 'music')).toBe(true);
    expect(miniPlayerVisible('LibraryTab', 'Discover', 'music')).toBe(true);
    expect(miniPlayerVisible('LibraryTab', 'Stats', 'music')).toBe(true);
    // Écrans vidéo, où qu'ils soient ouverts.
    for (const s of ['VideoFolder', 'VideoSeries', 'VideoStats']) {
      expect(miniPlayerVisible('LibraryTab', s, 'videos')).toBe(false);
      expect(miniPlayerVisible('HomeTab', s, 'music')).toBe(false);
    }
    for (const tab of ['SearchTab', 'PlaylistsTab', 'SettingsTab']) expect(miniPlayerVisible(tab, undefined, 'music')).toBe(false);
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
});
