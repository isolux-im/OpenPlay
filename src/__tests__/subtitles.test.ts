import { useSubtitles } from '../store/subtitles';
import { useUi } from '../store/ui';
import { importSubtitles, loadCues, unlinkSubtitles } from '../video/subtitleFiles';
import { clampOffset, cueTextAt, detectFormat, formatOffset, parseSubtitles, parseTimestamp } from '../video/subtitles';

jest.mock('../../modules/openplay-media', () => ({
  OpenPlayMedia: {
    pickSubtitleAsync: jest.fn(),
    readSubtitleAsync: jest.fn(),
    releaseSubtitleAsync: jest.fn(() => Promise.resolve()),
  },
}));

const mockNative = jest.requireMock<{ OpenPlayMedia: Record<'pickSubtitleAsync' | 'readSubtitleAsync' | 'releaseSubtitleAsync', jest.Mock> }>('../../modules/openplay-media').OpenPlayMedia;

const SRT = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\n<i>Bonjour</i> tout le monde\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000 X1:0 X2:10\r\n{\\an8}Ligne 1\r\nLigne 2 &amp; fin\r\n\r\n3\r\n00:00:07,000 --> 00:00:05,000\r\nMinutage invalide\r\n';

const VTT = `WEBVTT - Exemple

NOTE commentaire
sur deux lignes

STYLE
::cue { color: yellow }

intro
00:01.000 --> 00:02.500 align:start position:10%
<v Ama>Akwaba !</v>

00:00:02.000 --> 00:00:04.000
<c.jaune>Chevauchement</c> <00:00:03.000>suite
`;

describe('lecture des sous-titres', () => {
  it('lit les horodatages SRT et WebVTT', () => {
    expect(parseTimestamp('01:02:03,456')).toBeCloseTo(3723.456);
    expect(parseTimestamp('02:03.4')).toBeCloseTo(123.4);
    expect(parseTimestamp('00:61:00,000')).toBeNull();
    expect(parseTimestamp('abc')).toBeNull();
  });

  it('lit un SRT (BOM, CRLF, balises, codes ASS, entités) et ignore les minutages invalides', () => {
    expect(parseSubtitles(SRT)).toEqual([
      { start: 1, end: 3.5, text: 'Bonjour tout le monde' },
      { start: 4, end: 6, text: 'Ligne 1\nLigne 2 & fin' },
    ]);
  });

  it('lit un WebVTT (en-tête, NOTE, STYLE, identifiants, réglages, voix)', () => {
    expect(detectFormat(VTT)).toBe('vtt');
    expect(detectFormat('1\n00:00:01,000 --> 00:00:02,000\nx', 'film.srt')).toBe('srt');
    expect(parseSubtitles(VTT)).toEqual([
      { start: 1, end: 2.5, text: 'Akwaba !' },
      { start: 2, end: 4, text: 'Chevauchement suite' },
    ]);
  });

  it('ne reconnaît rien dans un fichier qui n’est pas un sous-titre', () => {
    expect(parseSubtitles('Bonjour\nceci est un texte')).toEqual([]);
    expect(parseSubtitles('')).toEqual([]);
  });

  it('affiche les répliques actives, superpositions et décalage compris', () => {
    const cues = parseSubtitles(VTT);
    expect(cueTextAt(cues, 0.5)).toBeNull();
    expect(cueTextAt(cues, 1.2)).toBe('Akwaba !');
    expect(cueTextAt(cues, 2.2)).toBe('Akwaba !\nChevauchement suite');
    expect(cueTextAt(cues, 4)).toBeNull();
    // +1 s : les sous-titres arrivent une seconde plus tard.
    expect(cueTextAt(cues, 1.2, 1)).toBeNull();
    expect(cueTextAt(cues, 2.2, 1)).toBe('Akwaba !');
    expect(cueTextAt(cues, 0.2, -1)).toBe('Akwaba !');
    expect(cueTextAt([], 3)).toBeNull();
  });

  it('borne et affiche le décalage', () => {
    expect(clampOffset(0.1 + 0.2)).toBe(0.3);
    expect(clampOffset(500)).toBe(60);
    expect(formatOffset(0)).toBe('0 s');
    expect(formatOffset(1.5)).toBe('+1,5 s');
    expect(formatOffset(-2)).toBe('−2 s');
  });
});

