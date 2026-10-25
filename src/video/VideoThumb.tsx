import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { formatDuration } from '../library/text';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';
import { useVideoThumbnail } from './thumbnails';
import type { Video } from './types';

/** Miniature 16:9 avec durée et, si la vidéo est commencée, barre de progression. */
export function VideoThumb({ video, width, progress = 0, style }: { video: Video; width?: number; progress?: number; style?: StyleProp<ViewStyle> }) {
  const { colors, dark } = useTheme();
  const uri = useVideoThumbnail(video.id);
  const portrait = video.height > video.width * 1.1;
  return (
    <View style={[styles.box, width ? { width } : { width: '100%' }, { backgroundColor: dark ? '#26262A' : '#E4E4E8' }, style]}>
      {uri && portrait ? (
        <>
          {/* Vidéo verticale : image entière sur un fond flouté, plutôt qu'un recadrage serré. */}
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={18} recyclingKey={`${uri}-bg`} />
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} recyclingKey={uri} />
        </>
      ) : uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} recyclingKey={uri} />
      ) : (
        <View style={styles.center}>
          <Icon name="film-outline" size={26} color={colors.tertiaryText} />
        </View>
      )}
      {video.durationSec > 0 ? (
        <View style={styles.badge}>
          <Text variant="caption" weight="semibold" color="#FFFFFF" style={styles.badgeText}>
            {formatDuration(video.durationSec)}
          </Text>
        </View>
      ) : null}
      {progress > 0 ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(100, progress * 100)}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: 6, bottom: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.62)' },
  badgeText: { fontVariant: ['tabular-nums'] },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  fill: { height: 3, backgroundColor: '#FFFFFF' },
});
