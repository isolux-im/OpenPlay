import { EMPTY_QUEUE, currentTrack, nextIndex, previousAction, startQueue } from '../player/queue';
import type { Track } from '../types';

const t = (id: string): Track => ({ id, uri: `file:///${id}.mp3`, title: id, artist: null, durationSec: 100, addedAt: 0 });
const tracks = [t('a'), t('b'), t('c')];

describe('file de lecture', () => {
  it('démarre sur la piste choisie', () => {
    const q = startQueue(tracks, 'b');
    expect(currentTrack(q)?.id).toBe('b');
  });

  it('démarre au début si la piste est introuvable', () => {
    expect(startQueue(tracks, 'zz').index).toBe(0);
  });

  it('reste vide sans pistes', () => {
    expect(startQueue([], 'a')).toEqual(EMPTY_QUEUE);
    expect(currentTrack(EMPTY_QUEUE)).toBeNull();
    expect(nextIndex(EMPTY_QUEUE)).toBeNull();
  });

  it('avance jusqu’à la dernière piste puis s’arrête', () => {
    expect(nextIndex({ tracks, index: 0 })).toBe(1);
    expect(nextIndex({ tracks, index: 2 })).toBeNull();
  });

  it('« précédent » revient au début après 3 s', () => {
    expect(previousAction({ tracks, index: 1 }, 10)).toEqual({ type: 'restart' });
  });

  it('« précédent » change de piste dans les 3 premières secondes', () => {
    expect(previousAction({ tracks, index: 1 }, 1)).toEqual({ type: 'goto', index: 0 });
  });

  it('« précédent » sur la première piste la relance', () => {
    expect(previousAction({ tracks, index: 0 }, 0)).toEqual({ type: 'restart' });
  });
});
