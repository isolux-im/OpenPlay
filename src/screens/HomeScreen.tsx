import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Artwork } from '../components/Artwork';
import { Carousel, MediaCard, SectionHeader } from '../components/Blocks';
import { PressableScale } from '../components/PressableScale';
import { ScrollScreen } from '../components/Screen';
import { fallbackColors, useArtwork } from '../library/artwork';
import { favoriteGenre, greeting, mostPlayed, recentlyAddedAlbums, recentlyPlayed, rediscover } from '../library/selectors';
import { formatDuration, pluralize } from '../library/text';
import { useAppNavigation } from '../navigation/ref';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUser } from '../store/user';
import type { Track } from '../types';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius } from '../ui/theme';
import { useNow } from '../ui/useNow';
import { LibraryGate } from './LibraryGate';
import { shuffled } from '../player/queue';

function ResumeCard({ track, position, label }: { track: Track; position: number; label: string | null }) {
  const art = useArtwork(track);
  const colors = art?.colors ?? fallbackColors(track.albumId);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const { toggle, setExpanded } = usePlayer.getState();
  return (
    <PressableScale onPress={() => setExpanded(true)} style={styles.resume} accessibilityRole="button" accessibilityLabel={`Reprendre ${track.title}`}>
      <LinearGradient colors={[colors.vibrant, colors.darkMuted]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.xl }]} />
      <Artwork track={track} size={96} rounded={10} shadow />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="overline" color="rgba(255,255,255,0.75)">
          {isPlaying ? 'EN COURS' : 'REPRENDRE LA LECTURE'}
        </Text>
        <Text variant="title3" color="#FFFFFF" numberOfLines={1}>
          {track.title}
        </Text>
        <Text variant="subhead" color="rgba(255,255,255,0.8)" numberOfLines={1}>
          {track.artist}
          {label ? ` · ${label}` : ''}
        </Text>
        <Text variant="caption" color="rgba(255,255,255,0.65)">
          {formatDuration(position)} / {formatDuration(track.durationSec)}
        </Text>
      </View>
      <PressableScale haptic onPress={toggle} style={styles.resumePlay} accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause' : 'Lecture'}>
        <Icon name={isPlaying ? 'pause' : 'play'} size={26} color="#000000" />
      </PressableScale>
    </PressableScale>
  );
}

type Mix = { key: string; title: string; subtitle: string; icon: IconName; tracks: Track[] };

function MixCard({ mix }: { mix: Mix }) {
  const playTracks = usePlayer((s) => s.playTracks);
  const c = fallbackColors(`mix:${mix.key}`);
  return (
    <PressableScale
      haptic
      onPress={() => playTracks(mix.tracks.map((t) => t.id), 0, { label: mix.title })}
      style={styles.mix}
      accessibilityRole="button"
      accessibilityLabel={`Lancer ${mix.title}`}>
      <LinearGradient colors={[c.vibrant, c.darkMuted]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]} />
      <Icon name={mix.icon} size={28} color="#FFFFFF" />
      <View>
        <Text variant="headline" color="#FFFFFF" numberOfLines={2}>
          {mix.title}
        </Text>
        <Text variant="footnote" color="rgba(255,255,255,0.8)" numberOfLines={1}>
          {mix.subtitle}
        </Text>
      </View>
    </PressableScale>
  );
}

