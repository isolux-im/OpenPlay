import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Linking, Platform, Pressable, Share, StyleSheet, Switch, View } from 'react-native';

import { BrandLogo } from '../components/BrandLogo';
import { clearCrashReport, loadCrashReport, type CrashReport } from '../diagnostics/crashReports';
import { ScrollScreen } from '../components/Screen';
import { formatTotalDuration } from '../library/text';
import { deleteApiKey, getApiKey, setApiKey } from '../lyrics/apiKeys';
import { LANGUAGES, PROVIDERS, type ProviderId } from '../lyrics/transcription';
import { useAppNavigation } from '../navigation/ref';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings, type AccentKey, type ThemeMode } from '../store/settings';
import { useStats } from '../store/stats';
import { useVideoHistory } from '../store/videoHistory';
import { useVideoStats } from '../store/videoStats';
import { useUi } from '../store/ui';
import { useUser } from '../store/user';
import { tap } from '../ui/haptics';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { ACCENTS, radius, useTheme } from '../ui/theme';
import { useNow } from '../ui/useNow';

function Group({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.group}>
      {title ? (
        <Text variant="footnote" tone="secondary" style={styles.groupTitle}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View style={[styles.groupBody, { backgroundColor: colors.card }]}>{children}</View>
      {footer ? (
        <Text variant="footnote" tone="secondary" style={styles.groupFooter}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

/** iconColor est conservé pour l'appel mais la palette neutre affiche toutes les pastilles en gris. */
function Row({ icon, label, detail, right, onPress, last, destructive }: { icon: IconName; iconColor?: string; label: string; detail?: string; right?: ReactNode; onPress?: () => void; last?: boolean; destructive?: boolean }) {
  const { colors } = useTheme();
  const content = (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: colors.fill }]}>
        <Icon name={outline(icon)} size={17} color={destructive ? colors.danger : colors.text} />
      </View>
      <View style={[styles.rowText, { borderBottomColor: last ? 'transparent' : colors.separator }]}>
        <Text variant="body" tone={destructive ? 'danger' : 'primary'} style={{ flex: 1 }}>
          {label}
        </Text>
        {detail ? (
          <Text variant="body" tone="secondary" style={{ marginRight: 4 }}>
            {detail}
          </Text>
        ) : null}
        {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={colors.tertiaryText} /> : null)}
      </View>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} android_ripple={{ color: colors.fill }} accessibilityRole="button" accessibilityLabel={label}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

/** Variante filaire de l'icône quand elle existe (« moon » → « moon-outline »). */
function outline(icon: IconName): IconName {
  const o = `${icon}-outline`;
  return o in Ionicons.glyphMap ? (o as IconName) : icon;
}

function Segmented<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { colors, dark } = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.fill }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => {
              tap('selection');
              onChange(o.value);
            }}
            style={[styles.segment, on && { backgroundColor: dark ? '#636366' : '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, elevation: 2 }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}>
            <Text variant="footnote" weight={on ? 'semibold' : 'medium'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SettingsScreen() {
  const { colors, dark } = useTheme();
  const navigation = useAppNavigation();
  const s = useSettings();
  const index = useLibrary((x) => x.index);
  const status = useLibrary((x) => x.status);
  const scannedAt = useLibrary((x) => x.scannedAt);
  const isDemo = useLibrary((x) => x.isDemo);
  const scan = useLibrary((x) => x.scan);
  const clearHistory = useUser((x) => x.clearHistory);
  const historyCount = useUser((x) => x.history.length);
  const sleep = usePlayer((x) => x.sleep);
  const openSleep = useUi((x) => x.openSleepSheet);
  const showToast = useUi((x) => x.showToast);
  const totalDuration = index.tracks.reduce((a, t) => a + t.durationSec, 0);
  const now = useNow(15_000);
  // Le graphite clair du mode sombre masquerait le curseur blanc : piste grise dans ce cas.
  const switchColors = { trackColor: { false: colors.fill, true: dark && s.accent === 'graphite' ? '#7C7C82' : colors.accent }, thumbColor: '#FFFFFF' };

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: 'Système' },
    { value: 'light', label: 'Clair' },
    { value: 'dark', label: 'Sombre' },
  ];

  return (
    <ScrollScreen title="Paramètres" grouped>
      <Group title="Apparence">
        <View style={styles.block}>
          <Text variant="subhead" tone="secondary" style={{ marginBottom: 8 }}>
            Thème
          </Text>
          <Segmented options={themeOptions} value={s.theme} onChange={(theme) => s.update({ theme })} />
          <Text variant="subhead" tone="secondary" style={{ marginTop: 16, marginBottom: 10 }}>
            Couleur d&apos;accent
          </Text>
          <View style={styles.swatches}>
            {(Object.keys(ACCENTS) as AccentKey[]).map((k) => {
              const on = s.accent === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => {
                    tap('selection');
                    s.update({ accent: k });
                  }}
                  style={[styles.swatch, { borderColor: on ? colors.text : 'transparent' }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={ACCENTS[k].label}>
                  <View style={[styles.swatchInner, { backgroundColor: ACCENTS[k].light }]}>{on ? <Icon name="checkmark" size={18} color="#FFFFFF" /> : null}</View>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Row icon="color-palette" iconColor="#AF52DE" label="Lecteur aux couleurs de la pochette" right={<Switch value={s.coloredPlayer} onValueChange={(v) => s.update({ coloredPlayer: v })} {...switchColors} />} last />
      </Group>

      <Group title="Bibliothèque" footer={isDemo ? 'Aperçu : bibliothèque de démonstration (le module Android est absent sur cette plateforme).' : `Les fichiers de moins de ${s.minDurationSec} s (sonneries, notifications) sont ignorés.`}>
        <Row icon="musical-notes" iconColor="#FF2D55" label="Morceaux" detail={String(index.tracks.length)} />
        <Row icon="time" iconColor="#FF9500" label="Durée totale" detail={formatTotalDuration(totalDuration)} />
        <Row
          icon="refresh"
          iconColor="#34C759"
          label={status === 'loading' ? 'Analyse en cours…' : 'Analyser à nouveau'}
          detail={scannedAt ? new Date(scannedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : undefined}
          onPress={async () => {
            await scan(s.minDurationSec);
            showToast('Bibliothèque à jour');
          }}
        />
        <Row icon="eye-off" iconColor="#8E8E93" label="Dossiers masqués" detail={s.excludedFolders.length ? String(s.excludedFolders.length) : 'Aucun'} onPress={() => navigation.navigate('ExcludedFolders')} />
        <View style={styles.block}>
          <Text variant="subhead" tone="secondary" style={{ marginBottom: 8 }}>
            Durée minimale d&apos;un morceau
          </Text>
          <Segmented
            options={[
              { value: 0, label: 'Aucune' },
              { value: 30, label: '30 s' },
              { value: 60, label: '1 min' },
            ]}
            value={s.minDurationSec}
            onChange={(minDurationSec) => {
              s.update({ minDurationSec });
              scan(minDurationSec);
            }}
          />
        </View>
      </Group>

      <Group title="Lecture" footer="Les fichiers de plus de 20 minutes (livres audio, cours, podcasts) reprennent là où vous vous êtes arrêté. La vitesse de lecture se règle dans le lecteur, menu « … ».">
        <Row icon="play-circle" iconColor="#0A84FF" label="Reprendre au lancement" right={<Switch value={s.resumeOnLaunch} onValueChange={(v) => s.update({ resumeOnLaunch: v })} {...switchColors} />} />
        <Row icon="bookmark" iconColor="#8E8E93" label="Reprendre les fichiers longs" right={<Switch value={s.resumeLongTracks} onValueChange={(v) => s.update({ resumeLongTracks: v })} {...switchColors} />} />
        <Row icon="phone-portrait" iconColor="#8E8E93" label="Retour haptique" right={<Switch value={s.haptics} onValueChange={(v) => s.update({ haptics: v })} {...switchColors} />} />
        <Row icon="moon" iconColor="#5856D6" label="Minuterie de sommeil" detail={sleep.atTrackEnd ? 'Fin du morceau' : sleep.endsAt ? `${Math.max(0, Math.round((sleep.endsAt - now) / 60000))} min` : 'Désactivée'} onPress={openSleep} last />
      </Group>

      <Group
        title="Vidéos"
        footer="Orientation : « Portrait » ne fait jamais pivoter l’écran ; « Selon vidéo » passe en paysage pour une vidéo horizontale ; « Auto » suit le téléphone (rotation automatique d’Android). Le bouton du lecteur permet toujours de pivoter à la demande. Fenêtre flottante : en quittant OpenPlay pendant une vidéo, elle continue dans une petite fenêtre au-dessus des autres applications (Android 8 et plus ; entrée automatique sur Android 12 et plus). Générique : OpenPlay compare le son du début de deux épisodes d’une même série, sur l’appareil ; rien n’est envoyé.">
        <View style={styles.block}>
          <Text variant="subhead" tone="secondary" style={{ marginBottom: 8 }}>
            Orientation à l’ouverture d’une vidéo
          </Text>
          <Segmented<'keep' | 'video' | 'landscape' | 'sensor'>
            options={[
              { value: 'keep', label: 'Portrait' },
              { value: 'video', label: 'Selon vidéo' },
              { value: 'landscape', label: 'Paysage' },
              { value: 'sensor', label: 'Auto' },
            ]}
            value={s.videoOrientation}
            onChange={(videoOrientation) => s.update({ videoOrientation })}
          />
        </View>
        <Row icon="albums" iconColor="#8E8E93" label="Mini-lecteur flottant (PiP)" right={<Switch value={s.videoPip} onValueChange={(v) => s.update({ videoPip: v })} {...switchColors} />} />
        <Row icon="hand-left" iconColor="#8E8E93" label="Double appui : ±10 secondes" right={<Switch value={s.videoDoubleTap} onValueChange={(v) => s.update({ videoDoubleTap: v })} {...switchColors} />} />
        <Row icon="swap-vertical" iconColor="#8E8E93" label="Glisser : luminosité (gauche), volume (droite)" right={<Switch value={s.videoSwipe} onValueChange={(v) => s.update({ videoSwipe: v })} {...switchColors} />} />
        <Row icon="play-forward" iconColor="#8E8E93" label="Séries : enchaîner les épisodes" right={<Switch value={s.videoAutoNext} onValueChange={(v) => s.update({ videoAutoNext: v })} {...switchColors} />} />
        <Row icon="musical-notes" iconColor="#8E8E93" label="Séries : repérer le générique" right={<Switch value={s.videoIntroDetect} onValueChange={(v) => s.update({ videoIntroDetect: v })} {...switchColors} />} />
        <Row icon="play-skip-forward" iconColor="#8E8E93" label="Passer le générique automatiquement" right={<Switch value={s.videoIntroAutoSkip} onValueChange={(v) => s.update({ videoIntroAutoSkip: v })} {...switchColors} />} />
        <Row
          icon="trash"
          iconColor="#FF3B30"
          label="Effacer l'historique vidéo"
          destructive
          last
          onPress={() =>
            Alert.alert("Effacer l'historique vidéo ?", 'Les positions de reprise, les épisodes vus et le bilan de visionnage seront remis à zéro. Les favoris et les sous-titres associés sont conservés.', [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Effacer',
                style: 'destructive',
                onPress: () => {
                  useVideoHistory.getState().clear();
                  useVideoStats.getState().clear();
                },
              },
            ])
          }
        />
      </Group>

      <Group
        title="À découvrir"
        footer="Un morceau passe dans « À réécouter » quand sa dernière écoute dépasse ce délai. Une écoute compte après 30 s de lecture effective. Calcul local, sans connexion.">
        <View style={styles.block}>
          <Text variant="subhead" tone="secondary" style={{ marginBottom: 8 }}>
            Délai avant « À réécouter »
          </Text>
          <Segmented<21 | 30>
            options={[
              { value: 21, label: '21 jours' },
              { value: 30, label: '30 jours' },
            ]}
            value={s.discoverDays}
            onChange={(discoverDays) => s.update({ discoverDays })}
          />
        </View>
      </Group>

      <Group
        title="Paroles en ligne"
        footer="À l'ouverture des paroles d'un morceau qui n'en a pas sur l'appareil, son titre, son artiste, son album et sa durée sont envoyés à LRCLIB (service libre, sans compte). Les paroles trouvées ne sont pas conservées après la fermeture de l'application.">
        <Row icon="search" iconColor="#8E8E93" label="Recherche automatique (LRCLIB)" right={<Switch value={s.onlineLyrics} onValueChange={(v) => s.update({ onlineLyrics: v })} {...switchColors} />} last />
      </Group>

      <AiLyricsGroup />

      <Group title="Historique">
        <Row
          icon="trash"
          iconColor="#FF3B30"
          label="Effacer l'historique d'écoute"
          detail={historyCount ? String(historyCount) : undefined}
          destructive
          last
          onPress={() =>
            Alert.alert("Effacer l'historique ?", 'Les écoutes récentes, les compteurs « Les plus écoutés », les dates utilisées par « À découvrir » et le bilan d’écoute seront remis à zéro. Les playlists et favoris sont conservés.', [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Effacer',
                style: 'destructive',
                onPress: () => {
                  clearHistory();
                  useStats.getState().clear();
                },
              },
            ])
          }
        />
      </Group>

      <DiagnosticGroup />

      <View style={{ marginTop: 32 }}>
        <BrandLogo width={120} />
      </View>

      <Group title="Informations" footer="La lecture fonctionne entièrement hors ligne. Seules la recherche de paroles (LRCLIB) et les transcriptions que vous lancez utilisent Internet ; l'historique d'écoute reste sur l'appareil.">
        <Row icon="information-circle" iconColor="#8E8E93" label="Version" detail={Constants.expoConfig?.version ?? '—'} />
        <Row icon="code-slash" iconColor="#8E8E93" label="Technologies" detail="Expo · React Native" last />
      </Group>
    </ScrollScreen>
  );
}

/** Rapports de plantage locaux : consultables et partageables par l'utilisateur, jamais envoyés automatiquement. */
function DiagnosticGroup() {
  const [report, setReport] = useState<CrashReport | null | undefined>(undefined);
  const showToast = useUi((x) => x.showToast);

  useEffect(() => {
    let alive = true;
    loadCrashReport()
      .then((r) => alive && setReport(r))
      .catch(() => alive && setReport(null));
    return () => {
      alive = false;
    };
  }, []);

  if (report === null) return null;
  const count = report?.count ?? 0;
  const header = `OpenPlay ${Constants.expoConfig?.version ?? ''} · Android ${Platform.Version}`;

  return (
    <Group
      title="Diagnostic"
      footer="Le journal reste sur l'appareil. « Partager » ouvre la feuille de partage d'Android : rien n'est envoyé sans votre action. Il peut contenir des noms de morceaux.">
      <Row
        icon="pulse"
        iconColor="#8E8E93"
        label="Rapport de plantage"
        detail={report === undefined ? '…' : count ? String(count) : 'Aucun'}
        onPress={count ? () => Share.share({ title: 'Rapport OpenPlay', message: `${header}\n\n${report?.text ?? ''}` }).catch(() => undefined) : undefined}
        last={!count}
      />
      {count ? (
        <Row
          icon="trash"
          iconColor="#8E8E93"
          label="Effacer le journal"
          last
          onPress={async () => {
            await clearCrashReport();
            setReport(await loadCrashReport());
            showToast('Journal effacé');
          }}
        />
      ) : null}
    </Group>
  );
}

function AiLyricsGroup() {
  const s = useSettings();
  const openPrompt = useUi((x) => x.openPrompt);
  const showToast = useUi((x) => x.showToast);
  const provider = PROVIDERS[s.aiProvider];
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    getApiKey(s.aiProvider).then((k) => alive && setHasKey(!!k));
    return () => {
      alive = false;
    };
  }, [s.aiProvider]);

  const editKey = () =>
    openPrompt({
      title: `Clé API ${provider.label}`,
      message: 'Elle est chiffrée sur ce téléphone et n’est envoyée qu’au fournisseur choisi.',
      placeholder: 'Collez votre clé',
      confirmLabel: 'Enregistrer',
      secure: true,
      onSubmit: async (value) => {
        await setApiKey(s.aiProvider, value);
        setHasKey(true);
        showToast('Clé enregistrée');
      },
    });

  return (
    <Group
      title="Paroles par IA"
      footer={`Pour transcrire, le fichier audio du morceau est envoyé à ${provider.label} (Internet requis, ${Math.round(provider.maxBytes / 1048576)} Mo maximum). L’usage est facturé sur votre compte selon ses conditions. Le résultat est un premier jet à vérifier ; les langues peu représentées (fon, goun…) sont mal reconnues.`}>
      <View style={styles.block}>
        <Text variant="subhead" tone="secondary" style={{ marginBottom: 8 }}>
          Service
        </Text>
        <Segmented<ProviderId>
          options={(Object.keys(PROVIDERS) as ProviderId[]).map((id) => ({ value: id, label: PROVIDERS[id].label }))}
          value={s.aiProvider}
          onChange={(aiProvider) => s.update({ aiProvider })}
        />
        <Text variant="subhead" tone="secondary" style={{ marginTop: 16, marginBottom: 8 }}>
          Langue des chansons
        </Text>
        <Segmented options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} value={s.aiLanguage} onChange={(aiLanguage) => s.update({ aiLanguage })} />
      </View>
      <Row icon="key" iconColor="#FF9500" label="Clé API" detail={hasKey === null ? undefined : hasKey ? 'Enregistrée' : 'Aucune'} onPress={editKey} />
      <Row icon="open-outline" iconColor="#0A84FF" label={`Obtenir une clé ${provider.label}`} onPress={() => Linking.openURL(provider.keyUrl)} last={!hasKey} />
      {hasKey ? (
        <Row
          icon="trash"
          iconColor="#FF3B30"
          label="Supprimer la clé"
          destructive
          last
          onPress={async () => {
            await deleteApiKey(s.aiProvider);
            setHasKey(false);
          }}
        />
      ) : null}
    </Group>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: 22, paddingHorizontal: 16 },
  groupTitle: { paddingHorizontal: 16, marginBottom: 6 },
  groupFooter: { paddingHorizontal: 16, marginTop: 6 },
  groupBody: { borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, minHeight: 48 },
  rowIcon: { width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 12, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, paddingRight: 14 },
  block: { padding: 14 },
  segmented: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  segment: { flex: 1, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  swatches: { flexDirection: 'row', gap: 14 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, padding: 3 },
  swatchInner: { flex: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});