describe('association vidéo → sous-titres', () => {
  beforeEach(() => {
    useSubtitles.setState({ byVideo: {} });
    jest.clearAllMocks();
  });
  afterEach(() => useUi.getState().hideToast());

  it('libère l’accès d’un fichier qui n’est plus utilisé et garde le décalage du même fichier', () => {
    const s = useSubtitles.getState();
    expect(s.link('v1', { uri: 'content://a', name: 'a.srt', persistent: true }, 1)).toEqual([]);
    useSubtitles.getState().setOffset('v1', 2.5);
    expect(useSubtitles.getState().link('v1', { uri: 'content://a', name: 'a.srt', persistent: true }, 2)).toEqual([]);
    expect(useSubtitles.getState().byVideo.v1.offsetSec).toBe(2.5);
    useSubtitles.getState().link('v2', { uri: 'content://a', name: 'a.srt', persistent: true }, 3);
    // Fichier encore utilisé par v2 : rien à libérer.
    expect(useSubtitles.getState().link('v1', { uri: 'content://b', name: 'b.srt', persistent: true }, 4)).toEqual([]);
    expect(useSubtitles.getState().byVideo.v1.offsetSec).toBe(0);
    expect(useSubtitles.getState().unlink('v2')).toEqual(['content://a']);
    expect(useSubtitles.getState().unlink('absent')).toEqual([]);
  });

  it('importe un fichier choisi, l’associe et le relit depuis le cache', async () => {
    mockNative.pickSubtitleAsync.mockResolvedValue({ uri: 'content://doc/1', name: 'film.srt', size: 200, persistent: true });
    mockNative.readSubtitleAsync.mockResolvedValue(SRT);
    await expect(importSubtitles({ id: 'v9' })).resolves.toBe(true);
    expect(useSubtitles.getState().byVideo.v9).toMatchObject({ uri: 'content://doc/1', name: 'film.srt', persistent: true, offsetSec: 0 });
    expect(useUi.getState().toast).toBe('Sous-titres associés (2 répliques)');
    await loadCues('content://doc/1');
    expect(mockNative.readSubtitleAsync).toHaveBeenCalledTimes(1);
    unlinkSubtitles('v9');
    expect(mockNative.releaseSubtitleAsync).toHaveBeenCalledWith('content://doc/1');
    expect(useSubtitles.getState().byVideo.v9).toBeUndefined();
  });

  it('refuse un fichier non reconnu et libère son accès', async () => {
    mockNative.pickSubtitleAsync.mockResolvedValue({ uri: 'content://doc/2', name: 'notes.txt', size: 20, persistent: true });
    mockNative.readSubtitleAsync.mockResolvedValue('juste du texte');
    await expect(importSubtitles({ id: 'v1' })).resolves.toBe(false);
    expect(useSubtitles.getState().byVideo.v1).toBeUndefined();
    expect(mockNative.releaseSubtitleAsync).toHaveBeenCalledWith('content://doc/2');
    expect(useUi.getState().toast).toBe('Aucun sous-titre reconnu : formats SRT ou WebVTT uniquement.');
  });

  it('signale un fichier trop volumineux ou inaccessible, et ne fait rien si l’utilisateur annule', async () => {
    mockNative.pickSubtitleAsync.mockResolvedValue({ uri: 'content://doc/3', name: 'gros.srt', size: 1e8, persistent: false });
    mockNative.readSubtitleAsync.mockRejectedValue(Object.assign(new Error('x'), { code: 'ERR_SUBTITLE_TOO_LARGE' }));
    await expect(importSubtitles({ id: 'v1' })).resolves.toBe(false);
    expect(useUi.getState().toast).toBe('Fichier trop volumineux pour des sous-titres.');
    mockNative.pickSubtitleAsync.mockResolvedValue(null);
    await expect(importSubtitles({ id: 'v1' })).resolves.toBe(false);
    expect(mockNative.readSubtitleAsync).toHaveBeenCalledTimes(1);
  });

  it('ne conserve après redémarrage que les associations à accès persistant', () => {
    useSubtitles.getState().link('v1', { uri: 'content://p', name: 'p.srt', persistent: true }, 1);
    useSubtitles.getState().link('v2', { uri: 'content://t', name: 't.srt', persistent: false }, 2);
    const partialize = useSubtitles.persist.getOptions().partialize!;
    expect(Object.keys((partialize(useSubtitles.getState()) as { byVideo: object }).byVideo)).toEqual(['v1']);
  });
});
