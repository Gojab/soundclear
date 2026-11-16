import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  DEFAULT_HOME_SECTION_ORDER,
  DEFAULT_LOCAL_AUDIO_PROFILE,
  DEFAULT_SETTINGS,
  DEFAULT_YOUTUBE_SOUND,
  normalizeLocalAudioProfile,
  type PersistedPlayerSession,
} from '../db/soundclearDb';
import type {
  EpisodeProgressEntry,
  FollowedArtistEntry,
  LocalAudioProfile,
  LocalPlaylist,
  MediaItem,
  PlayHistoryEntry,
  PlaylistFolder,
  PlaylistMixSettings,
  RecentSearchEntry,
  SavedAlbumEntry,
  SavedPodcastEntry,
  UserSettings,
} from '../types/music';
import { clampNumber, clampPlaybackRate } from '../utils/audioMath';
import { normalizeCustomBackground } from '../utils/backgroundTheme';
import { normalizePlaylistMixSettings } from '../utils/djMixLogic';
import { normalizeNotchDisplayMode, normalizeNotchMonitor } from '../utils/notchPlayer';
import { db } from './firebase';
import { handleFirestoreError, OperationType } from './firestoreError';

const knownDocPaths = new Set<string>();

export function clearKnownFirestoreDocPaths(): void {
  knownDocPaths.clear();
}

export function toSafeDocId(rawId: string): string {
  const clean = String(rawId || '').trim();
  if (/^[a-zA-Z0-9_-]{1,128}$/.test(clean)) {
    return clean;
  }
  let hash = 2166136261;
  for (let i = 0; i < clean.length; i += 1) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  const prefix = clean
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96);
  return `${prefix || 'id'}_${hex}`.slice(0, 128);
}

function truncateStr(val: string | null | undefined, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.slice(0, maxLen);
}

function optionalStr(val: string | null | undefined, maxLen: number): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.slice(0, maxLen);
  return trimmed.length > 0 ? trimmed : null;
}

function safeRemoteUrl(val: string | null | undefined, maxLen: number): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return null;
  return trimmed.slice(0, maxLen);
}

export function sanitizeTrackForFirestore(track: MediaItem): MediaItem {
  const safeArtists = Array.isArray(track.artists)
    ? track.artists.slice(0, 50).map((a) => ({
        id: a?.id ? truncateStr(a.id, 128) : null,
        name: truncateStr(a?.name || 'Artis', 200),
      }))
    : [];

  const sanitized: MediaItem = {
    id: truncateStr(track.id || track.videoId || 'track', 256) || 'track',
    title: truncateStr(track.title || 'Tanpa Judul', 500),
    artists: safeArtists,
    type: track.type || 'song',
  };

  if (track.album && typeof track.album === 'object') {
    sanitized.album = {
      id: track.album.id ? truncateStr(track.album.id, 128) : null,
      name: truncateStr(track.album.name || '', 300),
    };
  }
  if (typeof track.duration === 'string') sanitized.duration = truncateStr(track.duration, 32);
  if (typeof track.durationSeconds === 'number' && Number.isFinite(track.durationSeconds)) {
    sanitized.durationSeconds = Math.max(0, Math.round(track.durationSeconds));
  }
  const safeThumb = safeRemoteUrl(track.thumbnail, 2048);
  if (safeThumb) sanitized.thumbnail = safeThumb;
  if (typeof track.year === 'string') sanitized.year = truncateStr(track.year, 16);
  if (typeof track.views === 'string') sanitized.views = truncateStr(track.views, 64);
  if (typeof track.isExplicit === 'boolean') sanitized.isExplicit = track.isExplicit;
  if (typeof track.playlistId === 'string') sanitized.playlistId = truncateStr(track.playlistId, 128);
  if (typeof track.videoId === 'string') sanitized.videoId = truncateStr(track.videoId, 128);
  if (typeof track.browseId === 'string') sanitized.browseId = truncateStr(track.browseId, 128);
  if (typeof track.description === 'string') sanitized.description = truncateStr(track.description, 4000);
  if (typeof track.published === 'string') sanitized.published = truncateStr(track.published, 64);
  if (typeof track.podcastId === 'string') sanitized.podcastId = truncateStr(track.podcastId, 128);
  if (typeof track.creditsBrowseId === 'string') {
    sanitized.creditsBrowseId = truncateStr(track.creditsBrowseId, 128);
  }
  if (typeof track.genre === 'string') sanitized.genre = truncateStr(track.genre, 120);
  if (typeof track.localFileId === 'string') sanitized.localFileId = truncateStr(track.localFileId, 128);

  return sanitized;
}

function sanitizeMixConfig(cfg?: PlaylistMixSettings | null): PlaylistMixSettings | null {
  if (!cfg || typeof cfg !== 'object') return null;
  const norm = normalizePlaylistMixSettings(cfg);
  return {
    enabled: norm.enabled,
    durationSeconds: norm.durationSeconds,
    transitionStyle: norm.transitionStyle,
    beatMatch: norm.beatMatch,
    eqBlend: norm.eqBlend,
    volumeCurve: norm.volumeCurve,
  };
}

