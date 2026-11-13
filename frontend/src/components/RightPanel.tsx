import { Heart, ListMusic, ListPlus, Mic2, X } from 'lucide-react';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import type { MediaItem } from '../types/music';
import { getPlayableVideoId } from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';
import { LyricsView } from './LyricsView';
import { QueueView } from './QueueView';

interface RightPanelProps {
  onAddToPlaylist: (track: MediaItem) => void;
}

export function RightPanel({ onAddToPlaylist }: RightPanelProps) {
  const rightPanelOpen = usePlayerStore((s) => s.rightPanelOpen);
  const rightPanelTab = usePlayerStore((s) => s.rightPanelTab);
  const setRightPanelOpen = usePlayerStore((s) => s.setRightPanelOpen);
  const setRightPanelTab = usePlayerStore((s) => s.setRightPanelTab);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playerError = usePlayerStore((s) => s.playerError);

  const navigate = useNavigationStore((s) => s.navigate);

  const trackKey = currentTrack ? getPlayableVideoId(currentTrack) || currentTrack.id : null;
  const liked = useLibraryStore((s) => s.isLiked(trackKey));
  const toggleLike = useLibraryStore((s) => s.toggleLike);

  if (!rightPanelOpen) return null;

  return (
    <aside
      aria-label="Panel sedang diputar"
      className="hidden lg:flex flex-col w-[320px] xl:w-[348px] shrink-0 glass-panel rounded-2xl overflow-hidden transition-all duration-200"
    >
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/[0.08]">
        <h2 className="text-sm font-semibold text-white">Sedang diputar</h2>
        <button
          type="button"
          onClick={() => setRightPanelOpen(false)}
          aria-label="Tutup panel sedang diputar"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {currentTrack ? (
          <div className="space-y-3">
            <div className="aspect-square w-full overflow-hidden rounded-xl">
              <ArtworkImage
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                className="w-full h-full"
                roundedClass="rounded-xl"
              />
            </div>

            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-white truncate">
                  {currentTrack.title}
                </h3>
                <div className="flex flex-wrap items-center gap-x-1 text-xs text-white/60 mt-0.5">
                  {currentTrack.artists.map((artist, idx) => (
                    <span key={`${artist.name}-${idx}`} className="inline-flex items-center">
                      {idx > 0 && <span className="mr-1">,</span>}
                      {artist.id ? (
                        <button
                          type="button"
                          onClick={() => navigate({ name: 'artist', id: artist.id! })}
                          className="hover:text-white hover:underline text-left"
                        >
                          {artist.name}
                        </button>
                      ) : (
                        <span>{artist.name}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleLike(currentTrack)}
                  aria-label={liked ? 'Hapus dari lagu disukai' : 'Sukai lagu ini'}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                    liked ? 'text-[#2EE6A6]' : 'text-white/55 hover:text-white hover:bg-white/[0.08]'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${liked ? 'fill-[#2EE6A6]' : ''}`} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => onAddToPlaylist(currentTrack)}
                  aria-label="Simpan lagu ke playlist"
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.08] transition-colors"
                >
                  <ListPlus className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            {playerError && (
              <p className="text-xs text-red-300 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">
                {playerError}
              </p>
            )}
          </div>
        ) : (
          <div className="glass-card rounded-xl p-5 text-center space-y-2">
            <p className="text-sm font-medium text-white/80">Belum ada lagu diputar</p>
            <p className="text-xs text-white/45">
              Pilih lagu dari Beranda atau Cari untuk mulai memutar musik.
            </p>
          </div>
        )}

        <div
          role="tablist"
          aria-label="Tab panel sedang diputar"
          className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/[0.05] border border-white/[0.06]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={rightPanelTab === 'queue'}
            onClick={() => setRightPanelTab('queue')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              rightPanelTab === 'queue'
                ? 'bg-white/[0.1] text-[#2EE6A6]'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <ListMusic className="w-3.5 h-3.5" strokeWidth={1.75} />
            Antrean
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightPanelTab === 'lyrics'}
            onClick={() => setRightPanelTab('lyrics')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              rightPanelTab === 'lyrics'
                ? 'bg-white/[0.1] text-[#2EE6A6]'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Mic2 className="w-3.5 h-3.5" strokeWidth={1.75} />
            Lirik
          </button>
        </div>

        <div>{rightPanelTab === 'queue' ? <QueueView /> : <LyricsView />}</div>
      </div>
    </aside>
  );
}
