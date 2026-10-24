import { activeLineIndex, parseLyrics } from '../player/lrc';
import { indexAfterMove, indexAfterRemove, moveItem, nextRepeat, shouldRestart, shuffleAround, shuffled } from '../player/queue';

describe('parseLyrics', () => {
  it('lit un fichier .lrc synchronisé', () => {
    const l = parseLyrics('[ti:Aube]\n[ar:Nora Vale]\n[00:01.50]Première\n[00:05.00][00:20.00]Refrain\n[00:10]Deuxième\n');
    expect(l.synced).toBe(true);
    expect(l.lines.map((x) => [x.timeSec, x.text])).toEqual([
      [1.5, 'Première'],
      [5, 'Refrain'],
      [10, 'Deuxième'],
      [20, 'Refrain'],
    ]);
  });

  it('applique le décalage [offset]', () => {
    expect(parseLyrics('[offset:+500]\n[00:02.00]A').lines[0].timeSec).toBe(1.5);
  });

  it('accepte un texte non synchronisé', () => {
    const l = parseLyrics('Ligne 1\r\n\r\nLigne 2');
    expect(l).toEqual({ synced: false, lines: [{ timeSec: null, text: 'Ligne 1' }, { timeSec: null, text: 'Ligne 2' }] });
  });

  it('trouve la ligne active', () => {
    const { lines } = parseLyrics('[00:01]A\n[00:05]B\n[00:10]C');
    expect(activeLineIndex(lines, 0)).toBe(-1);
    expect(activeLineIndex(lines, 5)).toBe(1);
    expect(activeLineIndex(lines, 99)).toBe(2);
  });
});

describe('file de lecture', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];

  it('mélange en gardant la piste courante en tête et tous les éléments', () => {
    const s = shuffleAround(ids, 2, () => 0.3);
    expect(s[0]).toBe('c');
    expect([...s].sort()).toEqual(ids);
  });

  it('mélange de façon déterministe avec un tirage fixe', () => {
    expect(shuffled([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
  });

  it('cycle de répétition', () => {
    expect(nextRepeat('off')).toBe('all');
    expect(nextRepeat('all')).toBe('one');
    expect(nextRepeat('one')).toBe('off');
  });

  it('« précédent » relance la piste après 3 s ou en tête de file', () => {
    expect(shouldRestart(10, 2, 'off')).toBe(true);
    expect(shouldRestart(1, 2, 'off')).toBe(false);
    expect(shouldRestart(1, 0, 'off')).toBe(true);
    expect(shouldRestart(1, 0, 'all')).toBe(false);
  });

  it('déplace un élément et recalcule l’index courant', () => {
    expect(moveItem(ids, 0, 3)).toEqual(['b', 'c', 'd', 'a', 'e']);
    expect(moveItem(ids, 0, 9)).toBe(ids);
    expect(indexAfterMove(2, 2, 4)).toBe(4);
    expect(indexAfterMove(2, 0, 3)).toBe(1);
    expect(indexAfterMove(2, 4, 0)).toBe(3);
    expect(indexAfterMove(2, 3, 4)).toBe(2);
  });

  it('recalcule l’index après suppression', () => {
    expect(indexAfterRemove(2, 0, 5)).toBe(1);
    expect(indexAfterRemove(2, 4, 5)).toBe(2);
    expect(indexAfterRemove(4, 4, 5)).toBe(3);
    expect(indexAfterRemove(0, 0, 1)).toBe(-1);
  });
});
