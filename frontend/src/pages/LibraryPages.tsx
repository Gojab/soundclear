import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Disc3,
  Download,
  Edit3,
  Folder,
  FolderPlus,
  HardDrive,
  Heart,
  LayoutGrid,
  List,
  ListMusic,
  Pin,
  Play,
  Plus,
  Rows3,
  Trash2,
  Upload,
} from 'lucide-react';
import { ArtworkImage } from '../components/ArtworkImage';
import {
  getTransitionStyleLabel,
  PlaylistMixPanel,
} from '../components/PlaylistMixPanel';
import { TrackRow } from '../components/TrackRow';
import { useContextMenuStore } from '../store/contextMenuStore';
import {
  useLibraryStore,
  type LibraryFilterType,
  type LibrarySortMode,
  type LibraryViewMode,
} from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { LocalPlaylist, MediaItem, PlaylistMixSettings } from '../types/music';
import { normalizePlaylistMixSettings } from '../utils/djMixLogic';
import { localFileToMediaItem } from '../utils/localAudioImport';
import {
  findDuplicateTrackIndices,
  getTrackUniqueId,
  hasPlayableOfflineAudio,
} from '../utils/playerLogic';

interface LibraryPagesProps {
  onAddToPlaylist: (track: MediaItem) => void;
  onOpenCreatePlaylist: () => void;
  onEditPlaylist?: (playlist: LocalPlaylist) => void;
}

