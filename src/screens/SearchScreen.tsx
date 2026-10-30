import { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Artwork } from '../components/Artwork';
import { Carousel, EmptyState, MediaCard, SectionHeader } from '../components/Blocks';
import { PressableScale } from '../components/PressableScale';
import { ScrollScreen } from '../components/Screen';
import { TrackRow } from '../components/TrackRow';
import { searchLibrary } from '../library/search';
import { pluralize } from '../library/text';
import { useAppNavigation } from '../navigation/ref';
import { useDownloads } from '../store/downloads';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';
import { useUser } from '../store/user';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';
import { GenreTile } from './LibraryScreens';
import { LibraryGate } from './LibraryGate';

export function SearchScreen() {
  const navigation = useAppNavigation();
  const { colors } = useTheme();
  const index = useLibrary((s) => s.index);
  const playlists = useUser((s) => s.playlists);
  const recentSearches = useUser((s) => s.recentSearches);
  const { addRecentSearch, clearRecentSearches } = useUser.getState();
  const playTracks = usePlayer((s) => s.playTracks);
  const { openAlbumMenu, openPlaylistMenu } = useUi.getState();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const results = useMemo(() => searchLibrary(index, playlists, deferred), [index, playlists, deferred]);
  const searching = deferred.trim().length > 0;
  const remember = () => addRecentSearch(query);

  return (
    <ScrollScreen title="Recherche" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        <Icon name="search-outline" size={19} color={colors.secondaryText} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={remember}
          placeholder="Titres, artistes, albums, playlists"
          placeholderTextColor={colors.secondaryText}
          style={[styles.input, { color: colors.text }]}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Rechercher dans OpenPlay"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Effacer la recherche">
            <Icon name="close-circle" size={18} color={colors.secondaryText} />
          </Pressable>
        ) : null}
      </View>

      {!searching ? <DownloadEntry /> : null}

      <LibraryGate>
        {!searching ? (
          <>
            {recentSearches.length ? (
              <>
                <View style={styles.recentHeader}>
                  <Text variant="title3">Recherches récentes</Text>
                  <Pressable onPress={clearRecentSearches} hitSlop={8} accessibilityRole="button">
                    <Text variant="subhead" tone="secondary">
                      Effacer
                    </Text>
                  </Pressable>
                </View>
                {recentSearches.map((q) => (
                  <Pressable key={q} onPress={() => setQuery(q)} style={[styles.recent, { borderBottomColor: colors.separator }]} accessibilityRole="button">
                    <Icon name="time-outline" size={18} color={colors.secondaryText} />
                    <Text variant="body">
                      {q}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : null}
            <SectionHeader title="Parcourir les genres" />
            <View style={styles.tiles}>
              {index.genres.map((g) => (
                <GenreTile key={g.id} genre={g} onPress={() => navigation.push('Genre', { id: g.id })} />
              ))}
            </View>
          </>
        ) : (
          <>
            {results.top ? (
              <>
                <SectionHeader title="Meilleur résultat" />
                <PressableScale
                  onPress={() => {
                    remember();
                    const top = results.top!;
                    if (top.kind === 'track') {
                      // Le meilleur résultat, puis les autres morceaux trouvés : la lecture continue.
                      const ids = results.tracks.map((x) => x.id);
                      const queue = ids.includes(top.item.id) ? ids : [top.item.id, ...ids];
                      playTracks(queue, queue.indexOf(top.item.id), { label: `Recherche « ${query.trim()} »` });
                    }
                    else if (top.kind === 'album') navigation.push('Album', { id: top.item.id });
                    else navigation.push('Artist', { id: top.item.id });
                  }}
                  style={[styles.top, { backgroundColor: colors.card }]}
                  accessibilityRole="button">
                  <Artwork
                    track={results.top.kind === 'track' ? results.top.item : index.byId[results.top.item.trackIds[0]]}
                    size={88}
                    circle={results.top.kind === 'artist'}
                    rounded={14}
                    placeholderIcon={results.top.kind === 'artist' ? 'person' : 'musical-notes'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="title3" numberOfLines={2}>
                      {results.top.kind === 'artist' ? results.top.item.name : results.top.item.title}
                    </Text>
                    <Text variant="subhead" tone="secondary" numberOfLines={1}>
                      {results.top.kind === 'artist' ? 'Artiste' : results.top.kind === 'album' ? `Album · ${results.top.item.artist}` : `Morceau · ${results.top.item.artist}`}
                    </Text>
                  </View>
                </PressableScale>
              </>
            ) : null}

            {results.tracks.length ? (
              <>
                <SectionHeader title="Morceaux" />
                {results.tracks.slice(0, 8).map((t, i) => (
                  <TrackRow
                    key={t.id}
                    track={t}
                    onPress={() => {
                      remember();
                      playTracks(results.tracks.map((x) => x.id), i, { label: `Recherche « ${query.trim()} »` });
                    }}
                  />
                ))}
              </>
            ) : null}

            {results.artists.length ? (
              <>
                <SectionHeader title="Artistes" />
                <Carousel data={results.artists} keyOf={(a) => a.id} render={(a) => <MediaCard title={a.name} track={index.byId[a.trackIds[0]]} circle width={120} onPress={() => { remember(); navigation.push('Artist', { id: a.id }); }} />} />
              </>
            ) : null}

            {results.albums.length ? (
              <>
                <SectionHeader title="Albums" />
                <Carousel data={results.albums} keyOf={(a) => a.id} render={(a) => <MediaCard title={a.title} subtitle={a.artist} track={index.byId[a.trackIds[0]]} width={140} onPress={() => { remember(); navigation.push('Album', { id: a.id }); }} onLongPress={(anchor) => openAlbumMenu(a.id, anchor)} />} />
              </>
            ) : null}

            {results.playlists.length ? (
              <>
                <SectionHeader title="Playlists" />
                <Carousel
                  data={results.playlists}
                  keyOf={(p) => p.id}
                  render={(p) => <MediaCard title={p.name} subtitle={pluralize(p.trackIds.length, 'morceau', 'morceaux')} mosaic={p.trackIds.map((id) => index.byId[id]).filter(Boolean)} width={140} onPress={() => navigation.push('Playlist', { id: p.id })} onLongPress={(anchor) => openPlaylistMenu(p.id, anchor)} />}
                />
              </>
            ) : null}

            {!results.top ? <EmptyState icon="search" title="Aucun résultat" message={`Rien ne correspond à « ${query.trim()} ».`} /> : null}
          </>
        )}
      </LibraryGate>
    </ScrollScreen>
  );
}

/** « Télécharger par lien » (fichiers MP3 / MP4 directs) et « Mes téléchargements », sans toucher à la recherche locale. */
function DownloadEntry() {
  const navigation = useAppNavigation();
  const { colors } = useTheme();
  const total = useDownloads((s) => s.items.length);
  const active = useDownloads((s) => s.items.filter((d) => d.status === 'pending' || d.status === 'running').length);
  return (
    <View style={[styles.downloads, { backgroundColor: colors.card }]}>
      <Pressable onPress={() => navigation.push('DownloadLink', {})} style={({ pressed }) => [styles.downloadRow, pressed && { backgroundColor: colors.fill }]} accessibilityRole="button" accessibilityLabel="Télécharger par lien">
        <View style={[styles.downloadIcon, { backgroundColor: colors.fill }]}>
          <Icon name="link-outline" size={20} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="body" weight="semibold">
            Télécharger par lien
          </Text>
          <Text variant="footnote" tone="secondary">
            MP3 ou MP4 depuis un lien de fichier direct
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.tertiaryText} />
      </Pressable>
      {total ? (
        <Pressable onPress={() => navigation.push('Downloads')} style={({ pressed }) => [styles.downloadRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }, pressed && { backgroundColor: colors.fill }]} accessibilityRole="button" accessibilityLabel={active ? `Mes téléchargements, ${active} en cours` : 'Mes téléchargements'}>
          <View style={[styles.downloadIcon, { backgroundColor: colors.fill }]}>
            <Icon name="download-outline" size={20} color={colors.accent} />
          </View>
          <Text variant="body" style={{ flex: 1 }}>
            Mes téléchargements
          </Text>
          {active ? (
            <Text variant="subhead" tone="accent">
              {active} en cours
            </Text>
          ) : null}
          <Icon name="chevron-forward" size={18} color={colors.tertiaryText} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  downloads: { marginHorizontal: GUTTER, marginBottom: 6, borderRadius: radius.lg, overflow: 'hidden' },
  downloadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  downloadIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: GUTTER, paddingHorizontal: 14, height: 46, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, marginBottom: 4 },
  input: { flex: 1, fontSize: 17, paddingVertical: 0 },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: GUTTER, marginTop: 24, marginBottom: 6 },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: GUTTER, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GUTTER - 6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: GUTTER, padding: 12, borderRadius: radius.xl },
});
