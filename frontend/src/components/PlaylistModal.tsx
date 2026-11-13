import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, ListPlus, Plus, X } from 'lucide-react';
import { postAccountAddPlaylistItems, postAccountCreatePlaylist } from '../api/client';
import { useLibraryStore } from '../store/libraryStore';
import type { LocalPlaylist, MediaItem } from '../types/music';
import { getPlayableVideoId } from '../utils/playerLogic';

interface PlaylistModalProps {
  open: boolean;
  trackToAdd?: MediaItem | null;
  editingPlaylist?: LocalPlaylist | null;
  onClose: () => void;
}

export function PlaylistModal({
  open,
  trackToAdd,
  editingPlaylist,
  onClose,
}: PlaylistModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [folderId, setFolderId] = useState<string>('');
  const [duplicatePromptPlaylist, setDuplicatePromptPlaylist] = useState<LocalPlaylist | null>(null);

  const playlists = useLibraryStore((s) => s.playlists);
  const folders = useLibraryStore((s) => s.folders);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const updatePlaylist = useLibraryStore((s) => s.updatePlaylist);
  const hasTrackInPlaylist = useLibraryStore((s) => s.hasTrackInPlaylist);
  const addTrackToPlaylist = useLibraryStore((s) => s.addTrackToPlaylist);

  useEffect(() => {
    if (!open) return;
    setDuplicatePromptPlaylist(null);
    if (editingPlaylist) {
      setName(editingPlaylist.name);
      setDescription(editingPlaylist.description || '');
      setCoverUrl(editingPlaylist.coverUrl || '');
      setFolderId(editingPlaylist.folderId || '');
    } else {
      setName('');
      setDescription('');
      setCoverUrl('');
      setFolderId('');
    }
  }, [open, editingPlaylist]);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    if (editingPlaylist) {
      updatePlaylist(editingPlaylist.id, {
        name: trimmed,
        description: description.trim(),
        coverUrl: coverUrl.trim() || null,
        folderId: folderId || null,
      });
      onClose();
      return;
    }

    createPlaylist(trimmed, trackToAdd ?? undefined, {
      description: description.trim(),
      folderId: folderId || null,
    });
    const vid = trackToAdd ? getPlayableVideoId(trackToAdd) : null;
    void postAccountCreatePlaylist(trimmed, description.trim(), vid ? [vid] : []).catch(() => {});
    onClose();
  };

  const trackKey = trackToAdd ? getPlayableVideoId(trackToAdd) || trackToAdd.id : null;

  const handlePickExistingPlaylist = (pl: LocalPlaylist) => {
    if (!trackToAdd) return;
    if (hasTrackInPlaylist(pl.id, trackToAdd)) {
      setDuplicatePromptPlaylist(pl);
      return;
    }
    addTrackToPlaylist(pl.id, trackToAdd, false);
    const vid = getPlayableVideoId(trackToAdd);
    if (vid) void postAccountAddPlaylistItems(pl.id, [vid]).catch(() => {});
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={
        editingPlaylist
          ? 'Edit detail playlist'
          : trackToAdd
            ? 'Tambahkan ke playlist'
            : 'Buat playlist baru'
      }
    >
      <div className="w-full max-w-md glass-panel rounded-2xl p-5 bg-[#121215]/95 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-white">
            {editingPlaylist
              ? 'Ubah Detail Playlist'
              : trackToAdd
                ? 'Simpan ke Playlist'
                : 'Buat Playlist Baru'}
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

        {trackToAdd && !editingPlaylist && (
          <p className="text-xs text-white/60 truncate">
            Lagu: <span className="text-white font-medium">{trackToAdd.title}</span>
          </p>
        )}

        {duplicatePromptPlaylist && trackToAdd && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-400/25 p-3.5 space-y-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" strokeWidth={1.75} />
              <div className="text-xs text-white/85">
                <p className="font-semibold">Lagu sudah ada di playlist &ldquo;{duplicatePromptPlaylist.name}&rdquo;</p>
                <p className="text-white/60 mt-0.5">Tetap tambahkan lagu ini sebagai duplikat?</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDuplicatePromptPlaylist(null)}
                className="px-3 py-1.5 rounded-lg bg-white/[0.08] text-xs text-white/80"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  addTrackToPlaylist(duplicatePromptPlaylist.id, trackToAdd, true);
                  setDuplicatePromptPlaylist(null);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg bg-[#2EE6A6] text-[#06130E] text-xs font-semibold"
              >
                Tambahkan Juga
              </button>
            </div>
          </div>
        )}

        {trackToAdd && !editingPlaylist && playlists.length > 0 && (
          <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
            {playlists.map((pl) => {
              const alreadyAdded = Boolean(
                trackKey && pl.tracks.some((t) => (getPlayableVideoId(t) || t.id) === trackKey),
              );
              return (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => handlePickExistingPlaylist(pl)}
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

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="playlist-name-input" className="block text-xs text-white/60 mb-1.5">
              {editingPlaylist ? 'Nama playlist' : 'Nama playlist baru'}
            </label>
            <input
              id="playlist-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Fokus Malam"
              maxLength={60}
              autoFocus={!trackToAdd || Boolean(editingPlaylist)}
              className="w-full h-10 px-3.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-[#2EE6A6]"
            />
          </div>

          <div>
            <label htmlFor="playlist-desc-input" className="block text-xs text-white/60 mb-1.5">
              Deskripsi (opsional)
            </label>
            <input
              id="playlist-desc-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Keterangan singkat playlist"
              maxLength={160}
              className="w-full h-10 px-3.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-[#2EE6A6]"
            />
          </div>

          {editingPlaylist && (
            <div>
              <label htmlFor="playlist-cover-input" className="block text-xs text-white/60 mb-1.5">
                URL gambar sampul (opsional)
              </label>
              <input
                id="playlist-cover-input"
                type="url"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="https://..."
                className="w-full h-10 px-3.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-[#2EE6A6]"
              />
            </div>
          )}

          {folders.length > 0 && (
            <div>
              <label htmlFor="playlist-folder-select" className="block text-xs text-white/60 mb-1.5">
                Folder playlist
              </label>
              <select
                id="playlist-folder-select"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[#19191E] border border-white/[0.1] text-sm text-white focus:outline-none focus:border-[#2EE6A6]"
              >
                <option value="">Tanpa folder</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}

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
              {editingPlaylist ? (
                <>
                  <Check className="w-3.5 h-3.5" strokeWidth={2} />
                  Simpan Perubahan
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                  {trackToAdd ? 'Buat & Simpan' : 'Buat Playlist'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