function sanitizePreferencesPayload(uid: string, s: UserSettings) {
  const bg = normalizeCustomBackground(s.customBackground, null);
  const safeYoutubeSound = {
    maxVolumeLimit: clampNumber(s.youtubeSound?.maxVolumeLimit ?? DEFAULT_YOUTUBE_SOUND.maxVolumeLimit, 10, 100),
    startupVolumeMode: s.youtubeSound?.startupVolumeMode === 'fixed' ? 'fixed' : 'last',
    startupFixedVolume: clampNumber(
      s.youtubeSound?.startupFixedVolume ?? DEFAULT_YOUTUBE_SOUND.startupFixedVolume,
      0,
      100,
    ),
    defaultPlaybackRate: clampPlaybackRate(
      s.youtubeSound?.defaultPlaybackRate ?? DEFAULT_YOUTUBE_SOUND.defaultPlaybackRate,
    ),
    trackFadeSeconds: clampNumber(
      s.youtubeSound?.trackFadeSeconds ?? DEFAULT_YOUTUBE_SOUND.trackFadeSeconds,
      0,
      15,
    ),
    fadeOnPauseResume: Boolean(s.youtubeSound?.fadeOnPauseResume ?? true),
    fadeOutOnSleepTimer: Boolean(s.youtubeSound?.fadeOutOnSleepTimer ?? true),
    resumeLastPosition: Boolean(s.youtubeSound?.resumeLastPosition ?? true),
    autoStartOnOpen: Boolean(s.youtubeSound?.autoStartOnOpen ?? false),
  };

  const rawRates = s.episodePlaybackRates || {};
  const episodePlaybackRates: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawRates).slice(0, 200)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      episodePlaybackRates[truncateStr(k, 128)] = clampPlaybackRate(v);
    }
  }

  const order = (Array.isArray(s.homeSectionOrder) && s.homeSectionOrder.length > 0
    ? s.homeSectionOrder
    : DEFAULT_HOME_SECTION_ORDER
  )
    .slice(0, 20)
    .map((item) => truncateStr(item, 64))
    .filter(Boolean);

  return {
    uid,
    hideExplicit: Boolean(s.hideExplicit),
    autoplay: s.autoplay ?? true,
    dataSaver: Boolean(s.dataSaver),
    showRightPanel: s.showRightPanel ?? true,
    lyricsPreviewEnabled: s.lyricsPreviewEnabled ?? true,
    homeSectionOrder: order,
    youtubeSound: safeYoutubeSound,
    episodePlaybackRates,
    customBackground: {
      mode: bg.mode,
      presetId: truncateStr(bg.presetId, 64),
      solidColor: truncateStr(bg.solidColor, 32),
      gradientFrom: truncateStr(bg.gradientFrom, 32),
      gradientTo: truncateStr(bg.gradientTo, 32),
      gradientAngle: clampNumber(bg.gradientAngle, 0, 360),
      customImageDataUrl: null,
      customImageName: optionalStr(bg.customImageName, 160),
      blurPx: clampNumber(bg.blurPx, 0, 40),
      dimOpacity: clampNumber(bg.dimOpacity, 0, 1),
      panelGlass: Boolean(bg.panelGlass),
    },
    notchDisplayMode: normalizeNotchDisplayMode(s.notchDisplayMode),
    notchMonitor: truncateStr(normalizeNotchMonitor(s.notchMonitor), 128),
  };
}

function sanitizeAudioProfilePayload(uid: string, profileId: string, rawProfile: LocalAudioProfile) {
  const norm = normalizeLocalAudioProfile(rawProfile);
  return {
    uid,
    profileId: toSafeDocId(profileId),
    profile: {
      wifiQuality: norm.wifiQuality,
      cellularQuality: norm.cellularQuality,
      autoAdjustQuality: Boolean(norm.autoAdjustQuality),
      downloadQuality: norm.downloadQuality,
      eqEnabled: Boolean(norm.eqEnabled),
      presetId: truncateStr(norm.presetId, 64),
      preampDb: clampNumber(norm.preampDb, -12, 12),
      bands: norm.bands.slice(0, 10).map((b) => clampNumber(b, -12, 12)),
      customPresets: norm.customPresets.slice(0, 50).map((p) => ({
        id: truncateStr(p.id, 64),
        name: truncateStr(p.name, 80),
        preampDb: clampNumber(p.preampDb, -12, 12),
        bands: (Array.isArray(p.bands) ? p.bands : DEFAULT_LOCAL_AUDIO_PROFILE.bands)
          .slice(0, 10)
          .map((b) => clampNumber(b, -12, 12)),
        isCustom: true,
      })),
      bassBoostEnabled: Boolean(norm.bassBoostEnabled),
      bassBoostLevel: clampNumber(norm.bassBoostLevel, 0, 100),
      stereoWidenerEnabled: Boolean(norm.stereoWidenerEnabled),
      stereoWidenerLevel: clampNumber(norm.stereoWidenerLevel, 0, 100),
      normalizationTarget: norm.normalizationTarget,
      useReplayGain: Boolean(norm.useReplayGain),
      limiterEnabled: Boolean(norm.limiterEnabled),
      monoAudio: Boolean(norm.monoAudio),
      balance: clampNumber(norm.balance, -1, 1),
      outputDeviceId: truncateStr(norm.outputDeviceId || '', 128),
      directMode: Boolean(norm.directMode),
      crossfadeEnabled: Boolean(norm.crossfadeEnabled),
      crossfadeSeconds: clampNumber(norm.crossfadeSeconds, 0, 12),
      gaplessPlayback: Boolean(norm.gaplessPlayback),
      fadeOnPlayPause: Boolean(norm.fadeOnPlayPause),
      skipSilence: Boolean(norm.skipSilence),
      djMix: sanitizeMixConfig(norm.djMix),
    },
  };
}

