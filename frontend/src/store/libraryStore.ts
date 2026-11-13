import { create } from 'zustand';
import { buildStreamAudioUrl, fetchStreamAudioMeta } from '../api/client';
import { db, migrateLegacyLocalStorage } from '../db/soundclearDb';
import type {
  ConcreteQualityTier,
  EpisodeProgressEntry,
  FollowedArtistEntry,
  LocalAudioFileRecord,
  LocalPlaylist,
  MediaItem,
  OfflineDownloadRecord,
  PlayHistoryEntry,
  PlaylistFolder,
  RecentSearchEntry,
  SavedAlbumEntry,
  SavedPodcastEntry,
} from '../types/music';
import { classifyStreamQualityBadge } from '../utils/audioMath';
import { isSupportedLocalAudioFile, parseLocalAudioFile } from '../utils/localAudioImport';
import {
  formatArtists,
  getPlayableVideoId,
  getTrackUniqueId,
  isLocalTrack,
} from '../utils/playerLogic';

export type LibrarySortMode = 'newest' | 'alpha' | 'last_played';
export type LibraryFilterType =
  | 'all'
  | 'playlists'
  | 'albums'
  | 'artists'
  | 'podcasts'
  | 'local'
  | 'offline';
export type LibraryViewMode = 'list' | 'grid' | 'compact';

const OFFLINE_AUDIO_CACHE = 'soundclear-offline-audio-v1';

interface LibraryState {
  hydrated: boolean;
  likedTracks: MediaItem[];
  playlists: LocalPlaylist[];
  folders: PlaylistFolder[];
  savedAlbums: SavedAlbumEntry[];
  followedArtists: FollowedArtistEntry[];
  savedPodcasts: SavedPodcastEntry[];
  episodeProgress: Record<string, EpisodeProgressEntry>;
  playHistory: PlayHistoryEntry[];
  recentSearches: RecentSearchEntry[];
  hiddenTrackIds: string[];
  localFiles: LocalAudioFileRecord[];
  offlineDownloads: OfflineDownloadRecord[];

  sortMode: LibrarySortMode;
  filterType: LibraryFilterType;
  viewMode: LibraryViewMode;

  hydrate: () => Promise<void>;
  setSortMode: (mode: LibrarySortMode) => void;
  setFilterType: (filter: LibraryFilterType) => void;
  setViewMode: (mode: LibraryViewMode) => void;

  toggleLike: (track: MediaItem) => void;
  isLiked: (trackId: string | null | undefined) => boolean;

  createPlaylist: (
    name: string,
    initialTrack?: MediaItem,
    options?: { description?: string; folderId?: string | null },
  ) => LocalPlaylist;
  updatePlaylist: (
    playlistId: string,
    patch: Partial<Pick<LocalPlaylist, 'name' | 'description' | 'coverUrl' | 'folderId' | 'pinned'>>,
  ) => void;
  deletePlaylist: (playlistId: string) => void;
  togglePinPlaylist: (playlistId: string) => void;
  hasTrackInPlaylist: (playlistId: string, track: MediaItem) => boolean;
  addTrackToPlaylist: (playlistId: string, track: MediaItem, allowDuplicate?: boolean) => boolean;
  removeTrackFromPlaylist: (playlistId: string, trackId: string, index?: number) => void;
  reorderPlaylistTracks: (playlistId: string, fromIndex: number, toIndex: number) => void;
  removeDuplicatesFromPlaylist: (playlistId: string) => void;
  markPlaylistPlayed: (playlistId: string) => void;

  createFolder: (name: string) => PlaylistFolder;
  renameFolder: (folderId: string, name: string) => void;
  deleteFolder: (folderId: string) => void;

  toggleSaveAlbum: (album: MediaItem) => void;
  isAlbumSaved: (albumId: string) => boolean;
  togglePinAlbum: (albumId: string) => void;

  toggleFollowArtist: (artist: MediaItem) => void;
  isArtistFollowed: (artistId: string) => boolean;
  togglePinArtist: (artistId: string) => void;

