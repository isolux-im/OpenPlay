import { parseFilename } from '../library/filename';
import { alphabetIndex, compareText, formatDuration, formatTotalDuration, indexLetter, normalizeText, pluralize, sortKey } from '../library/text';

describe('parseFilename', () => {
  it.each([
    ['Angélique Kidjo - Agolo.mp3', { artist: 'Angélique Kidjo', title: 'Agolo' }],
    ['03 - Artiste - Titre.flac', { artist: 'Artiste', title: 'Titre' }],
    ['07_Mon titre.ogg', { artist: null, title: 'Mon titre' }],
    ['50 Cent - In da Club.mp3', { artist: '50 Cent', title: 'In da Club' }],
    ['Jean-Pierre.mp3', { artist: null, title: 'Jean-Pierre' }],
  ])('%s', (name, expected) => {
    expect(parseFilename(name)).toEqual(expected);
  });
});

describe('texte', () => {
  it('normalise accents, casse et ponctuation', () => {
    expect(normalizeText('  Élise—Moreau, «Valse» ')).toBe('elise moreau valse');
  });

  it('ignore les articles pour le tri', () => {
    expect(sortKey('The Beatles')).toBe('beatles');
    expect(sortKey("L'Écho")).toBe('echo');
    expect(['Zèbre', 'The Abba', 'écho'].sort(compareText)).toEqual(['The Abba', 'écho', 'Zèbre']);
  });

  it('donne la lettre d’index', () => {
    expect(indexLetter('Élan')).toBe('E');
    expect(indexLetter('2Pac')).toBe('#');
  });

  it.each([
    [0, '0:00'],
    [65.9, '1:05'],
    [3725, '1:02:05'],
    [Number.NaN, '0:00'],
  ])('formatDuration(%p) = %p', (s, e) => expect(formatDuration(s)).toBe(e));

  it('formate les durées totales', () => {
    expect(formatTotalDuration(52 * 60)).toBe('52 min');
    expect(formatTotalDuration(67 * 60)).toBe('1 h 07 min');
  });

  it('accorde le pluriel', () => {
    expect(pluralize(1, 'morceau', 'morceaux')).toBe('1 morceau');
    expect(pluralize(3, 'album')).toBe('3 albums');
  });

  it('construit l’index A–Z d’une liste triée', () => {
    const keys = ['2Pac', 'Aube', 'The Abba', 'Écho', 'Élan', 'Zèbre'];
    const { letters, first } = alphabetIndex(keys);
    expect(letters).toEqual(['#', 'A', 'E', 'Z']);
    expect(first).toEqual({ '#': 0, A: 1, E: 3, Z: 5 });
  });
});