async function upsertDoc(
  path: string,
  createFields: Record<string, unknown>,
  updateFields: Record<string, unknown>,
): Promise<void> {
  const ref = doc(db, path);
  if (knownDocPaths.has(path)) {
    try {
      await updateDoc(ref, {
        ...updateFields,
        updatedAt: serverTimestamp(),
      });
      return;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  let exists = false;
  try {
    const snap = await getDoc(ref);
    exists = snap.exists();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }

  if (exists) {
    knownDocPaths.add(path);
    try {
      await updateDoc(ref, {
        ...updateFields,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  } else {
    try {
      await setDoc(ref, {
        ...createFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      knownDocPaths.add(path);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }
}

export async function ensureUserDocuments(user: User): Promise<void> {
  const uid = user.uid;
  const publicPath = `users/${uid}`;
  const displayName = truncateStr(user.displayName || 'Pengguna SoundClear', 120);
  const photoURL = truncateStr(user.photoURL || '', 1024);
  await upsertDoc(
    publicPath,
    { uid, displayName, photoURL },
    { displayName, photoURL },
  );

  const privatePath = `users/${uid}/private/account`;
  const email = truncateStr(user.email || '', 320);
  await upsertDoc(
    privatePath,
    { uid, email },
    { email },
  );
}

export async function saveUserPreferencesToFirestore(
  uid: string,
  settings: UserSettings,
): Promise<void> {
  const path = `users/${uid}/settings/preferences`;
  const payload = sanitizePreferencesPayload(uid, settings);
  const { uid: _uid, ...updateFields } = payload;
  await upsertDoc(path, payload, updateFields);
}

export async function saveAudioProfileToFirestore(
  uid: string,
  profileId: string,
  profile: LocalAudioProfile,
): Promise<void> {
  const safeProfileId = toSafeDocId(profileId || 'cloud');
  const path = `users/${uid}/audioProfiles/${safeProfileId}`;
  const payload = sanitizeAudioProfilePayload(uid, safeProfileId, profile);
  await upsertDoc(path, payload, { profile: payload.profile });
}

export async function saveLikedTrackToFirestore(
  uid: string,
  track: MediaItem,
  addedAt: number,
): Promise<void> {
  const id = truncateStr(track.videoId || track.id, 256);
  const docId = toSafeDocId(id);
  const path = `users/${uid}/likedTracks/${docId}`;
  const safeTrack = sanitizeTrackForFirestore({ ...track, id });
  await upsertDoc(
    path,
    { uid, id, addedAt: Math.max(0, addedAt), track: safeTrack },
    { addedAt: Math.max(0, addedAt), track: safeTrack },
  );
}

export async function deleteLikedTrackFromFirestore(uid: string, trackId: string): Promise<void> {
  const docId = toSafeDocId(trackId);
  const path = `users/${uid}/likedTracks/${docId}`;
  try {
    await deleteDoc(doc(db, path));
    knownDocPaths.delete(path);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function savePlaylistToFirestore(
  uid: string,
  playlist: LocalPlaylist,
  action: 'create' | 'meta' | 'tracks' | 'played' = 'meta',
): Promise<void> {
  const safeId = toSafeDocId(playlist.id);
  const path = `users/${uid}/playlists/${safeId}`;
  const tracks = (playlist.tracks || []).slice(0, 500).map(sanitizeTrackForFirestore);
  const coverUrl = safeRemoteUrl(playlist.coverUrl, 2048);
  const folderId = optionalStr(playlist.folderId ? toSafeDocId(playlist.folderId) : null, 128);
  const mixConfig = sanitizeMixConfig(playlist.mixConfig);
  const nowMs = Date.now();
  const createdAtMs = Math.max(0, playlist.createdAt || nowMs);
  const updatedAtMs = Math.max(0, playlist.updatedAt || nowMs);
  const lastPlayedAt =
    typeof playlist.lastPlayedAt === 'number' && Number.isFinite(playlist.lastPlayedAt)
      ? Math.max(0, playlist.lastPlayedAt)
      : null;

  const fullDoc = {
    uid,
    id: safeId,
    name: truncateStr(playlist.name || 'Playlist Baru', 200) || 'Playlist Baru',
    description: truncateStr(playlist.description || '', 2000),
    coverUrl,
    folderId,
    pinned: Boolean(playlist.pinned),
    tracks,
    mixConfig,
    lastPlayedAt,
    createdAtMs,
    updatedAtMs,
  };

  if (action === 'create') {
    try {
      await setDoc(doc(db, path), {
        ...fullDoc,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      knownDocPaths.add(path);
      return;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }

  let updateFields: Record<string, unknown>;
  if (action === 'tracks') {
    updateFields = { tracks, coverUrl, updatedAtMs };
  } else if (action === 'played') {
    updateFields = { lastPlayedAt: lastPlayedAt ?? nowMs };
  } else {
    updateFields = {
      name: fullDoc.name,
      description: fullDoc.description,
      coverUrl,
      folderId,
      pinned: fullDoc.pinned,
      mixConfig,
      updatedAtMs,
    };
  }

  await upsertDoc(path, fullDoc, updateFields);
}

export async function deletePlaylistFromFirestore(uid: string, playlistId: string): Promise<void> {
  const path = `users/${uid}/playlists/${toSafeDocId(playlistId)}`;
  try {
    await deleteDoc(doc(db, path));
    knownDocPaths.delete(path);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveFolderToFirestore(uid: string, folder: PlaylistFolder): Promise<void> {
  const safeId = toSafeDocId(folder.id);
  const path = `users/${uid}/folders/${safeId}`;
  const name = truncateStr(folder.name || 'Folder Baru', 120) || 'Folder Baru';
  const createdAtMs = Math.max(0, folder.createdAt || Date.now());
  await upsertDoc(path, { uid, id: safeId, name, createdAtMs }, { name });
}

export async function deleteFolderFromFirestore(uid: string, folderId: string): Promise<void> {
  const path = `users/${uid}/folders/${toSafeDocId(folderId)}`;
  try {
    await deleteDoc(doc(db, path));
    knownDocPaths.delete(path);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveAlbumToFirestore(uid: string, entry: SavedAlbumEntry): Promise<void> {
  const docId = toSafeDocId(entry.id);
  const path = `users/${uid}/savedAlbums/${docId}`;
  const item = sanitizeTrackForFirestore(entry.item);
  const lastPlayedAt =
    typeof entry.lastPlayedAt === 'number' && Number.isFinite(entry.lastPlayedAt)
      ? Math.max(0, entry.lastPlayedAt)
      : null;
  await upsertDoc(
    path,
    {
      uid,
      id: truncateStr(entry.id, 256),
      pinned: Boolean(entry.pinned),
      savedAt: Math.max(0, entry.savedAt || Date.now()),
      lastPlayedAt,
      item,
    },
    { pinned: Boolean(entry.pinned), lastPlayedAt, item },
  );
}

export async function deleteAlbumFromFirestore(uid: string, albumId: string): Promise<void> {
  const path = `users/${uid}/savedAlbums/${toSafeDocId(albumId)}`;
  try {
    await deleteDoc(doc(db, path));
    knownDocPaths.delete(path);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveFollowedArtistToFirestore(
  uid: string,
  entry: FollowedArtistEntry,
): Promise<void> {
  const docId = toSafeDocId(entry.id);
  const path = `users/${uid}/followedArtists/${docId}`;
  const item = sanitizeTrackForFirestore(entry.item);
  const lastPlayedAt =
    typeof entry.lastPlayedAt === 'number' && Number.isFinite(entry.lastPlayedAt)
      ? Math.max(0, entry.lastPlayedAt)
      : null;
  await upsertDoc(
    path,
    {
      uid,
      id: truncateStr(entry.id, 256),
      pinned: Boolean(entry.pinned),
      followedAt: Math.max(0, entry.followedAt || Date.now()),
      lastPlayedAt,
      item,
    },
    { pinned: Boolean(entry.pinned), lastPlayedAt, item },
  );
}

export async function deleteFollowedArtistFromFirestore(
  uid: string,
  artistId: string,
): Promise<void> {
  const path = `users/${uid}/followedArtists/${toSafeDocId(artistId)}`;
  try {
    await deleteDoc(doc(db, path));
    knownDocPaths.delete(path);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function savePodcastToFirestore(uid: string, entry: SavedPodcastEntry): Promise<void> {
  const docId = toSafeDocId(entry.id);
  const path = `users/${uid}/savedPodcasts/${docId}`;
  const item = sanitizeTrackForFirestore(entry.item);
  const lastPlayedAt =
    typeof entry.lastPlayedAt === 'number' && Number.isFinite(entry.lastPlayedAt)
      ? Math.max(0, entry.lastPlayedAt)
      : null;
  await upsertDoc(
    path,
    {
      uid,
      id: truncateStr(entry.id, 256),
      pinned: Boolean(entry.pinned),
      savedAt: Math.max(0, entry.savedAt || Date.now()),
      lastPlayedAt,
      item,
    },
    { pinned: Boolean(entry.pinned), lastPlayedAt, item },
  );
}

export async function deletePodcastFromFirestore(uid: string, podcastId: string): Promise<void> {
  const path = `users/${uid}/savedPodcasts/${toSafeDocId(podcastId)}`;
  try {
    await deleteDoc(doc(db, path));
    knownDocPaths.delete(path);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveEpisodeProgressToFirestore(
  uid: string,
  entry: EpisodeProgressEntry,
): Promise<void> {
  const docId = toSafeDocId(entry.episodeId);
  const path = `users/${uid}/episodeProgress/${docId}`;
  const podcastId = optionalStr(entry.podcastId, 256);
  const positionSeconds = Math.max(0, entry.positionSeconds || 0);
  const durationSeconds = Math.max(0, entry.durationSeconds || 0);
  const completed = Boolean(entry.completed);
  const updatedAtMs = Math.max(0, entry.updatedAt || Date.now());
  await upsertDoc(
    path,
    {
      uid,
      episodeId: truncateStr(entry.episodeId, 256),
      podcastId,
      positionSeconds,
      durationSeconds,
      completed,
      updatedAtMs,
    },
    { podcastId, positionSeconds, durationSeconds, completed, updatedAtMs },
  );
}

export async function addPlayHistoryToFirestore(
  uid: string,
  entry: PlayHistoryEntry,
): Promise<void> {
  const entryId = toSafeDocId(
    `ph_${entry.playedAt.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  );
  const path = `users/${uid}/playHistory/${entryId}`;
  try {
    await setDoc(doc(db, path), {
      uid,
      entryId,
      trackId: truncateStr(entry.trackId, 256),
      playedAt: Math.max(0, entry.playedAt),
      durationListenedSec: Math.max(0, entry.durationListenedSec || 0),
      sourceType: entry.sourceType === 'episode' ? 'episode' : 'song',
      genreHint: optionalStr(entry.genreHint, 120),
      track: sanitizeTrackForFirestore(entry.track),
      createdAt: serverTimestamp(),
    });
    knownDocPaths.add(path);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function clearPlayHistoryInFirestore(uid: string): Promise<void> {
  const colPath = `users/${uid}/playHistory`;
  try {
    const snap = await getDocs(collection(db, colPath));
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      for (const d of docs.slice(i, i + 400)) {
        batch.delete(d.ref);
        knownDocPaths.delete(`${colPath}/${d.id}`);
      }
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, colPath);
  }
}

export async function addRecentSearchToFirestore(
  uid: string,
  entry: RecentSearchEntry,
): Promise<void> {
  const searchId = toSafeDocId(entry.query.toLowerCase());
  const path = `users/${uid}/recentSearches/${searchId}`;
  try {
    await deleteDoc(doc(db, path)).catch(() => {});
    await setDoc(doc(db, path), {
      uid,
      searchId,
      query: truncateStr(entry.query, 300),
      searchedAt: Math.max(0, entry.searchedAt),
      createdAt: serverTimestamp(),
    });
    knownDocPaths.add(path);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteRecentSearchFromFirestore(uid: string, queryText: string): Promise<void> {
  const searchId = toSafeDocId(queryText.toLowerCase());
  const path = `users/${uid}/recentSearches/${searchId}`;
  try {
    await deleteDoc(doc(db, path));
    knownDocPaths.delete(path);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function clearRecentSearchesInFirestore(uid: string): Promise<void> {
  const colPath = `users/${uid}/recentSearches`;
  try {
    const snap = await getDocs(collection(db, colPath));
    if (snap.empty) return;
    const batch = writeBatch(db);
    for (const d of snap.docs) {
      batch.delete(d.ref);
      knownDocPaths.delete(`${colPath}/${d.id}`);
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, colPath);
  }
}

export async function saveHiddenTrackToFirestore(uid: string, trackId: string): Promise<void> {
  const docId = toSafeDocId(trackId);
  const path = `users/${uid}/hiddenTracks/${docId}`;
  try {
    await setDoc(doc(db, path), {
      uid,
      id: truncateStr(trackId, 256),
      hiddenAt: Date.now(),
      createdAt: serverTimestamp(),
    });
    knownDocPaths.add(path);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteHiddenTrackFromFirestore(uid: string, trackId: string): Promise<void> {
  const path = `users/${uid}/hiddenTracks/${toSafeDocId(trackId)}`;
  try {
    await deleteDoc(doc(db, path));
    knownDocPaths.delete(path);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveTasteExclusionToFirestore(uid: string, trackId: string): Promise<void> {
  const docId = toSafeDocId(trackId);
  const path = `users/${uid}/tasteExclusions/${docId}`;
  try {
    await setDoc(doc(db, path), {
      uid,
      id: truncateStr(trackId, 256),
      excludedAt: Date.now(),
      createdAt: serverTimestamp(),
    });
    knownDocPaths.add(path);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteTasteExclusionFromFirestore(
  uid: string,
  trackId: string,
): Promise<void> {
  const path = `users/${uid}/tasteExclusions/${toSafeDocId(trackId)}`;
  try {
    await deleteDoc(doc(db, path));
    knownDocPaths.delete(path);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function savePlayerSessionToFirestore(
  uid: string,
  session: PersistedPlayerSession,
): Promise<void> {
  const path = `users/${uid}/playerSession/current`;
  const payload = {
    uid,
    currentTrack: session.currentTrack ? sanitizeTrackForFirestore(session.currentTrack) : null,
    queue: (session.queue || []).slice(0, 200).map(sanitizeTrackForFirestore),
    queueIndex: Math.max(0, Math.round(session.queueIndex || 0)),
    sourceQueue: (session.sourceQueue || []).slice(0, 200).map(sanitizeTrackForFirestore),
    sourceLabel: optionalStr(session.sourceLabel, 300),
    currentTime: Math.max(0, Number.isFinite(session.currentTime) ? session.currentTime : 0),
    duration: Math.max(0, Number.isFinite(session.duration) ? session.duration : 0),
    volume: clampNumber(session.volume ?? 80, 0, 100),
    isMuted: Boolean(session.isMuted),
    shuffle: Boolean(session.shuffle),
    smartShuffle: Boolean(session.smartShuffle),
    repeat:
      session.repeat === 'all' || session.repeat === 'one' ? session.repeat : ('off' as const),
    playbackRate: clampPlaybackRate(session.playbackRate ?? 1),
    crossfadeSeconds: clampNumber(session.crossfadeSeconds ?? 0, 0, 15),
    activeMixConfig: sanitizeMixConfig(session.activeMixConfig),
  };
  const { uid: _uid, ...updateFields } = payload;
  await upsertDoc(path, payload, updateFields);
}

export interface FirestoreSyncCallbacks {
  onSettings: (settings: Partial<UserSettings>) => void;
  onAudioProfile: (profile: LocalAudioProfile) => void;
  onLikedTracks: (tracks: Array<{ id: string; addedAt: number; track: MediaItem }>) => void;
  onPlaylists: (playlists: LocalPlaylist[]) => void;
  onFolders: (folders: PlaylistFolder[]) => void;
  onSavedAlbums: (albums: SavedAlbumEntry[]) => void;
  onFollowedArtists: (artists: FollowedArtistEntry[]) => void;
  onSavedPodcasts: (podcasts: SavedPodcastEntry[]) => void;
  onEpisodeProgress: (progress: Record<string, EpisodeProgressEntry>) => void;
  onPlayHistory: (history: PlayHistoryEntry[]) => void;
  onRecentSearches: (searches: RecentSearchEntry[]) => void;
  onHiddenTracks: (ids: string[]) => void;
  onTasteExclusions: (ids: string[]) => void;
  onPlayerSession: (session: PersistedPlayerSession) => void;
}

export function subscribeUserFirestoreData(
  uid: string,
  cb: FirestoreSyncCallbacks,
): () => void {
  const unsubs: Unsubscribe[] = [];

  const settingsPath = `users/${uid}/settings/preferences`;
  unsubs.push(
    onSnapshot(
      doc(db, settingsPath),
      (snap) => {
        if (!snap.exists()) return;
        knownDocPaths.add(settingsPath);
        const data = snap.data() as Partial<UserSettings>;
        cb.onSettings(data);
      },
      (err) => handleFirestoreError(err, OperationType.GET, settingsPath),
    ),
  );

  const audioProfilesCol = `users/${uid}/audioProfiles`;
  unsubs.push(
    onSnapshot(
      collection(db, audioProfilesCol),
      (snap) => {
        const preferred =
          snap.docs.find((d) => d.id === 'cloud') ?? snap.docs[0];
        if (!preferred) return;
        knownDocPaths.add(`${audioProfilesCol}/${preferred.id}`);
        const raw = preferred.data()?.profile as Partial<LocalAudioProfile> | undefined;
        if (raw) cb.onAudioProfile(normalizeLocalAudioProfile(raw));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, audioProfilesCol),
    ),
  );

  const likedCol = `users/${uid}/likedTracks`;
  unsubs.push(
    onSnapshot(
      query(collection(db, likedCol), orderBy('addedAt', 'desc')),
      (snap) => {
        const rows = snap.docs.map((d) => {
          knownDocPaths.add(`${likedCol}/${d.id}`);
          const data = d.data();
          return {
            id: String(data.id || d.id),
            addedAt: Number(data.addedAt || 0),
            track: data.track as MediaItem,
          };
        });
        cb.onLikedTracks(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, likedCol),
    ),
  );

  const playlistsCol = `users/${uid}/playlists`;
  unsubs.push(
    onSnapshot(
      query(collection(db, playlistsCol), orderBy('createdAtMs', 'desc')),
      (snap) => {
        const rows: LocalPlaylist[] = snap.docs.map((d) => {
          knownDocPaths.add(`${playlistsCol}/${d.id}`);
          const data = d.data();
          return {
            id: String(data.id || d.id),
            name: String(data.name || 'Playlist'),
            description: String(data.description || ''),
            coverUrl: (data.coverUrl as string | null) ?? null,
            folderId: (data.folderId as string | null) ?? null,
            pinned: Boolean(data.pinned),
            createdAt: Number(data.createdAtMs || Date.now()),
            updatedAt: Number(data.updatedAtMs || Date.now()),
            lastPlayedAt: (data.lastPlayedAt as number | null) ?? null,
            tracks: Array.isArray(data.tracks) ? (data.tracks as MediaItem[]) : [],
            mixConfig: data.mixConfig ? normalizePlaylistMixSettings(data.mixConfig) : undefined,
          };
        });
        cb.onPlaylists(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, playlistsCol),
    ),
  );

  const foldersCol = `users/${uid}/folders`;
  unsubs.push(
    onSnapshot(
      query(collection(db, foldersCol), orderBy('createdAtMs', 'desc')),
      (snap) => {
        const rows: PlaylistFolder[] = snap.docs.map((d) => {
          knownDocPaths.add(`${foldersCol}/${d.id}`);
          const data = d.data();
          return {
            id: String(data.id || d.id),
            name: String(data.name || 'Folder'),
            createdAt: Number(data.createdAtMs || Date.now()),
          };
        });
        cb.onFolders(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, foldersCol),
    ),
  );

  const albumsCol = `users/${uid}/savedAlbums`;
  unsubs.push(
    onSnapshot(
      query(collection(db, albumsCol), orderBy('savedAt', 'desc')),
      (snap) => {
        const rows: SavedAlbumEntry[] = snap.docs.map((d) => {
          knownDocPaths.add(`${albumsCol}/${d.id}`);
          const data = d.data();
          return {
            id: String(data.id || d.id),
            pinned: Boolean(data.pinned),
            savedAt: Number(data.savedAt || Date.now()),
            lastPlayedAt: (data.lastPlayedAt as number | null) ?? null,
            item: data.item as MediaItem,
          };
        });
        cb.onSavedAlbums(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, albumsCol),
    ),
  );

  const artistsCol = `users/${uid}/followedArtists`;
  unsubs.push(
    onSnapshot(
      query(collection(db, artistsCol), orderBy('followedAt', 'desc')),
      (snap) => {
        const rows: FollowedArtistEntry[] = snap.docs.map((d) => {
          knownDocPaths.add(`${artistsCol}/${d.id}`);
          const data = d.data();
          return {
            id: String(data.id || d.id),
            pinned: Boolean(data.pinned),
            followedAt: Number(data.followedAt || Date.now()),
            lastPlayedAt: (data.lastPlayedAt as number | null) ?? null,
            item: data.item as MediaItem,
          };
        });
        cb.onFollowedArtists(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, artistsCol),
    ),
  );

  const podcastsCol = `users/${uid}/savedPodcasts`;
  unsubs.push(
    onSnapshot(
      query(collection(db, podcastsCol), orderBy('savedAt', 'desc')),
      (snap) => {
        const rows: SavedPodcastEntry[] = snap.docs.map((d) => {
          knownDocPaths.add(`${podcastsCol}/${d.id}`);
          const data = d.data();
          return {
            id: String(data.id || d.id),
            pinned: Boolean(data.pinned),
            savedAt: Number(data.savedAt || Date.now()),
            lastPlayedAt: (data.lastPlayedAt as number | null) ?? null,
            item: data.item as MediaItem,
          };
        });
        cb.onSavedPodcasts(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, podcastsCol),
    ),
  );

  const epCol = `users/${uid}/episodeProgress`;
  unsubs.push(
    onSnapshot(
      collection(db, epCol),
      (snap) => {
        const map: Record<string, EpisodeProgressEntry> = {};
        for (const d of snap.docs) {
          knownDocPaths.add(`${epCol}/${d.id}`);
          const data = d.data();
          const epId = String(data.episodeId || d.id);
          map[epId] = {
            episodeId: epId,
            podcastId: (data.podcastId as string | null) ?? null,
            positionSeconds: Number(data.positionSeconds || 0),
            durationSeconds: Number(data.durationSeconds || 0),
            completed: Boolean(data.completed),
            updatedAt: Number(data.updatedAtMs || Date.now()),
          };
        }
        cb.onEpisodeProgress(map);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, epCol),
    ),
  );

  const historyCol = `users/${uid}/playHistory`;
  unsubs.push(
    onSnapshot(
      query(collection(db, historyCol), orderBy('playedAt', 'desc'), limit(250)),
      (snap) => {
        const rows: PlayHistoryEntry[] = snap.docs.map((d) => {
          knownDocPaths.add(`${historyCol}/${d.id}`);
          const data = d.data();
          return {
            trackId: String(data.trackId || ''),
            playedAt: Number(data.playedAt || 0),
            durationListenedSec: Number(data.durationListenedSec || 0),
            sourceType: data.sourceType === 'episode' ? 'episode' : 'song',
            genreHint: (data.genreHint as string | null) ?? null,
            track: data.track as MediaItem,
          };
        });
        cb.onPlayHistory(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, historyCol),
    ),
  );

  const searchesCol = `users/${uid}/recentSearches`;
  unsubs.push(
    onSnapshot(
      query(collection(db, searchesCol), orderBy('searchedAt', 'desc'), limit(20)),
      (snap) => {
        const rows: RecentSearchEntry[] = snap.docs.map((d, idx) => {
          knownDocPaths.add(`${searchesCol}/${d.id}`);
          const data = d.data();
          return {
            uid: idx + 1,
            query: String(data.query || ''),
            searchedAt: Number(data.searchedAt || 0),
          };
        });
        cb.onRecentSearches(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, searchesCol),
    ),
  );

  const hiddenCol = `users/${uid}/hiddenTracks`;
  unsubs.push(
    onSnapshot(
      collection(db, hiddenCol),
      (snap) => {
        const ids = snap.docs.map((d) => {
          knownDocPaths.add(`${hiddenCol}/${d.id}`);
          return String(d.data().id || d.id);
        });
        cb.onHiddenTracks(ids);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, hiddenCol),
    ),
  );

  const tasteCol = `users/${uid}/tasteExclusions`;
  unsubs.push(
    onSnapshot(
      collection(db, tasteCol),
      (snap) => {
        const ids = snap.docs.map((d) => {
          knownDocPaths.add(`${tasteCol}/${d.id}`);
          return String(d.data().id || d.id);
        });
        cb.onTasteExclusions(ids);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, tasteCol),
    ),
  );

  const sessionPath = `users/${uid}/playerSession/current`;
  unsubs.push(
    onSnapshot(
      doc(db, sessionPath),
      (snap) => {
        if (!snap.exists()) return;
        knownDocPaths.add(sessionPath);
        const data = snap.data() as PersistedPlayerSession;
        cb.onPlayerSession(data);
      },
      (err) => handleFirestoreError(err, OperationType.GET, sessionPath),
    ),
  );

  return () => {
    for (const u of unsubs) {
      try {
        u();
      } catch {
        // Ignore unsubscribe error
      }
    }
  };
}

export async function seedCloudIfEmptyFromLocal(
  uid: string,
  localData: {
    settings: UserSettings;
    localProfile: LocalAudioProfile;
    likedTracks: MediaItem[];
    playlists: LocalPlaylist[];
    folders: PlaylistFolder[];
    savedAlbums: SavedAlbumEntry[];
    followedArtists: FollowedArtistEntry[];
    savedPodcasts: SavedPodcastEntry[];
    episodeProgress: Record<string, EpisodeProgressEntry>;
    hiddenTrackIds: string[];
    excludedTasteIds: string[];
    recentSearches: RecentSearchEntry[];
  },
): Promise<{ seededCount: number }> {
  let seededCount = 0;

  try {
    const prefSnap = await getDoc(doc(db, `users/${uid}/settings/preferences`));
    if (!prefSnap.exists()) {
      await saveUserPreferencesToFirestore(uid, localData.settings);
      seededCount += 1;
    }

    const audioSnap = await getDoc(doc(db, `users/${uid}/audioProfiles/cloud`));
    if (!audioSnap.exists()) {
      await saveAudioProfileToFirestore(uid, 'cloud', localData.localProfile);
      seededCount += 1;
    }

    const [existingPlaylists, existingLikes] = await Promise.all([
      getDocs(query(collection(db, `users/${uid}/playlists`), limit(1))),
      getDocs(query(collection(db, `users/${uid}/likedTracks`), limit(1))),
    ]);

    if (existingPlaylists.empty && localData.playlists.length > 0) {
      for (const pl of localData.playlists.slice(0, 50)) {
        await savePlaylistToFirestore(uid, pl, 'create');
        seededCount += 1;
      }
      for (const fl of localData.folders.slice(0, 30)) {
        await saveFolderToFirestore(uid, fl);
        seededCount += 1;
      }
    }

    if (existingLikes.empty && localData.likedTracks.length > 0) {
      const now = Date.now();
      for (let i = 0; i < Math.min(localData.likedTracks.length, 100); i += 1) {
        const track = localData.likedTracks[i];
        await saveLikedTrackToFirestore(uid, track, now - i);
        seededCount += 1;
      }
    }

    if (localData.savedAlbums.length > 0) {
      const existingAlbums = await getDocs(query(collection(db, `users/${uid}/savedAlbums`), limit(1)));
      if (existingAlbums.empty) {
        for (const al of localData.savedAlbums.slice(0, 50)) {
          await saveAlbumToFirestore(uid, al);
          seededCount += 1;
        }
      }
    }

    if (localData.followedArtists.length > 0) {
      const existingArtists = await getDocs(
        query(collection(db, `users/${uid}/followedArtists`), limit(1)),
      );
      if (existingArtists.empty) {
        for (const ar of localData.followedArtists.slice(0, 50)) {
          await saveFollowedArtistToFirestore(uid, ar);
          seededCount += 1;
        }
      }
    }

    if (localData.savedPodcasts.length > 0) {
      const existingPodcasts = await getDocs(
        query(collection(db, `users/${uid}/savedPodcasts`), limit(1)),
      );
      if (existingPodcasts.empty) {
        for (const pod of localData.savedPodcasts.slice(0, 50)) {
          await savePodcastToFirestore(uid, pod);
          seededCount += 1;
        }
      }
    }

    const epEntries = Object.values(localData.episodeProgress);
    if (epEntries.length > 0) {
      const existingEp = await getDocs(query(collection(db, `users/${uid}/episodeProgress`), limit(1)));
      if (existingEp.empty) {
        for (const ep of epEntries.slice(0, 50)) {
          await saveEpisodeProgressToFirestore(uid, ep);
          seededCount += 1;
        }
      }
    }

    for (const hid of localData.hiddenTrackIds.slice(0, 50)) {
      await saveHiddenTrackToFirestore(uid, hid);
    }
    for (const tid of localData.excludedTasteIds.slice(0, 50)) {
      await saveTasteExclusionToFirestore(uid, tid);
    }
    for (const sr of localData.recentSearches.slice(0, 20)) {
      await addRecentSearchToFirestore(uid, sr);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
  }

  return { seededCount };
}

export { DEFAULT_SETTINGS };
