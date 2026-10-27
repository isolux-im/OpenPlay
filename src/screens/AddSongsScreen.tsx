import { useRoute, type RouteProp } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Artwork } from '../components/Artwork';
import { ListScreen } from '../components/Screen';
import { searchLibrary } from '../library/search';
import { useAppNavigation } from '../navigation/ref';
import type { SharedStackParams } from '../navigation/types';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useUser } from '../store/user';
import type { Track } from '../types';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, useTheme } from '../ui/theme';

/** Sélection multiple de morceaux à ajouter à une playlist. */
export function AddSongsScreen() {
  const { params } = useRoute<RouteProp<SharedStackParams, 'AddSongs'>>();
  const navigation = useAppNavigation();
  const { colors } = useTheme();
  const index = useLibrary((s) => s.index);
  const playlist = useUser((s) => s.playlists.find((p) => p.id === params.playlistId));
  const addToPlaylist = useUser((s) => s.addToPlaylist);
  const showToast = useUi((s) => s.showToast);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const list = useMemo(() => (query.trim() ? searchLibrary(index, [], query, 300).tracks : index.tracks), [index, query]);

  const done = () => {
    if (playlist && selected.length) {
      addToPlaylist(playlist.id, selected);
      showToast(`${selected.length} ajouté${selected.length > 1 ? 's' : ''}`);
    }
    navigation.goBack();
  };

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const renderItem = ({ item }: { item: Track }) => {
    const on = selected.includes(item.id);
    const already = playlist?.trackIds.includes(item.id);
    return (
      <Pressable onPress={() => toggle(item.id)} style={styles.row} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={item.title}>
        <Artwork track={item} size={44} rounded={6} />
        <View style={[styles.text, { borderBottomColor: colors.separator }]}>
          <View style={{ flex: 1 }}>
            <Text variant="body" numberOfLines={1}>
              {item.title}
            </Text>
            <Text variant="subhead" tone="secondary" numberOfLines={1}>
              {item.artist}
              {already ? ' · déjà présent' : ''}
            </Text>
          </View>
          <Icon name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? colors.accent : colors.tertiaryText} />
        </View>
      </Pressable>
    );
  };

  return (
    <ListScreen
      title="Ajouter des morceaux"
      back
      subtitle={playlist ? `Vers « ${playlist.name} »` : undefined}
      right={
        <Pressable onPress={done} hitSlop={10} accessibilityRole="button">
          <Text variant="headline" tone="accent">
            {selected.length ? `Ajouter (${selected.length})` : 'OK'}
          </Text>
        </Pressable>
      }
      data={list}
      keyExtractor={(t) => t.id}
      renderItem={renderItem}
      keyboardShouldPersistTaps="handled"
      header={
        <View style={[styles.search, { backgroundColor: colors.fill }]}>
          <Icon name="search" size={18} color={colors.secondaryText} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Rechercher un morceau" placeholderTextColor={colors.secondaryText} style={[styles.input, { color: colors.text }]} accessibilityLabel="Rechercher" />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: GUTTER, height: 60 },
  text: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 12, height: '100%', borderBottomWidth: StyleSheet.hairlineWidth, paddingRight: GUTTER },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: GUTTER, marginBottom: 12, paddingHorizontal: 10, height: 38, borderRadius: 10 },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
});
