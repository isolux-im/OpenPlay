import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '../../components/Glass';
import { audioQuality } from '../../library/text';
import { useLibrary } from '../../store/library';
import { PLAYBACK_RATES, usePlayer } from '../../store/player';
import { useSettings } from '../../store/settings';
import { useUi } from '../../store/ui';
import { tap } from '../../ui/haptics';
import { Icon, type IconName } from '../../ui/Icon';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';
import { useNow } from '../../ui/useNow';

function Option({ icon, label, detail, onPress, first }: { icon: IconName; label: string; detail?: string; onPress: () => void; first?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        tap('selection');
        onPress();
      }}
      style={({ pressed }) => [styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassSeparator }, pressed && { backgroundColor: colors.fill }]}
      accessibilityRole="menuitem"
      accessibilityLabel={label}>
      <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      {detail ? (
        <Text variant="footnote" tone="secondary">
          {detail}
        </Text>
      ) : null}
      <Icon name={icon} size={20} />
    </Pressable>
  );
}

/** Panneau vitré « … » du lecteur : paroles, playlist, minuterie de sommeil et qualité audio. */
export function PlayerOptionsHost() {
  const open = useUi((s) => s.playerOptions);
  // Monté à chaque ouverture : le détail « Qualité audio » repart replié.
  return open ? <OptionsPanel /> : null;
}

function OptionsPanel() {
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const { closeAll, setPlayerMode, openPlaylistPicker, openSleepSheet } = useUi.getState();
  const trackId = usePlayer((s) => s.queue[s.index]);
  const track = useLibrary((s) => (trackId ? s.index.byId[trackId] : undefined));
  const sleep = usePlayer((s) => s.sleep);
  const now = useNow(15_000);
  const [showQuality, setShowQuality] = useState(false);
  const rate = useSettings((s) => s.playbackRate);
  const setRate = usePlayer((s) => s.setRate);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeAll();
      return true;
    });
    return () => sub.remove();
  }, [closeAll]);

  if (!track) return null;
  const quality = audioQuality(track.mimeType, track.sizeBytes, track.durationSec);
  const sleepDetail = sleep.atTrackEnd ? 'Fin du titre' : sleep.endsAt ? `${Math.max(0, Math.round((sleep.endsAt - now) / 60000))} min` : undefined;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.14)' }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closeAll}
          accessibilityLabel="Fermer les options"
        />
      </Animated.View>
      <Animated.View entering={ZoomIn.duration(170)} exiting={ZoomOut.duration(120)} style={[styles.panel, { bottom: insets.bottom + 70 }]} accessibilityRole="menu" accessibilityViewIsModal>
        <Glass radius={22}>
          <Option first icon="chatbubble-ellipses-outline" label="Paroles" onPress={() => setPlayerMode('lyrics')} />
          <Option icon="add-circle-outline" label="Ajouter à une playlist" onPress={() => openPlaylistPicker([track.id])} />
          <Option icon="moon-outline" label="Minuterie de sommeil" detail={sleepDetail} onPress={openSleepSheet} />
          <View style={[styles.rates, { borderTopColor: colors.glassSeparator }]}>
            <Text variant="body">Vitesse de lecture</Text>
            <View style={styles.rateRow} accessibilityRole="radiogroup">
              {PLAYBACK_RATES.map((r) => {
                const on = r === rate;
                return (
                  <Pressable
                    key={r}
                    onPress={() => {
                      tap('selection');
                      setRate(r);
                    }}
                    style={[styles.rate, { backgroundColor: on ? colors.accent : colors.fill }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Vitesse ${formatRate(r)}`}>
                    <Text variant="footnote" weight="semibold" color={on ? colors.onAccent : colors.text}>
                      {formatRate(r)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Option icon="pulse-outline" label="Qualité audio" onPress={() => setShowQuality((v) => !v)} />
          {showQuality ? (
            <View style={[styles.quality, { borderTopColor: colors.glassSeparator }]}>
              {[
                ['Format', quality.format],
                ['Taille', quality.size],
                ['Débit moyen', quality.bitrate],
              ].map(([k, v]) => (
                <View key={k} style={styles.qualityRow}>
                  <Text variant="footnote" tone="secondary">
                    {k}
                  </Text>
                  <Text variant="footnote" weight="semibold">
                    {v}
                  </Text>
                </View>
              ))}
              <Text variant="caption" tone="tertiary" style={{ marginTop: 4 }}>
                Débit estimé à partir de la taille et de la durée du fichier.
              </Text>
            </View>
          ) : null}
        </Glass>
      </Animated.View>
    </View>
  );
}

/** « 1,25× » */
export function formatRate(rate: number): string {
  return `${rate.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}×`;
}

const styles = StyleSheet.create({
  rates: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  rateRow: { flexDirection: 'row', gap: 6 },
  rate: { flex: 1, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  panel: { position: 'absolute', right: 16, width: 280 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 48 },
  quality: { borderTopWidth: 6, paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
  qualityRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
