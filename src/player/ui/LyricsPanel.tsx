import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { PROVIDERS, isAiLyrics } from '../../lyrics/transcription';
import { useOnlineLyrics } from '../../store/onlineLyrics';
import { useSettings } from '../../store/settings';
import { useTranscription } from '../../store/transcription';
import { useUi } from '../../store/ui';
import { useUser } from '../../store/user';
import type { Track } from '../../types';
import { Text } from '../../ui/Text';
import { activeLineIndex } from '../lrc';
import { importLyricsFile, useLyrics } from '../lyricsSource';

type Props = { track: Track; position: number; onSeek: (sec: number) => void; textColor: string; dimColor: string };

/** Bouton principal « Transcrire » : fond #111111, texte blanc, sans icône, lisible sur fond clair comme sombre. */
export function TranscribeButton({ onPress, loading = false, disabled = false, onDark }: { onPress: () => void; loading?: boolean; disabled?: boolean; onDark: boolean }) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        styles.transcribe,
        // Liseré clair sur fond sombre, pour que la pastille se détache.
        onDark && styles.transcribeOnDark,
        pressed && !inactive && styles.transcribePressed,
        disabled && !loading && styles.transcribeDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Transcrire"
      accessibilityState={{ disabled: inactive, busy: loading }}>
      {loading ? <ActivityIndicator color="#FFFFFF" size="small" style={styles.spinner} /> : null}
      <Text variant="headline" color="#FFFFFF" style={[styles.center, loading && styles.hidden]}>
        Transcrire
      </Text>
    </Pressable>
  );
}

