import { useRoute, type RouteProp } from '@react-navigation/native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Artwork } from '../components/Artwork';
import { Carousel, EmptyState, MediaCard, PlayShuffleButtons, SectionHeader } from '../components/Blocks';
import { HeaderButton, ScrollScreen } from '../components/Screen';
import { TrackRow } from '../components/TrackRow';
import { UNKNOWN_GENRE } from '../library/trackFromNative';
import { useAppNavigation } from '../navigation/ref';
import type { SharedStackParams } from '../navigation/types';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { Text } from '../ui/Text';
import { GUTTER } from '../ui/theme';
import { ArtworkGlow, CollectionHeader, collectionMeta, usePlayList } from './common';

export function AlbumScreen() {
  const { params } = useRoute<RouteProp<SharedStackParams, 'Album'>>();
  const navigation = useAppNavigation();
  const album = useLibrary((s) => s.index.albumsById[params.id]);
  const index = useLibrary((s) => s.index);
  const openPicker = useUi((s) => s.openPlaylistPicker);
  const openAlbumMenu = useUi((s) => s.openAlbumMenu);
  const tracks = album ? album.trackIds.map((id) => index.byId[id]).filter(Boolean) : [];
  const { playAt, play, shuffle } = usePlayList(tracks, album?.title ?? null);

  if (!album) return <ScrollScreen title="Album" back largeTitle={false}><EmptyState icon="albums-outline" title="Album introuvable" /></ScrollScreen>;

  const artistId = album.artist.toLowerCase();
  const genre = tracks[0]?.genre === UNKNOWN_GENRE ? undefined : tracks[0]?.genre;
  const more = (index.artistsById[artistId]?.albumIds ?? []).filter((id) => id !== album.id).map((id) => index.albumsById[id]).filter(Boolean);
  const multiDisc = new Set(tracks.map((t) => t.discNumber)).size > 1;

  return (
    <ScrollScreen
      title={album.title}
      back
      largeTitle={false}
      fullBleed
      titleThreshold={170}
      right={<HeaderButton icon="ellipsis-horizontal" label="Options de l'album" onPress={() => openAlbumMenu(album.id)} />}>
      <ArtworkGlow track={tracks[0]} height={360}>
        <CollectionHeader
          art={<Artwork track={tracks[0]} size={124} rounded={16} />}
          title={album.title}
          byline={
            <Pressable onPress={() => navigation.navigate('Artist', { id: artistId })} accessibilityRole="link" style={{ marginTop: 2 }}>
              <Text variant="subhead" weight="medium" numberOfLines={1}>
                {album.artist}
              </Text>
            </Pressable>
          }
          meta={[genre, album.year, collectionMeta(tracks)].filter(Boolean).join(' · ')}>
          <PlayShuffleButtons onPlay={play} onShuffle={shuffle} onAdd={() => openPicker(album.trackIds)} />
        </CollectionHeader>
      </ArtworkGlow>
      {tracks.map((t, i) => (
        <View key={t.id}>
          {multiDisc && (i === 0 || tracks[i - 1].discNumber !== t.discNumber) ? (
            <Text variant="overline" tone="secondary" style={styles.disc}>
              DISQUE {t.discNumber}
            </Text>
          ) : null}
          <TrackRow track={t} number={t.trackNumber || i + 1} onPress={() => playAt(i)} subtitle={t.artist !== album.artist ? t.artist : ''} showDuration />
        </View>
      ))}
      {more.length ? (
        <>
          <SectionHeader title={`Plus de ${album.artist}`} onPress={() => navigation.navigate('Artist', { id: artistId })} />
          <Carousel
            data={more}
            keyOf={(a) => a.id}
            render={(a) => <MediaCard title={a.title} subtitle={a.year ? String(a.year) : undefined} track={index.byId[a.trackIds[0]]} onPress={() => navigation.push('Album', { id: a.id })} />}
          />
        </>
      ) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  disc: { paddingHorizontal: GUTTER, paddingTop: 16, paddingBottom: 4 },
});
