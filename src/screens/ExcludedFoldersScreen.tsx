import { useMemo } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { EmptyState } from '../components/Blocks';
import { ListScreen } from '../components/Screen';
import { folderSummary, isExcludedFolder } from '../library/exclusions';
import { pluralize } from '../library/text';
import { useLibrary } from '../store/library';
import { useSettings } from '../store/settings';
import { tap } from '../ui/haptics';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, useTheme } from '../ui/theme';

/** Dossiers affichés ou masqués dans la bibliothèque. Masquer ne supprime aucun fichier. */
export function ExcludedFoldersScreen() {
  const { colors, dark } = useTheme();
  const allTracks = useLibrary((s) => s.allTracks);
  const excluded = useSettings((s) => s.excludedFolders);
  const accent = useSettings((s) => s.accent);
  const update = useSettings((s) => s.update);
  const folders = useMemo(() => folderSummary(allTracks), [allTracks]);
  const trackOn = dark && accent === 'graphite' ? '#7C7C82' : colors.accent;

  const toggle = (path: string, visible: boolean) => {
    tap('selection');
    // Réafficher un dossier lève aussi l'exclusion d'un dossier parent qui le couvrait.
    update({ excludedFolders: visible ? excluded.filter((ex) => !(path === ex || path.startsWith(`${ex}/`))) : [...excluded, path] });
  };

  return (
    <ListScreen
      title="Dossiers"
      back
      backLabel="Paramètres"
      subtitle={excluded.length ? `${pluralize(excluded.length, 'dossier masqué', 'dossiers masqués')}` : 'Tous les dossiers sont affichés'}
      data={folders}
      keyExtractor={(f) => f.path}
      header={
        <Text variant="footnote" tone="secondary" style={styles.intro}>
          Désactivez un dossier pour le masquer d’OpenPlay, des recherches et des suggestions (notes vocales, enregistrements, sonneries…). Ses sous-dossiers sont masqués avec lui. Aucun fichier n’est supprimé.
        </Text>
      }
      renderItem={({ item }) => {
        const hidden = isExcludedFolder(item.path, excluded);
        return (
          <View style={[styles.row, { borderBottomColor: colors.separator }]}>
            <View style={[styles.icon, { backgroundColor: colors.fill }]}>
              <Icon name={hidden ? 'eye-off-outline' : 'folder-outline'} size={20} color={hidden ? colors.tertiaryText : colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="callout" weight="medium" numberOfLines={1} tone={hidden ? 'tertiary' : 'primary'}>
                {item.path.split('/').pop() || item.path}
              </Text>
              <Text variant="footnote" tone="secondary" numberOfLines={1}>
                {item.path} · {pluralize(item.count, 'morceau', 'morceaux')}
              </Text>
            </View>
            <Switch
              value={!hidden}
              onValueChange={(v) => toggle(item.path, v)}
              trackColor={{ false: colors.fill, true: trackOn }}
              thumbColor="#FFFFFF"
              accessibilityLabel={`Afficher le dossier ${item.path}`}
            />
          </View>
        );
      }}
      ListEmptyComponent={<EmptyState icon="folder-outline" title="Aucun dossier" message="Lancez une analyse des audios." />}
    />
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: GUTTER, paddingBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: GUTTER, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
