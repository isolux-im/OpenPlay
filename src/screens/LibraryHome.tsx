import { MediaSwitcher } from '../components/MediaSwitcher';
import { useUi } from '../store/ui';
import { LibraryScreen } from './LibraryScreens';
import { VideosScreen } from './VideosScreen';

/**
 * Racine de l'onglet Bibliothèque : Musique (écran Bibliothèque existant) ou Vidéos (écran Vidéos existant),
 * au choix du sélecteur. Les deux écrans et leurs sous-écrans sont réutilisés tels quels.
 */
export function LibraryHome() {
  const section = useUi((s) => s.librarySection);
  const setSection = useUi((s) => s.setLibrarySection);
  const switcher = <MediaSwitcher value={section} onChange={setSection} />;
  return section === 'videos' ? <VideosScreen title="Bibliothèque" switcher={switcher} /> : <LibraryScreen switcher={switcher} />;
}
