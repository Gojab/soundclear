import { useState, type FormEvent } from 'react';
import { Check, Edit3, Heart, ListMusic, Play, Plus, Trash2 } from 'lucide-react';
import { ArtworkImage } from '../components/ArtworkImage';
import { TrackRow } from '../components/TrackRow';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import type { MediaItem } from '../types/music';
import { getPlayableVideoId } from '../utils/playerLogic';

interface LibraryPagesProps {
  onAddToPlaylist: (track: MediaItem) => void;
  onOpenCreatePlaylist: () => void;
}

export function LibraryOverviewPage({ onOpenCreatePlaylist }: LibraryPagesProps) {
  const likedCount = useLibraryStore((s) => s.likedTracks.length);
  const playlists = useLibraryStore((s) => s.playlists);
  const navigate = useNavigationStore((s) => s.navigate);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
            Koleksi Lokal
          </h1>
          <p className="text-xs text-white/55 mt-0.5">
            Disimpan langsung di perangkat Anda
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenCreatePlaylist}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105 transition-all whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2} />
          Buat Playlist
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => navigate({ name: 'liked' })}
          className="glass-card rounded-2xl p-4 flex items-center gap-4 text-left"
        >
          <div className="w-14 h-14 rounded-xl bg-[#2EE6A6]/15 border border-[#2EE6A6]/30 flex items-center justify-center text-[#2EE6A6] shrink-0">
            <Heart className="w-6 h-6 fill-[#2EE6A6]" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Lagu Disukai</p>
            <p className="text-xs text-white/55 tabular-nums mt-0.5">{likedCount} lagu</p>
          </div>
        </button>

        {playlists.map((pl) => (
          <button
            key={pl.id}
            type="button"
            onClick={() => navigate({ name: 'local-playlist', id: pl.id })}
            className="glass-card rounded-2xl p-4 flex items-center gap-4 text-left"
          >
            <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0">
              {pl.tracks[0]?.thumbnail ? (
                <ArtworkImage
                  src={pl.tracks[0].thumbnail}
                  alt={pl.name}
                  className="w-full h-full"
                  roundedClass="rounded-xl"
                />
              ) : (
                <div className="w-full h-full rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white/45">
                  <ListMusic className="w-6 h-6" strokeWidth={1.75} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{pl.name}</p>
              <p className="text-xs text-white/55 tabular-nums mt-0.5">{pl.tracks.length} lagu</p>
            </div>
          </button>
        ))}
      </div>
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
                onClick={() => playTrackList(likedTracks, 0)}
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
              onPlay={() => playTrackList(likedTracks, idx)}
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
}: {
  id: string;
  onAddToPlaylist: (track: MediaItem) => void;
}) {
  const playlists = useLibraryStore((s) => s.playlists);
  const renamePlaylist = useLibraryStore((s) => s.renamePlaylist);
  const deletePlaylist = useLibraryStore((s) => s.deletePlaylist);
  const removeTrackFromPlaylist = useLibraryStore((s) => s.removeTrackFromPlaylist);
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const navigate = useNavigationStore((s) => s.navigate);

  const playlist = playlists.find((pl) => pl.id === id);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  const handleRenameSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (draftName.trim()) {
      renamePlaylist(playlist.id, draftName);
    }
    setEditing(false);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end gap-5">
        <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden shrink-0">
          {playlist.tracks[0]?.thumbnail ? (
            <ArtworkImage
              src={playlist.tracks[0].thumbnail}
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
          <p className="text-xs text-white/55">Playlist Lokal</p>

          {editing ? (
            <form onSubmit={handleRenameSubmit} className="flex items-center gap-2 max-w-md">
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                autoFocus
                className="flex-1 h-10 px-3 rounded-xl bg-white/[0.08] border border-white/[0.14] text-base font-semibold text-white focus:outline-none focus:border-[#2EE6A6]"
              />
              <button
                type="submit"
                aria-label="Simpan nama playlist"
                className="w-10 h-10 rounded-xl bg-[#2EE6A6] text-[#06130E] flex items-center justify-center"
              >
                <Check className="w-4 h-4" strokeWidth={2} />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight truncate">
                {playlist.name}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setDraftName(playlist.name);
                  setEditing(true);
                }}
                aria-label="Ubah nama playlist"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
              >
                <Edit3 className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
          )}

          <p className="text-xs text-white/55 tabular-nums">{playlist.tracks.length} lagu</p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {playlist.tracks.length > 0 && (
              <button
                type="button"
                onClick={() => playTrackList(playlist.tracks, 0)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105 transition-all"
              >
                <Play className="w-4 h-4 fill-current" strokeWidth={2} />
                Putar Semua
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
                    navigate({ name: 'home' });
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
          {playlist.tracks.map((track, idx) => (
            <TrackRow
              key={`${track.id}-${idx}`}
              track={track}
              index={idx}
              onPlay={() => playTrackList(playlist.tracks, idx)}
              onAddToPlaylist={onAddToPlaylist}
              onRemove={() =>
                removeTrackFromPlaylist(playlist.id, getPlayableVideoId(track) || track.id)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
