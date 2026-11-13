import { useEffect, useRef, useState } from 'react';
import {
  Check,
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
  Plus,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { MediaItem } from '../types/music';
import { clampYoutubeVolume, PLAYBACK_RATE_OPTIONS } from '../utils/audioMath';
import { formatTime, getTrackUniqueId, isLocalTrack } from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';

interface PlayerBarProps {
  onAddToPlaylist: (track: MediaItem) => void;
}

export function PlayerBar({ onAddToPlaylist }: PlayerBarProps) {
  const [speakerOpen, setSpeakerOpen] = useState(false);
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
  const sleepTimerMode = usePlayerStore((s) => s.sleepTimerMode);
  const sleepTimerEndsAt = usePlayerStore((s) => s.sleepTimerEndsAt);
  const rightPanelOpen = usePlayerStore((s) => s.rightPanelOpen);
  const rightPanelTab = usePlayerStore((s) => s.rightPanelTab);
  const floatingMiniOpen = usePlayerStore((s) => s.floatingMiniOpen);
  const activeStreamMeta = usePlayerStore((s) => s.activeStreamMeta);
  const webAudioWarning = usePlayerStore((s) => s.webAudioWarning);

  const youtubeSound = useSettingsStore((s) => s.youtubeSound);

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
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);
  const setRightPanelOpen = usePlayerStore((s) => s.setRightPanelOpen);
  const setRightPanelTab = usePlayerStore((s) => s.setRightPanelTab);
  const setKaraokeOpen = usePlayerStore((s) => s.setKaraokeOpen);
  const setFullscreenNowPlaying = usePlayerStore((s) => s.setFullscreenNowPlaying);
  const setFloatingMiniOpen = usePlayerStore((s) => s.setFloatingMiniOpen);

  const navigate = useNavigationStore((s) => s.navigate);

  const trackKey = getTrackUniqueId(currentTrack);
  const liked = useLibraryStore((s) => s.isLiked(trackKey));
  const toggleLike = useLibraryStore((s) => s.toggleLike);

  useEffect(() => {
    if (!speakerOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setSpeakerOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [speakerOpen]);

  const localPlaying = isLocalTrack(currentTrack);
  const maxVolumeCap = localPlaying ? 100 : youtubeSound.maxVolumeLimit;
  const effectiveVolume = localPlaying
    ? isMuted
      ? 0
      : Math.min(100, volume)
    : clampYoutubeVolume(volume, youtubeSound.maxVolumeLimit, isMuted);

  const safeDuration = duration > 0 ? duration : currentTrack?.durationSeconds || 0;
  const progressPct =
    safeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / safeDuration) * 100)) : 0;
  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;

  const remainingSleepMin =
    sleepTimerMode === 'minutes' && sleepTimerEndsAt
      ? Math.max(1, Math.ceil((sleepTimerEndsAt - Date.now()) / 60000))
      : null;

  return (
    <footer
      aria-label="Pemutar musik"
      className="hidden md:grid grid-cols-[minmax(0,1fr)_minmax(360px,1.45fr)_minmax(0,1fr)] items-center gap-4 h-[84px] shrink-0 bg-black px-4 relative z-30"
    >
      {/* Left: Track info */}
      <div className="flex items-center gap-3 min-w-0">
        {currentTrack ? (
          <>
            <button
              type="button"
              onClick={() => setFullscreenNowPlaying(true)}
              aria-label="Buka sedang diputar layar penuh"
              className="shrink-0 rounded-md overflow-hidden focus-visible:outline-2 focus-visible:outline-[#2EE6A6]"
            >
              <ArtworkImage
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                type={currentTrack.type}
                className="w-14 h-14"
                roundedClass="rounded-md"
              />
            </button>
            <div className="min-w-0 max-w-[210px] xl:max-w-[250px]">
              <p className="text-sm font-semibold text-white truncate hover:underline cursor-pointer" onClick={() => setFullscreenNowPlaying(true)}>
                {currentTrack.title}
              </p>
              <div className="flex items-center gap-1 text-xs text-white/60 truncate mt-0.5">
                {currentTrack.artists.map((artist, idx) => (
                  <span key={`${artist.name}-${idx}`} className="inline-flex items-center truncate">
                    {idx > 0 && <span className="mr-1">,</span>}
                    {artist.id ? (
                      <button
                        type="button"
                        onClick={() =>
                          navigate({ name: 'artist', id: artist.id!, fallbackQuery: artist.name })
                        }
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
              {activeStreamMeta && (
                <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'settings', tab: 'sound', focusEq: false })}
                    title={`Kualitas termuat: ${activeStreamMeta.badgeLabel}`}
                    className={`text-[10px] font-medium truncate hover:underline ${
                      activeStreamMeta.hiRes
                        ? 'text-[#F5C451]'
                        : activeStreamMeta.lossless
                          ? 'text-[#2EE6A6]'
                          : 'text-white/55'
                    }`}
                  >
                    {activeStreamMeta.badgeLabel}
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => toggleLike(currentTrack)}
              aria-label={liked ? 'Hapus dari lagu disukai' : 'Sukai lagu'}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0 ml-1 ${
                liked
                  ? 'bg-[#2EE6A6] text-[#06130E]'
                  : 'border border-white/40 text-white/75 hover:border-white hover:text-white'
              }`}
            >
              {liked ? (
                <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
              ) : (
                <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
              )}
            </button>
            <button
              type="button"
              onClick={() => onAddToPlaylist(currentTrack)}
              aria-label="Simpan ke playlist"
              title="Simpan ke playlist"
              className="w-7 h-7 rounded-full flex items-center justify-center text-white/55 hover:text-white transition-colors shrink-0"
            >
              <ListPlus className="w-4 h-4" strokeWidth={1.85} />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-md bg-[#181818]" />
            <div>
              <p className="text-sm font-semibold text-white/70">SoundClear</p>
              <p className="text-xs text-white/40">Pilih lagu untuk diputar</p>
            </div>
          </div>
        )}
      </div>

      {/* Center: Playback controls & seek bar */}
      <div className="flex flex-col items-center gap-1.5 w-full max-w-[600px] mx-auto">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggleShuffle}
            aria-label="Acak urutan"
            aria-pressed={shuffle}
            title="Acak (S)"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              shuffle ? 'text-[#2EE6A6]' : 'text-white/60 hover:text-white'
            }`}
          >
            <Shuffle className="w-4 h-4" strokeWidth={2} />
          </button>

          <button
            type="button"
            onClick={toggleSmartShuffle}
            aria-label="Acak pintar"
            aria-pressed={smartShuffle}
            title="Acak Pintar (sisipkan rekomendasi radio)"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              smartShuffle ? 'text-[#2EE6A6]' : 'text-white/50 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
          </button>

          <button
            type="button"
            onClick={prevTrack}
            disabled={!currentTrack}
            aria-label="Lagu sebelumnya"
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/75 hover:text-white disabled:opacity-35 transition-colors"
          >
            <SkipBack className="w-4.5 h-4.5 fill-current" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={togglePlayPause}
            disabled={!currentTrack}
            aria-label={isPlaying ? 'Jeda' : 'Putar'}
            className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 disabled:opacity-40 transition-transform"
          >
            {isPlaying ? (
              <Pause className="w-4.5 h-4.5 fill-current" strokeWidth={2} />
            ) : (
              <Play className="w-4.5 h-4.5 fill-current ml-0.5" strokeWidth={2} />
            )}
          </button>

          <button
            type="button"
            onClick={nextTrack}
            disabled={!currentTrack}
            aria-label="Lagu berikutnya"
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/75 hover:text-white disabled:opacity-35 transition-colors"
          >
            <SkipForward className="w-4.5 h-4.5 fill-current" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={cycleRepeat}
            aria-label={`Mode ulang: ${repeat}`}
            title="Ulang (R)"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              repeat !== 'off' ? 'text-[#2EE6A6]' : 'text-white/60 hover:text-white'
            }`}
          >
            <RepeatIcon className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        <div className="w-full flex items-center gap-2.5">
          <span className="w-10 text-right text-[11px] text-white/55 font-mono-num">
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
              background: `linear-gradient(to right, #ffffff ${progressPct}%, rgba(255,255,255,0.22) ${progressPct}%)`,
            }}
            className="sc-range flex-1 h-1 rounded-full disabled:opacity-40"
          />
          <span className="w-10 text-[11px] text-white/55 font-mono-num">
            {formatTime(safeDuration)}
          </span>
        </div>
      </div>

      {/* Right: Lyrics/Karaoke, Queue, Panel toggle, Speaker & Volume, PiP, Fullscreen */}
      <div ref={popoverRef} className="flex items-center justify-end gap-1 relative">
        <button
          type="button"
          onClick={() => navigate({ name: 'settings', tab: 'sound', focusEq: false })}
          aria-label="Buka Pengaturan Audio"
          title="Pengaturan Audio & EQ"
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/65 hover:text-[#2EE6A6] transition-colors"
        >
          <Sliders className="w-4 h-4" strokeWidth={1.85} />
        </button>

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
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/65 hover:text-white transition-colors"
        >
          <Mic2 className="w-4 h-4" strokeWidth={1.85} />
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
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
            rightPanelOpen && rightPanelTab === 'queue'
              ? 'text-[#2EE6A6]'
              : 'text-white/65 hover:text-white'
          }`}
        >
          <ListMusic className="w-4 h-4" strokeWidth={1.85} />
        </button>

        <button
          type="button"
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          aria-label={rightPanelOpen ? 'Tutup panel kanan' : 'Buka panel kanan'}
          title={rightPanelOpen ? 'Tutup panel sedang diputar' : 'Buka panel sedang diputar'}
          className={`hidden lg:flex w-8 h-8 rounded-full items-center justify-center transition-colors ${
            rightPanelOpen ? 'text-[#2EE6A6]' : 'text-white/65 hover:text-white'
          }`}
        >
          {rightPanelOpen ? (
            <PanelRightClose className="w-4 h-4" strokeWidth={1.85} />
          ) : (
            <PanelRightOpen className="w-4 h-4" strokeWidth={1.85} />
          )}
        </button>

        {/* Speaker Quick Controls + Inline Volume Slider */}
        <div className="flex items-center gap-1.5 pl-0.5">
          <button
            type="button"
            onClick={() => setSpeakerOpen((v) => !v)}
            aria-label="Kontrol suara cepat"
            aria-expanded={speakerOpen}
            title="Kontrol Suara (Volume, Kecepatan, Sleep Timer, EQ)"
            className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              speakerOpen || sleepTimerMode !== 'off' || playbackRate !== 1
                ? 'text-[#2EE6A6]'
                : 'text-white/70 hover:text-white'
            }`}
          >
            {isMuted || effectiveVolume === 0 ? (
              <VolumeX className="w-4 h-4" strokeWidth={1.85} />
            ) : (
              <Volume2 className="w-4 h-4" strokeWidth={1.85} />
            )}
            {remainingSleepMin && (
              <span className="absolute -top-0.5 -right-0.5 text-[9px] font-semibold bg-[#2EE6A6] text-[#06130E] px-1 rounded font-mono-num">
                {remainingSleepMin}
              </span>
            )}
          </button>

          <input
            type="range"
            aria-label="Volume"
            min={0}
            max={maxVolumeCap}
            value={effectiveVolume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{
              background: `linear-gradient(to right, #ffffff ${(effectiveVolume / maxVolumeCap) * 100}%, rgba(255,255,255,0.22) ${(effectiveVolume / maxVolumeCap) * 100}%)`,
            }}
            className="sc-range w-24 h-1 rounded-full"
          />
        </div>

        <button
          type="button"
          onClick={() => setFloatingMiniOpen(!floatingMiniOpen)}
          disabled={!currentTrack}
          aria-label="Pemutar mini desktop"
          title="Pemutar Mini / PiP"
          className={`hidden xl:flex w-8 h-8 rounded-full items-center justify-center transition-colors disabled:opacity-35 ${
            floatingMiniOpen ? 'text-[#2EE6A6]' : 'text-white/65 hover:text-white'
          }`}
        >
          <PictureInPicture2 className="w-4 h-4" strokeWidth={1.85} />
        </button>

        <button
          type="button"
          onClick={() => setFullscreenNowPlaying(true)}
          disabled={!currentTrack}
          aria-label="Sedang diputar layar penuh"
          title="Layar Penuh"
          className="hidden xl:flex w-8 h-8 rounded-full items-center justify-center text-white/65 hover:text-white disabled:opacity-35 transition-colors"
        >
          <Maximize2 className="w-4 h-4" strokeWidth={1.85} />
        </button>

        {/* Speaker Quick Controls Popover */}
        {speakerOpen && (
          <div
            role="dialog"
            aria-label="Kontrol suara cepat"
            className="absolute right-0 bottom-16 z-50 w-72 rounded-xl p-4 bg-[#1F1F1F] border border-white/[0.12] shadow-2xl space-y-3 text-xs"
          >
            {/* Volume & Mute */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white/90">Volume</span>
                <div className="flex items-center gap-2">
                  <span className="text-[#2EE6A6] font-mono-num">{effectiveVolume}%</span>
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-pressed={isMuted}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                      isMuted
                        ? 'bg-[#2EE6A6] text-[#06130E]'
                        : 'bg-white/[0.1] text-white/85 hover:text-white'
                    }`}
                  >
                    {isMuted ? (
                      <>
                        <VolumeX className="w-3 h-3" strokeWidth={1.8} />
                        Dibisukan
                      </>
                    ) : (
                      'Bisu'
                    )}
                  </button>
                </div>
              </div>
              <input
                type="range"
                aria-label="Pengatur volume cepat"
                min={0}
                max={maxVolumeCap}
                value={effectiveVolume}
                onChange={(e) => setVolume(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #2EE6A6 ${(effectiveVolume / maxVolumeCap) * 100}%, rgba(255,255,255,0.2) ${(effectiveVolume / maxVolumeCap) * 100}%)`,
                }}
                className="sc-range w-full h-1.5 rounded-full"
              />
            </div>

            {/* Playback Speed */}
            <div className="space-y-1.5 pt-2.5 border-t border-white/[0.08]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white/90">Kecepatan Putar</span>
                <span className="text-[#2EE6A6] font-mono-num">{playbackRate}x</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {PLAYBACK_RATE_OPTIONS.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setPlaybackRate(rate)}
                    className={`py-1 rounded-lg text-[11px] font-medium font-mono-num transition-colors ${
                      playbackRate === rate
                        ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                        : 'bg-white/[0.07] text-white/80 hover:text-white'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            {/* Sleep Timer */}
            <div className="space-y-1.5 pt-2.5 border-t border-white/[0.08]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white/90 inline-flex items-center gap-1.5">
                  <Moon className="w-3.5 h-3.5 text-white/60" strokeWidth={1.8} />
                  Sleep Timer
                </span>
                <span className="text-[11px] text-[#2EE6A6] font-mono-num">
                  {sleepTimerMode === 'end_of_track'
                    ? 'Akhir lagu'
                    : remainingSleepMin
                      ? `${remainingSleepMin} mnt`
                      : 'Mati'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => setSleepTimer('off')}
                  className={`py-1 rounded-lg text-[11px] font-medium ${
                    sleepTimerMode === 'off'
                      ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                      : 'bg-white/[0.07] text-white/80 hover:text-white'
                  }`}
                >
                  Mati
                </button>
                {[15, 30, 45, 60].map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setSleepTimer('minutes', min)}
                    className="py-1 rounded-lg text-[11px] font-medium bg-white/[0.07] text-white/80 hover:text-white font-mono-num"
                  >
                    {min}m
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSleepTimer('end_of_track')}
                  className={`py-1 rounded-lg text-[11px] font-medium ${
                    sleepTimerMode === 'end_of_track'
                      ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                      : 'bg-white/[0.07] text-white/80 hover:text-white'
                  }`}
                >
                  Akhir
                </button>
              </div>
            </div>

            {/* Pengaturan Audio & EQ button (always accessible) */}
            <div className="pt-2.5 border-t border-white/[0.08] space-y-1.5">
              {activeStreamMeta && (
                <div className="flex items-center justify-between text-[11px] text-white/65">
                  <span>Stream aktif</span>
                  <span className="font-mono-num text-white/90 truncate max-w-[165px]">
                    {activeStreamMeta.badgeLabel}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setSpeakerOpen(false);
                  navigate({ name: 'settings', tab: 'sound', focusEq: false });
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-full bg-[#2EE6A6] text-[#06130E] font-semibold hover:brightness-105 transition-colors"
              >
                <Sliders className="w-3.5 h-3.5" strokeWidth={2} />
                <span>Pengaturan Audio &amp; EQ</span>
              </button>
              {webAudioWarning && (
                <p className="text-[11px] text-[#2EE6A6]/85 text-center leading-snug">
                  {webAudioWarning}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </footer>
  );
}
