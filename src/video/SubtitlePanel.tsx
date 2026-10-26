import type { SubtitleTrack } from 'expo-video';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { SubtitleLink } from '../store/subtitles';
import { useSettings } from '../store/settings';
import { tap } from '../ui/haptics';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { canImportSubtitles, subtitleErrorMessage, type ExternalSubtitles } from './subtitleFiles';
import { OFFSET_STEP, SUBTITLE_CONTRASTS, SUBTITLE_SIZES, formatOffset } from './subtitles';

/** Piste affichée : aucune, le fichier importé, ou une piste intégrée à la vidéo (rendue par le lecteur natif). */
export type SubtitleChoice = { kind: 'off' } | { kind: 'external' } | { kind: 'embedded'; id: string };

/** Identifiant stable d'une piste intégrée (`id` n'est fourni que sur Android). */
export function trackKey(t: SubtitleTrack): string {
  return t.id ?? `${t.language}|${t.label}|${t.name ?? ''}`;
}

export function trackLabel(t: SubtitleTrack, i: number): string {
  return t.label || t.name || (t.language ? t.language.toUpperCase() : `Piste ${i + 1}`);
}

/** Texte des sous-titres importés, au-dessus de la vidéo. */
export function SubtitleOverlay({ text, bottom }: { text: string | null; bottom: number }) {
  const size = useSettings((s) => s.subtitleSize);
  const contrast = useSettings((s) => s.subtitleContrast);
  if (!text) return null;
  const fontSize = SUBTITLE_SIZES.find((s) => s.key === size)?.fontSize ?? 19;
  const boxed = contrast !== 'shadow';
  return (
    <View pointerEvents="none" style={[styles.overlay, { bottom }]} accessibilityLiveRegion="polite">
      <Text
        style={[
          styles.cue,
          { fontSize, lineHeight: Math.round(fontSize * 1.3), color: contrast === 'yellow' ? '#FFE600' : '#FFFFFF' },
          boxed ? styles.boxed : styles.shadow,
        ]}>
        {text}
      </Text>
    </View>
  );
}

