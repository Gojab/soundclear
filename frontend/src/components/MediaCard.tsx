import { Play } from 'lucide-react';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import type { MediaItem } from '../types/music';
import { formatArtists, getPlayableVideoId } from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';

interface MediaCardProps {
  item: MediaItem;
  subtitle?: string;
}

export function MediaCard({ item, subtitle }: MediaCardProps) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const navigateToItem = useNavigationStore((s) => s.navigateToItem);

  const playableId = getPlayableVideoId(item);
  const isArtist = item.type === 'artist';

  const handleCardClick = () => {
    if (playableId) {
      playTrack(item);
    } else {
      navigateToItem(item);
    }
  };

  const resolvedSubtitle =
    subtitle ||
    (item.type === 'artist'
      ? item.views || 'Artis'
      : item.artists && item.artists.length > 0
        ? formatArtists(item.artists)
        : item.year || (item.type === 'playlist' ? 'Playlist' : 'Album'));

  return (
    <div className="glass-card group rounded-2xl p-3 flex flex-col">
      <div className="relative aspect-square w-full mb-3 overflow-hidden rounded-xl">
        <button
          type="button"
          onClick={handleCardClick}
          aria-label={`${playableId ? 'Putar' : 'Buka'} ${item.title}`}
          className="block w-full h-full focus-visible:outline-2 focus-visible:outline-[#2EE6A6]"
        >
          <ArtworkImage
            src={item.thumbnail}
            alt={item.title}
            type={item.type}
            className="w-full h-full"
            roundedClass={isArtist ? 'rounded-full' : 'rounded-xl'}
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
            className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-[#2EE6A6] text-[#06130E] flex items-center justify-center opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-150 focus-visible:opacity-100"
          >
            <Play className="w-4 h-4 fill-current ml-0.5" strokeWidth={2} />
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
      <p className="text-xs text-white/55 truncate mt-1">{resolvedSubtitle}</p>
    </div>
  );
}
