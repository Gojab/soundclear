import {
  Heart,
  ListMusic,
  ListPlus,
  Mic2,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import type { MediaItem } from '../types/music';
import { formatTime, getPlayableVideoId } from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';

interface PlayerBarProps {
  onAddToPlaylist: (track: MediaItem) => void;
}

export function PlayerBar({ onAddToPlaylist }: PlayerBarProps) {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const rightPanelOpen = usePlayerStore((s) => s.rightPanelOpen);
  const rightPanelTab = usePlayerStore((s) => s.rightPanelTab);

  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const requestSeek = usePlayerStore((s) => s.requestSeek);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const setRightPanelOpen = usePlayerStore((s) => s.setRightPanelOpen);
  const setRightPanelTab = usePlayerStore((s) => s.setRightPanelTab);

  const navigate = useNavigationStore((s) => s.navigate);

  const trackKey = currentTrack ? getPlayableVideoId(currentTrack) || currentTrack.id : null;
  const liked = useLibraryStore((s) => s.isLiked(trackKey));
  const toggleLike = useLibraryStore((s) => s.toggleLike);

  const safeDuration = duration > 0 ? duration : currentTrack?.durationSeconds || 0;
  const progressPct =
    safeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / safeDuration) * 100)) : 0;
  const effectiveVolume = isMuted ? 0 : volume;

  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;

  return (
    <footer
      aria-label="Pemutar musik"
      className="hidden md:grid grid-cols-[minmax(0,1fr)_minmax(340px,1.4fr)_minmax(0,1fr)] items-center gap-4 h-[84px] shrink-0 glass-panel rounded-2xl px-4"
    >
      {/* Left: Track info */}
      <div className="flex items-center gap-3 min-w-0">
        {currentTrack ? (
          <>
            <ArtworkImage
              src={currentTrack.thumbnail}
              alt={currentTrack.title}
              className="w-13 h-13"
              roundedClass="rounded-xl"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{currentTrack.title}</p>
              <div className="flex items-center gap-1 text-xs text-white/55 truncate mt-0.5">
                {currentTrack.artists.map((artist, idx) => (
                  <span key={`${artist.name}-${idx}`} className="inline-flex items-center truncate">
                    {idx > 0 && <span className="mr-1">,</span>}
                    {artist.id ? (
                      <button
                        type="button"
                        onClick={() => navigate({ name: 'artist', id: artist.id! })}
                        className="hover:text-white hover:underline truncate"
                      >
                        {artist.name}
                      </button>
                    ) : (
                      <span className="truncate">{artist.name}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggleLike(currentTrack)}
              aria-label={liked ? 'Hapus dari lagu disukai' : 'Sukai lagu'}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                liked ? 'text-[#2EE6A6]' : 'text-white/55 hover:text-white'
              }`}
            >
              <Heart className={`w-4 h-4 ${liked ? 'fill-[#2EE6A6]' : ''}`} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => onAddToPlaylist(currentTrack)}
              aria-label="Simpan ke playlist"
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white/55 hover:text-white transition-colors shrink-0"
            >
              <ListPlus className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-13 h-13 rounded-xl bg-white/[0.05] border border-white/[0.07]" />
            <div>
              <p className="text-sm font-medium text-white/60">SoundClear</p>
              <p className="text-xs text-white/35">Pilih lagu untuk diputar</p>
            </div>
          </div>
        )}
      </div>

      {/* Center: Playback controls & seek bar */}
      <div className="flex flex-col items-center gap-1.5 w-full max-w-xl mx-auto">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleShuffle}
            aria-label="Acak urutan"
            aria-pressed={shuffle}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              shuffle ? 'text-[#2EE6A6]' : 'text-white/55 hover:text-white'
            }`}
          >
            <Shuffle className="w-4 h-4" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={prevTrack}
            disabled={!currentTrack}
            aria-label="Lagu sebelumnya"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white/80 hover:text-white disabled:opacity-35 transition-colors"
          >
            <SkipBack className="w-4 h-4 fill-current" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={togglePlayPause}
            disabled={!currentTrack}
            aria-label={isPlaying ? 'Jeda' : 'Putar'}
            className="w-10 h-10 rounded-full bg-[#2EE6A6] text-[#06130E] flex items-center justify-center hover:brightness-105 active:scale-95 disabled:opacity-40 transition-all"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" strokeWidth={2} />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" strokeWidth={2} />
            )}
          </button>

          <button
            type="button"
            onClick={nextTrack}
            disabled={!currentTrack}
            aria-label="Lagu berikutnya"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white/80 hover:text-white disabled:opacity-35 transition-colors"
          >
            <SkipForward className="w-4 h-4 fill-current" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={cycleRepeat}
            aria-label={`Mode ulang: ${repeat}`}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              repeat !== 'off' ? 'text-[#2EE6A6]' : 'text-white/55 hover:text-white'
            }`}
          >
            <RepeatIcon className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="w-full flex items-center gap-2.5">
          <span className="w-10 text-right text-[11px] text-white/50 tabular-nums">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            aria-label="Posisi pemutaran"
            min={0}
            max={safeDuration || 100}
            step={0.5}
            value={Math.min(currentTime, safeDuration || 100)}
            disabled={!currentTrack || safeDuration <= 0}
            onChange={(e) => requestSeek(Number(e.target.value))}
            style={{
              background: `linear-gradient(to right, #2EE6A6 ${progressPct}%, rgba(255,255,255,0.16) ${progressPct}%)`,
            }}
            className="sc-range flex-1 h-1 rounded-full disabled:opacity-40"
          />
          <span className="w-10 text-[11px] text-white/50 tabular-nums">
            {formatTime(safeDuration)}
          </span>
        </div>
      </div>

      {/* Right: Lyrics, Queue, Panel toggle, Volume */}
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => {
            if (rightPanelOpen && rightPanelTab === 'lyrics') {
              setRightPanelOpen(false);
            } else {
              setRightPanelTab('lyrics');
            }
          }}
          aria-label="Tampilkan lirik"
          title="Lirik"
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
            rightPanelOpen && rightPanelTab === 'lyrics'
              ? 'text-[#2EE6A6] bg-white/[0.08]'
              : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <Mic2 className="w-4 h-4" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={() => {
            if (rightPanelOpen && rightPanelTab === 'queue') {
              setRightPanelOpen(false);
            } else {
              setRightPanelTab('queue');
            }
          }}
          aria-label="Tampilkan antrean"
          title="Antrean"
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
            rightPanelOpen && rightPanelTab === 'queue'
              ? 'text-[#2EE6A6] bg-white/[0.08]'
              : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <ListMusic className="w-4 h-4" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          aria-label={rightPanelOpen ? 'Tutup panel kanan' : 'Buka panel kanan'}
          title={rightPanelOpen ? 'Tutup panel' : 'Buka panel'}
          className="hidden lg:flex w-9 h-9 rounded-lg items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          {rightPanelOpen ? (
            <PanelRightClose className="w-4 h-4" strokeWidth={1.75} />
          ) : (
            <PanelRightOpen className="w-4 h-4" strokeWidth={1.75} />
          )}
        </button>

        <div className="flex items-center gap-2 pl-2">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? 'Nyalakan suara' : 'Bisukan suara'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/65 hover:text-white transition-colors"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4" strokeWidth={1.75} />
            ) : (
              <Volume2 className="w-4 h-4" strokeWidth={1.75} />
            )}
          </button>
          <input
            type="range"
            aria-label="Volume"
            min={0}
            max={100}
            value={effectiveVolume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{
              background: `linear-gradient(to right, #2EE6A6 ${effectiveVolume}%, rgba(255,255,255,0.16) ${effectiveVolume}%)`,
            }}
            className="sc-range w-24 h-1 rounded-full"
          />
        </div>
      </div>
    </footer>
  );
}
