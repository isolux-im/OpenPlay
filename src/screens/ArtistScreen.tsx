import { useRoute, type RouteProp } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';

import { Artwork } from '../components/Artwork';
import { Carousel, EmptyState, MediaCard, PlayShuffleButtons, SectionHeader } from '../components/Blocks';
import { ScrollScreen } from '../components/Screen';
import { TrackRow } from '../components/TrackRow';
import { pluralize } from '../library/text';
import { useAppNavigation } from '../navigation/ref';
import type { SharedStackParams } from '../navigation/types';
import { useLibrary } from '../store/library';
import { useUser } from '../store/user';
import { Text } from '../ui/Text';
import { GUTTER } from '../ui/theme';
import { ArtworkGlow, usePlayList } from './common';

export function ArtistScreen() {
  const { params } = useRoute<RouteProp<SharedStackParams, 'Artist'>>();
  const navigation = useAppNavigation();
  const index = useLibrary((s) => s.index);
  const playCounts = useUser((s) => s.playCounts);
  const artist = index.artistsById[params.id];
  const tracks = artist ? artist.trackIds.map((id) => index.byId[id]).filter(Boolean) : [];
  const { play, shuffle, playAt } = usePlayList(tracks, artist?.name ?? null);
  const top = [...tracks].sort((a, b) => (playCounts[b.id] ?? 0) - (playCounts[a.id] ?? 0)).slice(0, 5);
  const topPlay = usePlayList(top, artist ? `${artist.name} — Top titres` : null);
  const albums = artist ? artist.albumIds.map((id) => index.albumsById[id]).filter(Boolean).sort((a, b) => (b.year ?? 0) - (a.year ?? 0)) : [];

  if (!artist) return <ScrollScreen title="Artiste" back largeTitle={false}><EmptyState icon="person-outline" title="Artiste introuvable" /></ScrollScreen>;

  return (
    <ScrollScreen title={artist.name} back largeTitle={false} fullBleed titleThreshold={300}>
      <ArtworkGlow track={tracks[0]}>
        <View style={styles.hero}>
          <Artwork track={tracks[0]} size={200} circle shadow placeholderIcon="person" />
          <Text variant="title1" style={styles.center} numberOfLines={2}>
            {artist.name}
          </Text>
          <Text variant="subhead" tone="secondary">
            {pluralize(albums.length, 'album')} · {pluralize(tracks.length, 'morceau', 'morceaux')}
          </Text>
        </View>
        <PlayShuffleButtons onPlay={play} onShuffle={shuffle} />
      </ArtworkGlow>
      <SectionHeader title="Titres populaires" />
      {top.map((t, i) => (
        <TrackRow key={t.id} track={t} onPress={() => topPlay.playAt(i)} subtitle={t.album} />
      ))}
      {albums.length ? (
        <>
          <SectionHeader title="Albums" />
          <Carousel
            data={albums}
            keyOf={(a) => a.id}
            render={(a) => <MediaCard title={a.title} subtitle={a.year ? String(a.year) : pluralize(a.trackIds.length, 'morceau', 'morceaux')} track={index.byId[a.trackIds[0]]} onPress={() => navigation.push('Album', { id: a.id })} />}
          />
        </>
      ) : null}
      <SectionHeader title="Tous les titres" />
      {tracks.map((t, i) => (
        <TrackRow key={t.id} track={t} onPress={() => playAt(i)} subtitle={t.album} />
      ))}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 6, paddingTop: 12, paddingHorizontal: GUTTER },
  center: { textAlign: 'center', marginTop: 6 },
});
