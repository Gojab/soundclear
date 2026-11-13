import { Play } from 'lucide-react';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import type { MediaItem } from '../types/music';
import { formatArtists, getPlayableVideoId } from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';

interface MediaCardProps {
  item: MediaItem;
  subtitle?: string;
  onAddToPlaylist?: (track: MediaItem) => void;
}

export function MediaCard({ item, subtitle, onAddToPlaylist }: MediaCardProps) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const navigateToItem = useNavigationStore((s) => s.navigateToItem);
  const openMenu = useContextMenuStore((s) => s.openMenu);

  const playableId = getPlayableVideoId(item);
  const isArtist = item.type === 'artist';

  const handleCardClick = () => {
    if (item.type === 'podcast' || item.type === 'episode') {
      navigateToItem(item);
      return;
    }
    if (playableId) {
      playTrack(item);
    } else {
      navigateToItem(item);
    }
  };

  const defaultTypeLabel =
    item.type === 'podcast'
      ? 'Podcast'
      : item.type === 'episode'
        ? item.published || 'Episode'
        : item.type === 'playlist'
          ? 'Playlist'
          : 'Album';

  const resolvedSubtitle =
    subtitle ||
    (item.type === 'artist'
      ? item.views || 'Artis'
      : item.artists && item.artists.length > 0
        ? formatArtists(item.artists)
        : item.year || defaultTypeLabel);

  return (
    <div
      onContextMenu={(e) => {
        if (playableId || item.type === 'album' || item.type === 'playlist') {
          e.preventDefault();
          openMenu(e.clientX, e.clientY, item, { onAddToPlaylist });
        }
      }}
      className="group rounded-lg p-3 flex flex-col bg-transparent hover:bg-white/[0.08] transition-colors duration-150"
    >
      <div className="relative aspect-square w-full mb-2.5 overflow-hidden rounded-md shadow-md shadow-black/40">
        <button
          type="button"
          onClick={handleCardClick}
          aria-label={`${playableId && item.type !== 'episode' ? 'Putar' : 'Buka'} ${item.title}`}
          className="block w-full h-full focus-visible:outline-2 focus-visible:outline-[#2EE6A6]"
        >
          <ArtworkImage
            src={item.thumbnail}
            alt={item.title}
            type={item.type}
            className="w-full h-full"
            roundedClass={isArtist ? 'rounded-full' : 'rounded-md'}
          />
        </button>

        {playableId && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              playTrack(item);
            }}
            aria-label={`Putar ${item.title}`}
            className="absolute bottom-2 right-2 w-11 h-11 rounded-full bg-[#2EE6A6] text-[#06130E] shadow-lg shadow-black/50 flex items-center justify-center opacity-0 translate-y-1.5 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-150 hover:scale-105 focus-visible:opacity-100"
          >
            <Play className="w-4.5 h-4.5 fill-current ml-0.5" strokeWidth={2} />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={handleCardClick}
        className="text-left text-sm font-semibold text-white truncate hover:underline"
      >
        {item.title}
      </button>
      <p className="text-xs text-white/60 truncate mt-1 leading-snug">{resolvedSubtitle}</p>
    </div>
  );
}
