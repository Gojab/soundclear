export interface ArtistRef {
  id?: string | null;
  name: string;
}

export interface AlbumRef {
  id?: string | null;
  name: string;
}

export type MediaItemType =
  | 'song'
  | 'video'
  | 'album'
  | 'artist'
  | 'playlist'
  | 'podcast'
  | 'episode'
  | 'local';

export interface MediaItem {
  id: string;
  title: string;
  artists: ArtistRef[];
  album?: AlbumRef | null;
  duration?: string | null;
  durationSeconds?: number | null;
  thumbnail?: string | null;
  type: MediaItemType;
  year?: string | null;
  views?: string | null;
  isExplicit?: boolean;
  playlistId?: string | null;
  videoId?: string | null;
  browseId?: string | null;
  description?: string | null;
  published?: string | null;
  podcastId?: string | null;
  creditsBrowseId?: string | null;
  genre?: string | null;
  localFileId?: string | null;
}

export interface HomeSection {
  title: string;
  items: MediaItem[];
}

export interface HomeResponse {
  sections: HomeSection[];
}

export interface ChartsResponse {
  country: string;
  songs: MediaItem[];
  videos: MediaItem[];
  artists: MediaItem[];
  trending: MediaItem[];
}

export interface MoodCategoryItem {
  title: string;
  params: string;
}

export interface MoodCategoryGroup {
  title: string;
  items: MoodCategoryItem[];
}

export interface MoodsResponse {
  groups: MoodCategoryGroup[];
}

export interface MoodPlaylistsResponse {
  params: string;
  playlists: MediaItem[];
}

export type SearchFilter =
  | 'all'
  | 'songs'
  | 'albums'
  | 'artists'
  | 'playlists'
  | 'videos'
  | 'podcasts'
  | 'episodes';

export interface SearchResponse {
  query: string;
  filter?: string | null;
  items: MediaItem[];
}

export interface SuggestResponse {
  query: string;
  suggestions: string[];
}

export interface ArtistDetailResponse {
  id: string;
  name: string;
  description?: string | null;
  subscribers?: string | null;
  views?: string | null;
  thumbnail?: string | null;
  shuffleId?: string | null;
  radioId?: string | null;
  songs: MediaItem[];
  albums: MediaItem[];
  singles: MediaItem[];
  compilations: MediaItem[];
  appearsOn: MediaItem[];
  videos: MediaItem[];
  related: MediaItem[];
}

export interface SongCredit {
  role: string;
  names: string[];
}

export interface AlbumDetailResponse {
  id: string;
  title: string;
  artists: ArtistRef[];
  year?: string | null;
  trackCount?: number | null;
  duration?: string | null;
  description?: string | null;
  thumbnail?: string | null;
  audioPlaylistId?: string | null;
  credits: SongCredit[];
  moreFromArtist: MediaItem[];
  tracks: MediaItem[];
}

export interface PlaylistDetailResponse {
  id: string;
  title: string;
  author?: string | null;
  description?: string | null;
  year?: string | null;
  trackCount?: number | null;
  duration?: string | null;
  thumbnail?: string | null;
  tracks: MediaItem[];
}

export interface WatchPlaylistResponse {
  videoId: string;
  playlistId?: string | null;
  lyricsBrowseId?: string | null;
  relatedBrowseId?: string | null;
  tracks: MediaItem[];
}

export interface LyricLine {
  text: string;
  startTimeMs: number;
  endTimeMs: number;
}

export interface LyricsResponse {
  browseId: string;
  hasTimestamps: boolean;
  source?: string | null;
  lines: LyricLine[];
  plainText?: string | null;
}

export interface SongCreditsResponse {
  videoId: string;
  title: string;
  credits: SongCredit[];
}

export interface SongRelatedResponse {
  videoId: string;
  tracks: MediaItem[];
  playlists: MediaItem[];
  artists: MediaItem[];
}

export interface PodcastEpisode {
  id: string;
  videoId: string;
  title: string;
  description?: string | null;
  duration?: string | null;
  durationSeconds?: number | null;
  published?: string | null;
  thumbnail?: string | null;
  podcastId?: string | null;
  podcastTitle?: string | null;
}

