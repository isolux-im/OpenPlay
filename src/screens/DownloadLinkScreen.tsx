import { useRoute, type RouteProp } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { OpenPlayMedia } from '../../modules/openplay-media';
import { Chips } from '../components/Blocks';
import { HeaderButton, ScrollScreen } from '../components/Screen';
import { analyzeLink, DESTINATION, fileNameFor, freeFileName, PLATFORM_ADVICE, platformLabel, type Analysis } from '../download/analyze';
import { downloadBackend } from '../download/backend';
import { formatBytes, formatMs } from '../download/format';
import { extractUrl, redactUrl } from '../download/link';
import { formatName, preferredFormat, resolveOptions, videoClass, type QualityOption, type TargetFormat } from '../download/options';
import { useAppNavigation } from '../navigation/ref';
import type { SharedStackParams } from '../navigation/types';
import { useDownloads } from '../store/downloads';
import { useLibrary } from '../store/library';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { useVideos } from '../store/videos';
import { tap } from '../ui/haptics';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';

const FORMATS: { key: TargetFormat; label: string }[] = [
  { key: 'mp3', label: 'MP3 (audio)' },
  { key: 'mp4', label: 'MP4 (vidéo)' },
];

/** Recherche › Télécharger par lien : coller ou partager un lien, analyser, choisir le format et la qualité. */
export function DownloadLinkScreen() {
  const { params } = useRoute<RouteProp<SharedStackParams, 'DownloadLink'>>();
  const navigation = useAppNavigation();
  const { colors } = useTheme();
  const [input, setInput] = useState(params?.url ?? '');
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [format, setFormat] = useState<TargetFormat>('mp4');
  const [quality, setQuality] = useState<string | null>(null);
  const request = useRef(0);
  const activeCount = useDownloads((s) => s.items.filter((x) => x.status === 'pending' || x.status === 'running').length);

  const analyze = async (value = input) => {
    const id = ++request.current;
    setBusy(true);
    setAnalysis(null);
    const result = await analyzeLink(value);
    if (id !== request.current) return; // analyse annulée ou remplacée
    setBusy(false);
    setAnalysis(result);
    if (result.kind === 'direct') {
      const f = preferredFormat(result.probe);
      setFormat(f);
      setQuality(resolveOptions(result.probe, f).find((o) => o.enabled)?.key ?? null);
    }
  };

  // Lien reçu par « Partager » (y compris pendant que l'écran est ouvert) : affiché puis analysé d'emblée ;
  // aucun téléchargement sans confirmation.
  const shared = params?.url;
  const [shownShared, setShownShared] = useState(shared);
  if (shared !== shownShared) {
    setShownShared(shared);
    setInput(shared ?? '');
    setAnalysis(null);
  }
  useEffect(() => {
    if (shared) void Promise.resolve().then(() => analyze(shared));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared]);

  const cancelAnalysis = () => {
    request.current += 1;
    setBusy(false);
  };

  const paste = async () => {
    let text: string | null = null;
    try {
      text = OpenPlayMedia?.getClipboardTextAsync ? await OpenPlayMedia.getClipboardTextAsync() : await navigator.clipboard?.readText?.();
    } catch {
      text = null;
    }
    if (!text?.trim()) {
      useUi.getState().showToast('Presse-papiers vide');
      return;
    }
    setInput(extractUrl(text) ?? text.trim());
    setAnalysis(null);
  };

  const options = analysis?.kind === 'direct' ? resolveOptions(analysis.probe, format) : [];
  const chosen = options.find((o) => o.key === quality && o.enabled) ?? null;

  const changeFormat = (f: TargetFormat) => {
    setFormat(f);
    if (analysis?.kind === 'direct') setQuality(resolveOptions(analysis.probe, f).find((o) => o.enabled)?.key ?? null);
  };

  const start = async () => {
    if (analysis?.kind !== 'direct' || !chosen?.method) return;
    const { probe, title } = analysis;
    const dest = DESTINATION[format];
    const backend = downloadBackend();
    let fileName = fileNameFor(title, format);
    if (await backend.exists(format === 'mp4' ? 'video' : 'audio', dest.relativePath, fileName)) {
      const choice = await new Promise<'rename' | 'cancel'>((resolve) =>
        Alert.alert('Fichier déjà présent', `« ${fileName} » existe déjà dans ${dest.relativePath}.`, [
          { text: 'Annuler', style: 'cancel', onPress: () => resolve('cancel') },
          { text: 'Garder les deux', onPress: () => resolve('rename') },
        ], { cancelable: true, onDismiss: () => resolve('cancel') }),
      );
      if (choice === 'cancel') return;
      fileName = await freeFileName(title, format, backend);
    }
    const record = useDownloads.getState().enqueue({
      sourceUrl: probe.finalUrl,
      displayTitle: title,
      targetFormat: format,
      qualityValue: chosen.key,
      qualityLabel: chosen.key === 'original' ? 'Originale' : chosen.label,
      method: chosen.method,
      fileName,
      relativePath: dest.relativePath,
      mimeType: dest.mimeType,
      expect: probe.sniff,
      bytesTotal: chosen.estimatedBytes ?? -1,
    });
    if (!record) {
      useUi.getState().showToast('Ce lien est déjà en cours de téléchargement');
      return;
    }
    tap();
    useUi.getState().showToast('Téléchargement lancé');
    navigation.push('Downloads');
  };

  const rescan = () => {
    void useVideos.getState().scan();
    void useLibrary.getState().scan(useSettings.getState().minDurationSec);
    useUi.getState().showToast('Analyse des fichiers du téléphone…');
  };

  return (
    <ScrollScreen
      title="Télécharger par lien"
      back
      backLabel="Recherche"
      keyboardShouldPersistTaps="handled"
      titleRight={<HeaderButton icon="download-outline" label={activeCount ? `Mes téléchargements, ${activeCount} en cours` : 'Mes téléchargements'} onPress={() => navigation.push('Downloads')} />}>
      <View style={styles.body}>
        <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.separator }]}>
          <Icon name="link-outline" size={19} color={colors.secondaryText} />
          <TextInput
            value={input}
            onChangeText={(t) => {
              setInput(t);
              if (analysis) setAnalysis(null);
            }}
            onSubmitEditing={() => void analyze()}
            placeholder="https://…"
            placeholderTextColor={colors.secondaryText}
            style={[styles.input, { color: colors.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            accessibilityLabel="Lien à analyser"
          />
          {input ? (
            <Pressable onPress={() => { setInput(''); setAnalysis(null); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Effacer le lien">
              <Icon name="close-circle" size={18} color={colors.secondaryText} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.row}>
          <Pill icon="clipboard-outline" label="Coller" onPress={() => void paste()} />
          <Pill icon="search-outline" label="Analyser le lien" primary disabled={busy || !input.trim()} onPress={() => void analyze()} />
        </View>
        <Text variant="footnote" tone="secondary" style={styles.hint}>
          Fichiers directs uniquement (lien vers un .mp3 ou un .mp4). Téléchargez seulement des contenus dont vous avez les droits. Vous pouvez aussi partager un lien vers OpenPlay depuis une autre application.
        </Text>

        {busy ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.cardRow}>
              <ActivityIndicator color={colors.accent} />
              <Text variant="body" style={{ flex: 1 }}>
                Analyse du lien…
              </Text>
              <Pressable onPress={cancelAnalysis} hitSlop={8} accessibilityRole="button" accessibilityLabel="Annuler l’analyse">
                <Text variant="subhead" tone="accent">
                  Annuler
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {analysis?.kind === 'invalid' || analysis?.kind === 'error' || analysis?.kind === 'http' || analysis?.kind === 'page' ? (
          <Notice icon={analysis.kind === 'page' ? 'globe-outline' : 'alert-circle-outline'} title={analysis.kind === 'page' ? 'Téléchargement direct indisponible pour cette source' : analysis.kind === 'invalid' ? 'Lien invalide' : 'Analyse impossible'} message={analysis.message} />
        ) : null}

        {analysis?.kind === 'platform' ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.cardRow}>
              <Icon name="lock-closed-outline" size={22} color={colors.secondaryText} />
              <View style={{ flex: 1 }}>
                <Text variant="headline">Lien {platformLabel(analysis.platform)} reconnu</Text>
                <Text variant="subhead" tone="secondary">
                  Téléchargement direct indisponible pour cette source
                </Text>
              </View>
            </View>
            <Text variant="footnote" tone="secondary" style={styles.cardText}>
              {PLATFORM_ADVICE[analysis.platform]}
            </Text>
            <View style={styles.row}>
              <Pill icon="open-outline" label={`Ouvrir ${platformLabel(analysis.platform)}`} onPress={() => void Linking.openURL(analysis.url)} />
              <Pill icon="refresh-outline" label="Importer un fichier autorisé" onPress={rescan} />
            </View>
          </View>
        ) : null}

        {analysis?.kind === 'direct' ? (
          <>
            <View style={[styles.card, { backgroundColor: colors.card }]} accessibilityLabel="Aperçu du fichier">
              <View style={styles.cardRow}>
                <View style={[styles.thumb, { backgroundColor: colors.fill }]}>
                  <Icon name={analysis.probe.sniff === 'mp3' ? 'musical-notes' : 'film'} size={26} color={colors.secondaryText} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="headline" numberOfLines={2}>
                    {analysis.title}
                  </Text>
                  <Text variant="footnote" tone="secondary" numberOfLines={1}>
                    {[analysis.host, formatName(analysis.probe.sniff), formatMs(analysis.probe.durationMs), videoClass(analysis.probe.width, analysis.probe.height) ? `${videoClass(analysis.probe.width, analysis.probe.height)}p` : null, analysis.probe.size > 0 ? formatBytes(analysis.probe.size) : 'Taille inconnue']
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              </View>
              {analysis.probe.size <= 0 ? (
                <Text variant="footnote" tone="secondary" style={styles.cardText}>
                  Taille inconnue : le serveur ne communique pas de longueur exploitable.
                </Text>
              ) : null}
              {analysis.probe.redirects ? (
                <Text variant="footnote" tone="secondary" style={styles.cardText}>
                  Source finale : {redactUrl(analysis.probe.finalUrl)}
                </Text>
              ) : null}
            </View>

            <Text variant="title3" style={styles.section}>
              Format
            </Text>
            <Chips options={FORMATS} value={format} onChange={changeFormat} />
            <Text variant="title3" style={styles.section}>
              Qualité
            </Text>
            <View style={[styles.list, { backgroundColor: colors.card }]}>
              {options.map((o, i) => (
                <OptionRow key={o.key} option={o} selected={o.key === quality && o.enabled} last={i === options.length - 1} onPress={() => setQuality(o.key)} />
              ))}
            </View>
            <Text variant="footnote" tone="secondary" style={styles.hint}>
              {chosen
                ? `Enregistré dans ${DESTINATION[format].relativePath}, puis ajouté à ${DESTINATION[format].library}.${chosen.estimatedBytes ? ` Taille : ${formatBytes(chosen.estimatedBytes)}.` : ''}`
                : 'Choisissez une qualité disponible.'}
            </Text>
            <Pressable
              onPress={() => void start()}
              disabled={!chosen}
              style={[styles.download, { backgroundColor: chosen ? colors.accent : colors.fill }]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !chosen }}
              accessibilityLabel="Télécharger">
              <Icon name="download-outline" size={20} color={chosen ? colors.onAccent : colors.secondaryText} />
              <Text variant="headline" color={chosen ? colors.onAccent : colors.secondaryText}>
                Télécharger
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </ScrollScreen>
  );
}

function Pill({ icon, label, onPress, primary, disabled }: { icon: IconName; label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  const fg = primary ? colors.onAccent : colors.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.pill, { backgroundColor: primary ? colors.accent : colors.fill, opacity: disabled ? 0.45 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}>
      <Icon name={icon} size={17} color={fg} />
      <Text variant="subhead" weight="semibold" color={fg}>
        {label}
      </Text>
    </Pressable>
  );
}

function Notice({ icon, title, message }: { icon: IconName; title: string; message: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]} accessibilityRole="alert">
      <View style={styles.cardRow}>
        <Icon name={icon} size={22} color={colors.secondaryText} />
        <Text variant="headline" style={{ flex: 1 }}>
          {title}
        </Text>
      </View>
      <Text variant="subhead" tone="secondary" style={styles.cardText}>
        {message}
      </Text>
    </View>
  );
}

function OptionRow({ option, selected, last, onPress }: { option: QualityOption; selected: boolean; last: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!option.enabled}
      style={[styles.option, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !option.enabled }}
      accessibilityLabel={`${option.label}${option.enabled ? '' : ', indisponible'}`}>
      <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={option.enabled ? (selected ? colors.accent : colors.secondaryText) : colors.tertiaryText} />
      <View style={{ flex: 1, gap: 1 }}>
        <View style={styles.optionTitle}>
          <Text variant="body" weight="semibold" color={option.enabled ? colors.text : colors.tertiaryText}>
            {option.label}
          </Text>
          {option.method ? (
            <View style={[styles.badge, { backgroundColor: colors.fill }]}>
              <Text variant="caption" weight="semibold" tone="secondary">
                {option.method === 'DIRECT' ? 'Source' : 'Conversion locale'}
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="footnote" color={option.enabled ? colors.secondaryText : colors.tertiaryText}>
          {option.enabled ? option.detail : option.reason}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 24 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: GUTTER, paddingHorizontal: 14, height: 46, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: GUTTER, marginTop: 12 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 19 },
  hint: { paddingHorizontal: GUTTER, marginTop: 10 },
  card: { marginHorizontal: GUTTER, marginTop: 16, padding: 14, borderRadius: radius.lg, gap: 4 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardText: { marginTop: 8 },
  thumb: { width: 54, height: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: GUTTER, marginTop: 22, marginBottom: 8 },
  list: { marginHorizontal: GUTTER, borderRadius: radius.lg, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  optionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  download: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, marginHorizontal: GUTTER, marginTop: 16, borderRadius: radius.lg },
});
