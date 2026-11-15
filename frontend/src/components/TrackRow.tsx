import {
  Check,
  Download,
  GripVertical,
  Heart,
  ListEnd,
  ListPlus,
  MoreHorizontal,
  Pause,
  Play,
  Trash2,
} from 'lucide-react';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { MediaItem } from '../types/music';
import { getTrackUniqueId, isPlayableTrack } from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';

interface TrackRowProps {
  track: MediaItem;
  index?: number;
  showAlbum?: boolean;
  compact?: boolean;
  draggable?: boolean;
  onDragStartIndex?: (index: number) => void;
  onDropIndex?: (index: number) => void;
  onPlay: () => void;
  onAddToPlaylist?: (track: MediaItem) => void;
  onRemove?: () => void;
}

export function TrackRow({
  track,
  index,
  showAlbum = true,
  compact = false,
  draggable = false,
  onDragStartIndex,
  onDropIndex,
  onPlay,
  onAddToPlaylist,
  onRemove,
}: TrackRowProps) {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const addToQueue = usePlayerStore((s) => s.addToQueue);

  const navigate = useNavigationStore((s) => s.navigate);
  const openMenu = useContextMenuStore((s) => s.openMenu);
  const showToast = useContextMenuStore((s) => s.showToast);

  const trackKey = getTrackUniqueId(track) || track.id;
  const activeKey = currentTrack ? getTrackUniqueId(currentTrack) || currentTrack.id : null;
  const isCurrent = Boolean(activeKey && activeKey === trackKey);

  const liked = useLibraryStore((s) => s.isLiked(trackKey));
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const isHidden = useLibraryStore((s) => s.isTrackHidden(trackKey));
  const isOffline = useLibraryStore((s) => s.isTrackDownloadedOffline(trackKey));
  const downloadTrackOffline = useLibraryStore((s) => s.downloadTrackOffline);
  const deleteOfflineDownload = useLibraryStore((s) => s.deleteOfflineDownload);
  const downloadQuality = useSettingsStore((s) => s.localProfile.downloadQuality);

  const handlePrimaryClick = () => {
    if (isCurrent) {
      togglePlayPause();
    } else {
      onPlay();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY, track, {
      onAddToPlaylist,
      onRemoveFromList: onRemove,
    });
  };

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable || typeof index !== 'number') return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
        onDragStartIndex?.(index);
      }}
      onDragOver={(e) => {
        if (!draggable) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        if (!draggable || typeof index !== 'number') return;
        e.preventDefault();
        onDropIndex?.(index);
      }}
      onContextMenu={handleContextMenu}
      className={`track-row group flex items-center gap-3 px-3 ${
        compact ? 'py-1.5' : 'py-2'
      } rounded-xl ${isCurrent ? 'bg-white/[0.09] border border-[#19EE8A]/20' : ''} ${isHidden ? 'opacity-45' : ''}`}
    >
      {draggable && (
        <span
          className="text-[#B3F7D1]/35 group-hover:text-[#B3F7D1]/65 cursor-grab active:cursor-grabbing shrink-0"
          aria-hidden="true"
        >
          <GripVertical className="w-4 h-4" strokeWidth={1.75} />
        </span>
      )}

      {typeof index === 'number' && (
        <div className="w-6 text-center shrink-0">
          <span
            className={`text-xs tabular-nums group-hover:hidden ${
              isCurrent ? 'text-[#19EE8A] font-semibold' : 'text-[#B3F7D1]/50'
            }`}
          >
            {index + 1}
          </span>
          <button
            type="button"
            onClick={handlePrimaryClick}
            tabIndex={-1}
            aria-hidden="true"
            className="hidden group-hover:inline-flex items-center justify-center w-6 h-6 text-[#E8FFF3] hover:text-[#19EE8A]"
          >
            {isCurrent && isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" strokeWidth={1.75} />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" strokeWidth={1.75} />
            )}
          </button>
        </div>
      )}

      {!compact && (
        <button
          type="button"
          onClick={handlePrimaryClick}
          aria-label={`${isCurrent && isPlaying ? 'Jeda' : 'Putar'} ${track.title}`}
          className="relative w-11 h-11 shrink-0 rounded-lg overflow-hidden focus-visible:outline-2 focus-visible:outline-[#19EE8A]"
        >
          <ArtworkImage
            src={track.thumbnail}
            alt={track.title}
            type={track.type}
            className="w-full h-full"
            roundedClass="rounded-lg"
          />
          <span
            className={`absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-xs transition-opacity duration-120 ${
              isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            {isCurrent && isPlaying ? (
              <Pause className="w-4 h-4 text-[#19EE8A] fill-[#19EE8A]" strokeWidth={1.75} />
            ) : (
              <Play className="w-4 h-4 text-[#E8FFF3] fill-[#E8FFF3]" strokeWidth={1.75} />
            )}
          </span>
        </button>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={handlePrimaryClick}
            className={`block text-left text-sm font-medium truncate transition-colors ${
              isCurrent ? 'text-[#19EE8A]' : 'text-[#E8FFF3] hover:text-[#E8FFF3]'
            }`}
          >
            {track.title}
          </button>
          {track.isExplicit && (
            <span className="text-[10px] font-semibold text-[#B3F7D1]/50 shrink-0" title="Konten eksplisit">
              E
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[#B3F7D1]/65 truncate mt-0.5">
          {track.artists && track.artists.length > 0 ? (
            track.artists.map((artist, idx) => (
              <span key={`${artist.name}-${idx}`} className="inline-flex items-center gap-1 truncate">
                {idx > 0 && <span aria-hidden="true">,</span>}
                {artist.id ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate({ name: 'artist', id: artist.id!, fallbackQuery: artist.name });
                    }}
                    className="hover:text-[#E8FFF3] hover:underline truncate"
                  >
                    {artist.name}
                  </button>
                ) : (
                  <span className="truncate">{artist.name}</span>
                )}
              </span>
            ))
          ) : (
            <span>Artis tidak diketahui</span>
          )}
        </div>
      </div>

      {showAlbum && track.album?.name && (
        <div className="hidden xl:block w-48 min-w-0">
          {track.album.id ? (
            <button
              type="button"
              onClick={() =>
                navigate({ name: 'album', id: track.album!.id!, fallbackQuery: track.album!.name })
              }
              className="text-xs text-[#B3F7D1]/60 hover:text-[#E8FFF3] hover:underline truncate block max-w-full text-left"
            >
              {track.album.name}
            </button>
          ) : (
            <span className="text-xs text-[#B3F7D1]/50 truncate block">{track.album.name}</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => {
            if (isOffline) {
              void deleteOfflineDownload(trackKey);
              showToast(`"${track.title}" dihapus dari penyimpanan offline`);
            } else {
              void downloadTrackOffline(track, downloadQuality)
                .then((res) => {
                  if (res.ok) {
                    showToast(`"${track.title}" tersimpan offline`);
                  } else {
                    showToast(res.reason || 'Gagal mengunduh lagu untuk offline');
                  }
                })
                .catch(() => {
                  showToast('Gagal mengunduh lagu untuk offline');
                });
            }
          }}
          aria-label={isOffline ? `Hapus ${track.title} dari offline` : `Unduh ${track.title} offline`}
          title={isOffline ? 'Tersimpan offline' : 'Unduh offline'}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            isOffline
              ? 'text-[#19EE8A]'
              : 'text-[#B3F7D1]/45 md:hidden md:group-hover:flex hover:text-[#E8FFF3] hover:bg-white/[0.1]'
          }`}
        >
          {isOffline ? (
            <Check className="w-4 h-4" strokeWidth={2.2} />
          ) : (
            <Download className="w-4 h-4" strokeWidth={1.75} />
          )}
        </button>

        <button
          type="button"
          onClick={() => toggleLike(track)}
          aria-label={liked ? `Hapus ${track.title} dari lagu disukai` : `Sukai ${track.title}`}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            liked
              ? 'text-[#19EE8A]'
              : 'text-[#B3F7D1]/45 md:hidden md:group-hover:flex hover:text-[#E8FFF3]'
          }`}
        >
          <Heart className={`w-4 h-4 ${liked ? 'fill-[#19EE8A]' : ''}`} strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={() => {
            if (!isPlayableTrack(track)) {
              showToast('Item ini tidak dapat ditambahkan ke antrean');
              return;
            }
            addToQueue(track);
            showToast(`"${track.title}" ditambahkan ke antrean`);
          }}
          aria-label={`Tambahkan ${track.title} ke antrean`}
          title="Tambahkan ke antrean"
          className="hidden sm:group-hover:flex w-8 h-8 rounded-lg items-center justify-center text-[#B3F7D1]/60 hover:text-[#E8FFF3] hover:bg-white/[0.1] transition-colors"
        >
          <ListEnd className="w-4 h-4" strokeWidth={1.75} />
        </button>

        {onAddToPlaylist && (
          <button
            type="button"
            onClick={() => onAddToPlaylist(track)}
            aria-label={`Simpan ${track.title} ke playlist`}
            title="Simpan ke playlist"
            className="hidden sm:group-hover:flex w-8 h-8 rounded-lg items-center justify-center text-[#B3F7D1]/60 hover:text-[#E8FFF3] hover:bg-white/[0.1] transition-colors"
          >
            <ListPlus className="w-4 h-4" strokeWidth={1.75} />
          </button>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Hapus ${track.title} dari daftar`}
            title="Hapus"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#B3F7D1]/50 hover:text-red-400 hover:bg-white/[0.1] transition-colors"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.75} />
          </button>
        )}

        <button
          type="button"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            openMenu(rect.right - 220, rect.bottom + 6, track, {
              onAddToPlaylist,
              onRemoveFromList: onRemove,
            });
          }}
          aria-label={`Opsi lainnya untuk ${track.title}`}
          title="Opsi lainnya"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#B3F7D1]/50 hover:text-[#E8FFF3] hover:bg-white/[0.1] transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" strokeWidth={1.75} />
        </button>

        <span className="w-10 text-right text-xs text-[#B3F7D1]/55 tabular-nums">
          {track.duration || '—'}
        </span>
      </div>
    </div>
  );
}
