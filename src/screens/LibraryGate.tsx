import type { ReactNode } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';

import { EmptyState } from '../components/Blocks';
import { BrandLogo } from '../components/BrandLogo';
import { useLibrary } from '../store/library';
import { useSettings } from '../store/settings';
import { useTheme } from '../ui/theme';

/** Affiche les états d'accès à la bibliothèque ; le contenu n'apparaît que lorsqu'elle est prête. */
export function LibraryGate({ children, emptyHint = true }: { children: ReactNode; emptyHint?: boolean }) {
  const { colors } = useTheme();
  const status = useLibrary((s) => s.status);
  const count = useLibrary((s) => s.index.tracks.length);
  const error = useLibrary((s) => s.error);
  const minDuration = useSettings((s) => s.minDurationSec);
  const { requestPermission, scan } = useLibrary.getState();

  if (status === 'checking' || (status === 'loading' && count === 0)) {
    return (
      <View style={{ paddingVertical: 80 }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (status === 'needs-permission') {
    return (
      <View style={{ paddingTop: 24 }}>
        <BrandLogo width={170} />
      <EmptyState
        icon="musical-notes"
        title="Votre musique, hors ligne"
        message="OpenPlay lit les fichiers audio de ce téléphone. Rien ne quitte votre appareil."
        action={{ label: "Autoriser l'accès à la musique", onPress: () => requestPermission(minDuration) }}
      />
      </View>
    );
  }
  if (status === 'denied') {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="Accès refusé"
        message="Autorisez « Musique et audio » dans les paramètres Android pour afficher vos audios."
        action={{ label: 'Ouvrir les paramètres', onPress: () => Linking.openSettings() }}
      />
    );
  }
  if (status === 'error') {
    return <EmptyState icon="alert-circle-outline" title="Lecture impossible" message={error ?? undefined} action={{ label: 'Réessayer', onPress: () => scan(minDuration) }} />;
  }
  if (count === 0 && emptyHint) {
    return (
      <EmptyState
        icon="musical-notes-outline"
        title="Aucune musique trouvée"
        message={`Copiez des fichiers audio (MP3, M4A, FLAC, OGG…) dans le dossier Musique du téléphone. Les fichiers de moins de ${minDuration} s sont ignorés.`}
        action={{ label: 'Analyser à nouveau', onPress: () => scan(minDuration) }}
      />
    );
  }
  return <>{children}</>;
}
