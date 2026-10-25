import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { describeError, recordDiagnostic } from './crashReports';

type Props = {
  children: ReactNode;
  fallbackTitle?: string;
  /** Affiché par-dessus l'écran (lecteur plein écran) plutôt qu'à sa place. */
  overlay?: boolean;
  /** Action de repli (ex. fermer le lecteur) proposée en plus de « Réessayer ». */
  onClose?: { label: string; run: () => void };
};
type State = { error: Error | null };

/**
 * Une erreur d'affichage n'arrête plus l'application : elle est consignée dans le journal de
 * diagnostic et l'écran propose de réessayer. La lecture musicale (moteur natif) n'est pas touchée.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    recordDiagnostic("Erreur d'affichage interceptée", `${describeError(error)}\n${info.componentStack ?? ''}`.slice(0, 8000));
  }

  render() {
    if (!this.state.error) return this.props.children;
    // Volontairement sans thème ni police : ce rendu doit fonctionner même si ces contextes ont échoué.
    return (
      <View style={[styles.wrap, this.props.overlay && styles.overlay]} accessibilityRole="alert">
        <View style={styles.card}>
          <Text style={[styles.text, styles.title]} accessibilityRole="header">
            {this.props.fallbackTitle ?? 'Un problème est survenu'}
          </Text>
          <Text style={styles.text}>Cet écran n’a pas pu s’afficher. L’incident est noté dans Paramètres › Diagnostic. La musique continue.</Text>
          <Pressable onPress={() => this.setState({ error: null })} style={styles.button} accessibilityRole="button" accessibilityLabel="Réessayer">
            <Text style={[styles.text, styles.title, { color: '#FFFFFF' }]}>Réessayer</Text>
          </Pressable>
          {this.props.onClose ? (
            <Pressable
              onPress={() => {
                this.setState({ error: null });
                this.props.onClose?.run();
              }}
              style={styles.secondary}
              accessibilityRole="button">
              <Text style={styles.text}>{this.props.onClose.label}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 200, elevation: 40 },
  secondary: { alignSelf: 'center', paddingVertical: 8 },
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F2F2F4' },
  card: { width: '100%', maxWidth: 360, gap: 12, padding: 20, borderRadius: 22, backgroundColor: '#FFFFFF' },
  text: { color: '#111111', fontSize: 15, textAlign: 'center' },
  title: { fontSize: 17, fontWeight: '600' },
  button: { alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 999, backgroundColor: '#111111' },
});