export function LyricsPanel({ track, position, onSeek, textColor, dimColor }: Props) {
  const { lyrics, loading, source, online } = useLyrics(track);
  const showToast = useUi((s) => s.showToast);
  const job = useTranscription((s) => s.jobs[track.id]);
  const { start, cancel, clearError } = useTranscription.getState();
  const provider = useSettings((s) => PROVIDERS[s.aiProvider]);
  const raw = useUser((s) => s.lyrics[track.id]);
  const fromAi = isAiLyrics(raw);
  const setLyrics = useUser((s) => s.setLyrics);
  const [confirming, setConfirming] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const offsets = useRef<number[]>([]);
  const active = useMemo(() => (lyrics?.synced ? activeLineIndex(lyrics.lines, position + 0.25) : -1), [lyrics, position]);
  const onDark = textColor.toUpperCase() === '#FFFFFF';

  useEffect(() => {
    if (active >= 0 && offsets.current[active] !== undefined) {
      scroll.current?.scrollTo({ y: Math.max(0, offsets.current[active] - 120), animated: true });
    }
  }, [active]);

  const importFile = async () => {
    try {
      if (await importLyricsFile(track.id)) showToast('Paroles importées');
    } catch {
      showToast("Impossible de lire ce fichier");
    }
  };

  // Jamais automatique : l'utilisateur est prévenu de l'envoi du fichier avant chaque transcription.
  const transcribe = () => {
    if (job?.status === 'running' || confirming) return;
    setConfirming(true);
    const size = track.sizeBytes > 0 ? ` (${(track.sizeBytes / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo)` : '';
    Alert.alert(
      'Transcrire ce morceau ?',
      `Le fichier « ${track.title} »${size} sera envoyé à ${provider.label} pour être analysé (Internet requis). Le résultat est une transcription automatique, à vérifier.`,
      [
        { text: 'Annuler', style: 'cancel', onPress: () => setConfirming(false) },
        {
          text: 'Transcrire',
          onPress: async () => {
            setConfirming(false);
            if (await start(track)) showToast('Paroles transcrites');
          },
        },
      ],
      { cancelable: true, onDismiss: () => setConfirming(false) },
    );
  };

  if (job?.status === 'running') {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={textColor} />
        <Text variant="title3" color={textColor} style={styles.center}>
          Transcription en cours…
        </Text>
        <Text variant="subhead" color={dimColor} style={styles.center}>
          Envoi du morceau puis analyse par {provider.label}. La lecture continue ; vous pouvez quitter cet écran.
        </Text>
        <Pressable onPress={() => cancel(track.id)} style={[styles.button, { borderColor: dimColor }]} accessibilityRole="button">
          <Text variant="headline" color={textColor}>
            Annuler
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!lyrics || lyrics.lines.length === 0) {
    const instrumental = online?.status === 'done' && online.result.kind === 'instrumental';
    const onlineError = online?.status === 'error' ? online : null;
    const title = loading ? 'Recherche des paroles…' : instrumental ? 'Morceau instrumental' : online?.status === 'done' ? 'Aucune parole trouvée' : 'Aucune parole disponible';
    return (
      <View style={styles.empty}>
        {loading ? <ActivityIndicator color={textColor} /> : null}
        <Text variant="title3" color={textColor} style={styles.center}>
          {title}
        </Text>
        {!loading ? (
          <>
            {job?.status === 'error' ? (
              <Pressable onPress={() => clearError(track.id)} accessibilityRole="button" accessibilityLabel="Masquer l'erreur">
                <Text variant="subhead" color={textColor} style={[styles.center, styles.error]}>
                  {job.message}
                </Text>
              </Pressable>
            ) : onlineError ? (
              <>
                <Text variant="subhead" color={textColor} style={[styles.center, styles.error]}>
                  Recherche en ligne impossible. {onlineError.message}
                </Text>
                {onlineError.retryable ? (
                  <Pressable onPress={() => useOnlineLyrics.getState().retry(track)} style={[styles.button, { borderColor: dimColor }]} accessibilityRole="button">
                    <Text variant="headline" color={textColor}>
                      Réessayer
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <Text variant="subhead" color={dimColor} style={styles.center}>
                {instrumental
                  ? 'LRCLIB indique un morceau sans paroles.'
                  : 'Vous pouvez faire transcrire le morceau (Internet requis) ou importer un fichier .lrc.'}
              </Text>
            )}
            <TranscribeButton onPress={transcribe} loading={confirming} onDark={onDark} />
            <Pressable onPress={importFile} style={[styles.button, { borderColor: dimColor }]} accessibilityRole="button">
              <Text variant="headline" color={textColor}>
                Importer un fichier .lrc
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      {fromAi ? (
        <View style={styles.aiBar}>
          <Text variant="footnote" color={dimColor} style={{ flex: 1 }}>
            Transcription automatique — à vérifier
          </Text>
          <Pressable onPress={transcribe} hitSlop={8} accessibilityRole="button">
            <Text variant="footnote" weight="semibold" color={textColor}>
              Refaire
            </Text>
          </Pressable>
          <Pressable onPress={() => setLyrics(track.id, null)} hitSlop={8} accessibilityRole="button">
            <Text variant="footnote" weight="semibold" color={textColor}>
              Effacer
            </Text>
          </Pressable>
        </View>
      ) : null}
    <ScrollView ref={scroll} style={styles.fill} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {source === 'lrclib' ? (
        <Text variant="footnote" color={dimColor} style={styles.credit}>
          Paroles : LRCLIB{lyrics.synced ? '' : ' (non synchronisées)'}
        </Text>
      ) : null}
      {lyrics.lines.map((line, i) => {
        const isActive = i === active;
        return (
          <Pressable
            key={`${i}-${line.timeSec}`}
            disabled={!lyrics.synced}
            onPress={() => line.timeSec !== null && onSeek(line.timeSec)}
            onLayout={(e) => {
              offsets.current[i] = e.nativeEvent.layout.y;
            }}>
            <Text
              variant={lyrics.synced ? 'title1' : 'title3'}
              color={!lyrics.synced || isActive ? textColor : dimColor}
              style={[styles.line, lyrics.synced && !isActive && { opacity: i < active ? 0.45 : 0.6 }]}>
              {line.text || '♪'}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingVertical: 24 },
  line: { marginBottom: 18 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 12 },
  center: { textAlign: 'center' },
  button: { marginTop: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
  transcribe: { borderWidth: 0, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center' },
  transcribeOnDark: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  transcribePressed: { backgroundColor: '#2C2C2E' },
  transcribeDisabled: { opacity: 0.45 },
  spinner: { position: 'absolute' },
  hidden: { opacity: 0 },
  credit: { marginBottom: 16 },
  error: { fontWeight: '600' },
  aiBar: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 8 },
});
