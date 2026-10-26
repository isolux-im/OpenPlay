import { periodStart, type StatsPeriod } from '../library/listeningStats';
import { dayKey } from '../store/stats';
import type { VideoDay } from '../store/videoStats';
import type { Video } from './types';

export type WatchSummary = {
  totalSec: number;
  activeDays: number;
  /** Vidéos différentes regardées. */
  distinct: number;
  /** Vidéos terminées (une fois par jour au plus). */
  finished: number;
  top: { video: Video; sec: number }[];
  hours: number[];
  peakHour: number | null;
};

/** Bilan de visionnage d'une période ; les vidéos supprimées comptent dans les totaux, pas dans le classement. */
export function summarizeWatching(days: Record<string, VideoDay>, byId: Record<string, Video>, period: StatsPeriod, now: number, limit = 5): WatchSummary {
  const from = periodStart(period, now);
  const to = dayKey(now);
  const hours = Array.from({ length: 24 }, () => 0);
  const perVideo = new Map<string, number>();
  let totalSec = 0;
  let activeDays = 0;
  let finished = 0;
  for (const [key, day] of Object.entries(days)) {
    if (key < from || key > to) continue;
    totalSec += day.sec;
    finished += day.finished.length;
    if (day.sec >= 60 || day.finished.length) activeDays += 1;
    day.hours.forEach((sec, h) => {
      hours[h] += sec;
    });
    for (const [id, sec] of Object.entries(day.videos)) perVideo.set(id, (perVideo.get(id) ?? 0) + sec);
  }
  const top = [...perVideo.entries()]
    .filter(([id, sec]) => byId[id] && sec >= 60)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, sec]) => ({ video: byId[id], sec }));
  const max = Math.max(...hours);
  return { totalSec, activeDays, distinct: [...perVideo.values()].filter((sec) => sec >= 60).length, finished, top, hours, peakHour: max > 0 ? hours.indexOf(max) : null };
}