export interface PodcastDetailResponse {
  id: string;
  title: string;
  author?: string | null;
  authorId?: string | null;
  description?: string | null;
  thumbnail?: string | null;
  episodes: PodcastEpisode[];
}

export interface EpisodeDetailResponse {
  id: string;
  videoId: string;
  title: string;
  description?: string | null;
  duration?: string | null;
  durationSeconds?: number | null;
  published?: string | null;
  thumbnail?: string | null;
  podcastId?: string | null;
  podcastTitle?: string | null;
  author?: string | null;
  authorId?: string | null;
}

export interface ArtworkColorResponse {
  r: number;
  g: number;
  b: number;
  hex: string;
}

export interface AccountStatusResponse {
  authenticated: boolean;
  mode: 'local' | 'ytmusic' | 'cloud';
  message: string;
}

export interface AccountLibraryResponse {
  likedSongs: MediaItem[];
  playlists: MediaItem[];
  albums: MediaItem[];
  artists: MediaItem[];
  subscriptions: MediaItem[];
  history: MediaItem[];
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface LocalPlaylist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string | null;
  folderId?: string | null;
  pinned?: boolean;
  createdAt: number;
  updatedAt?: number;
  lastPlayedAt?: number | null;
  tracks: MediaItem[];
}

export interface PlaylistFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface SavedAlbumEntry {
  id: string;
  pinned?: boolean;
  savedAt: number;
  lastPlayedAt?: number | null;
  item: MediaItem;
}

export interface FollowedArtistEntry {
  id: string;
  pinned?: boolean;
  followedAt: number;
  lastPlayedAt?: number | null;
  item: MediaItem;
}

export interface SavedPodcastEntry {
  id: string;
  pinned?: boolean;
  savedAt: number;
  lastPlayedAt?: number | null;
  item: MediaItem;
}

export interface EpisodeProgressEntry {
  episodeId: string;
  podcastId?: string | null;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt: number;
}

export interface PlayHistoryEntry {
  uid?: number;
  trackId: string;
  playedAt: number;
  durationListenedSec: number;
  sourceType: 'song' | 'episode';
  genreHint?: string | null;
  track: MediaItem;
}

export interface RecentSearchEntry {
  uid?: number;
  query: string;
  searchedAt: number;
}

export type StartupVolumeMode = 'last' | 'fixed';

export interface YouTubeSoundSettings {
  maxVolumeLimit: number;
  startupVolumeMode: StartupVolumeMode;
  startupFixedVolume: number;
  defaultPlaybackRate: number;
  trackFadeSeconds: number;
  fadeOnPauseResume: boolean;
  fadeOutOnSleepTimer: boolean;
  resumeLastPosition: boolean;
  autoStartOnOpen: boolean;
}

export type NormalizationTarget = 'off' | 'quiet' | 'normal' | 'loud';

export type StreamQualityTier =
  | 'auto'
  | 'low'
  | 'normal'
  | 'high'
  | 'very_high'
  | 'lossless'
  | 'hi_res';

export type ConcreteQualityTier = Exclude<StreamQualityTier, 'auto'>;

export interface StreamQualityOption {
  tier: ConcreteQualityTier;
  label: string;
  available: boolean;
  unavailableReason?: string | null;
  codec?: string | null;
  bitrateKbps?: number | null;
  sampleRateHz?: number | null;
  bitDepth?: number | null;
  lossless: boolean;
  hiRes: boolean;
  corsSupported: boolean;
  streamUrl?: string | null;
  proxyUrl?: string | null;
  rawUrl?: string | null;
  isPreview?: boolean;
}

export interface StreamOptionsResponse {
  trackId: string;
  audiodownload_allowed: boolean;
  downloadDisabledReason?: string | null;
  replayGainDb?: number | null;
  youtubeFallbackAvailable: boolean;
  options: StreamQualityOption[];
}

export type AudioSourceMode =
  | 'webaudio'
  | 'direct'
  | 'fallback-no-fx'
  | 'youtube-iframe'
  | 'test-tone';

