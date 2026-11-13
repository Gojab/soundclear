import { useEffect, useRef, useState } from 'react';
import {
  Heart,
  Keyboard,
  ListMusic,
  ListPlus,
  Maximize2,
  Mic2,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
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

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];

export function PlayerBar({ onAddToPlaylist }: PlayerBarProps) {
  const [openMenu, setOpenMenu] = useState<'sleep' | 'audio' | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const smartShuffle = usePlayerStore((s) => s.smartShuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const crossfadeSeconds = usePlayerStore((s) => s.crossfadeSeconds);
  const sleepTimerMode = usePlayerStore((s) => s.sleepTimerMode);
  const sleepTimerEndsAt = usePlayerStore((s) => s.sleepTimerEndsAt);
  const rightPanelOpen = usePlayerStore((s) => s.rightPanelOpen);
  const rightPanelTab = usePlayerStore((s) => s.rightPanelTab);
  const floatingMiniOpen = usePlayerStore((s) => s.floatingMiniOpen);

  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const requestSeek = usePlayerStore((s) => s.requestSeek);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const toggleSmartShuffle = usePlayerStore((s) => s.toggleSmartShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const setCrossfadeSeconds = usePlayerStore((s) => s.setCrossfadeSeconds);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);
  const setRightPanelOpen = usePlayerStore((s) => s.setRightPanelOpen);
  const setRightPanelTab = usePlayerStore((s) => s.setRightPanelTab);
  const setKaraokeOpen = usePlayerStore((s) => s.setKaraokeOpen);
  const setFullscreenNowPlaying = usePlayerStore((s) => s.setFullscreenNowPlaying);
  const setFloatingMiniOpen = usePlayerStore((s) => s.setFloatingMiniOpen);

  const navigate = useNavigationStore((s) => s.navigate);

  const trackKey = currentTrack ? getPlayableVideoId(currentTrack) || currentTrack.id : null;
  const liked = useLibraryStore((s) => s.isLiked(trackKey));
  const toggleLike = useLibraryStore((s) => s.toggleLike);

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [openMenu]);

  const safeDuration = duration > 0 ? duration : currentTrack?.durationSeconds || 0;
  const progressPct =
    safeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / safeDuration) * 100)) : 0;
  const effectiveVolume = isMuted ? 0 : volume;
  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;

  const remainingSleepMin =
    sleepTimerMode === 'minutes' && sleepTimerEndsAt
      ? Math.max(1, Math.ceil((sleepTimerEndsAt - Date.now()) / 60000))
      : null;

  return (
    <footer
      aria-label="Pemutar musik"
      className="hidden md:grid grid-cols-[minmax(0,1fr)_minmax(340px,1.35fr)_minmax(0,1.1fr)] items-center gap-3 h-[84px] shrink-0 glass-panel rounded-2xl px-4 relative"
    >
      {/* Left: Track info */}
      <div className="flex items-center gap-3 min-w-0">
        {currentTrack ? (
          <>
            <button
              type="button"
              onClick={() => setFullscreenNowPlaying(true)}
              aria-label="Buka sedang diputar layar penuh"
              className="shrink-0 rounded-xl overflow-hidden focus-visible:outline-2 focus-visible:outline-[#2EE6A6]"
            >
              <ArtworkImage
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                type={currentTrack.type}
                className="w-13 h-13"
                roundedClass="rounded-xl"
              />
            </button>
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
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                liked ? 'text-[#2EE6A6]' : 'text-white/55 hover:text-white'
              }`}
            >
              <Heart className={`w-4 h-4 ${liked ? 'fill-[#2EE6A6]' : ''}`} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => onAddToPlaylist(currentTrack)}
              aria-label="Simpan ke playlist"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white/55 hover:text-white transition-colors shrink-0"
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleShuffle}
            aria-label="Acak urutan"
            aria-pressed={shuffle}
            title="Acak (S)"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              shuffle ? 'text-[#2EE6A6]' : 'text-white/55 hover:text-white'
            }`}
          >
            <Shuffle className="w-4 h-4" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={toggleSmartShuffle}
            aria-label="Acak pintar"
            aria-pressed={smartShuffle}
            title="Acak Pintar (sisipkan rekomendasi radio)"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              smartShuffle ? 'text-[#2EE6A6] bg-[#2EE6A6]/10' : 'text-white/50 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
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
            title="Ulang (R)"
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

      {/* Right: Lyrics/Karaoke, Queue, Sleep Timer, Audio Controls, PiP/Fullscreen, Volume */}
      <div ref={popoverRef} className="flex items-center justify-end gap-1 relative">
        <button
          type="button"
          onClick={() => {
            if (currentTrack) {
              setKaraokeOpen(true);
            } else {
              setRightPanelTab('lyrics');
            }
          }}
          aria-label="Buka mode karaoke lirik"
          title="Lirik Karaoke (L)"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
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
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            rightPanelOpen && rightPanelTab === 'queue'
              ? 'text-[#2EE6A6] bg-white/[0.08]'
              : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <ListMusic className="w-4 h-4" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={() => setOpenMenu(openMenu === 'sleep' ? null : 'sleep')}
          aria-label="Pengatur waktu tidur"
          title="Sleep Timer"
          className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            sleepTimerMode !== 'off'
              ? 'text-[#2EE6A6] bg-white/[0.08]'
              : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <Moon className="w-4 h-4" strokeWidth={1.75} />
          {remainingSleepMin && (
            <span className="absolute -top-1 -right-1 text-[9px] font-semibold bg-[#2EE6A6] text-[#06130E] px-1 rounded tabular-nums">
              {remainingSleepMin}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setOpenMenu(openMenu === 'audio' ? null : 'audio')}
          aria-label="Kecepatan putar dan fade antar lagu"
          title="Kecepatan & Fade"
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            playbackRate !== 1 || crossfadeSeconds > 0
              ? 'text-[#2EE6A6] bg-white/[0.08]'
              : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={() => setFloatingMiniOpen(!floatingMiniOpen)}
          disabled={!currentTrack}
          aria-label="Pemutar mini desktop"
          title="Pemutar Mini / PiP"
          className={`hidden xl:flex w-8 h-8 rounded-lg items-center justify-center transition-colors disabled:opacity-35 ${
            floatingMiniOpen
              ? 'text-[#2EE6A6] bg-white/[0.08]'
              : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <PictureInPicture2 className="w-4 h-4" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={() => setFullscreenNowPlaying(true)}
          disabled={!currentTrack}
          aria-label="Sedang diputar layar penuh"
          title="Layar Penuh"
          className="hidden xl:flex w-8 h-8 rounded-lg items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.06] disabled:opacity-35 transition-colors"
        >
          <Maximize2 className="w-4 h-4" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={() => navigate({ name: 'shortcuts' })}
          aria-label="Daftar pintasan keyboard"
          title="Pintasan Keyboard (?)"
          className="hidden xl:flex w-8 h-8 rounded-lg items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <Keyboard className="w-4 h-4" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          aria-label={rightPanelOpen ? 'Tutup panel kanan' : 'Buka panel kanan'}
          title={rightPanelOpen ? 'Tutup panel' : 'Buka panel'}
          className="hidden lg:flex w-8 h-8 rounded-lg items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          {rightPanelOpen ? (
            <PanelRightClose className="w-4 h-4" strokeWidth={1.75} />
          ) : (
            <PanelRightOpen className="w-4 h-4" strokeWidth={1.75} />
          )}
        </button>

        <div className="flex items-center gap-1.5 pl-1">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? 'Nyalakan suara' : 'Bisukan suara'}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/65 hover:text-white transition-colors"
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
            className="sc-range w-20 h-1 rounded-full"
          />
        </div>

        {/* Sleep Timer Popover */}
        {openMenu === 'sleep' && (
          <div
            role="dialog"
            aria-label="Sleep Timer"
            className="absolute right-12 bottom-16 z-50 w-52 glass-panel rounded-xl p-2 bg-[#141418]/95 border border-white/[0.12] shadow-2xl space-y-1 text-xs"
          >
            <p className="px-2 py-1 font-semibold text-white/75">Sleep Timer</p>
            {[15, 30, 45, 60].map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => {
                  setSleepTimer('minutes', min);
                  setOpenMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-white/80 hover:bg-white/[0.08] tabular-nums"
              >
                {min} menit
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setSleepTimer('end_of_track');
                setOpenMenu(null);
              }}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] ${
                sleepTimerMode === 'end_of_track' ? 'text-[#2EE6A6] font-semibold' : 'text-white/80'
              }`}
            >
              Akhir lagu ini
            </button>
            {sleepTimerMode !== 'off' && (
              <button
                type="button"
                onClick={() => {
                  setSleepTimer('off');
                  setOpenMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-red-300 hover:bg-red-500/15"
              >
                Matikan timer
              </button>
            )}
          </div>
        )}

        {/* Playback Rate & Crossfade Popover */}
        {openMenu === 'audio' && (
          <div
            role="dialog"
            aria-label="Kecepatan putar dan fade"
            className="absolute right-8 bottom-16 z-50 w-60 glass-panel rounded-xl p-3 bg-[#141418]/95 border border-white/[0.12] shadow-2xl space-y-3 text-xs"
          >
            <div className="space-y-1.5">
              <p className="font-semibold text-white/75">Kecepatan Putar</p>
              <div className="grid grid-cols-5 gap-1">
                {PLAYBACK_RATES.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setPlaybackRate(rate)}
                    className={`py-1.5 rounded-lg text-[11px] font-medium tabular-nums transition-colors ${
                      playbackRate === rate
                        ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                        : 'bg-white/[0.06] text-white/75 hover:text-white'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-white/75">Fade Antar Lagu</p>
                <span className="text-[#2EE6A6] tabular-nums">{crossfadeSeconds} dtk</span>
              </div>
              <input
                type="range"
                aria-label="Durasi fade antar lagu"
                min={0}
                max={12}
                step={1}
                value={crossfadeSeconds}
                onChange={(e) => setCrossfadeSeconds(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #2EE6A6 ${(crossfadeSeconds / 12) * 100}%, rgba(255,255,255,0.16) ${(crossfadeSeconds / 12) * 100}%)`,
                }}
                className="sc-range w-full h-1 rounded-full"
              />
            </div>
          </div>
        )}
      </div>
    </footer>
  );
}
