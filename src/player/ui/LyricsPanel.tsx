import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { useUi } from '../../store/ui';
import type { Track } from '../../types';
import { Text } from '../../ui/Text';
import { activeLineIndex } from '../lrc';
import { importLyricsFile, useLyrics } from '../lyricsSource';

type Props = { track: Track; position: number; onSeek: (sec: number) => void; textColor: string; dimColor: string };

export function LyricsPanel({ track, position, onSeek, textColor, dimColor }: Props) {
  const { lyrics, loading } = useLyrics(track);
  const showToast = useUi((s) => s.showToast);
  const scroll = useRef<ScrollViewInstance>(null);
  const offsets = useRef<number[]>([]);
  const active = useMemo(() => (lyrics?.synced ? activeLineIndex(lyrics.lines, position + 0.25) : -1), [lyrics, position]);

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

  if (!lyrics || lyrics.lines.length === 0) {
    return (
      <View style={styles.empty}>
        <Text variant="title3" color={textColor} style={styles.center}>
          {loading ? 'Recherche des paroles…' : 'Aucune parole disponible'}
        </Text>
        {!loading ? (
          <>
            <Text variant="subhead" color={dimColor} style={styles.center}>
              Placez un fichier .lrc portant le même nom que le morceau, ou importez-le.
            </Text>
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
    <ScrollView ref={scroll} style={styles.fill} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingVertical: 24 },
  line: { marginBottom: 18 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 12 },
  center: { textAlign: 'center' },
  button: { marginTop: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
});
