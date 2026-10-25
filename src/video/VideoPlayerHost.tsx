import { useEventListener } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { VideoView, isPictureInPictureSupported, useVideoPlayer as useNativeVideoPlayer, type SubtitleTrack, type VideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, PixelRatio, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OpenPlayMedia } from '../../modules/openplay-media';
import { recordDiagnostic } from '../diagnostics/crashReports';
import { formatDuration } from '../library/text';
import { registerVideoPauser } from '../player/mediaFocus';
import { Scrubber } from '../player/ui/Scrubber';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { useIntros } from '../store/intros';
import { useSubtitles } from '../store/subtitles';
import { useUi } from '../store/ui';
import { useVideoHistory } from '../store/videoHistory';
import { useVideoPlayer } from '../store/videoPlayer';
import { useVideoStats } from '../store/videoStats';
import { useVideos } from '../store/videos';
import { tap } from '../ui/haptics';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { fitLabel, nextFitMode, preferredOrientation, seekSwipeDelta, swipeLevel, videoFrame, volumeStep } from './display';
import { detectIntro, inIntro } from './intro';
import { isFinished, resumePosition } from './library';
import { episodeLabel, nextEpisode } from './series';
import { importSubtitles, unlinkSubtitles, useExternalSubtitles } from './subtitleFiles';
import { SubtitleOverlay, SubtitlePanel, trackKey, type SubtitleChoice } from './SubtitlePanel';
import { cueTextAt } from './subtitles';
import type { Video } from './types';
import { useSeriesIndex } from './useSeries';
import { VideoThumb } from './VideoThumb';

export const VIDEO_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const HIDE_CONTROLS_MS = 3500;
const DOUBLE_TAP_MS = 280;
const SEEK_STEP = 10;
const SAVE_EVERY_MS = 5000;
const RESUME_HINT_MS = 6000;
/** Marges où un glissement appartient au système (barre d'état, navigation, retour). */
const EDGE = 40;
const UP_NEXT_MS = 10_000;

type Orientation = 'landscape' | 'portrait' | 'sensor';
/** Orientation choisie à la main, conservée d'une vidéo à la suivante tant que le lecteur reste ouvert. */
let carriedOrientation: Orientation | null = null;
const ORIENTATION_LABELS: Record<Orientation, string> = { sensor: 'Rotation automatique', landscape: 'Paysage verrouillé', portrait: 'Portrait verrouillé' };
/** Temps de visionnage écrit par paquets (évite une écriture du stockage à chaque seconde). */
const WATCH_FLUSH_SEC = 30;

/** Lecteur vidéo plein écran, au-dessus de l'application ; une nouvelle ouverture recrée le lecteur. */
export function VideoPlayerHost() {
  const session = useVideoPlayer((s) => s.session);
  const video = useVideos((s) => (session ? s.byId[session.id] : undefined));
  if (!session || !video) return null;
  return <PlayerSurface key={session.seq} video={video} list={session.list} restart={session.restart} />;
}

// Réglages du lecteur natif passés par des fonctions : le lecteur est un objet natif mutable par conception.
function setTime(player: VideoPlayer, sec: number) {
  player.currentTime = sec;
}

function setPlaybackRate(player: VideoPlayer, rate: number) {
  player.playbackRate = rate;
}

function setVolume(player: VideoPlayer, volume: number) {
  player.volume = volume;
}

function setSubtitleTrack(player: VideoPlayer, track: SubtitleTrack | null) {
  try {
    player.subtitleTrack = track;
  } catch {
    // Piste refusée par le lecteur natif : la vidéo continue sans sous-titres intégrés.
  }
}

function IconButton({ icon, label, onPress, size = 26, disabled = false }: { icon: IconName; label: string; onPress: () => void; size?: number; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={[styles.iconButton, disabled && { opacity: 0.35 }]} accessibilityRole="button" accessibilityLabel={label}>
      <Icon name={icon} size={size} color="#FFFFFF" />
    </Pressable>
  );
}

/**
 * Indicateur du glissement vertical, à la manière de VLC : barre verticale du côté opposé au doigt
 * (volume à gauche, luminosité à droite), pourcentage au-dessus, icône dessous, libellé à côté.
 */