function Row({ icon, label, detail, selected, onPress, tone }: { icon?: IconName; label: string; detail?: string; selected?: boolean; onPress: () => void; tone?: 'danger' }) {
  return (
    <Pressable
      onPress={() => {
        tap('selection');
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(255,255,255,0.08)' }]}
      accessibilityRole={selected === undefined ? 'button' : 'radio'}
      accessibilityState={selected === undefined ? undefined : { selected }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}>
      <View style={styles.rowIcon}>{selected ? <Icon name="checkmark" size={20} color="#FFFFFF" /> : icon ? <Icon name={icon} size={20} color={tone === 'danger' ? '#FF6B6B' : '#FFFFFF'} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text variant="callout" color={tone === 'danger' ? '#FF6B6B' : '#FFFFFF'} numberOfLines={1}>
          {label}
        </Text>
        {detail ? (
          <Text variant="caption" color="rgba(255,255,255,0.6)" numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function Options<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={styles.options}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              tap('selection');
              onChange(o.key);
            }}
            style={[styles.option, on && styles.optionOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}>
            <Text variant="footnote" weight="semibold" color={on ? '#111111' : '#FFFFFF'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type PanelProps = {
  choice: SubtitleChoice;
  onChoose: (c: SubtitleChoice) => void;
  embedded: SubtitleTrack[];
  link: SubtitleLink | undefined;
  external: ExternalSubtitles;
  onImport: () => void;
  onUnlink: () => void;
  onOffset: (sec: number) => void;
  onClose: () => void;
  bottom: number;
};

/** Choix de la piste, import d'un fichier SRT / WebVTT, taille, contraste et décalage. */
export function SubtitlePanel({ choice, onChoose, embedded, link, external, onImport, onUnlink, onOffset, onClose, bottom }: PanelProps) {
  const size = useSettings((s) => s.subtitleSize);
  const contrast = useSettings((s) => s.subtitleContrast);
  const update = useSettings((s) => s.update);
  const offset = link?.offsetSec ?? 0;
  const externalDetail =
    external.status === 'error' && external.error
      ? subtitleErrorMessage(external.error)
      : external.status === 'loading'
        ? 'Chargement…'
        : link && !link.persistent
          ? 'Accès pour cette session seulement : le fichier devra être réimporté après redémarrage.'
          : undefined;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer les sous-titres" />
      <View style={[styles.panel, { marginBottom: bottom }]} accessibilityViewIsModal>
        <View style={styles.header}>
          <Text variant="headline" color="#FFFFFF" style={{ flex: 1 }}>
            Sous-titres
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fermer">
            <Icon name="close" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
          <Row label="Désactivés" selected={choice.kind === 'off'} onPress={() => onChoose({ kind: 'off' })} />
          {link ? <Row label={link.name} detail={externalDetail ?? 'Fichier importé'} selected={choice.kind === 'external'} onPress={() => onChoose({ kind: 'external' })} /> : null}
          {embedded.map((t, i) => (
            <Row key={trackKey(t)} label={trackLabel(t, i)} detail="Intégrée à la vidéo" selected={choice.kind === 'embedded' && choice.id === trackKey(t)} onPress={() => onChoose({ kind: 'embedded', id: trackKey(t) })} />
          ))}
          {canImportSubtitles() ? <Row icon="document-text-outline" label={link ? 'Remplacer le fichier…' : 'Importer un fichier SRT ou WebVTT…'} onPress={onImport} /> : null}
          {link ? <Row icon="trash-outline" label="Retirer le fichier de cette vidéo" tone="danger" onPress={onUnlink} /> : null}

          <Text variant="footnote" color="rgba(255,255,255,0.6)" style={styles.section}>
            Taille
          </Text>
          <Options options={SUBTITLE_SIZES} value={size} onChange={(subtitleSize) => update({ subtitleSize })} />
          <Text variant="footnote" color="rgba(255,255,255,0.6)" style={styles.section}>
            Contraste
          </Text>
          <Options options={SUBTITLE_CONTRASTS} value={contrast} onChange={(subtitleContrast) => update({ subtitleContrast })} />

          {link ? (
            <>
              <Text variant="footnote" color="rgba(255,255,255,0.6)" style={styles.section}>
                Décalage
              </Text>
              <View style={styles.offset}>
                <Pressable onPress={() => onOffset(offset - OFFSET_STEP)} style={styles.option} accessibilityRole="button" accessibilityLabel={`Avancer les sous-titres de ${OFFSET_STEP.toLocaleString('fr-FR')} seconde`}>
                  <Text variant="footnote" weight="semibold" color="#FFFFFF">
                    − 0,5 s
                  </Text>
                </Pressable>
                <Text variant="headline" color="#FFFFFF" style={styles.offsetValue} accessibilityLabel={`Décalage ${formatOffset(offset)}`}>
                  {formatOffset(offset)}
                </Text>
                <Pressable onPress={() => onOffset(offset + OFFSET_STEP)} style={styles.option} accessibilityRole="button" accessibilityLabel={`Retarder les sous-titres de ${OFFSET_STEP.toLocaleString('fr-FR')} seconde`}>
                  <Text variant="footnote" weight="semibold" color="#FFFFFF">
                    + 0,5 s
                  </Text>
                </Pressable>
                {offset !== 0 ? (
                  <Pressable onPress={() => onOffset(0)} style={styles.option} accessibilityRole="button" accessibilityLabel="Réinitialiser le décalage">
                    <Text variant="footnote" weight="semibold" color="#FFFFFF">
                      Réinitialiser
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <Text variant="caption" color="rgba(255,255,255,0.6)" style={styles.note}>
                « + » si les sous-titres arrivent trop tôt, « − » s’ils arrivent trop tard. Le décalage est mémorisé pour cette vidéo.
              </Text>
            </>
          ) : null}
          <Text variant="caption" color="rgba(255,255,255,0.6)" style={styles.note}>
            Taille, contraste et décalage s’appliquent aux fichiers importés. Les pistes intégrées sont affichées par le lecteur du système. Les fichiers importés ne s’affichent pas dans la fenêtre flottante.
          </Text>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  cue: { textAlign: 'center', fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  shadow: { textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  boxed: { backgroundColor: 'rgba(0,0,0,0.78)' },
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    maxHeight: '72%',
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 48 },
  rowIcon: { width: 24, alignItems: 'center' },
  section: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  option: { paddingHorizontal: 12, height: 34, borderRadius: 17, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  optionOn: { backgroundColor: '#FFFFFF' },
  offset: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  offsetValue: { minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'] },
  note: { paddingHorizontal: 16, paddingTop: 10 },
});
