import { formatDuration, parseFilename, sortTracks, trackFromAsset } from '../library/trackFromAsset';
import type { Track } from '../types';

describe('parseFilename', () => {
  it('sépare « Artiste - Titre »', () => {
    expect(parseFilename('Angélique Kidjo - Agolo.mp3')).toEqual({ artist: 'Angélique Kidjo', title: 'Agolo' });
  });

  it('retire le numéro de piste en tête', () => {
    expect(parseFilename('03 - Artiste - Titre.flac')).toEqual({ artist: 'Artiste', title: 'Titre' });
    expect(parseFilename('07_Mon titre.ogg')).toEqual({ artist: null, title: 'Mon titre' });
  });

  it('ne confond pas un nom d’artiste numérique avec un numéro de piste', () => {
    expect(parseFilename('50 Cent - In da Club.mp3')).toEqual({ artist: '50 Cent', title: 'In da Club' });
  });

  it('garde un titre seul sans artiste', () => {
    expect(parseFilename('Mon enregistrement.m4a')).toEqual({ artist: null, title: 'Mon enregistrement' });
  });

  it('ne coupe pas les traits d’union internes', () => {
    expect(parseFilename('Jean-Pierre.mp3')).toEqual({ artist: null, title: 'Jean-Pierre' });
  });

  it('revient au nom de fichier si rien ne subsiste', () => {
    expect(parseFilename('.mp3').title).toBe('.mp3');
  });
});

describe('trackFromAsset', () => {
  it('convertit un asset en piste', () => {
    expect(
      trackFromAsset({ id: '42', uri: 'file:///a.mp3', filename: 'A - B.mp3', duration: 185.4, creationTime: 10 }),
    ).toEqual({ id: '42', uri: 'file:///a.mp3', title: 'B', artist: 'A', durationSec: 185.4, addedAt: 10 });
  });

  it('borne une durée invalide à 0', () => {
    expect(
      trackFromAsset({ id: '1', uri: 'u', filename: 'x.mp3', duration: -1, creationTime: 0 }).durationSec,
    ).toBe(0);
  });
});

describe('sortTracks', () => {
  it('trie par titre sans tenir compte de la casse ni des accents', () => {
    const t = (title: string): Track => ({ id: title, uri: '', title, artist: null, durationSec: 0, addedAt: 0 });
    expect(sortTracks([t('zèbre'), t('Écho'), t('abeille')]).map((x) => x.title)).toEqual(['abeille', 'Écho', 'zèbre']);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [5.9, '0:05'],
    [65, '1:05'],
    [3600, '60:00'],
    [Number.NaN, '0:00'],
  ])('%p → %p', (sec, expected) => {
    expect(formatDuration(sec)).toBe(expected);
  });
});
