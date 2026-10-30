import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { OpenPlayMedia } from '../../modules/openplay-media';
import { EmptyState, SectionHeader } from '../components/Blocks';
import { HeaderButton, ScrollScreen } from '../components/Screen';
import { formatBytes, formatRate, remaining } from '../download/format';
import { deleteTracksFromDevice } from '../library/actions';
import { deleteVideosFromDevice } from '../library/fileOps';
import { useAppNavigation } from '../navigation/ref';
import { useDownloads, type DownloadRecord } from '../store/downloads';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { useVideoPlayer } from '../store/videoPlayer';
import { useVideos } from '../store/videos';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { GUTTER, radius, useTheme } from '../ui/theme';

const STATUS_LABEL: Record<DownloadRecord['status'], string> = {
  pending: 'En attente',
  running: 'En cours',
  converting: 'Conversion en cours',
  done: 'Terminé',
  cancelled: 'Annulé',
  failed: 'Échec',
};

function progressLine(d: DownloadRecord): string {
  if (d.status === 'pending') return 'En attente d’un emplacement (2 téléchargements à la fois)';
  if (d.status === 'running') {
    const pct = d.bytesTotal > 0 ? `${Math.floor((d.bytesDone / d.bytesTotal) * 100)} %` : null;
    const amount = d.bytesTotal > 0 ? `${formatBytes(d.bytesDone)} sur ${formatBytes(d.bytesTotal)}` : `${formatBytes(d.bytesDone)} reçus · taille inconnue`;
    return [pct, amount, d.bytesPerSec > 0 ? formatRate(d.bytesPerSec) : null, remaining(d.bytesDone, d.bytesTotal, d.bytesPerSec)].filter(Boolean).join(' · ');
  }
  if (d.status === 'done') return `${formatBytes(d.bytesTotal)} · ${d.targetFormat === 'mp4' ? 'Vidéos' : 'Audios'} › ${d.relativePath}`;
  if (d.status === 'failed') return d.errorMessage ?? 'Téléchargement impossible.';
  return 'Annulé par vous ; le fichier partiel a été supprimé.';
}

/** Fichier publié : on le retrouve dans la bibliothèque (rafraîchie à la fin du téléchargement). */
function findMedia(d: DownloadRecord) {
  if (!d.mediaId) return null;
  if (d.targetFormat === 'mp4') {
    const video = useVideos.getState().byId[d.mediaId];
    return video ? ({ kind: 'video', video } as const) : null;
  }
  const track = useLibrary.getState().index.byId[d.mediaId];
  return track ? ({ kind: 'audio', track } as const) : null;
}

function openMedia(d: DownloadRecord) {
  const media = findMedia(d);
  if (!media) {
    // Indexation pas encore terminée : on relance l'analyse de la bibliothèque concernée.
    if (d.targetFormat === 'mp4') void useVideos.getState().scan();
    else void useLibrary.getState().scan(useSettings.getState().minDurationSec);
    useUi.getState().showToast('Fichier en cours d’ajout à la bibliothèque, réessayez dans un instant');
    return;
  }
  if (media.kind === 'video') useVideoPlayer.getState().open(media.video.id, [media.video.id]);
  else usePlayer.getState().playTracks([media.track.id], 0, { label: 'Téléchargements' });
}

function shareMedia(d: DownloadRecord) {
  if (!d.mediaId) return;
  const share = d.targetFormat === 'mp4' ? OpenPlayMedia?.shareVideoAsync : OpenPlayMedia?.shareAudioAsync;
  if (!share) {
    useUi.getState().showToast('Partage disponible dans l’application Android');
    return;
  }
  void share(d.mediaId, d.mimeType, d.displayTitle);
}

async function deleteFile(d: DownloadRecord) {
  const media = findMedia(d);
  if (!media) {
    useUi.getState().showToast('Fichier introuvable dans la bibliothèque (déjà supprimé ou déplacé ?)');
    return;
  }
  const ok = media.kind === 'video' ? await deleteVideosFromDevice([media.video], `« ${media.video.title} »`) : await deleteTracksFromDevice([media.track], `« ${media.track.title} »`);
  if (ok) useDownloads.getState().removeEntry(d.id);
}