export function HomeScreen() {
  const navigation = useAppNavigation();
  const index = useLibrary((s) => s.index);
  const history = useUser((s) => s.history);
  const favorites = useUser((s) => s.favorites);
  const playlists = useUser((s) => s.playlists);
  const playCounts = useUser((s) => s.playCounts);
  const currentId = usePlayer((s) => s.queue[s.index]);
  const position = usePlayer((s) => s.positionSec);
  const sourceLabel = usePlayer((s) => s.sourceLabel);
  const playTracks = usePlayer((s) => s.playTracks);
  const current = currentId ? index.byId[currentId] : undefined;
  const now = useNow();

  const recent = useMemo(() => recentlyPlayed(history, index.byId, 15), [history, index.byId]);
  const added = useMemo(() => recentlyAddedAlbums(index, 15), [index]);
  const favTracks = useMemo(() => favorites.map((id) => index.byId[id]).filter(Boolean).slice(0, 15), [favorites, index.byId]);
  const albums = useMemo(() => shuffled(index.albums, seeded(index.albums.length)).slice(0, 15), [index.albums]);
  const mixes = useMemo<Mix[]>(() => {
    const out: Mix[] = [];
    const top = mostPlayed(playCounts, index.byId, 50);
    if (top.length >= 3) out.push({ key: 'top', title: 'Vos titres phares', subtitle: pluralize(top.length, 'morceau', 'morceaux'), icon: 'flame', tracks: top });
    const genre = favoriteGenre(index, playCounts);
    if (genre) {
      const g = index.genresById[genre.toLowerCase()];
      if (g) out.push({ key: `genre-${genre}`, title: `Mix ${genre}`, subtitle: pluralize(g.trackIds.length, 'morceau', 'morceaux'), icon: 'radio', tracks: shuffled(g.trackIds.map((id) => index.byId[id])) });
    }
    const re = rediscover(index, history, now, 30, 60);
    if (re.length >= 3) out.push({ key: 'rediscover', title: 'À redécouvrir', subtitle: 'Pas écoutés depuis 30 jours', icon: 'refresh', tracks: shuffled(re) });
    if (index.tracks.length) out.push({ key: 'shuffle', title: 'Mix aléatoire', subtitle: 'Toute la bibliothèque', icon: 'shuffle', tracks: shuffled(index.tracks).slice(0, 100) });
    return out;
  }, [index, playCounts, history, now]);

  return (
    <ScrollScreen title="Accueil" subtitle={greeting(now)}>
      <LibraryGate>
        <Animated.View entering={FadeIn.duration(300)}>
          {current ? (
            <View style={{ paddingHorizontal: GUTTER, marginTop: 4 }}>
              <ResumeCard track={current} position={position} label={sourceLabel} />
            </View>
          ) : null}

          {mixes.length ? (
            <>
              <SectionHeader title="Mix pour vous" />
              <Carousel data={mixes} keyOf={(m) => m.key} render={(m) => <MixCard mix={m} />} />
            </>
          ) : null}

          {recent.length ? (
            <>
              <SectionHeader title="Écoutés récemment" onPress={() => navigation.navigate('History')} />
              <Carousel
                data={recent}
                keyOf={(t) => t.id}
                render={(t) => <MediaCard title={t.title} subtitle={t.artist} track={t} width={140} onPress={() => playTracks(recent.map((x) => x.id), recent.indexOf(t), { label: 'Écoutés récemment' })} />}
              />
            </>
          ) : null}

          {favTracks.length ? (
            <>
              <SectionHeader title="Vos favoris" onPress={() => navigation.navigate('Favorites')} />
              <Carousel
                data={favTracks}
                keyOf={(t) => t.id}
                render={(t) => <MediaCard title={t.title} subtitle={t.artist} track={t} width={140} onPress={() => playTracks(favTracks.map((x) => x.id), favTracks.indexOf(t), { label: 'Favoris' })} />}
              />
            </>
          ) : null}

          {added.length ? (
            <>
              <SectionHeader title="Ajoutés récemment" onPress={() => navigation.navigate('SmartPlaylist', { kind: 'recentlyAdded' })} />
              <Carousel data={added} keyOf={(a) => a.id} render={(a) => <MediaCard title={a.title} subtitle={a.artist} track={index.byId[a.trackIds[0]]} onPress={() => navigation.push('Album', { id: a.id })} />} />
            </>
          ) : null}

          {playlists.length ? (
            <>
              <SectionHeader title="Vos playlists" />
              <Carousel
                data={playlists}
                keyOf={(p) => p.id}
                render={(p) => <MediaCard title={p.name} subtitle={pluralize(p.trackIds.length, 'morceau', 'morceaux')} mosaic={p.trackIds.map((id) => index.byId[id]).filter(Boolean)} onPress={() => navigation.push('Playlist', { id: p.id })} />}
              />
            </>
          ) : null}

          {albums.length ? (
            <>
              <SectionHeader title="Albums" onPress={() => navigation.navigate('Albums')} />
              <Carousel data={albums} keyOf={(a) => a.id} render={(a) => <MediaCard title={a.title} subtitle={a.artist} track={index.byId[a.trackIds[0]]} onPress={() => navigation.push('Album', { id: a.id })} />} />
            </>
          ) : null}
        </Animated.View>
      </LibraryGate>
    </ScrollScreen>
  );
}

/** Générateur pseudo-aléatoire stable (même ordre d'albums tant que la bibliothèque ne change pas). */
function seeded(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const styles = StyleSheet.create({
  resume: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.xl, overflow: 'hidden' },
  resumePlay: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  mix: { width: 160, height: 190, borderRadius: radius.lg, padding: 14, justifyContent: 'space-between', overflow: 'hidden' },
});
