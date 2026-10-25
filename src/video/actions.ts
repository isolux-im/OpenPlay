import { Platform, Share } from 'react-native';

import { OpenPlayMedia } from '../../modules/openplay-media';
import { useUi } from '../store/ui';
import type { Video } from './types';

/** Partage le fichier vidéo (feuille de partage Android) ; à défaut, son titre. */
export async function shareVideo(video: Video) {
  try {
    if (Platform.OS === 'android' && OpenPlayMedia?.shareVideoAsync) await OpenPlayMedia.shareVideoAsync(video.id, video.mimeType, video.title);
    else await Share.share({ title: video.title, message: video.title });
  } catch {
    useUi.getState().showToast('Partage impossible');
  }
}

/** Propose une autre application pour lire la vidéo. */
export async function openVideoWith(video: Video) {
  try {
    if (Platform.OS === 'android' && OpenPlayMedia?.openVideoWithAsync) await OpenPlayMedia.openVideoWithAsync(video.id, video.mimeType, video.title);
    else useUi.getState().showToast('Disponible sur Android uniquement');
  } catch {
    useUi.getState().showToast('Aucune application pour ouvrir cette vidéo');
  }
}
