import Dexie, { type Table } from 'dexie';
import type {
  EpisodeProgressEntry,
  FollowedArtistEntry,
  HomeSectionId,
  LocalPlaylist,
  MediaItem,
  PlayHistoryEntry,
  PlaylistFolder,
  RecentSearchEntry,
  RepeatMode,
  SavedAlbumEntry,
  SavedPodcastEntry,
  UserSettings,
} from '../types/music';

export interface LikedTrackRecord {
  id: string;
  addedAt: number;
  track: MediaItem;
}

export interface HiddenTrackRecord {
  id: string;
  hiddenAt: number;
}

export interface KvRecord {
  key: string;
  value: unknown;
}

export interface PersistedPlayerSession {
  currentTrack: MediaItem | null;
  queue: MediaItem[];
  queueIndex: number;
  sourceQueue: MediaItem[];
  sourceLabel?: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  smartShuffle: boolean;
  repeat: RepeatMode;
  playbackRate: number;
  crossfadeSeconds: number;
}

export const DEFAULT_HOME_SECTION_ORDER: HomeSectionId[] = [
  'continue',
  'daily_mix',
  'frequent',
  'artist_releases',
  'for_you_mix',
  'charts',
  'home_feed',
  'moods',
];

export const DEFAULT_SETTINGS: UserSettings = {
  hideExplicit: false,
  autoplay: true,
  dataSaver: false,
  showRightPanel: true,
  homeSectionOrder: DEFAULT_HOME_SECTION_ORDER,
};

export class SoundClearDatabase extends Dexie {
  likedTracks!: Table<LikedTrackRecord, string>;
  playlists!: Table<LocalPlaylist, string>;
  playlistFolders!: Table<PlaylistFolder, string>;
  savedAlbums!: Table<SavedAlbumEntry, string>;
  followedArtists!: Table<FollowedArtistEntry, string>;
  savedPodcasts!: Table<SavedPodcastEntry, string>;
  episodeProgress!: Table<EpisodeProgressEntry, string>;
  playHistory!: Table<PlayHistoryEntry, number>;
  recentSearches!: Table<RecentSearchEntry, number>;
  hiddenTracks!: Table<HiddenTrackRecord, string>;
  kvState!: Table<KvRecord, string>;

  constructor() {
    super('soundclear_db_v1');
    this.version(1).stores({
      likedTracks: 'id, addedAt',
      playlists: 'id, folderId, pinned, createdAt, lastPlayedAt',
      playlistFolders: 'id, createdAt',
      savedAlbums: 'id, pinned, savedAt, lastPlayedAt',
      followedArtists: 'id, pinned, followedAt, lastPlayedAt',
      savedPodcasts: 'id, pinned, savedAt, lastPlayedAt',
      episodeProgress: 'episodeId, podcastId, updatedAt',
      playHistory: '++uid, trackId, playedAt, sourceType',
      recentSearches: '++uid, query, searchedAt',
      hiddenTracks: 'id, hiddenAt',
      kvState: 'key',
    });
  }
}

export const db = new SoundClearDatabase();

export async function migrateLegacyLocalStorage(): Promise<void> {
  try {
    const flag = await db.kvState.get('legacy_migrated_v1');
    if (flag?.value) return;

    const raw = window.localStorage.getItem('soundclear_library_v1');
    if (raw) {
      const parsed = JSON.parse(raw) as {
        state?: {
          likedTracks?: MediaItem[];
          playlists?: LocalPlaylist[];
        };
      };
      const liked = parsed?.state?.likedTracks ?? [];
      const pls = parsed?.state?.playlists ?? [];

      await db.transaction('rw', db.likedTracks, db.playlists, db.kvState, async () => {
        const now = Date.now();
        for (let i = 0; i < liked.length; i += 1) {
          const track = liked[i];
          const id = track.videoId || track.id;
          if (!id) continue;
          const existing = await db.likedTracks.get(id);
          if (!existing) {
            await db.likedTracks.put({ id, addedAt: now - i, track: { ...track, id } });
          }
        }
        for (const pl of pls) {
          if (!pl?.id) continue;
          const existing = await db.playlists.get(pl.id);
          if (!existing) {
            await db.playlists.put({
              ...pl,
              updatedAt: pl.updatedAt || pl.createdAt || now,
            });
          }
        }
        await db.kvState.put({ key: 'legacy_migrated_v1', value: true });
      });
    } else {
      await db.kvState.put({ key: 'legacy_migrated_v1', value: true });
    }
  } catch {
    // Non-fatal migration error
  }
}

