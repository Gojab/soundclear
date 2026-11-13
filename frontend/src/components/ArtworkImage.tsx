import { useState } from 'react';
import { Disc3, Headphones, Music, Podcast, User } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';
import type { MediaItemType } from '../types/music';
import { getEffectiveThumbnail } from '../utils/playerLogic';

interface ArtworkImageProps {
  src?: string | null;
  alt: string;
  type?: MediaItemType;
  className?: string;
  roundedClass?: string;
}

export function ArtworkImage({
  src,
  alt,
  type = 'song',
  className = 'w-full h-full',
  roundedClass = 'rounded-xl',
}: ArtworkImageProps) {
  const [failed, setFailed] = useState(false);
  const dataSaver = useSettingsStore((s) => s.dataSaver);
  const resolvedSrc = getEffectiveThumbnail(src, dataSaver);

  if (!resolvedSrc || failed) {
    const Icon =
      type === 'artist'
        ? User
        : type === 'album'
          ? Disc3
          : type === 'podcast' || type === 'episode'
            ? Podcast
            : type === 'local'
              ? Headphones
              : Music;
    return (
      <div
        className={`${className} ${roundedClass} flex items-center justify-center bg-white/[0.06] border border-white/[0.08] text-white/40 shrink-0`}
        aria-label={alt}
      >
        <Icon className="w-1/3 h-1/3" strokeWidth={1.75} />
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${className} ${roundedClass} object-cover bg-white/[0.04] shrink-0`}
    />
  );
}
