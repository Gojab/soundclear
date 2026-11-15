import Dexie, { type Table } from 'dexie';
import type {
  EpisodeProgressEntry,
  FollowedArtistEntry,
  HomeSectionId,
  LocalAudioFileRecord,
  LocalAudioProfile,
  LocalPlaylist,
  MediaItem,
  OfflineDownloadRecord,
  PlayHistoryEntry,
  PlaylistFolder,
  PlaylistMixSettings,
  RecentSearchEntry,
  RepeatMode,
  SavedAlbumEntry,
  SavedPodcastEntry,
  UserSettings,
  YouTubeSoundSettings,
} from '../types/music';
import {
  BUILTIN_EQ_PRESETS,
  clampCrossfadeSeconds,
  DEFAULT_CROSSFADE_SECONDS,
} from '../utils/audioMath';
import {
  DEFAULT_PLAYLIST_MIX_SETTINGS,
  normalizePlaylistMixSettings,
} from '../utils/djMixLogic';
import {
  DEFAULT_CUSTOM_BACKGROUND,
  isSafeBackgroundImageUrl,
  normalizeCustomBackground,
} from '../utils/backgroundTheme';
import {
  DEFAULT_NOTCH_DISPLAY_MODE,
  DEFAULT_NOTCH_MONITOR,
  normalizeNotchDisplayMode,
  normalizeNotchMonitor,
} from '../utils/notchPlayer';

export const CUSTOM_BACKGROUND_IMAGE_KV_KEY = 'custom_background_image';

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
  activeMixConfig?: PlaylistMixSettings | null;
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

export const DEFAULT_YOUTUBE_SOUND: YouTubeSoundSettings = {
  maxVolumeLimit: 100,
  startupVolumeMode: 'last',
  startupFixedVolume: 75,
  defaultPlaybackRate: 1,
  trackFadeSeconds: DEFAULT_CROSSFADE_SECONDS,
  fadeOnPauseResume: true,
  fadeOutOnSleepTimer: true,
  resumeLastPosition: true,
  autoStartOnOpen: false,
};

export const DEFAULT_LOCAL_AUDIO_PROFILE: LocalAudioProfile = {
  wifiQuality: 'auto',
  cellularQuality: 'normal',
  autoAdjustQuality: true,
  downloadQuality: 'high',
  eqEnabled: true,
  presetId: 'flat',
  preampDb: 0,
  bands: [...BUILTIN_EQ_PRESETS[0].bands],
  customPresets: [],
  bassBoostEnabled: true,
  bassBoostLevel: 35,
  stereoWidenerEnabled: true,
  stereoWidenerLevel: 35,
  normalizationTarget: 'normal',
  useReplayGain: true,
  limiterEnabled: true,
  monoAudio: false,
  balance: 0,
  outputDeviceId: '',
  directMode: false,
  crossfadeEnabled: true,
  crossfadeSeconds: DEFAULT_CROSSFADE_SECONDS,
  gaplessPlayback: true,
  fadeOnPlayPause: true,
  skipSilence: true,
  djMix: { ...DEFAULT_PLAYLIST_MIX_SETTINGS },
};

export const DEFAULT_SETTINGS: UserSettings = {
  hideExplicit: false,
  autoplay: true,
  dataSaver: false,
  showRightPanel: true,
  lyricsPreviewEnabled: true,
  homeSectionOrder: DEFAULT_HOME_SECTION_ORDER,
  youtubeSound: DEFAULT_YOUTUBE_SOUND,
  episodePlaybackRates: {},
  customBackground: { ...DEFAULT_CUSTOM_BACKGROUND },
  notchDisplayMode: DEFAULT_NOTCH_DISPLAY_MODE,
  notchMonitor: DEFAULT_NOTCH_MONITOR,
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
  localFiles!: Table<LocalAudioFileRecord, string>;
  offlineDownloads!: Table<OfflineDownloadRecord, string>;
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

    this.version(2).stores({
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
      localFiles: 'id, addedAt, title, artist',
      kvState: 'key',
    });

    this.version(3).stores({
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
      localFiles: 'id, addedAt, title, artist',
      offlineDownloads: 'id, downloadedAt',
      kvState: 'key',
    });
  }
}

export const db = new SoundClearDatabase();

export function getLocalAudioProfileKey(accountKey: string): string {
  return `local_audio_profile_${accountKey || 'local'}`;
}

