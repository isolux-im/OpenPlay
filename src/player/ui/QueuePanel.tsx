import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Artwork } from '../../components/Artwork';
import { DraggableRow } from '../../components/DraggableRow';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useUi } from '../../store/ui';
import { Icon } from '../../ui/Icon';
import { Text } from '../../ui/Text';

const ROW = 60;

type Props = { textColor: string; dimColor: string; chipColor: string };

export function QueuePanel({ textColor, dimColor, chipColor }: Props) {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const sourceLabel = usePlayer((s) => s.sourceLabel);
  const { toggleShuffle, cycleRepeat, jumpTo, moveInQueue, clearUpcoming } = usePlayer.getState();
  const byId = useLibrary((s) => s.index.byId);
  const openMenu = useUi((s) => s.openTrackMenu);
  const upcoming = queue.slice(index + 1);

  const chip = (icon: 'shuffle' | 'repeat', label: string, activeState: boolean, onPress: () => void, badge?: string) => (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: activeState ? textColor : chipColor }]}
      accessibilityRole="switch"
      accessibilityState={{ checked: activeState }}
      accessibilityLabel={label}>
      <Icon name={icon} size={20} color={activeState ? '#000000' : textColor} />
      {badge ? (
        <Text variant="caption" weight="bold" color={activeState ? '#000000' : textColor}>
          {badge}
        </Text>
      ) : null}
    </Pressable>
  );

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="headline" color={textColor}>
            À suivre
          </Text>
          {sourceLabel ? (
            <Text variant="footnote" color={dimColor} numberOfLines={1}>
              Lecture depuis : {sourceLabel}
            </Text>
          ) : null}
        </View>
        {chip('shuffle', 'Lecture aléatoire', shuffle, toggleShuffle)}
        {chip('repeat', repeat === 'one' ? 'Répéter le morceau' : 'Répéter', repeat !== 'off', cycleRepeat, repeat === 'one' ? '1' : undefined)}
      </View>
      {upcoming.length ? (
        <Pressable onPress={clearUpcoming} style={styles.clear} accessibilityRole="button">
          <Text variant="footnote" weight="semibold" color={dimColor}>
            Effacer la file
          </Text>
        </Pressable>
      ) : null}
      <ScrollView style={styles.fill} showsVerticalScrollIndicator={false}>
        {upcoming.length === 0 ? (
          <Text variant="subhead" color={dimColor} style={{ paddingVertical: 24, textAlign: 'center' }}>
            Aucun morceau à suivre.
          </Text>
        ) : (
          upcoming.map((id, k) => {
            const t = byId[id];
            const qi = index + 1 + k;
            if (!t) return null;
            return (
              <DraggableRow
                key={`${id}-${qi}`}
                index={qi}
                count={queue.length}
                rowHeight={ROW}
                handleColor={dimColor}
                onMove={(from, to) => moveInQueue(from, Math.max(index + 1, to))}>
                <Pressable
                  style={styles.row}
                  onPress={() => jumpTo(qi)}
                  onLongPress={() => openMenu(id, { queueIndex: qi })}
                  accessibilityRole="button"
                  accessibilityLabel={`Lire ${t.title}`}>
                  <Artwork track={t} size={44} rounded={6} />
                  <View style={{ flex: 1 }}>
                    <Text variant="body" color={textColor} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text variant="subhead" color={dimColor} numberOfLines={1}>
                      {t.artist}
                    </Text>
                  </View>
                </Pressable>
              </DraggableRow>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  chip: { height: 34, minWidth: 44, paddingHorizontal: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  clear: { alignSelf: 'flex-start', paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, height: ROW },
});
