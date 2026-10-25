import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Artwork, Mosaic } from '../components/Artwork';
import { Carousel, MediaCard, SectionHeader } from '../components/Blocks';
import { PressableScale } from '../components/PressableScale';
import { HeaderButton, ScrollScreen } from '../components/Screen';
import { favoriteGenre, greeting, mostPlayed, recentlyAddedAlbums, recentlyPlayed, rediscover } from '../library/selectors';
import { formatDuration, pluralize } from '../library/text';
import { goToTab, useAppNavigation } from '../navigation/ref';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { useUser } from '../store/user';
import type { Track } from '../types';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';
import { useNow } from '../ui/useNow';
import { LibraryGate } from './LibraryGate';
import { shuffled } from '../player/queue';

function ResumeCard({ track, position, label }: { track: Track; position: number; label: string | null }) {
  const { colors } = useTheme();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const { toggle, setExpanded } = usePlayer.getState();
  const progress = track.durationSec > 0 ? Math.min(1, position / track.durationSec) : 0;
  return (
    <PressableScale onPress={() => setExpanded(true)} scaleTo={0.98} style={[styles.resume, { backgroundColor: colors.card }]} accessibilityRole="button" accessibilityLabel={`Reprendre ${track.title}`}>
      <Artwork track={track} size={84} rounded={14} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" tone="secondary">
          {isPlaying ? 'EN COURS' : 'REPRENDRE LA LECTURE'}
        </Text>
        <Text variant="headline" numberOfLines={1}>
          {track.title}
        </Text>
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {track.artist}
          {label ? ` · ${label}` : ''}
        </Text>
        <View style={[styles.resumeTrack, { backgroundColor: colors.fill }]}>
          <View style={[styles.resumeFill, { width: `${progress * 100}%`, backgroundColor: colors.text }]} />
        </View>
        <Text variant="caption" tone="tertiary">
          {formatDuration(position)} / {formatDuration(track.durationSec)}
        </Text>
      </View>
      <PressableScale haptic onPress={toggle} style={[styles.resumePlay, { backgroundColor: colors.accent }]} accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause' : 'Lecture'}>
        <Icon name={isPlaying ? 'pause' : 'play'} size={22} color={colors.onAccent} />
      </PressableScale>
    </PressableScale>
  );
}

type Mix = { key: string; title: string; subtitle: string; icon: IconName; tracks: Track[] };

