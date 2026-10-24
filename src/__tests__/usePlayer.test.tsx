import { act, renderHook } from '@testing-library/react-native';

import type { EngineStatus, PlaybackEngine } from '../player/PlaybackEngine';
import { IDLE_STATUS, usePlayer } from '../player/usePlayer';
import type { Track } from '../types';

class FakeEngine implements PlaybackEngine {
  loaded: string[] = [];
  playing = false;
  seeks: number[] = [];
  released = false;
  private listener: ((s: EngineStatus) => void) | null = null;

  load(uri: string) {
    this.loaded.push(uri);
  }
  play() {
    this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  async seekTo(s: number) {
    this.seeks.push(s);
  }
  onStatus(l: (s: EngineStatus) => void) {
    this.listener = l;
    return () => {
      this.listener = null;
    };
  }
  release() {
    this.released = true;
  }
  emit(s: Partial<EngineStatus>) {
    this.listener?.({ ...IDLE_STATUS, isLoaded: true, ...s });
  }
}

const t = (id: string): Track => ({ id, uri: `file:///${id}.mp3`, title: id, artist: null, durationSec: 100, addedAt: 0 });
const tracks = [t('a'), t('b'), t('c')];

async function setup() {
  const engine = new FakeEngine();
  const hook = await renderHook(() => usePlayer(() => engine));
  return { engine, ...hook };
}

describe('usePlayer', () => {
  it('lance la piste choisie', async () => {
    const { engine, result } = await setup();
    await act(() => result.current.playFrom(tracks, 'b'));
    expect(engine.loaded).toEqual(['file:///b.mp3']);
    expect(engine.playing).toBe(true);
    expect(result.current.track?.id).toBe('b');
  });

  it('met en pause puis reprend', async () => {
    const { engine, result } = await setup();
    await act(() => result.current.playFrom(tracks, 'a'));
    await act(() => engine.emit({ playing: true }));
    await act(() => result.current.toggle());
    expect(engine.playing).toBe(false);
    await act(() => engine.emit({ playing: false }));
    await act(() => result.current.toggle());
    expect(engine.playing).toBe(true);
  });

  it('ignore lecture/pause sans file', async () => {
    const { engine, result } = await setup();
    await act(() => result.current.toggle());
    expect(engine.playing).toBe(false);
  });

  it('passe à la suivante, puis s’arrête en bout de file', async () => {
    const { engine, result } = await setup();
    await act(() => result.current.playFrom(tracks, 'b'));
    await act(() => result.current.next());
    expect(result.current.track?.id).toBe('c');
    await act(() => result.current.next());
    expect(result.current.track?.id).toBe('c');
    expect(engine.loaded).toEqual(['file:///b.mp3', 'file:///c.mp3']);
  });

  it('« précédent » relance la piste après 3 s, sinon recule', async () => {
    const { engine, result } = await setup();
    await act(() => result.current.playFrom(tracks, 'b'));
    await act(() => engine.emit({ positionSec: 42 }));
    await act(() => result.current.previous());
    expect(engine.seeks).toEqual([0]);
    expect(result.current.track?.id).toBe('b');
    await act(() => engine.emit({ positionSec: 1 }));
    await act(() => result.current.previous());
    expect(result.current.track?.id).toBe('a');
  });

  it('enchaîne automatiquement en fin de piste', async () => {
    const { engine, result } = await setup();
    await act(() => result.current.playFrom(tracks, 'a'));
    await act(() => engine.emit({ didJustFinish: true }));
    expect(result.current.track?.id).toBe('b');
  });

  it('s’arrête après la dernière piste', async () => {
    const { engine, result } = await setup();
    await act(() => result.current.playFrom(tracks, 'c'));
    await act(() => engine.emit({ didJustFinish: true }));
    expect(engine.playing).toBe(false);
    expect(engine.seeks).toEqual([0]);
    expect(result.current.track?.id).toBe('c');
  });

  it('libère le moteur au démontage', async () => {
    const { engine, unmount } = await setup();
    await unmount();
    expect(engine.released).toBe(true);
  });
});