function LevelIndicator({ kind, value }: { kind: 'brightness' | 'volume'; value: number }) {
  const percent = Math.round(value * 100);
  const volume = kind === 'volume';
  const icon: IconName = !volume ? 'sunny' : value === 0 ? 'volume-mute' : value < 0.4 ? 'volume-low' : value < 0.75 ? 'volume-medium' : 'volume-high';
  const label = volume ? 'Volume' : 'Luminosité';
  return (
    <View pointerEvents="none" style={[styles.levelSide, volume ? { left: '12%' } : { right: '12%' }]} accessibilityLiveRegion="polite" accessibilityLabel={`${label} ${percent} %`}>
      {!volume ? (
        <Text variant="headline" color="#FFFFFF" style={styles.levelLabel}>
          {label}
        </Text>
      ) : null}
      <View style={styles.levelColumn}>
        <Text variant="headline" color="#FFFFFF" style={styles.levelShadow}>
          {percent} %
        </Text>
        <View style={styles.levelBar}>
          <View style={[styles.levelBarFill, { height: `${percent}%` }]} />
        </View>
        <Icon name={icon} size={30} color="#FFFFFF" />
      </View>
      {volume ? (
        <Text variant="headline" color="#FFFFFF" style={styles.levelLabel}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/** PiP natif disponible ? La fonction d'expo-video n'existe pas sur toutes les plateformes (web). */
function pipAvailable(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    return isPictureInPictureSupported();
  } catch {
    return false;
  }
}

function formatRate(rate: number) {
  return `${rate.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}×`;
}

function PlayerSurface({ video, list, restart }: { video: Video; list: string[]; restart: boolean }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const swipeEnabled = useSettings((s) => s.videoSwipe);
  const seekSwipeEnabled = useSettings((s) => s.videoSeekSwipe);
  const fitMode = useSettings((s) => s.videoFit);
  const orientationMode = useSettings((s) => s.videoOrientation);
  const autoNext = useSettings((s) => s.videoAutoNext);
  const introDetect = useSettings((s) => s.videoIntroDetect);
  const introAutoSkip = useSettings((s) => s.videoIntroAutoSkip);
  const series = useSeriesIndex().byVideo[video.id];
  const intro = useIntros((s) => s.byVideo[video.id]);
  const pipEnabled = useSettings((s) => s.videoPip);
  const doubleTapEnabled = useSettings((s) => s.videoDoubleTap);
  const { close, step } = useVideoPlayer.getState();
  const showToast = useUi((s) => s.showToast);
  const view = useRef<VideoView>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(video.durationSec);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inPip, setInPip] = useState(false);
  const [controls, setControls] = useState(true);
  const [locked, setLocked] = useState(false);
  const [rate, setRate] = useState(1);
  const [upNext, setUpNext] = useState<{ video: Video; deadline: number } | null>(null);
  const [upNextLeft, setUpNextLeft] = useState(0);
  // « Auto » et « Paysage » s'appliquent dès l'ouverture ; « Selon vidéo » attend la taille de la vidéo.
  const [orientation, setOrientation] = useState<Orientation | null>(() => carriedOrientation ?? (orientationMode === 'sensor' || orientationMode === 'landscape' ? orientationMode : null));
  const [flash, setFlash] = useState<{ text: string; at: number } | null>(null);
  const [level, setLevel] = useState<{ kind: 'brightness' | 'volume'; value: number; at: number } | null>(null);
  /** Variante sans module natif (web) : voile sombre en guise de luminosité. */
  const [dim, setDim] = useState(0);
  /** Glissement horizontal en cours : position visée et écart. */
  const [seekPreview, setSeekPreview] = useState<{ target: number; delta: number } | null>(null);
  const [trackSize, setTrackSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [seekHint, setSeekHint] = useState<{
    side: 'left' | 'right';
    at: number;
  } | null>(null);
  const [interaction, setInteraction] = useState(0);
  const [resumedAt, setResumedAt] = useState<number | null>(null);
  const subtitleLink = useSubtitles((s) => s.byVideo[video.id]);
  const external = useExternalSubtitles(subtitleLink);
  const [subtitleChoice, setSubtitleChoice] = useState<SubtitleChoice>(() => (subtitleLink ? { kind: 'external' } : { kind: 'off' }));
  const [embeddedTracks, setEmbeddedTracks] = useState<SubtitleTrack[]>([]);
  const [subtitlesOpen, setSubtitlesOpen] = useState(false);
  const started = useRef(false);
  const failed = useRef(false);
  /** Dernière position connue : un lecteur libéré (fermeture de la fenêtre flottante) peut renvoyer 0. */
  const lastPosition = useRef(0);
  const watch = useRef({ last: -1, pending: 0 });
  const finishedRecorded = useRef(false);
  const introSkipped = useRef(false);
  const controlsState = useRef({ volume: 1, volumeSteps: 15, brightness: 1 });
  const orientationBeforeLock = useRef<Orientation | null>(null);
  const swipe = useRef<{ kind: 'brightness' | 'volume'; start: number; sent: number } | null>(null);
  const seekSwipe = useRef<{ start: number; target: number } | null>(null);
  const lastSave = useRef(0);
  const lastTap = useRef<{ at: number; side: 'left' | 'right' } | null>(null);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = list.indexOf(video.id);

  const player = useNativeVideoPlayer(video.uri ? { uri: video.uri } : null, (p) => {
    // 0,25 s : précision suffisante pour l'affichage des sous-titres importés.
    p.timeUpdateEventInterval = 0.25;
    p.keepScreenOnWhilePlaying = true;
    // Une seule notification de lecture : celle de la musique. La vidéo ne joue pas en arrière-plan hors PiP.
    p.showNowPlayingNotification = false;
    p.staysActiveInBackground = false;
    p.audioMixingMode = 'doNotMix';
    p.preservesPitch = true;
  });

  const flushWatching = () => {
    const sec = watch.current.pending;
    watch.current.pending = 0;
    if (sec > 0) useVideoStats.getState().addWatching(video.id, Date.now(), sec);
  };

  const save = (pos: number) => {
    if (!started.current || failed.current) return;
    const d = duration || player.duration || video.durationSec;
    if (d > 0) useVideoHistory.getState().savePosition(video.id, pos, d, Date.now());
    if (d > 0 && !finishedRecorded.current && isFinished(pos, d)) {
      finishedRecorded.current = true;
      useVideoStats.getState().addFinished(video.id, Date.now());
    }
    flushWatching();
  };

  // Plein écran immersif pendant la lecture ; orientation, luminosité et barres système rétablies à la fermeture.
  useEffect(() => {
    void OpenPlayMedia?.setImmersiveAsync?.(true).catch(() => {});
    void OpenPlayMedia?.getVideoControlsStateAsync?.()
      .then((state) => {
        controlsState.current = state;
      })
      .catch(() => {});
    return () => {
      // Passage à la vidéo suivante (épisode, précédent / suivant) : on garde l'orientation et le réglage en cours.
      if (useVideoPlayer.getState().session) return;
      carriedOrientation = null;
      void OpenPlayMedia?.setImmersiveAsync?.(false).catch(() => {});
      void OpenPlayMedia?.setScreenOrientationAsync?.('default').catch(() => {});
      void OpenPlayMedia?.setWindowBrightnessAsync?.(-1).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (orientation) void OpenPlayMedia?.setScreenOrientationAsync?.(orientation).catch(() => {});
  }, [orientation]);

  // Une seule lecture à la fois : la musique met la vidéo en pause, et inversement.
  useEffect(() => {
    registerVideoPauser(() => player.pause());
    return () => registerVideoPauser(null);
  }, [player]);

  useEventListener(player, 'statusChange', ({ status, error: e }) => {
    if (status === 'readyToPlay' && !started.current) {
      started.current = true;
      if (player.duration > 0) setDuration(player.duration);
      const resumeAt = restart ? 0 : resumePosition(useVideoHistory.getState().entries[video.id], player.duration || video.durationSec);
      if (resumeAt > 0) {
        setTime(player, resumeAt);
        setPosition(resumeAt);
        lastPosition.current = resumeAt;
        setResumedAt(resumeAt);
      }
      setEmbeddedTracks(player.availableSubtitleTracks ?? []);
      if (player.videoTrack?.size) setTrackSize(player.videoTrack.size);
      // Orientation choisie dans les réglages ; « selon la vidéo » utilise la taille MediaStore corrigée de la rotation.
      if (orientationMode === 'video') setOrientation((o) => o ?? preferredOrientation(video.width && video.height ? video : (player.videoTrack?.size ?? video)));
      // Fichier importé choisi : pas de piste intégrée affichée en même temps.
      if (subtitleChoice.kind !== 'embedded') setSubtitleTrack(player, null);
      if (usePlayer.getState().isPlaying) usePlayer.getState().pause();
      player.play();
    }
    if (status === 'error') {
      const message = e?.message ?? 'erreur inconnue';
      recordDiagnostic('Vidéo illisible', `${video.filename} (${video.mimeType}) : ${message}`);
      failed.current = true;
      setError('Lecture impossible : format ou codec non pris en charge, ou fichier inaccessible.');
      player.pause();
    }
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    setPlaying(isPlaying);
    if (isPlaying) {
      setEnded(false);
      if (usePlayer.getState().isPlaying) usePlayer.getState().pause();
    } else save(currentPosition());
  });

  useEventListener(player, 'videoTrackChange', ({ videoTrack }) => {
    if (videoTrack?.size) setTrackSize(videoTrack.size);
  });

  useEventListener(player, 'availableSubtitleTracksChange', ({ availableSubtitleTracks }) => setEmbeddedTracks(availableSubtitleTracks));

  // Piste intégrée activée par le lecteur (piste par défaut du fichier) : le choix affiché suit.
  useEventListener(player, 'subtitleTrackChange', ({ subtitleTrack }) => {
    if (subtitleTrack) setSubtitleChoice({ kind: 'embedded', id: trackKey(subtitleTrack) });
    else setSubtitleChoice((c) => (c.kind === 'embedded' ? { kind: 'off' } : c));
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    setPosition(currentTime);
    lastPosition.current = currentTime;
    // Temps réellement regardé : progression du média divisée par la vitesse ; les sauts sont ignorés.
    const delta = currentTime - watch.current.last;
    if (player.playing && watch.current.last >= 0 && delta > 0 && delta < 2) watch.current.pending += delta / (player.playbackRate || 1);
    watch.current.last = currentTime;
    if (watch.current.pending >= WATCH_FLUSH_SEC) flushWatching();
    if (introAutoSkip && !introSkipped.current && inIntro(intro, currentTime)) {
      introSkipped.current = true;
      setTime(player, intro.end);
      setFlash({ text: 'Générique passé', at: Date.now() });
    }
    const now = Date.now();
    if (now - lastSave.current > SAVE_EVERY_MS) {
      lastSave.current = now;
      save(currentTime);
    }
  });

  useEventListener(player, 'playToEnd', () => {
    setEnded(true);
    setControls(true);
    save(duration || player.duration);
    const next = series && autoNext && !inPip ? nextEpisode(series, video.id) : null;
    if (next) {
      setUpNext({ video: next, deadline: Date.now() + UP_NEXT_MS });
      setUpNextLeft(Math.ceil(UP_NEXT_MS / 1000));
    }
  });

  const playEpisode = (next: Video) => {
    setUpNext(null);
    useVideoPlayer.getState().open(next.id, series ? series.episodes.map((e) => e.id) : [next.id]);
  };

  // Compte à rebours de l'épisode suivant.
  useEffect(() => {
    if (!upNext) return;
    const t = setInterval(() => {
      const left = upNext.deadline - Date.now();
      if (left <= 0) {
        clearInterval(t);
        setUpNext(null);
        useVideoPlayer.getState().open(upNext.video.id, series ? series.episodes.map((e) => e.id) : [upNext.video.id]);
      } else setUpNextLeft(Math.ceil(left / 1000));
    }, 250);
    return () => clearInterval(t);
  }, [upNext, series]);

  // Repérage du générique, quelques secondes après le début pour ne pas ralentir l'ouverture.
  useEffect(() => {
    if (!series || !introDetect || intro) return;
    const t = setTimeout(() => void detectIntro(series, video), 4000);
    return () => clearTimeout(t);
  }, [series, introDetect, intro, video]);

  useEffect(
    () => () => {
      const sec = watch.current.pending;
      watch.current.pending = 0;
      if (sec > 0) useVideoStats.getState().addWatching(video.id, Date.now(), sec);
    },
    [video.id],
  );

  function currentPosition() {
    const t = player.currentTime;
    return t > 0 || lastPosition.current < 1 ? t : lastPosition.current;
  }

  const exit = () => {
    save(currentPosition());
    close();
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (subtitlesOpen) setSubtitlesOpen(false);
      else exit();
      return true;
    });
    return () => sub.remove();
  });

  // Les commandes se masquent seules pendant la lecture.
  useEffect(() => {
    if (!controls || !playing || locked || subtitlesOpen) return;
    const t = setTimeout(() => setControls(false), HIDE_CONTROLS_MS);
    return () => clearTimeout(t);
  }, [controls, playing, locked, interaction, subtitlesOpen]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    if (!level) return;
    const t = setTimeout(() => setLevel((l) => (swipe.current ? l : null)), 900);
    return () => clearTimeout(t);
  }, [level]);

  useEffect(() => {
    if (resumedAt === null) return;
    const t = setTimeout(() => setResumedAt(null), RESUME_HINT_MS);
    return () => clearTimeout(t);
  }, [resumedAt]);

  useEffect(
    () => () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    },
    [],
  );

  const touch = () => setInteraction((n) => n + 1);

  const seekBy = (delta: number) => {
    const d = duration || player.duration;
    const target = Math.max(0, Math.min(d > 0 ? d - 0.5 : Infinity, player.currentTime + delta));
    setTime(player, target);
    setPosition(target);
    lastPosition.current = target;
    touch();
  };

  const restartFromZero = () => {
    tap();
    setTime(player, 0);
    setPosition(0);
    lastPosition.current = 0;
    setResumedAt(null);
    setEnded(false);
    player.play();
  };

  const chooseSubtitles = (c: SubtitleChoice) => {
    if (c.kind === 'embedded') setSubtitleTrack(player, embeddedTracks.find((t) => trackKey(t) === c.id) ?? null);
    else setSubtitleTrack(player, null);
    setSubtitleChoice(c);
  };

  const importForVideo = async () => {
    if (await importSubtitles(video)) chooseSubtitles({ kind: 'external' });
  };

  const onSurfacePress = (x: number) => {
    if (locked) {
      setControls((c) => !c);
      return;
    }
    const side = x < width / 2 ? 'left' : 'right';
    const now = Date.now();
    if (doubleTapEnabled && lastTap.current && now - lastTap.current.at < DOUBLE_TAP_MS && lastTap.current.side === side) {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      lastTap.current = null;
      tap('selection');
      seekBy(side === 'left' ? -SEEK_STEP : SEEK_STEP);
      setSeekHint({ side, at: now });
      return;
    }
    lastTap.current = { at: now, side };
    if (!doubleTapEnabled) {
      setControls((c) => !c);
      return;
    }
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = setTimeout(() => setControls((c) => !c), DOUBLE_TAP_MS);
  };

  useEffect(() => {
    if (!seekHint) return;
    const t = setTimeout(() => setSeekHint(null), 700);
    return () => clearTimeout(t);
  }, [seekHint]);

  const toggle = () => {
    tap();
    if (ended) {
      setUpNext(null);
      player.replay();
      lastPosition.current = 0;
      setEnded(false);
    } else if (playing) player.pause();
    else player.play();
    touch();
  };

  const cycleRate = () => {
    const next = VIDEO_RATES[(VIDEO_RATES.indexOf(rate as (typeof VIDEO_RATES)[number]) + 1) % VIDEO_RATES.length];
    setPlaybackRate(player, next);
    setRate(next);
    touch();
  };

  // Verrouiller fige aussi la rotation dans l'orientation affichée ; déverrouiller rétablit le mode précédent.
  const lock = () => {
    orientationBeforeLock.current = orientation;
    if (OpenPlayMedia?.setScreenOrientationAsync) setOrientation(width > height ? 'landscape' : 'portrait');
    setLocked(true);
    setFlash({ text: 'Commandes et rotation verrouillées', at: Date.now() });
  };

  const unlock = () => {
    const previous = orientationBeforeLock.current;
    setLocked(false);
    if (OpenPlayMedia?.setScreenOrientationAsync) {
      setOrientation(previous);
      if (!previous) void OpenPlayMedia.setScreenOrientationAsync('default').catch(() => {});
    }
    setFlash({ text: 'Déverrouillé', at: Date.now() });
    touch();
  };

  const cycleFit = () => {
    const next = nextFitMode(fitMode);
    useSettings.getState().update({ videoFit: next });
    setFlash({ text: fitLabel(next), at: Date.now() });
    touch();
  };

  const rotate = () => {
    // Comme le verrou de rotation de VLC : automatique → paysage verrouillé → portrait verrouillé → automatique.
    const next: Orientation = orientation === 'sensor' ? 'landscape' : orientation === 'landscape' ? 'portrait' : 'sensor';
    carriedOrientation = next;
    setOrientation(next);
    setFlash({ text: ORIENTATION_LABELS[next], at: Date.now() });
    touch();
  };

  // Glissement vertical (comme VLC) : moitié gauche = luminosité de la fenêtre, moitié droite = volume média.
  const beginSwipe = (x: number, y: number) => {
    if (y < insets.top + EDGE || y > height - insets.bottom - EDGE || x < EDGE / 2 || x > width - EDGE / 2) {
      swipe.current = null;
      return;
    }
    const kind = x < width / 2 ? 'brightness' : 'volume';
    const native = !!OpenPlayMedia?.getVideoControlsStateAsync;
    const start = kind === 'brightness' ? (native ? controlsState.current.brightness : 1 - dim / 0.85) : native ? controlsState.current.volume : player.volume;
    swipe.current = { kind, start, sent: start };
    setControls(false);
  };

  const moveSwipe = (translationY: number) => {
    const s = swipe.current;
    if (!s) return;
    const native = !!OpenPlayMedia?.getVideoControlsStateAsync;
    let value = swipeLevel(s.start, translationY, height);
    if (s.kind === 'volume') {
      if (native) value = volumeStep(value, controlsState.current.volumeSteps);
      if (value !== s.sent) {
        s.sent = value;
        if (native) {
          controlsState.current.volume = value;
          void OpenPlayMedia?.setMediaVolumeAsync?.(value).catch(() => {});
        } else setVolume(player, value);
      }
    } else if (Math.abs(value - s.sent) >= 0.01 || value === 0 || value === 1) {
      s.sent = value;
      if (native) {
        controlsState.current.brightness = value;
        void OpenPlayMedia?.setWindowBrightnessAsync?.(value).catch(() => {});
      } else setDim((1 - value) * 0.85);
    }
    setLevel({ kind: s.kind, value: s.kind === 'volume' ? value : s.sent, at: Date.now() });
  };

  const endSwipe = () => {
    swipe.current = null;
    setLevel((l) => (l ? { ...l, at: Date.now() } : l));
  };

  // Glissement horizontal (comme VLC) : aperçu de la position pendant le geste, saut au relâchement.
  const beginSeekSwipe = (x: number, y: number) => {
    if (y < insets.top + EDGE || y > height - insets.bottom - EDGE || x < EDGE || x > width - EDGE || error) {
      seekSwipe.current = null;
      return;
    }
    const start = player.currentTime;
    seekSwipe.current = { start, target: start };
    setControls(false);
  };

  const moveSeekSwipe = (translationX: number) => {
    const s = seekSwipe.current;
    if (!s) return;
    const d = duration || player.duration || video.durationSec;
    const target = Math.max(0, Math.min(d > 0 ? d - 0.5 : Infinity, s.start + seekSwipeDelta(translationX, width, d)));
    s.target = target;
    setSeekPreview({ target, delta: Math.round(target - s.start) });
  };

  const endSeekSwipe = () => {
    const s = seekSwipe.current;
    seekSwipe.current = null;
    setSeekPreview(null);
    if (!s || Math.abs(s.target - s.start) < 1) return;
    setTime(player, s.target);
    setPosition(s.target);
    lastPosition.current = s.target;
    setEnded(false);
  };

  const surfaceGesture = Gesture.Race(
    Gesture.Pan()
      .runOnJS(true)
      .enabled(seekSwipeEnabled && !locked && !inPip)
      .activeOffsetX([-16, 16])
      .failOffsetY([-24, 24])
      .onStart((e) => beginSeekSwipe(e.x, e.y))
      .onUpdate((e) => moveSeekSwipe(e.translationX))
      .onFinalize(endSeekSwipe),
    Gesture.Pan()
      .runOnJS(true)
      .enabled(swipeEnabled && !locked && !inPip)
      .activeOffsetY([-14, 14])
      .failOffsetX([-24, 24])
      .onStart((e) => beginSwipe(e.x, e.y))
      .onUpdate((e) => moveSwipe(e.translationY))
      .onFinalize(endSwipe),
    Gesture.Tap()
      .runOnJS(true)
      .maxDuration(300)
      .onEnd((e, success) => {
        if (success) onSurfacePress(e.x);
      }),
  );

  const startPip = () => {
    view.current?.startPictureInPicture().catch(() => showToast('Fenêtre flottante indisponible sur cet appareil'));
  };

  const frame = videoFrame(fitMode, { width, height }, video.width && video.height ? video : trackSize, PixelRatio.get());
  const pipSupported = pipEnabled && pipAvailable();
  const showControls = controls && !inPip;
  const showSkipIntro = !introAutoSkip && !inPip && !error && !locked && inIntro(intro, position);
  const cueText = subtitleChoice.kind === 'external' && subtitleLink && external.status === 'ready' && !inPip && !error ? cueTextAt(external.cues, position, subtitleLink.offsetSec) : null;

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <StatusBar hidden={!inPip} style="light" />
      <View style={styles.stage} pointerEvents="none">
        {/* Même surface en portrait comme en paysage : la vidéo n'est jamais reconstruite ni réduite en changeant d'orientation. */}
        <VideoView
          ref={view}
          player={player}
          style={inPip ? StyleSheet.absoluteFill : { width: frame.width, height: frame.height }}
          contentFit={inPip ? 'contain' : frame.fit}
          surfaceType="surfaceView"
          nativeControls={false}
          allowsPictureInPicture={pipSupported}
          // Pas de fenêtre flottante pour une vidéo terminée, en erreur ou en pause.
          startsPictureInPictureAutomatically={pipSupported && playing && !ended && !error}
          onPictureInPictureStart={() => setInPip(true)}
          onPictureInPictureStop={() => setInPip(false)}
        />
      </View>

      {dim > 0 && !inPip ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${dim})` }]} /> : null}

      {!inPip ? (
        <GestureDetector gesture={surfaceGesture}>
          <View style={StyleSheet.absoluteFill} accessible accessibilityRole="button" accessibilityLabel={showControls ? 'Masquer les commandes' : 'Afficher les commandes'} onAccessibilityTap={() => setControls((c) => !c)} />
        </GestureDetector>
      ) : null}

      {level ? <LevelIndicator kind={level.kind} value={level.value} /> : null}

      {seekPreview ? (
        <View pointerEvents="none" style={styles.seekPreview} accessibilityLiveRegion="polite">
          <Text variant="title1" weight="bold" color="#FFFFFF" style={styles.levelShadow}>
            {seekPreview.delta >= 0 ? '+' : '−'}
            {formatDuration(Math.abs(seekPreview.delta))}
          </Text>
          <Text variant="headline" color="#FFFFFF" style={styles.levelShadow}>
            {formatDuration(seekPreview.target)} / {formatDuration(duration || video.durationSec)}
          </Text>
        </View>
      ) : null}

      {flash && !level ? (
        <View pointerEvents="none" style={styles.flash}>
          <Text variant="headline" color="#FFFFFF">
            {flash.text}
          </Text>
        </View>
      ) : null}

      <SubtitleOverlay text={cueText} bottom={insets.bottom + (showControls && !locked ? 124 : 28)} />

      {showSkipIntro ? (
        <Pressable
          onPress={() => {
            tap();
            setTime(player, intro.end);
            setPosition(intro.end);
            lastPosition.current = intro.end;
          }}
          style={[styles.skipIntro, { bottom: insets.bottom + (showControls ? 128 : 36) }]}
          accessibilityRole="button"
          accessibilityLabel="Passer le générique">
          <Icon name="play-skip-forward" size={18} color="#111111" />
          <Text variant="headline" color="#111111">
            Passer le générique
          </Text>
        </Pressable>
      ) : null}

      {upNext && !inPip ? (
        <View style={[styles.upNext, { bottom: insets.bottom + 128, width: Math.min(420, width - 32) }]} accessibilityLiveRegion="polite">
          <VideoThumb video={upNext.video} width={112} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text variant="caption" color="rgba(255,255,255,0.7)">
              Épisode suivant dans {upNextLeft} s
            </Text>
            <Text variant="callout" weight="semibold" color="#FFFFFF" numberOfLines={2}>
              {series?.info[upNext.video.id] ? `${episodeLabel(series.info[upNext.video.id])} · ` : ''}
              {upNext.video.title}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => playEpisode(upNext.video)} style={styles.upNextPlay} accessibilityRole="button" accessibilityLabel="Lire l’épisode suivant maintenant">
                <Text variant="footnote" weight="semibold" color="#111111">
                  Lire
                </Text>
              </Pressable>
              <Pressable onPress={() => setUpNext(null)} style={styles.upNextCancel} accessibilityRole="button" accessibilityLabel="Annuler l’épisode suivant">
                <Text variant="footnote" weight="semibold" color="#FFFFFF">
                  Annuler
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {resumedAt !== null && !inPip && !error ? (
        <View style={[styles.resume, { top: insets.top + 72 }]}>
          <Text variant="footnote" weight="semibold" color="#FFFFFF">
            Reprise à {formatDuration(resumedAt)}
          </Text>
          <Pressable onPress={restartFromZero} hitSlop={8} style={styles.resumeButton} accessibilityRole="button" accessibilityLabel="Recommencer depuis le début">
            <Text variant="footnote" weight="semibold" color="#111111">
              Recommencer
            </Text>
          </Pressable>
        </View>
      ) : null}

      {seekHint ? (
        <View pointerEvents="none" style={[styles.seekHint, seekHint.side === 'left' ? { left: 32 } : { right: 32 }]}>
          <Text variant="headline" color="#FFFFFF">
            {seekHint.side === 'left' ? `−${SEEK_STEP} s` : `+${SEEK_STEP} s`}
          </Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Icon name="alert-circle-outline" size={36} color="#FFFFFF" />
          <Text variant="headline" color="#FFFFFF" style={styles.center}>
            {error}
          </Text>
          <Text variant="footnote" color="rgba(255,255,255,0.7)" style={styles.center}>
            {video.filename}
          </Text>
          <Pressable onPress={exit} style={styles.errorButton} accessibilityRole="button">
            <Text variant="headline" color="#111111">
              Fermer
            </Text>
          </Pressable>
        </View>
      ) : null}

      {showControls && locked ? (
        <View style={[styles.lockOnly, { bottom: insets.bottom + 28 }]}>
          <IconButton
            icon="lock-closed"
            label="Déverrouiller les commandes"
            onPress={unlock}
          />
        </View>
      ) : null}

      {showControls && !locked && !error ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View style={[styles.scrim, styles.top, { paddingTop: insets.top + 8 }]}>
            <IconButton icon="chevron-down" label="Fermer la vidéo" onPress={exit} size={28} />
            <Text variant="headline" color="#FFFFFF" numberOfLines={2} style={{ flex: 1 }}>
              {video.title}
            </Text>
            {pipSupported ? <IconButton icon="albums-outline" label="Fenêtre flottante" onPress={startPip} size={22} /> : null}
          </View>

          <View style={styles.middle} pointerEvents="box-none">
            <IconButton icon="play-skip-back" label="Vidéo précédente" onPress={() => step(-1)} size={28} disabled={index <= 0} />
            <IconButton icon="play-back" label={`Reculer de ${SEEK_STEP} secondes`} onPress={() => seekBy(-SEEK_STEP)} size={30} />
            <Pressable onPress={toggle} style={styles.playButton} accessibilityRole="button" accessibilityLabel={ended ? 'Revoir' : playing ? 'Pause' : 'Lecture'}>
              <Icon name={ended ? 'refresh' : playing ? 'pause' : 'play'} size={36} color="#FFFFFF" />
            </Pressable>
            <IconButton icon="play-forward" label={`Avancer de ${SEEK_STEP} secondes`} onPress={() => seekBy(SEEK_STEP)} size={30} />
            <IconButton icon="play-skip-forward" label="Vidéo suivante" onPress={() => step(1)} size={28} disabled={index < 0 || index >= list.length - 1} />
          </View>

          <View style={[styles.scrim, styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
            <Scrubber
              position={position}
              duration={duration || video.durationSec}
              onSeek={(sec) => {
                setTime(player, sec);
                setPosition(sec);
                touch();
              }}
              color="#FFFFFF"
              trackColor="rgba(255,255,255,0.28)"
              textColor="rgba(255,255,255,0.75)"
            />
            <View style={styles.tools}>
              <Pressable onPress={cycleRate} style={styles.chip} accessibilityRole="button" accessibilityLabel={`Vitesse ${formatRate(rate)}`}>
                <Text variant="footnote" weight="semibold" color="#FFFFFF">
                  {formatRate(rate)}
                </Text>
              </Pressable>
              <Pressable onPress={cycleFit} style={styles.chip} accessibilityRole="button" accessibilityLabel={`Format d’image : ${fitLabel(fitMode)}`}>
                <Text variant="footnote" weight="semibold" color="#FFFFFF">
                  {fitLabel(fitMode)}
                </Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              <IconButton icon={subtitleChoice.kind === 'off' ? 'chatbox-outline' : 'chatbox-ellipses'} label="Sous-titres" onPress={() => setSubtitlesOpen(true)} size={22} />
              <IconButton icon="lock-open-outline" label="Verrouiller les commandes et la rotation" onPress={lock} size={22} />
              {OpenPlayMedia?.setScreenOrientationAsync ? (
                <IconButton
                  icon={orientation === 'sensor' ? 'sync-outline' : orientation === 'landscape' ? 'phone-landscape-outline' : 'phone-portrait-outline'}
                  label={`Orientation : ${ORIENTATION_LABELS[orientation ?? 'portrait'].toLowerCase()}. Toucher pour changer`}
                  onPress={rotate}
                  size={22}
                />
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {subtitlesOpen && !inPip ? (
        <SubtitlePanel
          choice={subtitleChoice.kind === 'external' && !subtitleLink ? { kind: 'off' } : subtitleChoice}
          onChoose={chooseSubtitles}
          embedded={embeddedTracks}
          link={subtitleLink}
          external={external}
          onImport={() => void importForVideo()}
          onUnlink={() => {
            unlinkSubtitles(video.id);
            chooseSubtitles({ kind: 'off' });
          }}
          onOffset={(sec) => useSubtitles.getState().setOffset(video.id, sec)}
          onClose={() => setSubtitlesOpen(false)}
          bottom={insets.bottom + 12}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
    zIndex: 300,
    elevation: 50,
  },
  skipIntro: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  upNext: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(20,20,22,0.92)',
  },
  upNextPlay: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, backgroundColor: '#FFFFFF' },
  upNextCancel: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
  stage: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  seekPreview: { position: 'absolute', top: '38%', alignSelf: 'center', alignItems: 'center', gap: 4 },
  levelSide: { position: 'absolute', top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 16 },
  levelColumn: { alignItems: 'center', gap: 12 },
  levelBar: {
    width: 10,
    height: 180,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  levelBarFill: { width: '100%', backgroundColor: '#FFFFFF' },
  levelShadow: { fontVariant: ['tabular-nums'], textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  levelLabel: { textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  flash: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  scrim: { backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 12 },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 10,
  },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 6 },
  middle: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  chip: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  seekHint: {
    position: 'absolute',
    top: '45%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  lockOnly: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  errorBox: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 32,
  },
  errorButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  center: { textAlign: 'center' },
  resume: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  resumeButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#FFFFFF' },
});