export function DownloadsScreen() {
  const { colors } = useTheme();
  const navigation = useAppNavigation();
  const items = useDownloads((s) => s.items);
  const current = items.filter((d) => d.status === 'pending' || d.status === 'running' || d.status === 'converting');
  const finished = items.filter((d) => d.status === 'done');
  const other = items.filter((d) => d.status === 'failed' || d.status === 'cancelled');

  const clear = () =>
    Alert.alert('Effacer l’historique ?', 'Les entrées terminées, annulées ou en échec sont retirées de la liste. Les fichiers téléchargés restent sur le téléphone.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Effacer', style: 'destructive', onPress: () => useDownloads.getState().clearFinished() },
    ]);

  return (
    <ScrollScreen
      title="Mes téléchargements"
      back
      titleRight={items.length > current.length ? <HeaderButton icon="trash-outline" label="Effacer l’historique" onPress={clear} /> : <HeaderButton icon="add" label="Télécharger par lien" onPress={() => navigation.push('DownloadLink', {})} />}>
      {!items.length ? (
        <EmptyState icon="download-outline" title="Aucun téléchargement" message="Recherche › Télécharger par lien : collez le lien d’un fichier MP3 ou MP4." action={{ label: 'Télécharger par lien', onPress: () => navigation.push('DownloadLink', {}) }} />
      ) : null}
      {current.length ? (
        <>
          <SectionHeader title="En cours" />
          {current.map((d) => (
            <DownloadRow key={d.id} item={d} />
          ))}
        </>
      ) : null}
      {finished.length ? (
        <>
          <SectionHeader title="Terminés" />
          {finished.map((d) => (
            <DownloadRow key={d.id} item={d} />
          ))}
        </>
      ) : null}
      {other.length ? (
        <>
          <SectionHeader title="Annulés et échecs" />
          {other.map((d) => (
            <DownloadRow key={d.id} item={d} />
          ))}
        </>
      ) : null}
      {items.length ? (
        <Text variant="footnote" tone="secondary" style={[styles.note, { borderTopColor: colors.separator }]}>
          Un fichier n’apparaît dans Audios ou Vidéos qu’une fois complet et vérifié (taille et type réel). Pause et reprise ne sont pas proposées : un transfert interrompu se relance depuis le début avec « Réessayer ».
        </Text>
      ) : null}
    </ScrollScreen>
  );
}

function DownloadRow({ item }: { item: DownloadRecord }) {
  const { colors } = useTheme();
  const store = useDownloads.getState();
  const running = item.status === 'running';
  const progress = running && item.bytesTotal > 0 ? Math.min(1, item.bytesDone / item.bytesTotal) : null;
  const icon: IconName = item.targetFormat === 'mp4' ? 'film' : 'musical-notes';
  const tone = item.status === 'failed' ? colors.danger : colors.secondaryText;
  const actions: { icon: IconName; label: string; onPress: () => void; danger?: boolean }[] = [];
  if (item.status === 'pending' || running) actions.push({ icon: 'close-circle-outline', label: 'Annuler', onPress: () => void store.cancel(item.id) });
  if (item.status === 'done') {
    actions.push({ icon: 'play-circle-outline', label: 'Ouvrir', onPress: () => openMedia(item) });
    actions.push({ icon: 'share-outline', label: 'Partager', onPress: () => shareMedia(item) });
    actions.push({ icon: 'trash-outline', label: 'Supprimer le fichier', onPress: () => void deleteFile(item), danger: true });
  }
  if (item.status === 'failed' || item.status === 'cancelled') actions.push({ icon: 'refresh-outline', label: 'Réessayer', onPress: () => store.retry(item.id) });
  if (item.status === 'done' || item.status === 'failed' || item.status === 'cancelled') actions.push({ icon: 'remove-circle-outline', label: 'Retirer de la liste', onPress: () => store.removeEntry(item.id) });

  return (
    <View style={[styles.row, { backgroundColor: colors.card }]} accessibilityLabel={`${item.displayTitle}, ${STATUS_LABEL[item.status]}`}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: colors.fill }]}>
          <Icon name={icon} size={20} color={colors.secondaryText} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="callout" weight="semibold" numberOfLines={1}>
            {item.fileName}
          </Text>
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {STATUS_LABEL[item.status]} · {item.targetFormat.toUpperCase()} {item.qualityLabel} · {item.method === 'DIRECT' ? 'Source' : 'Conversion locale'}
          </Text>
        </View>
      </View>
      {progress !== null ? (
        <View style={[styles.track, { backgroundColor: colors.fill }]} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
          <View style={[styles.bar, { backgroundColor: colors.accent, width: `${progress * 100}%` }]} />
        </View>
      ) : null}
      <Text variant="footnote" color={tone}>
        {progressLine(item)}
      </Text>
      <View style={styles.actions}>
        {actions.map((a) => (
          <Pressable key={a.label} onPress={a.onPress} hitSlop={6} style={[styles.action, { backgroundColor: colors.fill }]} accessibilityRole="button" accessibilityLabel={`${a.label} : ${item.fileName}`}>
            <Icon name={a.icon} size={16} color={a.danger ? colors.danger : colors.accent} />
            <Text variant="footnote" weight="semibold" color={a.danger ? colors.danger : colors.accent}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginHorizontal: GUTTER, marginBottom: 10, padding: 12, borderRadius: radius.lg, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  bar: { height: 5, borderRadius: 3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 10, borderRadius: 16 },
  note: { paddingHorizontal: GUTTER, paddingTop: 12, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
