import { Play, Trash2, X } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { formatArtists } from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';

export function QueueView() {
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playQueueIndex = usePlayerStore((s) => s.playQueueIndex);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);
  const clearUpcomingQueue = usePlayerStore((s) => s.clearUpcomingQueue);

  if (!currentTrack || queue.length === 0) {
    return (
      <div className="py-12 text-center text-xs text-white/45">
        Antrean putar masih kosong. Pilih lagu untuk mulai mendengarkan.
      </div>
    );
  }

  const upcoming = queue
    .map((track, idx) => ({ track, idx }))
    .filter(({ idx }) => idx > queueIndex);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-white/55 mb-2">Sedang diputar</h4>
        <div className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.08]">
          <ArtworkImage
            src={currentTrack.thumbnail}
            alt={currentTrack.title}
            className="w-10 h-10"
            roundedClass="rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#2EE6A6] truncate">{currentTrack.title}</p>
            <p className="text-xs text-white/60 truncate">{formatArtists(currentTrack.artists)}</p>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-white/55">
            Berikutnya <span className="tabular-nums">({upcoming.length})</span>
          </h4>
          {upcoming.length > 0 && (
            <button
              type="button"
              onClick={clearUpcomingQueue}
              className="inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white transition-colors"
            >
              <Trash2 className="w-3 h-3" strokeWidth={1.75} />
              Bersihkan
            </button>
          )}
        </div>

        {upcoming.length === 0 ? (
          <p className="text-xs text-white/40 py-4">
            Lagu berikutnya akan dimuat otomatis saat lagu selesai.
          </p>
        ) : (
          <div className="space-y-1">
            {upcoming.map(({ track, idx }) => (
              <div
                key={`${track.id}-${idx}`}
                className="track-row group flex items-center gap-2.5 p-1.5 rounded-xl"
              >
                <button
                  type="button"
                  onClick={() => playQueueIndex(idx)}
                  aria-label={`Putar ${track.title}`}
                  className="relative w-9 h-9 rounded-lg overflow-hidden shrink-0"
                >
                  <ArtworkImage
                    src={track.thumbnail}
                    alt={track.title}
                    className="w-full h-full"
                    roundedClass="rounded-lg"
                  />
                  <span className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Play className="w-3.5 h-3.5 text-white fill-white" strokeWidth={1.75} />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => playQueueIndex(idx)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-xs font-medium text-white truncate">{track.title}</p>
                  <p className="text-[11px] text-white/50 truncate">
                    {formatArtists(track.artists)}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => removeFromQueue(idx)}
                  aria-label={`Hapus ${track.title} dari antrean`}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-white/[0.08] transition-all shrink-0"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
