import type { MediaItem, PlayHistoryEntry } from '../types/music';

export type RecapRange = '4w' | '6m' | 'all';

export interface RankedStat<T> {
  key: string;
  item: T;
  plays: number;
  minutes: number;
}

export interface MonthlyStat {
  monthKey: string;
  label: string;
  minutes: number;
  plays: number;
}

export interface RecapSummary {
  range: RecapRange;
  totalPlays: number;
  totalMinutes: number;
  uniqueArtists: number;
  uniqueTracks: number;
  topTracks: RankedStat<MediaItem>[];
  topArtists: RankedStat<{ id?: string | null; name: string; thumbnail?: string | null }>[];
  topGenres: RankedStat<{ name: string }>[];
  monthlyBreakdown: MonthlyStat[];
}

const MONTH_NAMES_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

export function filterHistoryByRange(
  entries: PlayHistoryEntry[],
  range: RecapRange,
  nowMs: number = Date.now(),
): PlayHistoryEntry[] {
  if (range === 'all') return entries;
  const days = range === '4w' ? 28 : 183;
  const cutoff = nowMs - days * 24 * 60 * 60 * 1000;
  return entries.filter((e) => e.playedAt >= cutoff);
}

export function computeRecapSummary(
  entries: PlayHistoryEntry[],
  range: RecapRange,
  nowMs: number = Date.now(),
): RecapSummary {
  const filtered = filterHistoryByRange(entries, range, nowMs);

  let totalSeconds = 0;
  const trackMap = new Map<string, RankedStat<MediaItem>>();
  const artistMap = new Map<
    string,
    RankedStat<{ id?: string | null; name: string; thumbnail?: string | null }>
  >();
  const genreMap = new Map<string, RankedStat<{ name: string }>>();
  const monthMap = new Map<string, MonthlyStat>();

  for (const entry of filtered) {
    const listenedSec =
      entry.durationListenedSec > 0
        ? entry.durationListenedSec
        : entry.track.durationSeconds || 180;
    const mins = listenedSec / 60;
    totalSeconds += listenedSec;

    // Tracks
    const tKey = entry.trackId;
    const prevTrack = trackMap.get(tKey);
    if (prevTrack) {
      prevTrack.plays += 1;
      prevTrack.minutes += mins;
    } else {
      trackMap.set(tKey, {
        key: tKey,
        item: entry.track,
        plays: 1,
        minutes: mins,
      });
    }

    // Artists
    const primaryArtist = entry.track.artists?.[0];
    if (primaryArtist?.name) {
      const aKey = primaryArtist.id || primaryArtist.name.toLowerCase();
      const prevArtist = artistMap.get(aKey);
      if (prevArtist) {
        prevArtist.plays += 1;
        prevArtist.minutes += mins;
        if (!prevArtist.item.thumbnail && entry.track.thumbnail) {
          prevArtist.item.thumbnail = entry.track.thumbnail;
        }
      } else {
        artistMap.set(aKey, {
          key: aKey,
          item: {
            id: primaryArtist.id,
            name: primaryArtist.name,
            thumbnail: entry.track.thumbnail,
          },
          plays: 1,
          minutes: mins,
        });
      }
    }

    // Genre
    const genreLabel =
      entry.genreHint ||
      entry.track.genre ||
      (entry.sourceType === 'episode' ? 'Podcast' : 'Musik Pop & Umum');
    const gKey = genreLabel.toLowerCase();
    const prevGenre = genreMap.get(gKey);
    if (prevGenre) {
      prevGenre.plays += 1;
      prevGenre.minutes += mins;
    } else {
      genreMap.set(gKey, {
        key: gKey,
        item: { name: genreLabel },
        plays: 1,
        minutes: mins,
      });
    }

    // Monthly chart
    const dt = new Date(entry.playedAt);
    const y = dt.getFullYear();
    const m = dt.getMonth();
    const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;
    const label = `${MONTH_NAMES_ID[m]} '${String(y).slice(-2)}`;
    const prevMonth = monthMap.get(monthKey);
    if (prevMonth) {
      prevMonth.plays += 1;
      prevMonth.minutes += mins;
    } else {
      monthMap.set(monthKey, {
        monthKey,
        label,
        minutes: mins,
        plays: 1,
      });
    }
  }

  const sortByScore = <T>(a: RankedStat<T>, b: RankedStat<T>) =>
    b.plays - a.plays || b.minutes - a.minutes;

  const topTracks = [...trackMap.values()]
    .sort(sortByScore)
    .slice(0, 10)
    .map((r) => ({ ...r, minutes: Math.round(r.minutes) }));

  const topArtists = [...artistMap.values()]
    .sort(sortByScore)
    .slice(0, 10)
    .map((r) => ({ ...r, minutes: Math.round(r.minutes) }));

  const topGenres = [...genreMap.values()]
    .sort(sortByScore)
    .slice(0, 6)
    .map((r) => ({ ...r, minutes: Math.round(r.minutes) }));

  const monthlyBreakdown = [...monthMap.values()]
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .slice(-12)
    .map((m) => ({ ...m, minutes: Math.round(m.minutes) }));

  return {
    range,
    totalPlays: filtered.length,
    totalMinutes: Math.round(totalSeconds / 60),
    uniqueArtists: artistMap.size,
    uniqueTracks: trackMap.size,
    topTracks,
    topArtists,
    topGenres,
    monthlyBreakdown,
  };
}

export function getGreetingByHour(hour: number): { greeting: string; moodLabel: string } {
  if (hour >= 4 && hour < 11) {
    return { greeting: 'Selamat pagi', moodLabel: 'Mix Pagi Cerah' };
  }
  if (hour >= 11 && hour < 15) {
    return { greeting: 'Selamat siang', moodLabel: 'Mix Fokus Siang' };
  }
  if (hour >= 15 && hour < 19) {
    return { greeting: 'Selamat sore', moodLabel: 'Mix Santai Sore' };
  }
  return { greeting: 'Selamat malam', moodLabel: 'Mix Malam Tenang' };
}
