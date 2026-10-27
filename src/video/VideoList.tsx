import { useCallback, useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';

import { EmptyState } from '../components/Blocks';
import { PressableScale } from '../components/PressableScale';
import { ListScreen } from '../components/Screen';
import { formatDuration } from '../library/text';
import { useSettings } from '../store/settings';
import { useSelectable, useSelection } from '../store/selection';
import { useUi, type VideoPlaylistContext } from '../store/ui';
import { useVideoHistory } from '../store/videoHistory';
import { useVideoPlayer } from '../store/videoPlayer';
import { tap } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, useTheme } from '../ui/theme';
import { VideoThumb } from './VideoThumb';
import type { Video } from './types';

const GAP = 12;

export function formatSize(bytes: number): string {
  if (!bytes) return '';
  return bytes >= 1e9 ? `${(bytes / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go` : `${Math.round(bytes / 1e6)} Mo`;
}

/** Lecture et menu ; pendant une sélection, l'appui (court ou long) coche ou décoche la vidéo. */
function useVideoActions(video: Video, list: string[], playlist?: VideoPlaylistContext) {
  const open = useVideoPlayer((s) => s.open);
  const openMenu = useUi((s) => s.openVideoMenu);
  const selecting = useSelection((s) => s.kind === 'video');
  const checked = useSelection((s) => s.kind === 'video' && s.ids.includes(video.id));
  const toggle = () => {
    tap('selection');
    useSelection.getState().toggle(video.id);
  };
  return {
    selecting,
    checked,
    play: selecting ? toggle : () => open(video.id, list),
    menu: (e: GestureResponderEvent) => {
      if (selecting) return toggle();
      tap();
      openMenu(video.id, list, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }, playlist);
    },
  };
}

function Check({ checked, overlay }: { checked: boolean; overlay?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={overlay ? styles.checkOverlay : styles.more}>
      <Icon name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={checked ? colors.accent : overlay ? '#FFFFFF' : colors.tertiaryText} />
    </View>
  );
}

function useProgress(video: Video): number {
  const entry = useVideoHistory((s) => s.entries[video.id]);
  if (!entry || entry.finished || !video.durationSec) return 0;
  return entry.positionSec / video.durationSec;
}

function GridItem({ video, list, width }: { video: Video; list: string[]; width: number }) {
  const { play, menu, selecting, checked } = useVideoActions(video, list);
  const progress = useProgress(video);
  return (
    <PressableScale
      onPress={play}
      onLongPress={menu}
      delayLongPress={320}
      scaleTo={0.97}
      style={{ width }}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityState={selecting ? { checked } : undefined}
      accessibilityLabel={selecting ? video.title : `Lire ${video.title}, ${formatDuration(video.durationSec)}`}>
      <View>
        <VideoThumb video={video} progress={progress} />
        {selecting ? <Check checked={checked} overlay /> : null}
      </View>
      <Text variant="subhead" weight="semibold" numberOfLines={2} style={styles.gridTitle}>
        {video.title}
      </Text>
      <Text variant="caption" tone="secondary" numberOfLines={1}>
        {[formatSize(video.sizeBytes), video.folder.split('/').pop()].filter(Boolean).join(' · ')}
      </Text>
    </PressableScale>
  );
}

/** Ligne de vidéo (vignette, titre, détails) ; `subtitle` remplace la ligne de détails, `watched` ajoute une coche. */
export function VideoRow(props: { video: Video; list: string[]; label?: string; title?: string; subtitle?: string; watched?: boolean; playlist?: VideoPlaylistContext }) {
  return <ListItem {...props} />;
}

function ListItem({ video, list, label, title, subtitle, watched, playlist }: { video: Video; list: string[]; label?: string; title?: string; subtitle?: string; watched?: boolean; playlist?: VideoPlaylistContext }) {
  const { colors } = useTheme();
  const { play, menu, selecting, checked } = useVideoActions(video, list, playlist);
  const progress = useProgress(video);
  return (
    <Pressable
      onPress={play}
      onLongPress={menu}
      delayLongPress={320}
      android_ripple={{ color: colors.fill }}
      style={({ pressed }) => [styles.row, (pressed || checked) && { backgroundColor: colors.fill }]}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityState={selecting ? { checked } : undefined}
      accessibilityLabel={selecting ? video.title : `Lire ${video.title}, ${formatDuration(video.durationSec)}`}>
      <VideoThumb video={video} width={128} progress={progress} />
      <View style={styles.rowText}>
        {label ? (
          <Text variant="caption" weight="semibold" tone="secondary">
            {label}
          </Text>
        ) : null}
        <Text variant="callout" weight="medium" numberOfLines={2}>
          {title ?? video.title}
        </Text>
        <View style={styles.rowMeta}>
          {watched ? <Icon name="checkmark-circle" size={15} color={colors.secondaryText} /> : null}
          <Text variant="footnote" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
            {subtitle ?? [formatSize(video.sizeBytes), new Date(video.addedAt).toLocaleDateString('fr-FR')].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      {selecting ? (
        <Check checked={checked} />
      ) : (
        <Pressable onPress={menu} hitSlop={10} style={styles.more} accessibilityRole="button" accessibilityLabel={`Options pour ${video.title}`}>
          <Icon name="ellipsis-vertical" size={18} color={colors.secondaryText} />
        </Pressable>
      )}
    </Pressable>
  );
}

type Props = {
  title: string;
  videos: Video[];
  back?: boolean;
  header?: ReactNode;
  titleRight?: ReactNode;
  emptyTitle?: string;
  emptyMessage?: string;
};

/** Liste de vidéos en grille (deux colonnes) ou en liste, selon le réglage. */
export function VideoList({ title, videos, back, header, titleRight, emptyTitle = 'Aucune vidéo', emptyMessage }: Props) {
  const layout = useSettings((s) => s.videoLayout);
  const { width } = useWindowDimensions();
  const cell = (width - GUTTER * 2 - GAP) / 2;
  const ids = useMemo(() => videos.map((v) => v.id), [videos]);
  useSelectable('video', ids);
  const renderGrid = useCallback(({ item }: { item: Video }) => <GridItem video={item} list={ids} width={cell} />, [ids, cell]);
  const renderList = useCallback(({ item }: { item: Video }) => <ListItem video={item} list={ids} />, [ids]);
  return (
    <ListScreen
      key={layout}
      title={title}
      back={back}
      titleRight={titleRight}
      header={header}
      data={videos}
      keyExtractor={(v) => v.id}
      numColumns={layout === 'grid' ? 2 : 1}
      columnWrapperStyle={layout === 'grid' ? styles.columns : undefined}
      renderItem={layout === 'grid' ? renderGrid : renderList}
      initialNumToRender={10}
      windowSize={7}
      ListEmptyComponent={<EmptyState icon="film-outline" title={emptyTitle} message={emptyMessage} />}
    />
  );
}

const styles = StyleSheet.create({
  columns: { paddingHorizontal: GUTTER, gap: GAP, marginBottom: 18 },
  gridTitle: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: GUTTER, paddingVertical: 8 },
  rowText: { flex: 1, gap: 4 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  more: { paddingLeft: 4, paddingVertical: 8 },
  checkOverlay: { position: 'absolute', top: 6, right: 6, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.35)' },
});
