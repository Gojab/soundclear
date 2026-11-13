import { useState, type FormEvent } from 'react';
import { Check, ListPlus, Plus, X } from 'lucide-react';
import { useLibraryStore } from '../store/libraryStore';
import type { MediaItem } from '../types/music';
import { getPlayableVideoId } from '../utils/playerLogic';

interface PlaylistModalProps {
  open: boolean;
  trackToAdd?: MediaItem | null;
  onClose: () => void;
}

export function PlaylistModal({ open, trackToAdd, onClose }: PlaylistModalProps) {
  const [name, setName] = useState('');
  const playlists = useLibraryStore((s) => s.playlists);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const addTrackToPlaylist = useLibraryStore((s) => s.addTrackToPlaylist);

  if (!open) return null;

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createPlaylist(trimmed, trackToAdd ?? undefined);
    setName('');
    onClose();
  };

  const trackKey = trackToAdd ? getPlayableVideoId(trackToAdd) || trackToAdd.id : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={trackToAdd ? 'Tambahkan ke playlist' : 'Buat playlist baru'}
    >
      <div className="w-full max-w-md glass-panel rounded-2xl p-5 bg-[#121215]/95">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-base font-semibold text-white">
            {trackToAdd ? 'Simpan ke Playlist' : 'Buat Playlist Baru'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {trackToAdd && (
          <p className="text-xs text-white/60 mb-4 truncate">
            Lagu: <span className="text-white font-medium">{trackToAdd.title}</span>
          </p>
        )}

        {trackToAdd && playlists.length > 0 && (
          <div className="mb-4 max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {playlists.map((pl) => {
              const alreadyAdded = Boolean(
                trackKey && pl.tracks.some((t) => (getPlayableVideoId(t) || t.id) === trackKey),
              );
              return (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => {
                    if (!alreadyAdded) {
                      addTrackToPlaylist(pl.id, trackToAdd);
                    }
                    onClose();
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] text-left transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ListPlus className="w-4 h-4 text-white/60 shrink-0" strokeWidth={1.75} />
                    <span className="text-sm text-white truncate">{pl.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-white/45 tabular-nums">
                      {pl.tracks.length} lagu
                    </span>
                    {alreadyAdded && <Check className="w-4 h-4 text-[#2EE6A6]" strokeWidth={1.75} />}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label htmlFor="playlist-name-input" className="block text-xs text-white/60 mb-1.5">
              Nama playlist baru
            </label>
            <input
              id="playlist-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Fokus Malam"
              maxLength={60}
              autoFocus={!trackToAdd}
              className="w-full h-11 px-3.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-[#2EE6A6]"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-white/70 hover:text-white hover:bg-white/[0.07] transition-colors whitespace-nowrap"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#2EE6A6] text-[#06130E] hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2} />
              {trackToAdd ? 'Buat & Simpan' : 'Buat Playlist'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