export function LibraryOverviewPage({
  onAddToPlaylist,
  onOpenCreatePlaylist,
  onEditPlaylist,
}: LibraryPagesProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [isDraggingAudio, setIsDraggingAudio] = useState(false);
  const [importingLocal, setImportingLocal] = useState(false);
  const localFileInputRef = useRef<HTMLInputElement | null>(null);

  const likedCount = useLibraryStore((s) => s.likedTracks.length);
  const playlists = useLibraryStore((s) => s.playlists);
  const folders = useLibraryStore((s) => s.folders);
  const savedAlbums = useLibraryStore((s) => s.savedAlbums);
  const followedArtists = useLibraryStore((s) => s.followedArtists);
  const savedPodcasts = useLibraryStore((s) => s.savedPodcasts);
  const localFiles = useLibraryStore((s) => s.localFiles);
  const offlineDownloads = useLibraryStore((s) => s.offlineDownloads);

  const sortMode = useLibraryStore((s) => s.sortMode);
  const filterType = useLibraryStore((s) => s.filterType);
  const viewMode = useLibraryStore((s) => s.viewMode);
  const setSortMode = useLibraryStore((s) => s.setSortMode);
  const setFilterType = useLibraryStore((s) => s.setFilterType);
  const setViewMode = useLibraryStore((s) => s.setViewMode);

  const createFolder = useLibraryStore((s) => s.createFolder);
  const deleteFolder = useLibraryStore((s) => s.deleteFolder);
  const togglePinPlaylist = useLibraryStore((s) => s.togglePinPlaylist);
  const togglePinAlbum = useLibraryStore((s) => s.togglePinAlbum);
  const togglePinArtist = useLibraryStore((s) => s.togglePinArtist);
  const togglePinPodcast = useLibraryStore((s) => s.togglePinPodcast);
  const importLocalFiles = useLibraryStore((s) => s.importLocalFiles);
  const deleteLocalFile = useLibraryStore((s) => s.deleteLocalFile);
  const deleteOfflineDownload = useLibraryStore((s) => s.deleteOfflineDownload);

  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const showToast = useContextMenuStore((s) => s.showToast);
  const navigate = useNavigationStore((s) => s.navigate);

  const handleLocalImport = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setImportingLocal(true);
    try {
      const result = await importLocalFiles(files);
      if (result.imported > 0) {
        showToast(`${result.imported} file lokal berhasil diimpor`);
        setFilterType('local');
      } else {
        showToast('Format file tidak didukung (gunakan MP3, M4A, FLAC, OGG, atau WAV)');
      }
    } finally {
      setImportingLocal(false);
    }
  };

  const localMediaItems = useMemo(() => {
    const items = localFiles.map((f) => localFileToMediaItem(f));
    if (sortMode === 'alpha') {
      return [...items].sort((a, b) => a.title.localeCompare(b.title, 'id'));
    }
    return items;
  }, [localFiles, sortMode]);

  const handleCreateFolder = (e: FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    createFolder(folderName.trim());
    setFolderName('');
    setCreatingFolder(false);
  };

  type UnifiedLibraryEntry = {
    kind: 'playlist' | 'album' | 'artist' | 'podcast';
    id: string;
    title: string;
    subtitle: string;
    thumbnail?: string | null;
    pinned: boolean;
    createdAt: number;
    lastPlayedAt: number;
    folderId?: string | null;
    playlistObj?: LocalPlaylist;
  };

  const entries = useMemo(() => {
    const out: UnifiedLibraryEntry[] = [];

    if (filterType === 'all' || filterType === 'playlists') {
      for (const pl of playlists) {
        if (selectedFolderId !== 'all' && pl.folderId !== selectedFolderId) continue;
        out.push({
          kind: 'playlist',
          id: pl.id,
          title: pl.name,
          subtitle: `Playlist · ${pl.tracks.length} lagu`,
          thumbnail: pl.coverUrl || pl.tracks[0]?.thumbnail || null,
          pinned: Boolean(pl.pinned),
          createdAt: pl.createdAt,
          lastPlayedAt: pl.lastPlayedAt || pl.updatedAt || pl.createdAt,
          folderId: pl.folderId,
          playlistObj: pl,
        });
      }
    }

    if (selectedFolderId === 'all' && (filterType === 'all' || filterType === 'albums')) {
      for (const a of savedAlbums) {
        out.push({
          kind: 'album',
          id: a.id,
          title: a.item.title,
          subtitle: `Album · ${a.item.artists.map((x) => x.name).join(', ') || a.item.year || ''}`,
          thumbnail: a.item.thumbnail,
          pinned: Boolean(a.pinned),
          createdAt: a.savedAt,
          lastPlayedAt: a.lastPlayedAt || a.savedAt,
        });
      }
    }

    if (selectedFolderId === 'all' && (filterType === 'all' || filterType === 'artists')) {
      for (const ar of followedArtists) {
        out.push({
          kind: 'artist',
          id: ar.id,
          title: ar.item.title,
          subtitle: 'Artis diikuti',
          thumbnail: ar.item.thumbnail,
          pinned: Boolean(ar.pinned),
          createdAt: ar.followedAt,
          lastPlayedAt: ar.lastPlayedAt || ar.followedAt,
        });
      }
    }

    if (selectedFolderId === 'all' && (filterType === 'all' || filterType === 'podcasts')) {
      for (const p of savedPodcasts) {
        out.push({
          kind: 'podcast',
          id: p.id,
          title: p.item.title,
          subtitle: 'Podcast diikuti',
          thumbnail: p.item.thumbnail,
          pinned: Boolean(p.pinned),
          createdAt: p.savedAt,
          lastPlayedAt: p.lastPlayedAt || p.savedAt,
        });
      }
    }

    return out.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sortMode === 'alpha') return a.title.localeCompare(b.title, 'id');
      if (sortMode === 'last_played') return b.lastPlayedAt - a.lastPlayedAt;
      return b.createdAt - a.createdAt;
    });
  }, [
    playlists,
    savedAlbums,
    followedArtists,
    savedPodcasts,
    filterType,
    sortMode,
    selectedFolderId,
  ]);

  const filterChips: Array<{ id: LibraryFilterType; label: string }> = [
    { id: 'all', label: 'Semua' },
    { id: 'playlists', label: 'Playlist' },
    { id: 'albums', label: 'Album' },
    { id: 'artists', label: 'Artis' },
    { id: 'podcasts', label: 'Podcast' },
    {
      id: 'offline',
      label: offlineDownloads.length > 0 ? `Offline (${offlineDownloads.length})` : 'Offline',
    },
    {
      id: 'local',
      label: localFiles.length > 0 ? `File Lokal (${localFiles.length})` : 'File Lokal',
    },
  ];

  const openEntry = (item: UnifiedLibraryEntry) => {
    if (item.kind === 'playlist') navigate({ name: 'local-playlist', id: item.id });
    else if (item.kind === 'album') navigate({ name: 'album', id: item.id, fallbackQuery: item.title });
    else if (item.kind === 'artist') navigate({ name: 'artist', id: item.id, fallbackQuery: item.title });
    else navigate({ name: 'podcast', id: item.id, fallbackQuery: item.title });
  };

  const togglePinEntry = (item: UnifiedLibraryEntry) => {
    if (item.kind === 'playlist') togglePinPlaylist(item.id);
    else if (item.kind === 'album') togglePinAlbum(item.id);
    else if (item.kind === 'artist') togglePinArtist(item.id);
    else togglePinPodcast(item.id);
  };

  return (
    <div
      className="space-y-6"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setIsDraggingAudio(true);
        }
      }}
      onDragLeave={() => setIsDraggingAudio(false)}
      onDrop={(e) => {
        if (e.dataTransfer.files?.length) {
          e.preventDefault();
          setIsDraggingAudio(false);
          void handleLocalImport(e.dataTransfer.files);
        }
      }}
    >
      <input
        ref={localFileInputRef}
        type="file"
        multiple
        accept=".mp3,.m4a,.flac,.ogg,.oga,.wav,.aac,audio/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            void handleLocalImport(e.target.files);
          }
          e.target.value = '';
        }}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-[#E8FFF3] tracking-tight">
            Koleksi Anda
          </h1>
          <p className="text-xs text-[#B3F7D1]/60 mt-0.5">
            Playlist, folder, lagu disukai, album, artis, podcast, dan file audio lokal Anda
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={importingLocal}
            onClick={() => localFileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.055] backdrop-blur-xl hover:bg-white/[0.11] border border-white/[0.11] text-xs font-medium text-[#E8FFF3] transition-colors"
          >
            <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
            {importingLocal ? 'Mengimpor...' : 'Impor File Lokal'}
          </button>
          <button
            type="button"
            onClick={() => setCreatingFolder((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.055] backdrop-blur-xl hover:bg-white/[0.11] border border-white/[0.11] text-xs font-medium text-[#E8FFF3] transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" strokeWidth={1.75} />
            Folder Baru
          </button>
          <button
            type="button"
            onClick={() => navigate({ name: 'create-mix' })}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.055] backdrop-blur-xl hover:bg-white/[0.11] border border-white/[0.11] text-xs font-medium text-[#E8FFF3] transition-colors whitespace-nowrap shrink-0"
          >
            <Disc3 className="w-3.5 h-3.5 text-[#19EE8A]" strokeWidth={1.9} />
            Buat Mix
          </button>
          <button
            type="button"
            onClick={onOpenCreatePlaylist}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105 transition-all whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
            Buat Playlist
          </button>
        </div>
      </div>

      {creatingFolder && (
        <form
          onSubmit={handleCreateFolder}
          className="glass-card rounded-xl p-3 flex items-center gap-2 max-w-md"
        >
          <input
            type="text"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="Nama folder playlist..."
            autoFocus
            className="flex-1 h-9 px-3 rounded-lg bg-white/[0.06] border border-white/[0.12] text-sm text-[#E8FFF3] placeholder:text-[#B3F7D1]/40 focus:outline-none focus:border-[#19EE8A]"
          />
          <button
            type="submit"
            disabled={!folderName.trim()}
            className="px-3.5 h-9 rounded-lg bg-sc-gradient text-[#0F1F17] text-xs font-semibold disabled:opacity-40"
          >
            Buat
          </button>
        </form>
      )}

      {/* Controls toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {filterChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                setFilterType(chip.id);
                setSelectedFolderId('all');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                filterType === chip.id && selectedFolderId === 'all'
                  ? 'bg-sc-gradient text-[#0F1F17] font-semibold'
                  : 'bg-white/[0.055] backdrop-blur-xl border border-white/[0.1] text-[#B3F7D1]/75 hover:text-[#E8FFF3] hover:bg-white/[0.11]'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Urutkan koleksi"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as LibrarySortMode)}
            className="h-9 px-2.5 rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.12] text-xs text-[#E8FFF3] focus:outline-none focus:border-[#19EE8A]"
          >
            <option value="newest" className="bg-[#0B0F0D] text-[#E8FFF3]">Terbaru</option>
            <option value="alpha" className="bg-[#0B0F0D] text-[#E8FFF3]">Abjad (A–Z)</option>
            <option value="last_played" className="bg-[#0B0F0D] text-[#E8FFF3]">Terakhir diputar</option>
          </select>

          <div className="flex items-center gap-0.5 p-1 rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11]">
            {(
              [
                { id: 'list', icon: List, label: 'Tampilan daftar' },
                { id: 'grid', icon: LayoutGrid, label: 'Tampilan grid' },
                { id: 'compact', icon: Rows3, label: 'Tampilan ringkas' },
              ] as Array<{ id: LibraryViewMode; icon: typeof List; label: string }>
            ).map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setViewMode(mode.id)}
                  aria-label={mode.label}
                  aria-pressed={viewMode === mode.id}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    viewMode === mode.id
                      ? 'bg-white/[0.14] text-[#19EE8A]'
                      : 'text-[#B3F7D1]/60 hover:text-[#E8FFF3]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Offline Downloads Section */}
      {filterType === 'offline' ? (
        <section className="space-y-4">
          <div className="glass-card rounded-2xl p-5 border border-[#B3F7D1]/[0.1]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-[#19EE8A]/15 border border-[#19EE8A]/30 flex items-center justify-center text-[#19EE8A] shrink-0">
                  <Download className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-[#E8FFF3]">Unduhan Offline</h2>
                  <p className="text-xs text-[#B3F7D1]/60 mt-0.5 max-w-xl">
                    Semua lagu yang Anda simpan untuk akses offline (file audio lokal tersimpan utuh dan lagu katalog terindeks di penyimpanan browser).
                  </p>
                </div>
              </div>

              {offlineDownloads.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    playTrackList(
                      offlineDownloads.map((d) => d.track),
                      0,
                      'Unduhan Offline',
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105 shrink-0"
                >
                  <Play className="w-3.5 h-3.5 fill-current" strokeWidth={2} />
                  Putar Semua ({offlineDownloads.length})
                </button>
              )}
            </div>
          </div>

          {offlineDownloads.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center space-y-3">
              <p className="text-sm text-[#E8FFF3]/85">Belum ada lagu yang disimpan offline.</p>
              <p className="text-xs text-[#B3F7D1]/55">
                Tekan tombol Unduh di baris lagu atau di menu Pengaturan Audio untuk menyimpan lagu apa saja.
              </p>
              <button
                type="button"
                onClick={() => navigate({ name: 'settings', tab: 'sound', focusEq: false })}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-[#E8FFF3]"
              >
                Buka Pengaturan Audio
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {offlineDownloads.map((rec, idx) => (
                <TrackRow
                  key={rec.id}
                  track={rec.track}
                  index={idx}
                  compact={viewMode === 'compact'}
                  onPlay={() =>
                    playTrackList(
                      offlineDownloads.map((d) => d.track),
                      idx,
                      'Unduhan Offline',
                    )
                  }
                  onAddToPlaylist={onAddToPlaylist}
                  onRemove={() => {
                    void deleteOfflineDownload(rec.id);
                    showToast(
                      `${rec.track.title} (${hasPlayableOfflineAudio(rec) ? 'Audio Lokal' : 'Cache Katalog'}) dihapus dari Offline`,
                    );
                  }}
                />
              ))}
            </div>
          )}
        </section>
      ) : filterType === 'local' ? (
        <section className="space-y-4">
          <div
            className={`glass-card rounded-2xl p-5 border transition-colors ${
              isDraggingAudio
                ? 'border-[#19EE8A] bg-[#19EE8A]/10'
                : 'border-[#B3F7D1]/[0.1]'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-[#19EE8A]/15 border border-[#19EE8A]/30 flex items-center justify-center text-[#19EE8A] shrink-0">
                  <HardDrive className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-[#E8FFF3]">File Lokal</h2>
                  <p className="text-xs text-[#B3F7D1]/60 mt-0.5 max-w-xl">
                    Seret &amp; lepas file audio (MP3, M4A, FLAC, OGG, WAV) untuk diputar dengan EQ
                    10-band, normalisasi, dan crossfade. Hanya untuk file milik Anda sendiri.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {localMediaItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => playTrackList(localMediaItems, 0, 'File Lokal')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" strokeWidth={2} />
                    Putar Semua
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigate({ name: 'settings', tab: 'sound', focusEq: true })}
                  className="px-3.5 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-[#E8FFF3]"
                >
                  Atur EQ &amp; Suara
                </button>
              </div>
            </div>
          </div>

          {localMediaItems.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center space-y-3">
              <p className="text-sm text-[#E8FFF3]/85">Belum ada file audio lokal yang diimpor.</p>
              <button
                type="button"
                onClick={() => localFileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105"
              >
                <Upload className="w-4 h-4" strokeWidth={2} />
                Pilih File Audio
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {localMediaItems.map((track, idx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={idx}
                  compact={viewMode === 'compact'}
                  onPlay={() => playTrackList(localMediaItems, idx, 'File Lokal')}
                  onAddToPlaylist={onAddToPlaylist}
                  onRemove={() => {
                    void deleteLocalFile(track.id);
                    showToast(`${track.title} dihapus dari File Lokal`);
                  }}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Folders strip */}
          {folders.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedFolderId('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium ${
                  selectedFolderId === 'all'
                    ? 'bg-white/[0.13] border border-white/[0.14] text-[#E8FFF3]'
                    : 'bg-white/[0.055] border border-white/[0.09] text-[#B3F7D1]/65 hover:text-[#E8FFF3] hover:bg-white/[0.1]'
                }`}
              >
                Semua Folder
              </button>
              {folders.map((fld) => (
                <div
                  key={fld.id}
                  className={`inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-xl text-xs ${
                    selectedFolderId === fld.id
                      ? 'bg-[#19EE8A]/15 text-[#19EE8A] border border-[#19EE8A]/35'
                      : 'bg-white/[0.055] border border-white/[0.09] text-[#B3F7D1]/80'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedFolderId(fld.id)}
                    className="inline-flex items-center gap-1.5 py-0.5"
                  >
                    <Folder className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>{fld.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedFolderId === fld.id) setSelectedFolderId('all');
                      deleteFolder(fld.id);
                    }}
                    aria-label={`Hapus folder ${fld.name}`}
                    className="w-5 h-5 rounded flex items-center justify-center text-[#B3F7D1]/45 hover:text-red-300"
                  >
                    <Trash2 className="w-3 h-3" strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Quick Spotlight Cards in 'Semua' */}
          {selectedFolderId === 'all' && filterType === 'all' && (
            <div className="grid grid-cols-1 @[660px]:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => navigate({ name: 'liked' })}
                className="w-full glass-card rounded-2xl p-3.5 flex items-center justify-between gap-4 text-left hover:bg-white/[0.1] transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-[#19EE8A]/15 border border-[#19EE8A]/30 flex items-center justify-center text-[#19EE8A] shrink-0">
                    <Heart className="w-5 h-5 fill-[#19EE8A]" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#E8FFF3]">Lagu Disukai</p>
                    <p className="text-xs text-[#B3F7D1]/60 tabular-nums mt-0.5">
                      {likedCount} lagu tersimpan
                    </p>
                  </div>
                </div>
                <span className="text-xs font-medium text-[#19EE8A] shrink-0 pr-1">Buka</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterType('offline')}
                className="w-full glass-card rounded-2xl p-3.5 flex items-center justify-between gap-4 text-left hover:bg-white/[0.1] transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.06] border border-white/[0.12] flex items-center justify-center text-[#19EE8A] shrink-0">
                    <Download className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#E8FFF3]">Unduhan Offline</p>
                    <p className="text-xs text-[#B3F7D1]/60 tabular-nums mt-0.5">
                      {offlineDownloads.length} lagu tersimpan
                    </p>
                  </div>
                </div>
                <span className="text-xs font-medium text-[#19EE8A] shrink-0 pr-1">Buka</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterType('local')}
                className="w-full glass-card rounded-2xl p-3.5 flex items-center justify-between gap-4 text-left hover:bg-white/[0.1] transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.06] border border-white/[0.12] flex items-center justify-center text-[#19EE8A] shrink-0">
                    <HardDrive className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#E8FFF3]">File Lokal</p>
                    <p className="text-xs text-[#B3F7D1]/60 tabular-nums mt-0.5">
                      {localFiles.length} file audio (EQ &amp; normalisasi)
                    </p>
                  </div>
                </div>
                <span className="text-xs font-medium text-[#19EE8A] shrink-0 pr-1">Buka</span>
              </button>
            </div>
          )}

          {selectedFolderId === 'all' && filterType === 'playlists' && (
            <button
              type="button"
              onClick={() => navigate({ name: 'liked' })}
              className="w-full glass-card rounded-2xl p-3.5 flex items-center justify-between gap-4 text-left hover:bg-white/[0.1] transition-colors"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-[#19EE8A]/15 border border-[#19EE8A]/30 flex items-center justify-center text-[#19EE8A] shrink-0">
                  <Heart className="w-5 h-5 fill-[#19EE8A]" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#E8FFF3]">Lagu Disukai</p>
                  <p className="text-xs text-[#B3F7D1]/60 tabular-nums mt-0.5">
                    {likedCount} lagu tersimpan
                  </p>
                </div>
              </div>
              <span className="text-xs font-medium text-[#19EE8A] shrink-0 pr-1">Buka</span>
            </button>
          )}

          {/* Entries Rendering */}
          {entries.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <p className="text-sm text-[#B3F7D1]/80">Belum ada item di filter koleksi ini.</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 @[540px]:grid-cols-3 @[760px]:grid-cols-4 @[960px]:grid-cols-5 gap-4">
              {entries.map((entry) => (
                <div
                  key={`${entry.kind}-${entry.id}`}
                  className="glass-card group rounded-2xl p-3 flex flex-col"
                >
                  <div className="relative aspect-square w-full mb-3 overflow-hidden rounded-xl">
                    <button
                      type="button"
                      onClick={() => openEntry(entry)}
                      className="w-full h-full block"
                    >
                      <ArtworkImage
                        src={entry.thumbnail}
                        alt={entry.title}
                        type={
                          entry.kind === 'artist'
                            ? 'artist'
                            : entry.kind === 'podcast'
                              ? 'podcast'
                              : 'playlist'
                        }
                        className="w-full h-full"
                        roundedClass={entry.kind === 'artist' ? 'rounded-full' : 'rounded-xl'}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePinEntry(entry)}
                      aria-label={
                        entry.pinned ? `Lepas pin ${entry.title}` : `Pasang pin ${entry.title}`
                      }
                      className={`absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center backdrop-blur-md transition-opacity ${
                        entry.pinned
                          ? 'bg-sc-gradient text-[#0F1F17] opacity-100'
                          : 'bg-black/65 text-[#E8FFF3]/80 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <Pin className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEntry(entry)}
                    className="text-left text-sm font-semibold text-[#E8FFF3] truncate hover:underline"
                  >
                    {entry.title}
                  </button>
                  <p className="text-xs text-[#B3F7D1]/60 truncate mt-0.5">{entry.subtitle}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {entries.map((entry) => (
                <div
                  key={`${entry.kind}-${entry.id}`}
                  className="track-row group flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.045] backdrop-blur-xl border border-white/[0.1]"
                >
                  {viewMode === 'list' && (
                    <button
                      type="button"
                      onClick={() => openEntry(entry)}
                      className="w-11 h-11 rounded-lg overflow-hidden shrink-0"
                    >
                      {entry.thumbnail ? (
                        <ArtworkImage
                          src={entry.thumbnail}
                          alt={entry.title}
                          type={entry.kind === 'artist' ? 'artist' : 'playlist'}
                          className="w-full h-full"
                          roundedClass={entry.kind === 'artist' ? 'rounded-full' : 'rounded-lg'}
                        />
                      ) : (
                        <div className="w-full h-full rounded-lg bg-white/[0.08] flex items-center justify-center text-[#B3F7D1]/50">
                          <ListMusic className="w-5 h-5" strokeWidth={1.75} />
                        </div>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openEntry(entry)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="text-sm font-medium text-[#E8FFF3] truncate">{entry.title}</p>
                    <p className="text-xs text-[#B3F7D1]/55 truncate">{entry.subtitle}</p>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    {entry.playlistObj && onEditPlaylist && (
                      <button
                        type="button"
                        onClick={() => onEditPlaylist(entry.playlistObj!)}
                        aria-label={`Edit ${entry.title}`}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#B3F7D1]/50 hover:text-[#E8FFF3] hover:bg-white/[0.1]"
                      >
                        <Edit3 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => togglePinEntry(entry)}
                      aria-label={
                        entry.pinned ? `Lepas pin ${entry.title}` : `Pasang pin ${entry.title}`
                      }
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        entry.pinned
                          ? 'text-[#19EE8A]'
                          : 'text-[#B3F7D1]/45 hover:text-[#E8FFF3] hover:bg-white/[0.1]'
                      }`}
                    >
                      <Pin className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function LikedTracksPage({
  onAddToPlaylist,
}: {
  onAddToPlaylist: (track: MediaItem) => void;
}) {
  const likedTracks = useLibraryStore((s) => s.likedTracks);
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const downloadTracksOffline = useLibraryStore((s) => s.downloadTracksOffline);
  const downloadQuality = useSettingsStore((s) => s.localProfile.downloadQuality);
  const showToast = useContextMenuStore((s) => s.showToast);
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const navigate = useNavigationStore((s) => s.navigate);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end gap-5">
        <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl bg-[#19EE8A]/15 border border-[#19EE8A]/30 flex items-center justify-center text-[#19EE8A] shrink-0">
          <Heart className="w-12 h-12 fill-[#19EE8A]" strokeWidth={1.75} />
        </div>
        <div className="space-y-2">
          <p className="text-xs text-[#B3F7D1]/60">Koleksi</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#E8FFF3] tracking-tight">
            Lagu Disukai
          </h1>
          <p className="text-xs text-[#B3F7D1]/60 tabular-nums">{likedTracks.length} lagu tersimpan</p>
          {likedTracks.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => playTrackList(likedTracks, 0, 'Lagu Disukai')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105 transition-all"
              >
                <Play className="w-4 h-4 fill-current" strokeWidth={2} />
                Putar Semua
              </button>
              <button
                type="button"
                onClick={() => {
                  void downloadTracksOffline(likedTracks, downloadQuality)
                    .then(({ savedCount, failedCount }) => {
                      if (savedCount === 0) {
                        showToast('Gagal menyimpan lagu disukai untuk offline');
                      } else if (failedCount > 0) {
                        showToast(
                          `${savedCount} lagu disukai tersimpan offline (${failedCount} gagal)`,
                        );
                      } else {
                        showToast(`${savedCount} lagu disukai tersimpan offline`);
                      }
                    })
                    .catch(() => {
                      showToast('Gagal menyimpan lagu disukai untuk offline');
                    });
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.055] backdrop-blur-xl hover:bg-white/[0.11] border border-white/[0.11] text-xs font-medium text-[#E8FFF3] transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-[#19EE8A]" strokeWidth={1.9} />
                Unduh Offline
              </button>
            </div>
          )}
        </div>
      </header>

      {likedTracks.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center space-y-3 max-w-lg">
          <p className="text-sm font-medium text-[#E8FFF3]/85">Belum ada lagu yang disukai</p>
          <p className="text-xs text-[#B3F7D1]/55">
            Tekan ikon hati pada lagu mana saja untuk menyimpannya di sini.
          </p>
          <button
            type="button"
            onClick={() => navigate({ name: 'search' })}
            className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.13] border border-white/[0.1] text-xs font-medium text-[#E8FFF3] transition-colors"
          >
            Cari Lagu
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {likedTracks.map((track, idx) => (
            <TrackRow
              key={`${track.id}-${idx}`}
              track={track}
              index={idx}
              onPlay={() => playTrackList(likedTracks, idx, 'Lagu Disukai')}
              onAddToPlaylist={onAddToPlaylist}
              onRemove={() => {
                toggleLike(track);
                showToast(`"${track.title}" dihapus dari Lagu Disukai`);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function LocalPlaylistPage({
  id,
  onAddToPlaylist,
  onEditPlaylist,
}: {
  id: string;
  onAddToPlaylist: (track: MediaItem) => void;
  onEditPlaylist?: (playlist: LocalPlaylist) => void;
}) {
  const playlists = useLibraryStore((s) => s.playlists);
  const folders = useLibraryStore((s) => s.folders);
  const deletePlaylist = useLibraryStore((s) => s.deletePlaylist);
  const togglePinPlaylist = useLibraryStore((s) => s.togglePinPlaylist);
  const removeTrackFromPlaylist = useLibraryStore((s) => s.removeTrackFromPlaylist);
  const reorderPlaylistTracks = useLibraryStore((s) => s.reorderPlaylistTracks);
  const removeDuplicatesFromPlaylist = useLibraryStore((s) => s.removeDuplicatesFromPlaylist);
  const markPlaylistPlayed = useLibraryStore((s) => s.markPlaylistPlayed);
  const updatePlaylistMixConfig = useLibraryStore((s) => s.updatePlaylistMixConfig);
  const downloadTracksOffline = useLibraryStore((s) => s.downloadTracksOffline);
  const localProfile = useSettingsStore((s) => s.localProfile);
  const downloadQuality = localProfile.downloadQuality;
  const showToast = useContextMenuStore((s) => s.showToast);
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const sourceLabel = usePlayerStore((s) => s.sourceLabel);
  const setActiveMixConfig = usePlayerStore((s) => s.setActiveMixConfig);
  const navigate = useNavigationStore((s) => s.navigate);

  const playlist = playlists.find((pl) => pl.id === id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  if (!playlist) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center space-y-3 max-w-lg">
        <p className="text-sm font-medium text-[#E8FFF3]">Playlist tidak ditemukan</p>
        <button
          type="button"
          onClick={() => navigate({ name: 'home' })}
          className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.13] border border-white/[0.1] text-xs font-medium text-[#E8FFF3]"
        >
          Kembali ke Beranda
        </button>
      </div>
    );
  }

  const folder = playlist.folderId ? folders.find((f) => f.id === playlist.folderId) : null;
  const duplicateIndices = findDuplicateTrackIndices(playlist.tracks);
  const coverSrc = playlist.coverUrl || playlist.tracks[0]?.thumbnail;
  const playlistMix = normalizePlaylistMixSettings(playlist.mixConfig);

  const handleUpdateMix = (patch: Partial<PlaylistMixSettings>) => {
    const next = updatePlaylistMixConfig(playlist.id, patch);
    if (next && sourceLabel === playlist.name) {
      setActiveMixConfig(next.enabled ? next : null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end gap-5">
        <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden shrink-0">
          {coverSrc ? (
            <ArtworkImage
              src={coverSrc}
              alt={playlist.name}
              className="w-full h-full"
              roundedClass="rounded-2xl"
            />
          ) : (
            <div className="w-full h-full rounded-2xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] flex items-center justify-center text-[#B3F7D1]/50">
              <ListMusic className="w-12 h-12" strokeWidth={1.75} />
            </div>
          )}
        </div>

        <div className="space-y-2 min-w-0 flex-1">
          <p className="text-xs text-[#B3F7D1]/60">
            Playlist Lokal{folder ? ` · Folder: ${folder.name}` : ''}
          </p>

          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-[#E8FFF3] tracking-tight truncate">
              {playlist.name}
            </h1>
            {onEditPlaylist && (
              <button
                type="button"
                onClick={() => onEditPlaylist(playlist)}
                aria-label="Ubah detail playlist"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#B3F7D1]/55 hover:text-[#E8FFF3] hover:bg-white/[0.1] transition-colors shrink-0"
              >
                <Edit3 className="w-4 h-4" strokeWidth={1.75} />
              </button>
            )}
          </div>

          {playlist.description && (
            <p className="text-xs text-[#B3F7D1]/70 max-w-2xl">{playlist.description}</p>
          )}

          <p className="text-xs text-[#B3F7D1]/60 tabular-nums">{playlist.tracks.length} lagu</p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {playlist.tracks.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    markPlaylistPlayed(playlist.id);
                    playTrackList(
                      playlist.tracks,
                      0,
                      playlist.name,
                      playlistMix.enabled ? { mixConfig: playlistMix } : undefined,
                    );
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105 transition-all"
                >
                  <Play className="w-4 h-4 fill-current" strokeWidth={2} />
                  Putar Semua
                </button>
                <button
                  type="button"
                  aria-pressed={playlistMix.enabled}
                  onClick={() => handleUpdateMix({ enabled: !playlistMix.enabled })}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                    playlistMix.enabled
                      ? 'bg-[#19EE8A]/15 text-[#19EE8A] border border-[#19EE8A]/40'
                      : 'bg-white/[0.055] backdrop-blur-xl hover:bg-white/[0.11] border border-white/[0.11] text-[#E8FFF3]'
                  }`}
                >
                  <Disc3 className="w-3.5 h-3.5" strokeWidth={1.9} />
                  Mix
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void downloadTracksOffline(playlist.tracks, downloadQuality)
                      .then(({ savedCount, failedCount }) => {
                        if (savedCount === 0) {
                          showToast('Gagal menyimpan lagu di playlist untuk offline');
                        } else if (failedCount > 0) {
                          showToast(
                            `${savedCount} lagu di playlist tersimpan offline (${failedCount} gagal)`,
                          );
                        } else {
                          showToast(`${savedCount} lagu di playlist tersimpan offline`);
                        }
                      })
                      .catch(() => {
                        showToast('Gagal menyimpan lagu di playlist untuk offline');
                      });
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/[0.055] backdrop-blur-xl hover:bg-white/[0.11] border border-white/[0.11] text-xs font-medium text-[#E8FFF3] transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-[#19EE8A]" strokeWidth={1.9} />
                  Unduh Offline
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => togglePinPlaylist(playlist.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                playlist.pinned
                  ? 'bg-[#19EE8A]/15 text-[#19EE8A] border border-[#19EE8A]/35'
                  : 'bg-white/[0.055] backdrop-blur-xl text-[#B3F7D1]/80 hover:text-[#E8FFF3] hover:bg-white/[0.11] border border-white/[0.11]'
              }`}
            >
              <Pin className="w-3.5 h-3.5" strokeWidth={1.75} />
              {playlist.pinned ? 'Dipasang pin' : 'Pasang pin'}
            </button>

            {duplicateIndices.size > 0 && (
              <button
                type="button"
                onClick={() => removeDuplicatesFromPlaylist(playlist.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-400/25 text-xs font-medium text-amber-200 hover:bg-amber-500/25"
              >
                <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.75} />
                Hapus {duplicateIndices.size} Duplikat
              </button>
            )}

            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/[0.055] backdrop-blur-xl hover:bg-white/[0.11] border border-white/[0.11] text-xs font-medium text-[#B3F7D1]/80 hover:text-red-300 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                Hapus Playlist
              </button>
            ) : (
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    deletePlaylist(playlist.id);
                    navigate({ name: 'library' });
                  }}
                  className="px-3.5 py-2.5 rounded-xl bg-red-500/20 border border-red-400/30 text-xs font-semibold text-red-200 hover:bg-red-500/30"
                >
                  Konfirmasi Hapus
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-xs text-[#B3F7D1]/75"
                >
                  Batal
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {playlistMix.enabled && (
        <PlaylistMixPanel
          settings={playlistMix}
          directModeActive={localProfile.directMode}
          canStartMix={playlist.tracks.length > 0}
          onChange={handleUpdateMix}
          onStartMixPlayback={() => {
            markPlaylistPlayed(playlist.id);
            playTrackList(playlist.tracks, 0, playlist.name, { mixConfig: playlistMix });
          }}
        />
      )}

      {playlist.tracks.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center space-y-3 max-w-lg">
          <p className="text-sm font-medium text-[#E8FFF3]/85">Playlist ini masih kosong</p>
          <p className="text-xs text-[#B3F7D1]/55">
            Tambahkan lagu dari hasil pencarian atau lagu yang sedang diputar.
          </p>
          <button
            type="button"
            onClick={() => navigate({ name: 'search' })}
            className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.13] border border-white/[0.1] text-xs font-medium text-[#E8FFF3] transition-colors"
          >
            Cari Lagu
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-[11px] text-[#B3F7D1]/45 px-3 pb-1">
            Seret baris lagu untuk mengatur ulang urutan
          </p>
          {playlist.tracks.map((track, idx) => (
            <div key={`${track.id}-${idx}`} className="space-y-0.5">
              <TrackRow
                track={track}
                index={idx}
                draggable
                onDragStartIndex={(fromIdx) => setDragIndex(fromIdx)}
                onDropIndex={(toIdx) => {
                  if (dragIndex !== null && dragIndex !== toIdx) {
                    reorderPlaylistTracks(playlist.id, dragIndex, toIdx);
                  }
                  setDragIndex(null);
                }}
                onPlay={() => {
                  markPlaylistPlayed(playlist.id);
                  playTrackList(
                    playlist.tracks,
                    idx,
                    playlist.name,
                    playlistMix.enabled ? { mixConfig: playlistMix } : undefined,
                  );
                }}
                onAddToPlaylist={onAddToPlaylist}
                onRemove={() =>
                  removeTrackFromPlaylist(
                    playlist.id,
                    getTrackUniqueId(track) || track.id,
                    idx,
                  )
                }
              />
              {playlistMix.enabled && idx < playlist.tracks.length - 1 && (
                <div className="flex items-center gap-2 pl-12 pr-3 py-0.5 text-[10px] text-[#19EE8A]/70 select-none">
                  <span className="h-px w-4 bg-[#19EE8A]/35" aria-hidden="true" />
                  <span className="truncate">
                    Transisi {playlistMix.durationSeconds} dtk ·{' '}
                    {getTransitionStyleLabel(playlistMix.transitionStyle)}
                    {playlistMix.beatMatch ? ' · Beat Match' : ''}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
