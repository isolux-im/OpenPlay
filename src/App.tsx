import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts } from '@expo-google-fonts/inter';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OpenPlayMedia } from '../modules/openplay-media';
import { ContextMenuHost } from './components/ContextMenu';
import { GlassTarget } from './components/Glass';
import { installJsErrorRecorder } from './diagnostics/crashReports';
import { ErrorBoundary } from './diagnostics/ErrorBoundary';
import { SheetHost } from './components/Sheets';
import { RootNavigator } from './navigation/RootNavigator';
import { ExpoPlaylistEngine, SimulatedEngine, type PlaybackEngine } from './player/PlaybackEngine';
import { FullPlayer } from './player/ui/FullPlayer';
import { PlayerOptionsHost } from './player/ui/PlayerOptions';
import { useLibrary } from './store/library';
import { connectPlayer, disconnectPlayer, usePlayer } from './store/player';
import { useSettings } from './store/settings';
import { useUser } from './store/user';
import { ThemeProvider, useTheme } from './ui/theme';

installJsErrorRecorder();

/** Sur Android, le vrai moteur ; ailleurs (aperçu web), un moteur simulé silencieux. */
export function createEngine(): PlaybackEngine {
  if (Platform.OS === 'android' && OpenPlayMedia) return new ExpoPlaylistEngine();
  return new SimulatedEngine((id) => useLibrary.getState().index.byId[id]?.durationSec ?? 180);
}

function useBootstrap(engineFactory: () => PlaybackEngine) {
  useEffect(() => {
    connectPlayer(engineFactory(), (id) => useLibrary.getState().index.byId[id]);
    return () => disconnectPlayer();
  }, [engineFactory]);

  useEffect(() => {
    const start = () => useLibrary.getState().init(useSettings.getState().minDurationSec);
    if (useSettings.persist.hasHydrated()) start();
    else return useSettings.persist.onFinishHydration(start);
  }, []);

  // Dossiers masqués ou infos corrigées : l'index est recalculé sans nouvelle analyse.
  const excludedFolders = useSettings((s) => s.excludedFolders);
  const trackEdits = useUser((s) => s.trackEdits);
  useEffect(() => {
    useLibrary.getState().refreshIndex();
  }, [excludedFolders, trackEdits]);

  const status = useLibrary((s) => s.status);
  useEffect(() => {
    if (status !== 'ready') return;
    const restore = () => {
      const session = useUser.getState().session;
      if (!session || !useSettings.getState().resumeOnLaunch) return;
      const byId = useLibrary.getState().index.byId;
      usePlayer.getState().restoreSession(session, (id) => !!byId[id]);
    };
    if (useUser.persist.hasHydrated()) restore();
    else return useUser.persist.onFinishHydration(restore);
  }, [status]);
}

function Shell({ engineFactory }: { engineFactory: () => PlaybackEngine }) {
  const { dark, colors } = useTheme();
  useBootstrap(engineFactory);
  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {/* Les menus vitrés sont rendus hors de la cible de flou, qu'ils floutent. */}
      <GlassTarget
        overlay={
          <>
            <PlayerOptionsHost />
            <ContextMenuHost />
            <SheetHost />
          </>
        }>
        <ErrorBoundary>
          <RootNavigator />
        </ErrorBoundary>
        <ErrorBoundary overlay fallbackTitle="Le lecteur n’a pas pu s’afficher" onClose={{ label: 'Fermer le lecteur', run: () => usePlayer.getState().setExpanded(false) }}>
          <FullPlayer />
        </ErrorBoundary>
      </GlassTarget>
    </View>
  );
}

export default function App({ engineFactory = createEngine }: { engineFactory?: () => PlaybackEngine }) {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  if (!fontsLoaded && !fontError) return null;
  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Shell engineFactory={engineFactory} />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
