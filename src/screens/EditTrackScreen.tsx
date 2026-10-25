import { useRoute, type RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Artwork } from '../components/Artwork';
import { EmptyState } from '../components/Blocks';
import { ScrollScreen } from '../components/Screen';
import { EDIT_MAX_LENGTH, diffEdit, type TrackEdit } from '../library/trackEdits';
import { useAppNavigation } from '../navigation/ref';
import type { SharedStackParams } from '../navigation/types';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useUser } from '../store/user';
import type { Track } from '../types';
import { tap } from '../ui/haptics';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';

const FIELDS: { key: keyof Required<TrackEdit>; label: string }[] = [
  { key: 'title', label: 'Titre' },
  { key: 'artist', label: 'Artiste' },
  { key: 'album', label: 'Album' },
  { key: 'genre', label: 'Genre' },
];

/** Correction locale des informations d'un morceau : le fichier n'est pas modifié. */
export function EditTrackScreen() {
  const { params } = useRoute<RouteProp<SharedStackParams, 'EditTrack'>>();
  const original = useLibrary((s) => s.allTracks.find((t) => t.id === params.id));
  if (!original) {
    return (
      <ScrollScreen title="Modifier les infos" back largeTitle={false}>
        <EmptyState icon="musical-note-outline" title="Morceau introuvable" />
      </ScrollScreen>
    );
  }
  return <EditForm key={original.id} original={original} />;
}

function EditForm({ original }: { original: Track }) {
  const navigation = useAppNavigation();
  const { colors } = useTheme();
  const current = useUser((s) => s.trackEdits[original.id]);
  const setTrackEdit = useUser((s) => s.setTrackEdit);
  const showToast = useUi((s) => s.showToast);
  const [values, setValues] = useState<Required<TrackEdit>>({
    title: current?.title ?? original.title,
    artist: current?.artist ?? original.artist,
    album: current?.album ?? original.album,
    genre: current?.genre ?? original.genre,
  });

  const save = () => {
    tap('success');
    setTrackEdit(original.id, diffEdit(original, values));
    showToast('Infos enregistrées');
    navigation.goBack();
  };

  const restore = () => {
    setTrackEdit(original.id, null);
    showToast("Infos d'origine rétablies");
    navigation.goBack();
  };

  return (
    <ScrollScreen
      title="Modifier les infos"
      back
      keyboardShouldPersistTaps="handled"
      right={
        <Pressable onPress={save} hitSlop={10} accessibilityRole="button" accessibilityLabel="Enregistrer">
          <Text variant="headline">Enregistrer</Text>
        </Pressable>
      }>
      <View style={styles.header}>
        <Artwork track={original} size={64} rounded={12} />
        <View style={{ flex: 1 }}>
          <Text variant="footnote" tone="secondary" numberOfLines={2}>
            Fichier : {original.path?.split('/').pop() ?? original.title}
          </Text>
          <Text variant="caption" tone="tertiary" style={{ marginTop: 2 }}>
            Les corrections restent dans OpenPlay ; le fichier n’est pas modifié.
          </Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {FIELDS.map((f, i) => (
          <View key={f.key} style={[styles.field, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }]}>
            <Text variant="footnote" tone="secondary">
              {f.label}
            </Text>
            <TextInput
              value={values[f.key]}
              onChangeText={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
              placeholder={original[f.key]}
              placeholderTextColor={colors.tertiaryText}
              maxLength={EDIT_MAX_LENGTH}
              style={[styles.input, { color: colors.text }]}
              returnKeyType={i === FIELDS.length - 1 ? 'done' : 'next'}
              onSubmitEditing={i === FIELDS.length - 1 ? save : undefined}
              autoCorrect={false}
              accessibilityLabel={f.label}
            />
            {values[f.key].trim() !== original[f.key] ? (
              <Text variant="caption" tone="tertiary" numberOfLines={1}>
                D’origine : {original[f.key]}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      <Text variant="footnote" tone="secondary" style={styles.note}>
        Un champ vidé reprend sa valeur d’origine. Corriger l’artiste corrige aussi l’artiste de l’album ; corriger l’album regroupe le morceau avec les autres morceaux de cet album.
      </Text>

      {current ? (
        <Pressable onPress={restore} style={[styles.restore, { backgroundColor: colors.card }]} accessibilityRole="button">
          <Text variant="body" tone="danger">
            Rétablir les infos d’origine
          </Text>
        </Pressable>
      ) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: GUTTER, paddingBottom: 16 },
  card: { marginHorizontal: GUTTER, borderRadius: radius.lg, overflow: 'hidden' },
  field: { paddingHorizontal: 16, paddingVertical: 10, gap: 2 },
  input: { fontSize: 17, paddingVertical: 4 },
  note: { paddingHorizontal: GUTTER, paddingTop: 12 },
  restore: { marginHorizontal: GUTTER, marginTop: 24, borderRadius: radius.lg, alignItems: 'center', paddingVertical: 14 },
});
