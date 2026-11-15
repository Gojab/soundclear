import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import type { MediaItem } from '../types/music';
import { playAnyMediaItem } from '../utils/playCollection';
import {
  formatArtists,
  getPlayableVideoId,
  isCollectionPlayableType,
  isLocalTrack,
} from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';

interface MediaCardProps {
  item: MediaItem;
  subtitle?: string;
  onAddToPlaylist?: (track: MediaItem) => void;
}

export function MediaCard({ item, subtitle, onAddToPlaylist }: MediaCardProps) {
  const [resolvingPlay, setResolvingPlay] = useState(false);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const navigateToItem = useNavigationStore((s) => s.navigateToItem);
  const openMenu = useContextMenuStore((s) => s.openMenu);

  const playableId = getPlayableVideoId(item);
  const canPlay = Boolean(
    playableId || isLocalTrack(item) || isCollectionPlayableType(item.type),
  );
  const isArtist = item.type === 'artist';

  const handleCardClick = () => {
    if (item.type === 'podcast' || item.type === 'episode') {
      navigateToItem(item);
      return;
    }
    if (playableId || isLocalTrack(item)) {
      playTrack(item);
    } else {
      navigateToItem(item);
    }
  };

  const handlePlayButtonClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (resolvingPlay) return;
    if (playableId || isLocalTrack(item)) {
      playTrack(item);
      return;
    }
    setResolvingPlay(true);
    try {
      await playAnyMediaItem(item);
    } finally {
      setResolvingPlay(false);
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
        if (playableId || isLocalTrack(item) || item.type === 'album' || item.type === 'playlist') {
          e.preventDefault();
          openMenu(e.clientX, e.clientY, item, { onAddToPlaylist });
        }
      }}
      className="group rounded-xl p-3 flex flex-col bg-white/[0.035] backdrop-blur-md border border-white/[0.07] hover:bg-white/[0.085] hover:border-white/[0.14] transition-all duration-150"
    >
      <div className="relative aspect-square w-full mb-2.5 overflow-hidden rounded-md shadow-md shadow-black/40">
        <button
          type="button"
          onClick={handleCardClick}
          aria-label={`Buka ${item.title}`}
          className="block w-full h-full focus-visible:outline-2 focus-visible:outline-[#19EE8A]"
        >
          <ArtworkImage
            src={item.thumbnail}
            alt={item.title}
            type={item.type}
            className="w-full h-full"
            roundedClass={isArtist ? 'rounded-full' : 'rounded-md'}
          />
        </button>

        {canPlay && (
          <button
            type="button"
            disabled={resolvingPlay}
            onClick={(e) => void handlePlayButtonClick(e)}
            aria-label={`Putar ${item.title}`}
            className={`absolute bottom-2 right-2 z-10 w-11 h-11 rounded-full bg-sc-gradient text-[#0F1F17] shadow-lg shadow-black/50 flex items-center justify-center transition-all duration-150 hover:scale-105 hover:brightness-105 focus-visible:opacity-100 ${
              resolvingPlay
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-1.5 group-hover:opacity-100 group-hover:translate-y-0'
            }`}
          >
            {resolvingPlay ? (
              <Loader2 className="w-4.5 h-4.5 animate-spin" strokeWidth={2.2} />
            ) : (
              <Play className="w-4.5 h-4.5 fill-current ml-0.5" strokeWidth={2} />
            )}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={handleCardClick}
        className="text-left text-sm font-semibold text-[#E8FFF3] truncate hover:underline"
      >
        {item.title}
      </button>
      <p className="text-xs text-[#B3F7D1]/65 truncate mt-1 leading-snug">{resolvedSubtitle}</p>
    </div>
  );
}