export interface ActiveStreamMeta {
  trackId: string;
  requestedTier: StreamQualityTier;
  actualTier: ConcreteQualityTier | 'cloud' | 'youtube' | 'local' | 'offline';
  codec: string;
  bitrateKbps?: number | null;
  sampleRateHz?: number | null;
  bitDepth?: number | null;
  lossless: boolean;
  hiRes: boolean;
  badgeLabel: string;
  sourceMode: AudioSourceMode;
  proxiedViaBackend?: boolean;
  audiodownloadAllowed: boolean;
  replayGainDb?: number | null;
}

export interface EqPreset {
  id: string;
  name: string;
  preampDb: number;
  bands: number[];
  isCustom?: boolean;
}

export interface LocalAudioProfile {
  wifiQuality: StreamQualityTier;
  cellularQuality: StreamQualityTier;
  autoAdjustQuality: boolean;
  downloadQuality: ConcreteQualityTier;
  eqEnabled: boolean;
  presetId: string;
  preampDb: number;
  bands: number[];
  customPresets: EqPreset[];
  bassBoostEnabled: boolean;
  bassBoostLevel: number; // 0-100%
  stereoWidenerEnabled: boolean;
  stereoWidenerLevel: number; // 0-100%
  normalizationTarget: NormalizationTarget;
  useReplayGain: boolean;
  limiterEnabled: boolean;
  monoAudio: boolean;
  balance: number; // -1 (kiri penuh) s.d. +1 (kanan penuh)
  outputDeviceId: string;
  directMode: boolean;
  crossfadeSeconds: number; // 0-12 detik
  gaplessPlayback: boolean;
  fadeOnPlayPause: boolean;
  skipSilence: boolean;
}

export interface LocalAudioFileRecord {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  coverDataUrl?: string | null;
  estimatedLufs: number;
  peakLinear: number;
  codec?: string;
  bitrateKbps?: number | null;
  sampleRateHz?: number | null;
  bitDepth?: number | null;
  lossless?: boolean;
  hiRes?: boolean;
  replayGainDb?: number | null;
  addedAt: number;
  blob: Blob;
}

export interface OfflineDownloadRecord {
  id: string;
  track: MediaItem;
  downloadedAt: number;
  qualityTier: ConcreteQualityTier;
  codec: string;
  bitrateKbps?: number | null;
  sampleRateHz?: number | null;
  bitDepth?: number | null;
  lossless: boolean;
  hiRes: boolean;
  replayGainDb?: number | null;
  estimatedLufs: number;
  peakLinear: number;
  fileSize: number;
  mimeType: string;
  hasAudioBlob?: boolean;
  blob: Blob;
}

export interface UserSettings {
  hideExplicit: boolean;
  autoplay: boolean;
  dataSaver: boolean;
  showRightPanel: boolean;
  homeSectionOrder: string[];
  youtubeSound: YouTubeSoundSettings;
  episodePlaybackRates: Record<string, number>;
}

export type HomeSectionId =
  | 'continue'
  | 'daily_mix'
  | 'frequent'
  | 'artist_releases'
  | 'for_you_mix'
  | 'charts'
  | 'home_feed'
  | 'moods';

export type RouteView =
  | { name: 'home' }
  | { name: 'search'; query?: string; filter?: SearchFilter }
  | { name: 'moods' }
  | { name: 'mood-detail'; params: string; title: string }
  | { name: 'artist'; id: string; fallbackQuery?: string }
  | { name: 'album'; id: string; fallbackQuery?: string }
  | { name: 'playlist'; id: string; fallbackQuery?: string }
  | { name: 'podcast'; id: string; fallbackQuery?: string }
  | { name: 'episode'; id: string; fallbackQuery?: string }
  | { name: 'library' }
  | { name: 'liked' }
  | { name: 'local-playlist'; id: string }
  | { name: 'recap' }
  | { name: 'settings'; tab?: 'general' | 'sound'; focusEq?: boolean }
  | { name: 'shortcuts' };