export interface SoundClearBackupPayload {
  version: number;
  exportedAt: string;
  likedTracks: LikedTrackRecord[];
  playlists: LocalPlaylist[];
  playlistFolders: PlaylistFolder[];
  savedAlbums: SavedAlbumEntry[];
  followedArtists: FollowedArtistEntry[];
  savedPodcasts: SavedPodcastEntry[];
  episodeProgress: EpisodeProgressEntry[];
  playHistory: PlayHistoryEntry[];
  recentSearches: RecentSearchEntry[];
  hiddenTracks: HiddenTrackRecord[];
  settings: UserSettings;
  playerSession?: PersistedPlayerSession | null;
}

export async function exportAllSoundClearData(): Promise<SoundClearBackupPayload> {
  const [
    likedTracks,
    playlists,
    playlistFolders,
    savedAlbums,
    followedArtists,
    savedPodcasts,
    episodeProgress,
    playHistory,
    recentSearches,
    hiddenTracks,
    settingsRec,
    sessionRec,
  ] = await Promise.all([
    db.likedTracks.toArray(),
    db.playlists.toArray(),
    db.playlistFolders.toArray(),
    db.savedAlbums.toArray(),
    db.followedArtists.toArray(),
    db.savedPodcasts.toArray(),
    db.episodeProgress.toArray(),
    db.playHistory.toArray(),
    db.recentSearches.toArray(),
    db.hiddenTracks.toArray(),
    db.kvState.get('settings'),
    db.kvState.get('player_session'),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    likedTracks,
    playlists,
    playlistFolders,
    savedAlbums,
    followedArtists,
    savedPodcasts,
    episodeProgress,
    playHistory,
    recentSearches,
    hiddenTracks,
    settings: (settingsRec?.value as UserSettings) || DEFAULT_SETTINGS,
    playerSession: (sessionRec?.value as PersistedPlayerSession) || null,
  };
}

export async function importAllSoundClearData(payload: unknown): Promise<void> {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Format file JSON tidak valid.');
  }
  const data = payload as Partial<SoundClearBackupPayload>;
  if (typeof data.version !== 'number') {
    throw new Error('File JSON bukan cadangan SoundClear yang valid.');
  }

  await db.transaction(
    'rw',
    [
      db.likedTracks,
      db.playlists,
      db.playlistFolders,
      db.savedAlbums,
      db.followedArtists,
      db.savedPodcasts,
      db.episodeProgress,
      db.playHistory,
      db.recentSearches,
      db.hiddenTracks,
      db.kvState,
    ],
    async () => {
      await Promise.all([
        db.likedTracks.clear(),
        db.playlists.clear(),
        db.playlistFolders.clear(),
        db.savedAlbums.clear(),
        db.followedArtists.clear(),
        db.savedPodcasts.clear(),
        db.episodeProgress.clear(),
        db.playHistory.clear(),
        db.recentSearches.clear(),
        db.hiddenTracks.clear(),
      ]);

      if (Array.isArray(data.likedTracks) && data.likedTracks.length > 0) {
        await db.likedTracks.bulkPut(data.likedTracks);
      }
      if (Array.isArray(data.playlists) && data.playlists.length > 0) {
        await db.playlists.bulkPut(data.playlists);
      }
      if (Array.isArray(data.playlistFolders) && data.playlistFolders.length > 0) {
        await db.playlistFolders.bulkPut(data.playlistFolders);
      }
      if (Array.isArray(data.savedAlbums) && data.savedAlbums.length > 0) {
        await db.savedAlbums.bulkPut(data.savedAlbums);
      }
      if (Array.isArray(data.followedArtists) && data.followedArtists.length > 0) {
        await db.followedArtists.bulkPut(data.followedArtists);
      }
      if (Array.isArray(data.savedPodcasts) && data.savedPodcasts.length > 0) {
        await db.savedPodcasts.bulkPut(data.savedPodcasts);
      }
      if (Array.isArray(data.episodeProgress) && data.episodeProgress.length > 0) {
        await db.episodeProgress.bulkPut(data.episodeProgress);
      }
      if (Array.isArray(data.playHistory) && data.playHistory.length > 0) {
        const cleaned = data.playHistory.map(({ uid: _uid, ...rest }) => rest);
        await db.playHistory.bulkAdd(cleaned);
      }
      if (Array.isArray(data.recentSearches) && data.recentSearches.length > 0) {
        const cleaned = data.recentSearches.map(({ uid: _uid, ...rest }) => rest);
        await db.recentSearches.bulkAdd(cleaned);
      }
      if (Array.isArray(data.hiddenTracks) && data.hiddenTracks.length > 0) {
        await db.hiddenTracks.bulkPut(data.hiddenTracks);
      }
      if (data.settings) {
        await db.kvState.put({
          key: 'settings',
          value: { ...DEFAULT_SETTINGS, ...data.settings },
        });
      }
      if (data.playerSession) {
        await db.kvState.put({
          key: 'player_session',
          value: data.playerSession,
        });
      }
    },
  );
}
