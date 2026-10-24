import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PermissionState } from '../library/mediaLibrary';
import type { Palette } from './theme';

type Props = { permission: PermissionState; palette: Palette; onRequest: () => void };

export function PermissionGate({ permission, palette, onRequest }: Props) {
  const denied = permission === 'denied';
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: palette.text }]}>Accès à votre musique</Text>
      <Text style={[styles.body, { color: palette.muted }]}>
        {denied
          ? "L'accès aux fichiers audio a été refusé. Autorisez-le dans les paramètres Android (Applications › OpenPlay › Autorisations), ou réessayez."
          : 'OpenPlay lit les fichiers audio enregistrés sur ce téléphone. Rien ne quitte votre appareil.'}
      </Text>
      <Pressable
        onPress={onRequest}
        accessibilityRole="button"
        style={[styles.button, { backgroundColor: palette.accent }]}>
        <Text style={[styles.buttonText, { color: palette.onAccent }]}>Autoriser l&apos;accès</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