function MixCard({ mix }: { mix: Mix }) {
  const { colors } = useTheme();
  const playTracks = usePlayer((s) => s.playTracks);
  return (
    <PressableScale
      haptic
      onPress={() => playTracks(mix.tracks.map((t) => t.id), 0, { label: mix.title })}
      style={[styles.mix, { backgroundColor: colors.card }]}
      accessibilityRole="button"
      accessibilityLabel={`Lancer ${mix.title}`}>
      <Mosaic tracks={mix.tracks} size={124} rounded={14} />
      <View style={styles.mixText}>
        <View style={{ flex: 1 }}>
          <Text variant="subhead" weight="semibold" numberOfLines={1}>
            {mix.title}
          </Text>
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {mix.subtitle}
          </Text>
        </View>
        <Icon name={mix.icon} size={17} color={colors.secondaryText} />
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
  const { openAlbumMenu, openPlaylistMenu, openTrackMenu } = useUi.getState();
  const now = useNow();

  const recent = useMemo(() => recentlyPlayed(history, index.byId, 15), [history, index.byId]);
  const added = useMemo(() => recentlyAddedAlbums(index, 15), [index]);
  const favTracks = useMemo(() => favorites.map((id) => index.byId[id]).filter(Boolean).slice(0, 15), [favorites, index.byId]);
  const albums = useMemo(() => shuffled(index.albums, seeded(index.albums.length)).slice(0, 15), [index.albums]);
  const mixes = useMemo<Mix[]>(() => {
    const out: Mix[] = [];
    const top = mostPlayed(playCounts, index.byId, 50);
    if (top.length >= 3) out.push({ key: 'top', title: 'Vos titres phares', subtitle: pluralize(top.length, 'morceau', 'morceaux'), icon: 'flame-outline', tracks: top });
    const genre = favoriteGenre(index, playCounts);
    if (genre) {
      const g = index.genresById[genre.toLowerCase()];
      if (g) out.push({ key: `genre-${genre}`, title: `Mix ${genre}`, subtitle: pluralize(g.trackIds.length, 'morceau', 'morceaux'), icon: 'radio-outline', tracks: shuffled(g.trackIds.map((id) => index.byId[id])) });
    }
    const re = rediscover(index, history, now, 30, 60);
    if (re.length >= 3) out.push({ key: 'rediscover', title: 'À redécouvrir', subtitle: 'Pas écoutés depuis 30 jours', icon: 'refresh-outline', tracks: shuffled(re) });
    if (index.tracks.length) out.push({ key: 'shuffle', title: 'Mix aléatoire', subtitle: 'Toute la bibliothèque', icon: 'shuffle-outline', tracks: shuffled(index.tracks).slice(0, 100) });
    return out;
  }, [index, playCounts, history, now]);

  return (
    <ScrollScreen title="Accueil" subtitle={greeting(now)} titleRight={<HeaderButton icon="person-outline" label="Paramètres" onPress={() => goToTab('SettingsTab')} />}>
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
              <Carousel data={mixes} keyOf={(m) => m.key} render={(m) => <MixCard mix={m} />} gap={12} />
            </>
          ) : null}

          {recent.length ? (
            <>
              <SectionHeader title="Écoutés récemment" onPress={() => navigation.navigate('History')} />
              <Carousel
                data={recent}
                keyOf={(t) => t.id}
                render={(t) => <MediaCard title={t.title} subtitle={t.artist} track={t} width={140} onPress={() => playTracks(recent.map((x) => x.id), recent.indexOf(t), { label: 'Écoutés récemment' })} onLongPress={(anchor) => openTrackMenu(t.id, {}, anchor)} />}
              />
            </>
          ) : null}

          {favTracks.length ? (
            <>
              <SectionHeader title="Vos favoris" onPress={() => navigation.navigate('Favorites')} />
              <Carousel
                data={favTracks}
                keyOf={(t) => t.id}
                render={(t) => <MediaCard title={t.title} subtitle={t.artist} track={t} width={140} onPress={() => playTracks(favTracks.map((x) => x.id), favTracks.indexOf(t), { label: 'Favoris' })} onLongPress={(anchor) => openTrackMenu(t.id, {}, anchor)} />}
              />
            </>
          ) : null}

          {added.length ? (
            <>
              <SectionHeader title="Ajoutés récemment" onPress={() => navigation.navigate('SmartPlaylist', { kind: 'recentlyAdded' })} />
              <Carousel data={added} keyOf={(a) => a.id} render={(a) => <MediaCard title={a.title} subtitle={a.artist} track={index.byId[a.trackIds[0]]} onPress={() => navigation.push('Album', { id: a.id })} onLongPress={(anchor) => openAlbumMenu(a.id, anchor)} />} />
            </>
          ) : null}

          {playlists.length ? (
            <>
              <SectionHeader title="Vos playlists" />
              <Carousel
                data={playlists}
                keyOf={(p) => p.id}
                render={(p) => <MediaCard title={p.name} subtitle={pluralize(p.trackIds.length, 'morceau', 'morceaux')} mosaic={p.trackIds.map((id) => index.byId[id]).filter(Boolean)} onPress={() => navigation.push('Playlist', { id: p.id })} onLongPress={(anchor) => openPlaylistMenu(p.id, anchor)} />}
              />
            </>
          ) : null}

          {albums.length ? (
            <>
              <SectionHeader title="Albums" onPress={() => navigation.navigate('Albums')} />
              <Carousel data={albums} keyOf={(a) => a.id} render={(a) => <MediaCard title={a.title} subtitle={a.artist} track={index.byId[a.trackIds[0]]} onPress={() => navigation.push('Album', { id: a.id })} onLongPress={(anchor) => openAlbumMenu(a.id, anchor)} />} />
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
  resume: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: radius.xl },
  resumeTrack: { height: 3, borderRadius: 2, marginTop: 6, marginBottom: 2, overflow: 'hidden' },
  resumeFill: { height: 3, borderRadius: 2 },
  resumePlay: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  mix: { width: 148, padding: 12, borderRadius: radius.xl, gap: 10 },
  mixText: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
