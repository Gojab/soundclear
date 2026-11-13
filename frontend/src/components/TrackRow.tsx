import { GripVertical, Heart, ListEnd, ListPlus, MoreHorizontal, Pause, Play, Trash2 } from 'lucide-react';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import type { MediaItem } from '../types/music';
import { getTrackUniqueId } from '../utils/playerLogic';
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

  const trackKey = getTrackUniqueId(track) || track.id;
  const activeKey = currentTrack ? getTrackUniqueId(currentTrack) || currentTrack.id : null;
  const isCurrent = Boolean(activeKey && activeKey === trackKey);

  const liked = useLibraryStore((s) => s.isLiked(trackKey));
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const isHidden = useLibraryStore((s) => s.isTrackHidden(trackKey));

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
      } rounded-xl ${isCurrent ? 'bg-white/[0.08]' : ''} ${isHidden ? 'opacity-45' : ''}`}
    >
      {draggable && (
        <span
          className="text-white/30 group-hover:text-white/60 cursor-grab active:cursor-grabbing shrink-0"
          aria-hidden="true"
        >
          <GripVertical className="w-4 h-4" strokeWidth={1.75} />
        </span>
      )}

      {typeof index === 'number' && (
        <div className="w-6 text-center shrink-0">
          <span
            className={`text-xs tabular-nums group-hover:hidden ${
              isCurrent ? 'text-[#2EE6A6] font-semibold' : 'text-white/45'
            }`}
          >
            {index + 1}
          </span>
          <button
            type="button"
            onClick={handlePrimaryClick}
            tabIndex={-1}
            aria-hidden="true"
            className="hidden group-hover:inline-flex items-center justify-center w-6 h-6 text-white hover:text-[#2EE6A6]"
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
          className="relative w-11 h-11 shrink-0 rounded-lg overflow-hidden focus-visible:outline-2 focus-visible:outline-[#2EE6A6]"
        >
          <ArtworkImage
            src={track.thumbnail}
            alt={track.title}
            type={track.type}
            className="w-full h-full"
            roundedClass="rounded-lg"
          />
          <span
            className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity duration-120 ${
              isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            {isCurrent && isPlaying ? (
              <Pause className="w-4 h-4 text-[#2EE6A6] fill-[#2EE6A6]" strokeWidth={1.75} />
            ) : (
              <Play className="w-4 h-4 text-white fill-white" strokeWidth={1.75} />
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
              isCurrent ? 'text-[#2EE6A6]' : 'text-white hover:text-white'
            }`}
          >
            {track.title}
          </button>
          {track.isExplicit && (
            <span className="text-[10px] font-semibold text-white/45 shrink-0" title="Konten eksplisit">
              E
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-white/55 truncate mt-0.5">
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
                    className="hover:text-white hover:underline truncate"
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
              className="text-xs text-white/50 hover:text-white hover:underline truncate block max-w-full text-left"
            >
              {track.album.name}
            </button>
          ) : (
            <span className="text-xs text-white/45 truncate block">{track.album.name}</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => toggleLike(track)}
          aria-label={liked ? `Hapus ${track.title} dari lagu disukai` : `Sukai ${track.title}`}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            liked
              ? 'text-[#2EE6A6]'
              : 'text-white/40 md:hidden md:group-hover:flex hover:text-white'
          }`}
        >
          <Heart className={`w-4 h-4 ${liked ? 'fill-[#2EE6A6]' : ''}`} strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={() => addToQueue(track)}
          aria-label={`Tambahkan ${track.title} ke antrean`}
          title="Tambahkan ke antrean"
          className="hidden sm:group-hover:flex w-8 h-8 rounded-lg items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <ListEnd className="w-4 h-4" strokeWidth={1.75} />
        </button>

        {onAddToPlaylist && (
          <button
            type="button"
            onClick={() => onAddToPlaylist(track)}
            aria-label={`Simpan ${track.title} ke playlist`}
            title="Simpan ke playlist"
            className="hidden sm:group-hover:flex w-8 h-8 rounded-lg items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.08] transition-colors"
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
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/45 hover:text-red-400 hover:bg-white/[0.08] transition-colors"
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
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/45 hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" strokeWidth={1.75} />
        </button>

        <span className="w-10 text-right text-xs text-white/50 tabular-nums">
          {track.duration || '—'}
        </span>
      </div>
    </div>
  );
}