export function normalizeLocalAudioProfile(raw?: Partial<LocalAudioProfile> | null): LocalAudioProfile {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const crossfadeSeconds = clampCrossfadeSeconds(
    typeof safe.crossfadeSeconds === 'number'
      ? safe.crossfadeSeconds
      : DEFAULT_LOCAL_AUDIO_PROFILE.crossfadeSeconds,
  );
  const crossfadeEnabled =
    typeof safe.crossfadeEnabled === 'boolean'
      ? safe.crossfadeEnabled
      : crossfadeSeconds > 0;
  return {
    ...DEFAULT_LOCAL_AUDIO_PROFILE,
    ...safe,
    crossfadeEnabled,
    crossfadeSeconds,
    bands:
      Array.isArray(safe.bands) && safe.bands.length === 10
        ? safe.bands
        : [...DEFAULT_LOCAL_AUDIO_PROFILE.bands],
    customPresets: Array.isArray(safe.customPresets) ? safe.customPresets : [],
    djMix: normalizePlaylistMixSettings(safe.djMix),
  };
}

export async function loadLocalAudioProfile(accountKey: string): Promise<LocalAudioProfile> {
  const storageKey = getLocalAudioProfileKey(accountKey);
  try {
    const rec = await db.kvState.get(storageKey);
    if (rec?.value && typeof rec.value === 'object') {
      return normalizeLocalAudioProfile(rec.value as Partial<LocalAudioProfile>);
    }
  } catch {
    // Fallback to localStorage below
  }
  try {
    const lsRaw = window.localStorage.getItem(storageKey);
    if (lsRaw) {
      return normalizeLocalAudioProfile(JSON.parse(lsRaw) as Partial<LocalAudioProfile>);
    }
  } catch {
    // Fallback to default
  }
  return normalizeLocalAudioProfile(null);
}

export async function saveLocalAudioProfile(
  accountKey: string,
  profile: LocalAudioProfile,
): Promise<void> {
  const storageKey = getLocalAudioProfileKey(accountKey);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(profile));
  } catch {
    // Ignore quota errors
  }
  await db.kvState.put({
    key: storageKey,
    value: profile,
  });
}

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
  customBackgroundImage?: string | null;
  playerSession?: PersistedPlayerSession | null;
  localAudioProfiles?: Record<string, LocalAudioProfile>;
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
    customBgImageRec,
    sessionRec,
    allKv,
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
    db.kvState.get(CUSTOM_BACKGROUND_IMAGE_KV_KEY),
    db.kvState.get('player_session'),
    db.kvState.toArray(),
  ]);

  const localAudioProfiles: Record<string, LocalAudioProfile> = {};
  for (const kv of allKv) {
    if (kv.key.startsWith('local_audio_profile_') && kv.value && typeof kv.value === 'object') {
      localAudioProfiles[kv.key] = kv.value as LocalAudioProfile;
    }
  }

  const rawSettings = (settingsRec?.value as Partial<UserSettings> | undefined) || {};
  const customBgImage = isSafeBackgroundImageUrl(customBgImageRec?.value)
    ? customBgImageRec.value
    : null;

  return {
    version: 3,
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
    settings: {
      ...DEFAULT_SETTINGS,
      ...rawSettings,
      youtubeSound: {
        ...DEFAULT_YOUTUBE_SOUND,
        ...(rawSettings.youtubeSound || {}),
      },
      customBackground: normalizeCustomBackground(rawSettings.customBackground, null),
      notchDisplayMode: normalizeNotchDisplayMode(rawSettings.notchDisplayMode),
      notchMonitor: normalizeNotchMonitor(rawSettings.notchMonitor),
    },
    customBackgroundImage: customBgImage,
    playerSession: (sessionRec?.value as PersistedPlayerSession) || null,
    localAudioProfiles,
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
        const normalizedBg = normalizeCustomBackground(data.settings.customBackground, null);
        await db.kvState.put({
          key: 'settings',
          value: {
            ...DEFAULT_SETTINGS,
            ...data.settings,
            youtubeSound: {
              ...DEFAULT_YOUTUBE_SOUND,
              ...(data.settings.youtubeSound || {}),
            },
            customBackground: normalizedBg,
            notchDisplayMode: normalizeNotchDisplayMode(data.settings.notchDisplayMode),
            notchMonitor: normalizeNotchMonitor(data.settings.notchMonitor),
          },
        });
      }
      const importedBgImage = isSafeBackgroundImageUrl(data.customBackgroundImage)
        ? data.customBackgroundImage
        : isSafeBackgroundImageUrl(data.settings?.customBackground?.customImageDataUrl)
          ? data.settings?.customBackground?.customImageDataUrl
          : null;
      if (importedBgImage) {
        await db.kvState.put({
          key: CUSTOM_BACKGROUND_IMAGE_KV_KEY,
          value: importedBgImage,
        });
      } else {
        await db.kvState.delete(CUSTOM_BACKGROUND_IMAGE_KV_KEY);
      }
      if (data.playerSession) {
        await db.kvState.put({
          key: 'player_session',
          value: data.playerSession,
        });
      }
      if (data.localAudioProfiles && typeof data.localAudioProfiles === 'object') {
        for (const [k, v] of Object.entries(data.localAudioProfiles)) {
          if (k.startsWith('local_audio_profile_') && v) {
            await db.kvState.put({ key: k, value: v });
          }
        }
      }
    },
  );
}
