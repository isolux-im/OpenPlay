import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { fallbackColors, useArtwork } from '../library/artwork';
import type { Track } from '../types';
import { Icon, type IconName } from '../ui/Icon';
import { radius as R } from '../ui/theme';

type Props = {
  track?: Pick<Track, 'id' | 'albumId'> | null;
  size?: number;
  rounded?: number;
  circle?: boolean;
  placeholderIcon?: IconName;
  style?: StyleProp<ViewStyle>;
  shadow?: boolean;
};

/** Pochette carrée (ou ronde pour les artistes) ; dégradé coloré quand le fichier n'en contient pas. */
export function Artwork({ track, size, rounded = R.md, circle = false, placeholderIcon = 'musical-notes', style, shadow = false }: Props) {
  const info = useArtwork(track ?? null);
  const dim = size ? { width: size, height: size } : { width: '100%' as const, aspectRatio: 1 };
  const r = circle ? 9999 : rounded;
  const colors = info?.colors ?? fallbackColors(track?.albumId || track?.id || 'openplay');
  const iconSize = Math.max(16, Math.round((size ?? 160) * 0.34));

  return (
    <View style={[dim, { borderRadius: r }, shadow && styles.shadow, style]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: r, overflow: 'hidden' }]}>
        {info?.uri && isSquareish(info.aspect) ? (
          <Image source={{ uri: info.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} recyclingKey={info.uri} />
        ) : info?.uri ? (
          <>
            {/* Image non carrée (vignette vidéo) : affichée en entier sur un fond flouté d'elle-même. */}
            <Image source={{ uri: info.uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={24} recyclingKey={`${info.uri}#bg`} />
            <View style={[StyleSheet.absoluteFill, styles.dim]} />
            <Image source={{ uri: info.uri }} style={StyleSheet.absoluteFill} contentFit="contain" transition={180} recyclingKey={info.uri} />
          </>
        ) : (
          <LinearGradient colors={[colors.vibrant, colors.dominant]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.center}>
            <Icon name={placeholderIcon} size={iconSize} color="rgba(255,255,255,0.82)" />
          </LinearGradient>
        )}
        <View style={[StyleSheet.absoluteFill, styles.hairline, { borderRadius: r }]} pointerEvents="none" />
      </View>
    </View>
  );
}

/** Mosaïque 2 × 2 pour les playlists (pochettes des quatre premiers albums distincts). */
export function Mosaic({ tracks, size, rounded = R.md, style }: { tracks: Pick<Track, 'id' | 'albumId'>[]; size?: number; rounded?: number; style?: StyleProp<ViewStyle> }) {
  const distinct: Pick<Track, 'id' | 'albumId'>[] = [];
  for (const t of tracks) {
    if (!distinct.some((d) => d.albumId === t.albumId)) distinct.push(t);
    if (distinct.length === 4) break;
  }
  if (distinct.length < 4) {
    return <Artwork track={distinct[0] ?? { id: 'playlist', albumId: 'playlist' }} size={size} rounded={rounded} placeholderIcon="list" style={style} />;
  }
  const dim = size ? { width: size, height: size } : { width: '100%' as const, aspectRatio: 1 };
  return (
    <View style={[dim, { borderRadius: rounded, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap' }, style]}>
      {distinct.map((t) => (
        <View key={t.albumId} style={{ width: '50%', height: '50%' }}>
          <Artwork track={t} rounded={0} style={{ width: '100%', height: '100%' }} />
        </View>
      ))}
    </View>
  );
}

/** Tolérance de 8 % : au-delà, l'image est montrée entière plutôt que recadrée. */
function isSquareish(aspect: number) {
  return Math.abs(aspect - 1) <= 0.08;
}

const styles = StyleSheet.create({
  dim: { backgroundColor: 'rgba(0,0,0,0.18)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hairline: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(128,128,128,0.25)' },
  shadow: {
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
});
