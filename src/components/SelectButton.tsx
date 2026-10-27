import type { MediaKind } from '../library/fileOps';
import { useSelection } from '../store/selection';
import { HeaderButton } from './Screen';

/** « Sélectionner » en tête d'une liste : coche ensuite un ou plusieurs éléments (barre d'actions en bas). */
export function SelectButton({ kind }: { kind: MediaKind }) {
  const active = useSelection((s) => s.kind === kind);
  if (active) return null;
  return <HeaderButton icon="checkmark-circle-outline" label="Sélectionner" onPress={() => useSelection.getState().start(kind)} />;
}
