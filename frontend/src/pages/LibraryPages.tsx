import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
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
import type { LocalPlaylist, MediaItem } from '../types/music';
import { localFileToMediaItem } from '../utils/localAudioImport';
import { findDuplicateTrackIndices, getTrackUniqueId } from '../utils/playerLogic';

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
      id: 'local',
      label: localFiles.length > 0 ? `File Lokal (${localFiles.length})` : 'File Lokal',
    },
  ];

  const openEntry = (item: UnifiedLibraryEntry) => {
    if (item.kind === 'playlist') navigate({ name: 'local-playlist', id: item.id });
    else if (item.kind === 'album') navigate({ name: 'album', id: item.id });
    else if (item.kind === 'artist') navigate({ name: 'artist', id: item.id });
    else navigate({ name: 'podcast', id: item.id });
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
          <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
            Koleksi Anda
          </h1>
          <p className="text-xs text-white/55 mt-0.5">
            Playlist, folder, lagu disukai, album, artis, podcast, dan file audio lokal Anda
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={importingLocal}
            onClick={() => localFileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-xs font-medium text-white transition-colors"
          >
            <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
            {importingLocal ? 'Mengimpor...' : 'Impor File Lokal'}
          </button>
          <button
            type="button"
            onClick={() => setCreatingFolder((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-xs font-medium text-white transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" strokeWidth={1.75} />
            Folder Baru
          </button>
          <button
            type="button"
            onClick={onOpenCreatePlaylist}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105 transition-all whitespace-nowrap shrink-0"
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
            className="flex-1 h-9 px-3 rounded-lg bg-white/[0.06] border border-white/[0.1] text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-[#2EE6A6]"
          />
          <button
            type="submit"
            disabled={!folderName.trim()}
            className="px-3.5 h-9 rounded-lg bg-[#2EE6A6] text-[#06130E] text-xs font-semibold disabled:opacity-40"
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
                  ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                  : 'bg-white/[0.06] text-white/70 hover:text-white'
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
            className="h-9 px-2.5 rounded-xl bg-[#16161B] border border-white/[0.1] text-xs text-white focus:outline-none focus:border-[#2EE6A6]"
          >
            <option value="newest">Terbaru</option>
            <option value="alpha">Abjad (A–Z)</option>
            <option value="last_played">Terakhir diputar</option>
          </select>

          <div className="flex items-center gap-0.5 p-1 rounded-xl bg-white/[0.05] border border-white/[0.08]">
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
                      ? 'bg-white/[0.12] text-[#2EE6A6]'
                      : 'text-white/55 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* File Lokal Dropzone + Section */}
      {filterType === 'local' ? (
        <section className="space-y-4">
          <div
            className={`glass-card rounded-2xl p-5 border transition-colors ${
              isDraggingAudio
                ? 'border-[#2EE6A6] bg-[#2EE6A6]/10'
                : 'border-white/[0.08]'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-[#2EE6A6]/15 border border-[#2EE6A6]/30 flex items-center justify-center text-[#2EE6A6] shrink-0">
                  <HardDrive className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">File Lokal</h2>
                  <p className="text-xs text-white/55 mt-0.5 max-w-xl">
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
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" strokeWidth={2} />
                    Putar Semua
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigate({ name: 'settings', tab: 'sound', focusEq: true })}
                  className="px-3.5 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-xs font-medium text-white"
                >
                  Atur EQ &amp; Suara
                </button>
              </div>
            </div>
          </div>

          {localMediaItems.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center space-y-3">
              <p className="text-sm text-white/80">Belum ada file audio lokal yang diimpor.</p>
              <button
                type="button"
                onClick={() => localFileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105"
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
                    ? 'bg-white/[0.14] text-white'
                    : 'bg-white/[0.05] text-white/60 hover:text-white'
                }`}
              >
                Semua Folder
              </button>
              {folders.map((fld) => (
                <div
                  key={fld.id}
                  className={`inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-xl text-xs ${
                    selectedFolderId === fld.id
                      ? 'bg-[#2EE6A6]/15 text-[#2EE6A6] border border-[#2EE6A6]/35'
                      : 'bg-white/[0.05] text-white/75'
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
                    className="w-5 h-5 rounded flex items-center justify-center text-white/40 hover:text-red-300"
                  >
                    <Trash2 className="w-3 h-3" strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Quick Spotlight Cards in 'Semua' */}
          {selectedFolderId === 'all' && filterType === 'all' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => navigate({ name: 'liked' })}
                className="w-full glass-card rounded-2xl p-3.5 flex items-center justify-between gap-4 text-left hover:bg-white/[0.08] transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-[#2EE6A6]/15 border border-[#2EE6A6]/30 flex items-center justify-center text-[#2EE6A6] shrink-0">
                    <Heart className="w-5 h-5 fill-[#2EE6A6]" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">Lagu Disukai</p>
                    <p className="text-xs text-white/55 tabular-nums mt-0.5">
                      {likedCount} lagu tersimpan
                    </p>
                  </div>
                </div>
                <span className="text-xs font-medium text-[#2EE6A6] shrink-0 pr-1">Buka</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterType('local')}
                className="w-full glass-card rounded-2xl p-3.5 flex items-center justify-between gap-4 text-left hover:bg-white/[0.08] transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.07] border border-white/[0.1] flex items-center justify-center text-[#2EE6A6] shrink-0">
                    <HardDrive className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">File Lokal</p>
                    <p className="text-xs text-white/55 tabular-nums mt-0.5">
                      {localFiles.length} file audio (EQ &amp; normalisasi)
                    </p>
                  </div>
                </div>
                <span className="text-xs font-medium text-[#2EE6A6] shrink-0 pr-1">Buka</span>
              </button>
            </div>
          )}

          {selectedFolderId === 'all' && filterType === 'playlists' && (
            <button
              type="button"
              onClick={() => navigate({ name: 'liked' })}
              className="w-full glass-card rounded-2xl p-3.5 flex items-center justify-between gap-4 text-left hover:bg-white/[0.08] transition-colors"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-[#2EE6A6]/15 border border-[#2EE6A6]/30 flex items-center justify-center text-[#2EE6A6] shrink-0">
                  <Heart className="w-5 h-5 fill-[#2EE6A6]" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">Lagu Disukai</p>
                  <p className="text-xs text-white/55 tabular-nums mt-0.5">
                    {likedCount} lagu tersimpan
                  </p>
                </div>
              </div>
              <span className="text-xs font-medium text-[#2EE6A6] shrink-0 pr-1">Buka</span>
            </button>
          )}

          {/* Entries Rendering */}
          {entries.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <p className="text-sm text-white/75">Belum ada item di filter koleksi ini.</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
                        entry.pinned ? `Lepas sematan ${entry.title}` : `Sematkan ${entry.title}`
                      }
                      className={`absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center backdrop-blur-md transition-opacity ${
                        entry.pinned
                          ? 'bg-[#2EE6A6] text-[#06130E] opacity-100'
                          : 'bg-black/60 text-white/75 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <Pin className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEntry(entry)}
                    className="text-left text-sm font-semibold text-white truncate hover:underline"
                  >
                    {entry.title}
                  </button>
                  <p className="text-xs text-white/55 truncate mt-0.5">{entry.subtitle}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {entries.map((entry) => (
                <div
                  key={`${entry.kind}-${entry.id}`}
                  className="track-row group flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05]"
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
                        <div className="w-full h-full rounded-lg bg-white/[0.06] flex items-center justify-center text-white/45">
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
                    <p className="text-sm font-medium text-white truncate">{entry.title}</p>
                    <p className="text-xs text-white/50 truncate">{entry.subtitle}</p>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    {entry.playlistObj && onEditPlaylist && (
                      <button
                        type="button"
                        onClick={() => onEditPlaylist(entry.playlistObj!)}
                        aria-label={`Edit ${entry.title}`}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white/45 hover:text-white hover:bg-white/[0.08]"
                      >
                        <Edit3 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => togglePinEntry(entry)}
                      aria-label={
                        entry.pinned ? `Lepas sematan ${entry.title}` : `Sematkan ${entry.title}`
                      }
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        entry.pinned
                          ? 'text-[#2EE6A6]'
                          : 'text-white/40 hover:text-white hover:bg-white/[0.08]'
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
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const navigate = useNavigationStore((s) => s.navigate);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end gap-5">
        <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl bg-[#2EE6A6]/15 border border-[#2EE6A6]/30 flex items-center justify-center text-[#2EE6A6] shrink-0">
          <Heart className="w-12 h-12 fill-[#2EE6A6]" strokeWidth={1.75} />
        </div>
        <div className="space-y-2">
          <p className="text-xs text-white/55">Koleksi</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Lagu Disukai
          </h1>
          <p className="text-xs text-white/55 tabular-nums">{likedTracks.length} lagu tersimpan</p>
          {likedTracks.length > 0 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => playTrackList(likedTracks, 0, 'Lagu Disukai')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105 transition-all"
              >
                <Play className="w-4 h-4 fill-current" strokeWidth={2} />
                Putar Semua
              </button>
            </div>
          )}
        </div>
      </header>

      {likedTracks.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center space-y-3 max-w-lg">
          <p className="text-sm font-medium text-white/85">Belum ada lagu yang disukai</p>
          <p className="text-xs text-white/50">
            Tekan ikon hati pada lagu mana saja untuk menyimpannya di sini.
          </p>
          <button
            type="button"
            onClick={() => navigate({ name: 'search' })}
            className="px-4 py-2 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] text-xs font-medium text-white transition-colors"
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
              onRemove={() => toggleLike(track)}
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
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const navigate = useNavigationStore((s) => s.navigate);

  const playlist = playlists.find((pl) => pl.id === id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  if (!playlist) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center space-y-3 max-w-lg">
        <p className="text-sm font-medium text-white">Playlist tidak ditemukan</p>
        <button
          type="button"
          onClick={() => navigate({ name: 'home' })}
          className="px-4 py-2 rounded-xl bg-white/[0.1] text-xs font-medium text-white"
        >
          Kembali ke Beranda
        </button>
      </div>
    );
  }

  const folder = playlist.folderId ? folders.find((f) => f.id === playlist.folderId) : null;
  const duplicateIndices = findDuplicateTrackIndices(playlist.tracks);
  const coverSrc = playlist.coverUrl || playlist.tracks[0]?.thumbnail;

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
            <div className="w-full h-full rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white/45">
              <ListMusic className="w-12 h-12" strokeWidth={1.75} />
            </div>
          )}
        </div>

        <div className="space-y-2 min-w-0 flex-1">
          <p className="text-xs text-white/55">
            Playlist Lokal{folder ? ` · Folder: ${folder.name}` : ''}
          </p>

          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight truncate">
              {playlist.name}
            </h1>
            {onEditPlaylist && (
              <button
                type="button"
                onClick={() => onEditPlaylist(playlist)}
                aria-label="Ubah detail playlist"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
              >
                <Edit3 className="w-4 h-4" strokeWidth={1.75} />
              </button>
            )}
          </div>

          {playlist.description && (
            <p className="text-xs text-white/65 max-w-2xl">{playlist.description}</p>
          )}

          <p className="text-xs text-white/55 tabular-nums">{playlist.tracks.length} lagu</p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {playlist.tracks.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  markPlaylistPlayed(playlist.id);
                  playTrackList(playlist.tracks, 0, playlist.name);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105 transition-all"
              >
                <Play className="w-4 h-4 fill-current" strokeWidth={2} />
                Putar Semua
              </button>
            )}

            <button
              type="button"
              onClick={() => togglePinPlaylist(playlist.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                playlist.pinned
                  ? 'bg-[#2EE6A6]/15 text-[#2EE6A6] border border-[#2EE6A6]/30'
                  : 'bg-white/[0.07] text-white/75 hover:text-white'
              }`}
            >
              <Pin className="w-3.5 h-3.5" strokeWidth={1.75} />
              {playlist.pinned ? 'Disematkan' : 'Sematkan'}
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
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-xs font-medium text-white/75 hover:text-red-300 transition-colors"
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
                  className="px-3 py-2.5 rounded-xl bg-white/[0.07] text-xs text-white/70"
                >
                  Batal
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {playlist.tracks.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center space-y-3 max-w-lg">
          <p className="text-sm font-medium text-white/85">Playlist ini masih kosong</p>
          <p className="text-xs text-white/50">
            Tambahkan lagu dari hasil pencarian atau lagu yang sedang diputar.
          </p>
          <button
            type="button"
            onClick={() => navigate({ name: 'search' })}
            className="px-4 py-2 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] text-xs font-medium text-white transition-colors"
          >
            Cari Lagu
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-[11px] text-white/40 px-3 pb-1">
            Seret baris lagu untuk mengatur ulang urutan
          </p>
          {playlist.tracks.map((track, idx) => (
            <TrackRow
              key={`${track.id}-${idx}`}
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
                playTrackList(playlist.tracks, idx, playlist.name);
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
          ))}
        </div>
      )}
    </div>
  );
}
