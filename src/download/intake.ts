import { useEffect } from 'react';

import { OpenPlayMedia } from '../../modules/openplay-media';
import { navigationRef } from '../navigation/ref';
import { useDownloads } from '../store/downloads';
import { useUi } from '../store/ui';
import { extractUrl } from './link';

/** Ouvre Recherche › Télécharger par lien avec le lien partagé (analyse seulement ; rien n'est téléchargé d'office). */
export function openSharedText(text: string, attempt = 0) {
  const url = extractUrl(text);
  if (!url) {
    useUi.getState().showToast('Aucun lien trouvé dans le texte partagé');
    return;
  }
  if (!navigationRef.isReady()) {
    if (attempt < 40) setTimeout(() => openSharedText(text, attempt + 1), 250);
    return;
  }
  (navigationRef.navigate as (name: string, p: object) => void)('SearchTab', { screen: 'DownloadLink', params: { url } });
}

/** Au lancement : liens reçus par « Partager », reprise de la file de téléchargements. */
export function useDownloadIntake() {
  useEffect(() => {
    const reconcile = () => void useDownloads.getState().reconcile();
    const unsubscribe = useDownloads.persist.hasHydrated() ? (reconcile(), undefined) : useDownloads.persist.onFinishHydration(reconcile);
    void OpenPlayMedia?.getSharedTextAsync?.().then((text) => text && openSharedText(text)).catch(() => undefined);
    const sub = OpenPlayMedia?.addListener?.('onSharedText', (e) => openSharedText(e.text));
    return () => {
      unsubscribe?.();
      sub?.remove();
    };
  }, []);
}