  toggleFollowPodcast: (podcast: MediaItem) => void;
  isPodcastFollowed: (podcastId: string) => boolean;
  togglePinPodcast: (podcastId: string) => void;

  saveEpisodeProgress: (
    episodeId: string,
    podcastId: string | null | undefined,
    positionSeconds: number,
    durationSeconds: number,
    completed?: boolean,
  ) => void;
  markEpisodeCompleted: (
    episodeId: string,
    podcastId: string | null | undefined,
    completed: boolean,
  ) => void;

  recordPlay: (track: MediaItem, durationListenedSec?: number, genreHint?: string | null) => void;
  clearPlayHistory: () => Promise<void>;

  addRecentSearch: (query: string) => void;
  removeRecentSearch: (uid: number) => void;
  clearRecentSearches: () => void;

  hideTrack: (trackId: string) => void;
  unhideTrack: (trackId: string) => void;
  isTrackHidden: (trackId: string | null | undefined) => boolean;

  importLocalFiles: (files: FileList | File[]) => Promise<{ imported: number; skipped: number }>;
  deleteLocalFile: (id: string) => Promise<void>;

  downloadTrackOffline: (
    track: MediaItem,
    requestedTier: ConcreteQualityTier,
  ) => Promise<{ ok: boolean; reason?: string; record?: OfflineDownloadRecord }>;
  downloadTracksOffline: (
    tracks: MediaItem[],
    requestedTier: ConcreteQualityTier,
  ) => Promise<{ savedCount: number; failedCount: number }>;
  deleteOfflineDownload: (trackId: string) => Promise<void>;
  isTrackDownloadedOffline: (trackId: string | null | undefined) => boolean;
}

