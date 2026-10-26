import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo } from '../components/BrandLogo';
import { PressableScale } from '../components/PressableScale';
import { audioAccess, useLibrary } from '../store/library';
import { useSettings } from '../store/settings';
import { useVideos, videoAccess } from '../store/videos';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';

type Access = 'granted' | 'denied' | 'undetermined';

/**
 * Accueil des autorisations présenté une seule fois : à la première installation, ou après une mise à
 * jour s'il manque l'accès audio ou vidéo. Jamais quand les deux sont déjà accordés.
 */
export function needsMediaOnboarding({ done, demo, audio, video }: { done: boolean; demo: boolean; audio: Access; video: Access }): boolean {
  return !done && !demo && (audio !== 'granted' || video !== 'granted');
}

/**
 * Demandes Android réelles, l'une après l'autre (audio puis vidéo) : chaque bibliothèque connaît ainsi
 * sa propre réponse. Un accès déjà accordé n'affiche aucune fenêtre système.
 */
export async function requestMediaAccess() {
  await useLibrary.getState().requestPermission(useSettings.getState().minDurationSec);
  await useVideos.getState().requestPermission();
}

function Point({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.point}>
      <View style={[styles.pointIcon, { backgroundColor: colors.fill }]}>
        <Icon name={icon} size={20} color={colors.text} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline">{title}</Text>
        <Text variant="subhead" tone="secondary">
          {text}
        </Text>
      </View>
    </View>
  );
}

/** Écran d'explication ; les fenêtres d'autorisation sont celles d'Android, ouvertes après « Continuer ». */
export function MediaOnboardingScreen({ onContinue, onLater }: { onContinue: () => Promise<void>; onLater: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy) onLater();
      return true;
    });
    return () => sub.remove();
  }, [busy, onLater]);

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={[styles.root, { backgroundColor: colors.background }]} accessibilityViewIsModal>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
        <BrandLogo width={150} />
        <Text variant="title1" weight="bold" style={styles.title} accessibilityRole="header">
          Autoriser l’accès à vos médias
        </Text>
        <Text variant="body" tone="secondary" style={styles.lead}>
          OpenPlay utilise les fichiers audio et vidéo de votre téléphone pour vous permettre d’écouter vos musiques et de regarder vos vidéos hors ligne.
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Point icon="musical-notes" title="Musique et audio" text="Vos MP3, M4A, FLAC… pour la bibliothèque musicale." />
          <View style={[styles.sep, { backgroundColor: colors.separator }]} />
          <Point icon="film" title="Vidéos" text="Vos MP4 et autres vidéos. Android peut vous proposer de n’en autoriser qu’une partie." />
        </View>
        <Text variant="footnote" tone="secondary" style={styles.note}>
          Android affiche ensuite ses propres fenêtres d’autorisation. Les fichiers restent sur l’appareil : rien n’est envoyé pendant l’analyse. Vous pourrez modifier ces accès à tout moment dans les paramètres d’Android.
        </Text>
        <PressableScale
          onPress={async () => {
            if (busy) return;
            setBusy(true);
            try {
              await onContinue();
            } finally {
              setBusy(false);
            }
          }}
          style={[styles.primary, { backgroundColor: colors.accent }]}
          accessibilityRole="button"
          accessibilityLabel="Continuer"
          accessibilityState={{ busy }}>
          {busy ? <ActivityIndicator color={colors.onAccent} /> : (
            <Text variant="headline" color={colors.onAccent}>
              Continuer
            </Text>
          )}
        </PressableScale>
        <Pressable onPress={onLater} disabled={busy} hitSlop={8} style={styles.secondary} accessibilityRole="button" accessibilityLabel="Plus tard">
          <Text variant="body" tone="secondary">
            Plus tard
          </Text>
        </Pressable>
      </ScrollView>
    </Animated.View>
  );
}

/** Affiche l'accueil des autorisations au lancement quand c'est nécessaire (une seule fois). */
export function MediaOnboardingHost() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const done = useSettings.getState().mediaOnboarded;
      if (done) return;
      const demo = useLibrary.getState().isDemo;
      try {
        const [audio, video] = await Promise.all([audioAccess(false), videoAccess(false)]);
        if (!alive) return;
        if (needsMediaOnboarding({ done, demo, audio, video: video.status })) setVisible(true);
        // Les deux accès existent déjà (mise à jour) : rien à présenter.
        else useSettings.getState().update({ mediaOnboarded: true });
      } catch {
        // Vérification impossible : les écrans Musique et Vidéos proposent toujours l'autorisation.
      }
    };
    if (useSettings.persist.hasHydrated()) void check();
    else return useSettings.persist.onFinishHydration(() => void check());
    return () => {
      alive = false;
    };
  }, []);

  if (!visible) return null;
  const finish = () => {
    useSettings.getState().update({ mediaOnboarded: true });
    setVisible(false);
  };
  return (
    <MediaOnboardingScreen
      onContinue={async () => {
        await requestMediaAccess();
        finish();
      }}
      onLater={finish}
    />
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 400, elevation: 60 },
  content: { paddingHorizontal: GUTTER + 8, gap: 16 },
  title: { textAlign: 'center', marginTop: 8 },
  lead: { textAlign: 'center' },
  card: { borderRadius: radius.lg, padding: 16, gap: 14 },
  point: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  pointIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 54 },
  note: { textAlign: 'center' },
  primary: { height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  secondary: { alignSelf: 'center', paddingVertical: 10 },
});