function normalizeTrackId(track: MediaItem): string {
  return getTrackUniqueId(track) || track.id;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  hydrated: false,
  likedTracks: [],
  playlists: [],
  folders: [],
  savedAlbums: [],
  followedArtists: [],
  savedPodcasts: [],
  episodeProgress: {},
  playHistory: [],
  recentSearches: [],
  hiddenTrackIds: [],
  localFiles: [],
  offlineDownloads: [],

  sortMode: 'newest',
  filterType: 'all',
  viewMode: 'list',

  hydrate: async () => {
    await migrateLegacyLocalStorage();

    const [
      likedRecs,
      playlists,
      folders,
      savedAlbums,
      followedArtists,
      savedPodcasts,
      epProgressRecs,
      playHistory,
      recentSearches,
      hiddenRecs,
      localFiles,
      offlineDownloads,
    ] = await Promise.all([
      db.likedTracks.orderBy('addedAt').reverse().toArray(),
      db.playlists.orderBy('createdAt').reverse().toArray(),
      db.playlistFolders.orderBy('createdAt').reverse().toArray(),
      db.savedAlbums.orderBy('savedAt').reverse().toArray(),
      db.followedArtists.orderBy('followedAt').reverse().toArray(),
      db.savedPodcasts.orderBy('savedAt').reverse().toArray(),
      db.episodeProgress.toArray(),
      db.playHistory.orderBy('playedAt').reverse().toArray(),
      db.recentSearches.orderBy('searchedAt').reverse().toArray(),
      db.hiddenTracks.toArray(),
      db.localFiles.orderBy('addedAt').reverse().toArray(),
      db.offlineDownloads.orderBy('downloadedAt').reverse().toArray(),
    ]);

    const episodeProgress: Record<string, EpisodeProgressEntry> = {};
    for (const ep of epProgressRecs) {
      episodeProgress[ep.episodeId] = ep;
    }

    set({
      hydrated: true,
      likedTracks: likedRecs.map((r) => r.track),
      playlists,
      folders,
      savedAlbums,
      followedArtists,
      savedPodcasts,
      episodeProgress,
      playHistory,
      recentSearches,
      hiddenTrackIds: hiddenRecs.map((r) => r.id),
      localFiles,
      offlineDownloads,
    });
  },

  setSortMode: (sortMode) => set({ sortMode }),
  setFilterType: (filterType) => set({ filterType }),
  setViewMode: (viewMode) => set({ viewMode }),

  toggleLike: (track) => {
    const key = normalizeTrackId(track);
    const current = get().likedTracks;
    const exists = current.some((t) => normalizeTrackId(t) === key);
    if (exists) {
      set({ likedTracks: current.filter((t) => normalizeTrackId(t) !== key) });
      void db.likedTracks.delete(key).catch(() => {});
    } else {
      const normalized = { ...track, id: key };
      set({ likedTracks: [normalized, ...current] });
      void db.likedTracks.put({ id: key, addedAt: Date.now(), track: normalized }).catch(() => {});
    }
  },

  isLiked: (trackId) => {
    if (!trackId) return false;
    return get().likedTracks.some((t) => normalizeTrackId(t) === trackId);
  },

  createPlaylist: (name, initialTrack, options) => {
    const now = Date.now();
    const newPlaylist: LocalPlaylist = {
      id: `pl_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || 'Playlist Baru',
      description: options?.description?.trim() || '',
      coverUrl: initialTrack?.thumbnail || null,
      folderId: options?.folderId ?? null,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      lastPlayedAt: null,
      tracks: initialTrack ? [initialTrack] : [],
    };
    set((state) => ({ playlists: [newPlaylist, ...state.playlists] }));
    void db.playlists.put(newPlaylist).catch(() => {});
    return newPlaylist;
  },

  updatePlaylist: (playlistId, patch) => {
    const updatedAt = Date.now();
    set((state) => ({
      playlists: state.playlists.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const next = { ...pl, ...patch, updatedAt };
        void db.playlists.put(next).catch(() => {});
        return next;
      }),
    }));
  },

  deletePlaylist: (playlistId) => {
    set((state) => ({
      playlists: state.playlists.filter((pl) => pl.id !== playlistId),
    }));
    void db.playlists.delete(playlistId).catch(() => {});
  },

  togglePinPlaylist: (playlistId) => {
    const pl = get().playlists.find((p) => p.id === playlistId);
    if (!pl) return;
    get().updatePlaylist(playlistId, { pinned: !pl.pinned });
  },

  hasTrackInPlaylist: (playlistId, track) => {
    const pl = get().playlists.find((p) => p.id === playlistId);
    if (!pl) return false;
    const key = normalizeTrackId(track);
    return pl.tracks.some((t) => normalizeTrackId(t) === key);
  },

  addTrackToPlaylist: (playlistId, track, allowDuplicate = false) => {
    const pl = get().playlists.find((p) => p.id === playlistId);
    if (!pl) return false;
    const key = normalizeTrackId(track);
    const isDuplicate = pl.tracks.some((t) => normalizeTrackId(t) === key);
    if (isDuplicate && !allowDuplicate) {
      return false;
    }
    const nextPl: LocalPlaylist = {
      ...pl,
      coverUrl: pl.coverUrl || track.thumbnail || null,
      updatedAt: Date.now(),
      tracks: [...pl.tracks, track],
    };
    set((state) => ({
      playlists: state.playlists.map((p) => (p.id === playlistId ? nextPl : p)),
    }));
    void db.playlists.put(nextPl).catch(() => {});
    return true;
  },

  removeTrackFromPlaylist: (playlistId, trackId, index) => {
    set((state) => ({
      playlists: state.playlists.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const nextTracks =
          typeof index === 'number'
            ? pl.tracks.filter((_, idx) => idx !== index)
            : pl.tracks.filter((t) => normalizeTrackId(t) !== trackId);
        const nextPl = { ...pl, updatedAt: Date.now(), tracks: nextTracks };
        void db.playlists.put(nextPl).catch(() => {});
        return nextPl;
      }),
    }));
  },

  reorderPlaylistTracks: (playlistId, fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    set((state) => ({
      playlists: state.playlists.map((pl) => {
        if (pl.id !== playlistId) return pl;
        if (
          fromIndex < 0 ||
          fromIndex >= pl.tracks.length ||
          toIndex < 0 ||
          toIndex >= pl.tracks.length
        ) {
          return pl;
        }
        const copy = [...pl.tracks];
        const [moved] = copy.splice(fromIndex, 1);
        copy.splice(toIndex, 0, moved);
        const nextPl = { ...pl, updatedAt: Date.now(), tracks: copy };
        void db.playlists.put(nextPl).catch(() => {});
        return nextPl;
      }),
    }));
  },

  removeDuplicatesFromPlaylist: (playlistId) => {
    set((state) => ({
      playlists: state.playlists.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const seen = new Set<string>();
        const unique: MediaItem[] = [];
        for (const t of pl.tracks) {
          const key = normalizeTrackId(t);
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(t);
          }
        }
        const nextPl = { ...pl, updatedAt: Date.now(), tracks: unique };
        void db.playlists.put(nextPl).catch(() => {});
        return nextPl;
      }),
    }));
  },

  markPlaylistPlayed: (playlistId) => {
    set((state) => ({
      playlists: state.playlists.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const nextPl = { ...pl, lastPlayedAt: Date.now() };
        void db.playlists.put(nextPl).catch(() => {});
        return nextPl;
      }),
    }));
  },

  createFolder: (name) => {
    const folder: PlaylistFolder = {
      id: `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      name: name.trim() || 'Folder Baru',
      createdAt: Date.now(),
    };
    set((state) => ({ folders: [folder, ...state.folders] }));
    void db.playlistFolders.put(folder).catch(() => {});
    return folder;
  },

  renameFolder: (folderId, name) => {
    const clean = name.trim();
    if (!clean) return;
    set((state) => ({
      folders: state.folders.map((f) => {
        if (f.id !== folderId) return f;
        const updated = { ...f, name: clean };
        void db.playlistFolders.put(updated).catch(() => {});
        return updated;
      }),
    }));
  },

  deleteFolder: (folderId) => {
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== folderId),
      playlists: state.playlists.map((pl) => {
        if (pl.folderId !== folderId) return pl;
        const updated = { ...pl, folderId: null };
        void db.playlists.put(updated).catch(() => {});
        return updated;
      }),
    }));
    void db.playlistFolders.delete(folderId).catch(() => {});
  },

  toggleSaveAlbum: (album) => {
    const id = album.browseId || album.id;
    const exists = get().savedAlbums.some((a) => a.id === id);
    if (exists) {
      set((state) => ({ savedAlbums: state.savedAlbums.filter((a) => a.id !== id) }));
      void db.savedAlbums.delete(id).catch(() => {});
    } else {
      const entry: SavedAlbumEntry = {
        id,
        pinned: false,
        savedAt: Date.now(),
        lastPlayedAt: null,
        item: { ...album, id, type: 'album' },
      };
      set((state) => ({ savedAlbums: [entry, ...state.savedAlbums] }));
      void db.savedAlbums.put(entry).catch(() => {});
    }
  },

  isAlbumSaved: (albumId) => get().savedAlbums.some((a) => a.id === albumId),

  togglePinAlbum: (albumId) => {
    set((state) => ({
      savedAlbums: state.savedAlbums.map((a) => {
        if (a.id !== albumId) return a;
        const next = { ...a, pinned: !a.pinned };
        void db.savedAlbums.put(next).catch(() => {});
        return next;
      }),
    }));
  },

  toggleFollowArtist: (artist) => {
    const id = artist.browseId || artist.id;
    const exists = get().followedArtists.some((a) => a.id === id);
    if (exists) {
      set((state) => ({ followedArtists: state.followedArtists.filter((a) => a.id !== id) }));
      void db.followedArtists.delete(id).catch(() => {});
    } else {
      const entry: FollowedArtistEntry = {
        id,
        pinned: false,
        followedAt: Date.now(),
        lastPlayedAt: null,
        item: { ...artist, id, type: 'artist' },
      };
      set((state) => ({ followedArtists: [entry, ...state.followedArtists] }));
      void db.followedArtists.put(entry).catch(() => {});
    }
  },

  isArtistFollowed: (artistId) => get().followedArtists.some((a) => a.id === artistId),

  togglePinArtist: (artistId) => {
    set((state) => ({
      followedArtists: state.followedArtists.map((a) => {
        if (a.id !== artistId) return a;
        const next = { ...a, pinned: !a.pinned };
        void db.followedArtists.put(next).catch(() => {});
        return next;
      }),
    }));
  },

  toggleFollowPodcast: (podcast) => {
    const id = podcast.browseId || podcast.id;
    const exists = get().savedPodcasts.some((p) => p.id === id);
    if (exists) {
      set((state) => ({ savedPodcasts: state.savedPodcasts.filter((p) => p.id !== id) }));
      void db.savedPodcasts.delete(id).catch(() => {});
    } else {
      const entry: SavedPodcastEntry = {
        id,
        pinned: false,
        savedAt: Date.now(),
        lastPlayedAt: null,
        item: { ...podcast, id, type: 'podcast' },
      };
      set((state) => ({ savedPodcasts: [entry, ...state.savedPodcasts] }));
      void db.savedPodcasts.put(entry).catch(() => {});
    }
  },

  isPodcastFollowed: (podcastId) => get().savedPodcasts.some((p) => p.id === podcastId),

  togglePinPodcast: (podcastId) => {
    set((state) => ({
      savedPodcasts: state.savedPodcasts.map((p) => {
        if (p.id !== podcastId) return p;
        const next = { ...p, pinned: !p.pinned };
        void db.savedPodcasts.put(next).catch(() => {});
        return next;
      }),
    }));
  },

  saveEpisodeProgress: (episodeId, podcastId, positionSeconds, durationSeconds, completed) => {
    const prev = get().episodeProgress[episodeId];
    const autoDone =
      durationSeconds > 0 && positionSeconds >= Math.max(durationSeconds - 10, durationSeconds * 0.94);
    const entry: EpisodeProgressEntry = {
      episodeId,
      podcastId: podcastId ?? prev?.podcastId ?? null,
      positionSeconds,
      durationSeconds: durationSeconds || prev?.durationSeconds || 0,
      completed: completed ?? (prev?.completed || autoDone),
      updatedAt: Date.now(),
    };
    set((state) => ({
      episodeProgress: { ...state.episodeProgress, [episodeId]: entry },
    }));
    void db.episodeProgress.put(entry).catch(() => {});
  },

  markEpisodeCompleted: (episodeId, podcastId, completed) => {
    const prev = get().episodeProgress[episodeId];
    const entry: EpisodeProgressEntry = {
      episodeId,
      podcastId: podcastId ?? prev?.podcastId ?? null,
      positionSeconds: completed ? prev?.durationSeconds || 0 : 0,
      durationSeconds: prev?.durationSeconds || 0,
      completed,
      updatedAt: Date.now(),
    };
    set((state) => ({
      episodeProgress: { ...state.episodeProgress, [episodeId]: entry },
    }));
    void db.episodeProgress.put(entry).catch(() => {});
  },

  recordPlay: (track, durationListenedSec, genreHint) => {
    const trackId = normalizeTrackId(track);
    if (!trackId) return;
    const entry: PlayHistoryEntry = {
      trackId,
      playedAt: Date.now(),
      durationListenedSec: durationListenedSec ?? track.durationSeconds ?? 180,
      sourceType: track.type === 'episode' ? 'episode' : 'song',
      genreHint: genreHint ?? track.genre ?? null,
      track,
    };
    set((state) => ({
      playHistory: [entry, ...state.playHistory].slice(0, 1000),
    }));
    void db.playHistory
      .add(entry)
      .then((uid) => {
        set((state) => ({
          playHistory: state.playHistory.map((h) => (h === entry ? { ...h, uid } : h)),
        }));
      })
      .catch(() => {});
  },

  clearPlayHistory: async () => {
    set({ playHistory: [] });
    await db.playHistory.clear();
  },

  addRecentSearch: (query) => {
    const clean = query.trim();
    if (!clean) return;
    const existing = get().recentSearches.filter(
      (s) => s.query.toLowerCase() !== clean.toLowerCase(),
    );
    const duplicates = get().recentSearches.filter(
      (s) => s.query.toLowerCase() === clean.toLowerCase(),
    );
    for (const dup of duplicates) {
      if (dup.uid) void db.recentSearches.delete(dup.uid).catch(() => {});
    }

    const entry: RecentSearchEntry = { query: clean, searchedAt: Date.now() };
    set({ recentSearches: [entry, ...existing].slice(0, 20) });
    void db.recentSearches
      .add(entry)
      .then((uid) => {
        set((state) => ({
          recentSearches: state.recentSearches.map((r) => (r === entry ? { ...r, uid } : r)),
        }));
      })
      .catch(() => {});
  },

  removeRecentSearch: (uid) => {
    set((state) => ({
      recentSearches: state.recentSearches.filter((r) => r.uid !== uid),
    }));
    void db.recentSearches.delete(uid).catch(() => {});
  },

  clearRecentSearches: () => {
    set({ recentSearches: [] });
    void db.recentSearches.clear().catch(() => {});
  },

  hideTrack: (trackId) => {
    if (!trackId || get().hiddenTrackIds.includes(trackId)) return;
    set((state) => ({ hiddenTrackIds: [trackId, ...state.hiddenTrackIds] }));
    void db.hiddenTracks.put({ id: trackId, hiddenAt: Date.now() }).catch(() => {});
  },

  unhideTrack: (trackId) => {
    set((state) => ({
      hiddenTrackIds: state.hiddenTrackIds.filter((id) => id !== trackId),
    }));
    void db.hiddenTracks.delete(trackId).catch(() => {});
  },

  isTrackHidden: (trackId) => {
    if (!trackId) return false;
    return get().hiddenTrackIds.includes(trackId);
  },

  importLocalFiles: async (fileList) => {
    const files = Array.from(fileList);
    let imported = 0;
    let skipped = 0;
    const addedRecords: LocalAudioFileRecord[] = [];

    for (const file of files) {
      if (!isSupportedLocalAudioFile(file)) {
        skipped += 1;
        continue;
      }
      try {
        const record = await parseLocalAudioFile(file);
        await db.localFiles.put(record);
        addedRecords.push(record);
        imported += 1;
      } catch {
        skipped += 1;
      }
    }

    if (addedRecords.length > 0) {
      set((state) => ({
        localFiles: [...addedRecords.reverse(), ...state.localFiles],
      }));
    }

    return { imported, skipped };
  },

  deleteLocalFile: async (id) => {
    set((state) => ({
      localFiles: state.localFiles.filter((f) => f.id !== id),
    }));
    await db.localFiles.delete(id).catch(() => {});
  },

  downloadTrackOffline: async (track, requestedTier) => {
    const id = getTrackUniqueId(track) || track.id;
    if (!id) {
      return { ok: false, reason: 'ID lagu tidak valid.' };
    }

    if (isLocalTrack(track)) {
      const localRec =
        get().localFiles.find((f) => f.id === id) || (await db.localFiles.get(id));
      if (!localRec) {
        return { ok: false, reason: 'File audio lokal tidak ditemukan.' };
      }
      const badge = classifyStreamQualityBadge({
        codec: localRec.codec || localRec.mimeType,
        bitrateKbps: localRec.bitrateKbps,
        sampleRateHz: localRec.sampleRateHz,
        bitDepth: localRec.bitDepth,
        lossless: localRec.lossless,
      });
      const rec: OfflineDownloadRecord = {
        id,
        track: { ...track, id },
        downloadedAt: Date.now(),
        qualityTier: badge.hiRes ? 'hi_res' : badge.lossless ? 'lossless' : requestedTier,
        codec: localRec.codec || 'Lokal',
        bitrateKbps: localRec.bitrateKbps ?? null,
        sampleRateHz: localRec.sampleRateHz ?? null,
        bitDepth: localRec.bitDepth ?? null,
        lossless: badge.lossless,
        hiRes: badge.hiRes,
        replayGainDb: localRec.replayGainDb ?? null,
        estimatedLufs: localRec.estimatedLufs,
        peakLinear: localRec.peakLinear,
        fileSize: localRec.fileSize,
        mimeType: localRec.mimeType,
        hasAudioBlob: true,
        blob: localRec.blob,
      };
      await db.offlineDownloads.put(rec);
      if ('caches' in window) {
        try {
          const cache = await window.caches.open(OFFLINE_AUDIO_CACHE);
          await cache.put(
            `/offline-audio/${encodeURIComponent(id)}`,
            new Response(localRec.blob, {
              headers: { 'Content-Type': localRec.mimeType || 'audio/mpeg' },
            }),
          );
        } catch {
          // IndexedDB already persisted the offline blob
        }
      }
      set((state) => ({
        offlineDownloads: [rec, ...state.offlineDownloads.filter((d) => d.id !== id)],
      }));
      return { ok: true, record: rec };
    }

    // Online catalog track: download real audio stream when available, with metadata fallback if offline
    const videoId = getPlayableVideoId(track) || id;
    const artistName = formatArtists(track.artists);
    const streamMeta = {
      title: track.title,
      artist: artistName,
      durationSeconds: track.durationSeconds,
      quality: requestedTier,
    };

    let downloadedBlob: Blob | null = null;
    let resolvedCodec = 'AAC';
    let resolvedBitrate: number | null = 160;
    let resolvedSampleRate: number | null = 44100;
    let resolvedMime = 'audio/mp4';

    try {
      const [metaResp, audioResp] = await Promise.all([
        fetchStreamAudioMeta(videoId, streamMeta).catch(() => null),
        fetch(buildStreamAudioUrl(videoId, streamMeta)),
      ]);
      if (audioResp.ok) {
        const blob = await audioResp.blob();
        if (blob.size > 1024) {
          downloadedBlob = blob;
          resolvedCodec = metaResp?.codec || (blob.type.includes('mpeg') ? 'MP3' : 'AAC');
          resolvedBitrate = metaResp?.bitrateKbps ?? resolvedBitrate;
          resolvedSampleRate = metaResp?.sampleRateHz ?? resolvedSampleRate;
          resolvedMime = metaResp?.mimeType || blob.type || 'audio/mp4';
        }
      }
    } catch {
      downloadedBlob = null;
    }

    if (downloadedBlob) {
      const badge = classifyStreamQualityBadge({
        codec: resolvedCodec,
        bitrateKbps: resolvedBitrate,
        sampleRateHz: resolvedSampleRate,
        lossless: false,
      });
      const rec: OfflineDownloadRecord = {
        id,
        track: { ...track, id },
        downloadedAt: Date.now(),
        qualityTier: requestedTier,
        codec: resolvedCodec,
        bitrateKbps: resolvedBitrate,
        sampleRateHz: resolvedSampleRate,
        bitDepth: null,
        lossless: badge.lossless,
        hiRes: badge.hiRes,
        replayGainDb: null,
        estimatedLufs: -14,
        peakLinear: 0.95,
        fileSize: downloadedBlob.size,
        mimeType: resolvedMime,
        hasAudioBlob: true,
        blob: downloadedBlob,
      };
      await db.offlineDownloads.put(rec);
      if ('caches' in window) {
        try {
          const cache = await window.caches.open(OFFLINE_AUDIO_CACHE);
          await cache.put(
            `/offline-audio/${encodeURIComponent(id)}`,
            new Response(downloadedBlob, {
              headers: { 'Content-Type': resolvedMime },
            }),
          );
          if (track.thumbnail && !track.thumbnail.startsWith('blob:')) {
            const thumbResp = await fetch(track.thumbnail).catch(() => null);
            if (thumbResp && thumbResp.ok) {
              await cache.put(track.thumbnail, thumbResp.clone());
            }
          }
        } catch {
          // IndexedDB already persisted the offline blob
        }
      }
      set((state) => ({
        offlineDownloads: [rec, ...state.offlineDownloads.filter((d) => d.id !== id)],
      }));
      return { ok: true, record: rec };
    }

    const tierDefaults: Record<ConcreteQualityTier, { bitrate: number; codec: string; sampleRate: number }> = {
      low: { bitrate: 96, codec: 'AAC-HE', sampleRate: 44100 },
      normal: { bitrate: 128, codec: 'AAC', sampleRate: 44100 },
      high: { bitrate: 160, codec: 'AAC', sampleRate: 44100 },
      very_high: { bitrate: 160, codec: 'AAC', sampleRate: 44100 },
      lossless: { bitrate: 160, codec: 'AAC', sampleRate: 44100 },
      hi_res: { bitrate: 160, codec: 'AAC', sampleRate: 44100 },
    };
    const tierMeta = tierDefaults[requestedTier] || tierDefaults.high;
    const badge = classifyStreamQualityBadge({
      codec: tierMeta.codec,
      bitrateKbps: tierMeta.bitrate,
      sampleRateHz: tierMeta.sampleRate,
      lossless: false,
    });

    const manifestPayload = JSON.stringify({
      id,
      track: { ...track, id },
      savedAt: Date.now(),
      qualityTier: requestedTier,
      codec: tierMeta.codec,
      bitrateKbps: tierMeta.bitrate,
      sampleRateHz: tierMeta.sampleRate,
    });
    const manifestBlob = new Blob([manifestPayload], { type: 'application/json' });

    const rec: OfflineDownloadRecord = {
      id,
      track: { ...track, id },
      downloadedAt: Date.now(),
      qualityTier: requestedTier,
      codec: tierMeta.codec,
      bitrateKbps: tierMeta.bitrate,
      sampleRateHz: tierMeta.sampleRate,
      bitDepth: null,
      lossless: false,
      hiRes: false,
      replayGainDb: null,
      estimatedLufs: -14,
      peakLinear: 0.95,
      fileSize: manifestBlob.size,
      mimeType: 'application/json',
      hasAudioBlob: false,
      blob: manifestBlob,
    };

    await db.offlineDownloads.put(rec);
    if ('caches' in window) {
      try {
        const cache = await window.caches.open(OFFLINE_AUDIO_CACHE);
        await cache.put(
          `/offline-audio/${encodeURIComponent(id)}`,
          new Response(manifestBlob, {
            headers: { 'Content-Type': 'application/json' },
          }),
        );
        if (track.thumbnail && !track.thumbnail.startsWith('blob:')) {
          const thumbResp = await fetch(track.thumbnail).catch(() => null);
          if (thumbResp && thumbResp.ok) {
            await cache.put(track.thumbnail, thumbResp.clone());
          }
        }
      } catch {
        // IndexedDB already persisted the offline record
      }
    }

    set((state) => ({
      offlineDownloads: [rec, ...state.offlineDownloads.filter((d) => d.id !== id)],
    }));
    return { ok: true, record: rec };
  },

  downloadTracksOffline: async (tracks, requestedTier) => {
    let savedCount = 0;
    let failedCount = 0;
    for (const track of tracks) {
      const res = await get().downloadTrackOffline(track, requestedTier);
      if (res.ok) {
        savedCount += 1;
      } else {
        failedCount += 1;
      }
    }
    return { savedCount, failedCount };
  },

  deleteOfflineDownload: async (trackId) => {
    set((state) => ({
      offlineDownloads: state.offlineDownloads.filter((d) => d.id !== trackId),
    }));
    await db.offlineDownloads.delete(trackId).catch(() => {});
    if ('caches' in window) {
      try {
        const cache = await window.caches.open(OFFLINE_AUDIO_CACHE);
        await cache.delete(`/offline-audio/${encodeURIComponent(trackId)}`);
      } catch {
        // Ignore
      }
    }
  },

  isTrackDownloadedOffline: (trackId) => {
    if (!trackId) return false;
    return get().offlineDownloads.some((d) => d.id === trackId);
  },
}));
