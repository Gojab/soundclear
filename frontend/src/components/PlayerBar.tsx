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
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { MediaItem } from '../types/music';
import { clampYoutubeVolume, PLAYBACK_RATE_OPTIONS } from '../utils/audioMath';
import { hasActiveCustomBackground } from '../utils/backgroundTheme';
import { formatTime, getTrackUniqueId, isLocalTrack } from '../utils/playerLogic';
import { isDesktopNotchHost } from '../utils/notchDesktopBridge';
import {
  closeWindowsExternalNotch,
  openWindowsExternalNotch,
  useExternalPiPState,
} from '../utils/notchExternalPiP';
import {
  isTopLevelBrowsingContext,
  isWindowsPlatform,
  resolveWindowsExternalNotchSupport,
  supportsDocumentPictureInPicture,
  supportsVideoPictureInPicture,
} from '../utils/notchPlayer';
import { useNotchVisibility } from '../utils/useNotchVisibility';
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
  const repeat = usePlayerStore((s) => s.repeat);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const sleepTimerMode = usePlayerStore((s) => s.sleepTimerMode);
  const sleepTimerEndsAt = usePlayerStore((s) => s.sleepTimerEndsAt);
  const sleepTimerMinutes = usePlayerStore((s) => s.sleepTimerMinutes);
  const rightPanelOpen = usePlayerStore((s) => s.rightPanelOpen);
  const rightPanelTab = usePlayerStore((s) => s.rightPanelTab);
  const { desktopNotchVisible } = useNotchVisibility();
  const pipState = useExternalPiPState();
  const externalNotchOpen = pipState.open;
  const windowsSupport = resolveWindowsExternalNotchSupport({
    isWindows: isWindowsPlatform(),
    hasDesktopHost: isDesktopNotchHost(),
    hasDocumentPiP: supportsDocumentPictureInPicture(),
    hasVideoPiP: supportsVideoPictureInPicture(),
    isTopLevel: isTopLevelBrowsingContext(),
  });
  const showToast = useContextMenuStore((s) => s.showToast);
  const activeStreamMeta = usePlayerStore((s) => s.activeStreamMeta);
  const webAudioWarning = usePlayerStore((s) => s.webAudioWarning);

  const youtubeSound = useSettingsStore((s) => s.youtubeSound);
  const customBackground = useSettingsStore((s) => s.customBackground);
  const bgActive = hasActiveCustomBackground(customBackground);
  const glassPanels = bgActive && customBackground.panelGlass;

  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const requestSeek = usePlayerStore((s) => s.requestSeek);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
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
      className={`hidden md:grid grid-cols-[minmax(0,1fr)_auto_auto] lg:grid-cols-[minmax(0,1fr)_minmax(300px,1.2fr)_auto] xl:grid-cols-[minmax(0,1fr)_minmax(380px,1.3fr)_auto] items-center gap-2 lg:gap-4 h-[88px] shrink-0 px-2 lg:px-4 relative z-30 transition-colors duration-300 ${
        glassPanels
          ? 'bg-black/55 backdrop-blur-xl border-t border-[#B3F7D1]/[0.08]'
          : bgActive
            ? 'bg-black/80 backdrop-blur-md'
            : 'bg-black'
      }`}
    >
      {/* Left: Track info */}
      <div className="flex items-center gap-2 min-w-0">
        {currentTrack ? (
          <>
            <button
              type="button"
              onClick={() => setFullscreenNowPlaying(true)}
              aria-label="Buka sedang diputar layar penuh"
              className="shrink-0 min-w-[44px] min-h-[44px] rounded-md overflow-hidden focus-visible:outline-2 focus-visible:outline-[#19EE8A]"
            >
              <ArtworkImage
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                type={currentTrack.type}
                className="w-12 h-12 lg:w-14 lg:h-14"
                roundedClass="rounded-md"
              />
            </button>
            <div className="min-w-0 flex-1 max-w-[200px] xl:max-w-[256px]">
              <p className="text-sm font-semibold text-[#E8FFF3] truncate hover:underline cursor-pointer" onClick={() => setFullscreenNowPlaying(true)}>
                {currentTrack.title}
              </p>
              <div className="flex items-center gap-1 text-xs text-[#B3F7D1]/70 truncate mt-0.5">
                {currentTrack.artists.map((artist, idx) => (
                  <span key={`${artist.name}-${idx}`} className="inline-flex items-center truncate">
                    {idx > 0 && <span className="mr-1">,</span>}
                    {artist.id ? (
                      <button
                        type="button"
                        onClick={() =>
                          navigate({ name: 'artist', id: artist.id!, fallbackQuery: artist.name })
                        }
                        className="hover:text-[#E8FFF3] hover:underline truncate"
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
                <div className="flex items-center gap-2 mt-0.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'settings', tab: 'sound', focusEq: false })}
                    title={`Kualitas termuat: ${activeStreamMeta.badgeLabel}`}
                    className={`text-[10px] font-medium truncate hover:underline ${
                      activeStreamMeta.hiRes
                        ? 'text-[#19EE8A]'
                        : activeStreamMeta.lossless
                          ? 'text-[#0AD36C]'
                          : 'text-[#B3F7D1]/60'
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
              className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center shrink-0"
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                  liked
                    ? 'bg-[#19EE8A] text-[#0F1F17]'
                    : 'border border-[#B3F7D1]/40 text-[#B3F7D1]/75 hover:border-[#19EE8A] hover:text-[#E8FFF3]'
                }`}
              >
                {liked ? (
                  <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                ) : (
                  <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onAddToPlaylist(currentTrack)}
              aria-label="Simpan ke playlist"
              title="Simpan ke playlist"
              className="w-11 h-11 rounded-full flex items-center justify-center text-[#B3F7D1]/60 hover:text-[#E8FFF3] hover:bg-white/[0.06] transition-colors shrink-0"
            >
              <ListPlus className="w-4 h-4" strokeWidth={1.85} />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <img
              src="/soundclear-logo.png"
              alt="SoundClear"
              className="w-12 h-12 rounded-lg object-contain shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#E8FFF3]/80 truncate">SoundClear</p>
              <p className="text-xs text-[#B3F7D1]/50 truncate">Pilih lagu untuk diputar</p>
            </div>
          </div>
        )}
      </div>

      {/* Center: Playback controls & seek bar */}
      <div className="flex flex-col items-center gap-1 w-full max-w-[600px] mx-auto">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleShuffle}
            aria-label="Acak urutan"
            aria-pressed={shuffle}
            title="Acak (S)"
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              shuffle ? 'text-[#19EE8A]' : 'text-[#B3F7D1]/65 hover:text-[#E8FFF3]'
            }`}
          >
            <Shuffle className="w-4 h-4" strokeWidth={2} />
          </button>

          <button
            type="button"
            onClick={prevTrack}
            disabled={!currentTrack}
            aria-label="Lagu sebelumnya"
            className="w-11 h-11 rounded-full flex items-center justify-center text-[#E8FFF3]/80 hover:text-[#E8FFF3] disabled:opacity-35 transition-colors"
          >
            <SkipBack className="w-4.5 h-4.5 fill-current" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={togglePlayPause}
            disabled={!currentTrack}
            aria-label={isPlaying ? 'Jeda' : 'Putar'}
            className="w-11 h-11 rounded-full bg-[#E8FFF3] text-[#0F1F17] flex items-center justify-center hover:scale-105 hover:bg-[#19EE8A] active:scale-95 disabled:opacity-40 transition-all"
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
            className="w-11 h-11 rounded-full flex items-center justify-center text-[#E8FFF3]/80 hover:text-[#E8FFF3] disabled:opacity-35 transition-colors"
          >
            <SkipForward className="w-4.5 h-4.5 fill-current" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            onClick={cycleRepeat}
            aria-label={`Mode ulang: ${repeat}`}
            title="Ulang (R)"
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              repeat !== 'off' ? 'text-[#19EE8A]' : 'text-[#B3F7D1]/65 hover:text-[#E8FFF3]'
            }`}
          >
            <RepeatIcon className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        <div className="w-full flex items-center gap-2">
          <span className="w-10 text-right text-[11px] text-[#B3F7D1]/60 font-mono-num">
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
              background: `linear-gradient(to right, #19EE8A ${progressPct}%, rgba(179,247,209,0.22) ${progressPct}%)`,
            }}
            className="sc-range flex-1 h-1 rounded-full disabled:opacity-40"
          />
          <span className="w-10 text-[11px] text-[#B3F7D1]/60 font-mono-num">
            {formatTime(safeDuration)}
          </span>
        </div>
      </div>

      {/* Right: Lyrics/Karaoke, Queue, Panel toggle, Speaker & Volume, PiP, Fullscreen */}
      <div ref={popoverRef} className="flex items-center justify-end gap-2 relative">
        <button
          type="button"
          onClick={() => navigate({ name: 'settings', tab: 'sound', focusEq: false })}
          aria-label="Buka Pengaturan Audio"
          title="Pengaturan Audio & EQ"
          className="w-11 h-11 rounded-full flex items-center justify-center text-[#B3F7D1]/65 hover:text-[#19EE8A] transition-colors"
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
          className="w-11 h-11 rounded-full flex items-center justify-center text-[#B3F7D1]/65 hover:text-[#E8FFF3] transition-colors"
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
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
            rightPanelOpen && rightPanelTab === 'queue'
              ? 'text-[#19EE8A]'
              : 'text-[#B3F7D1]/65 hover:text-[#E8FFF3]'
          }`}
        >
          <ListMusic className="w-4 h-4" strokeWidth={1.85} />
        </button>

        <button
          type="button"
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          aria-label={rightPanelOpen ? 'Tutup panel kanan' : 'Buka panel kanan'}
          title={rightPanelOpen ? 'Tutup panel sedang diputar' : 'Buka panel sedang diputar'}
          className={`hidden lg:flex w-11 h-11 rounded-full items-center justify-center transition-colors ${
            rightPanelOpen ? 'text-[#19EE8A]' : 'text-[#B3F7D1]/65 hover:text-[#E8FFF3]'
          }`}
        >
          {rightPanelOpen ? (
            <PanelRightClose className="w-4 h-4" strokeWidth={1.85} />
          ) : (
            <PanelRightOpen className="w-4 h-4" strokeWidth={1.85} />
          )}
        </button>

        {/* Speaker Quick Controls + Inline Volume Slider */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSpeakerOpen((v) => !v)}
            aria-label="Kontrol suara cepat"
            aria-expanded={speakerOpen}
            title="Kontrol Suara (Volume, Kecepatan, Sleep Timer, EQ)"
            className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              speakerOpen || sleepTimerMode !== 'off' || playbackRate !== 1
                ? 'text-[#19EE8A]'
                : 'text-[#B3F7D1]/70 hover:text-[#E8FFF3]'
            }`}
          >
            {isMuted || effectiveVolume === 0 ? (
              <VolumeX className="w-4 h-4" strokeWidth={1.85} />
            ) : (
              <Volume2 className="w-4 h-4" strokeWidth={1.85} />
            )}
            {remainingSleepMin && (
              <span className="absolute top-1 right-1 text-[9px] font-semibold bg-[#19EE8A] text-[#0F1F17] px-1 rounded font-mono-num">
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
              background: `linear-gradient(to right, #19EE8A ${(effectiveVolume / maxVolumeCap) * 100}%, rgba(179,247,209,0.22) ${(effectiveVolume / maxVolumeCap) * 100}%)`,
            }}
            className="sc-range hidden lg:block lg:w-20 xl:w-24 h-1 rounded-full"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            if (windowsSupport.mode === 'document-pip' || windowsSupport.mode === 'video-pip') {
              if (externalNotchOpen) {
                closeWindowsExternalNotch();
              } else {
                void openWindowsExternalNotch().then((res) => {
                  if (!res.ok) {
                    showToast(
                      res.reason === 'windows-only'
                        ? 'Pemutar mini eksternal hanya tersedia khusus untuk Windows.'
                        : 'Gagal membuka jendela pemutar mini Windows. Pastikan izin Picture-in-Picture browser aktif.',
                    );
                  }
                });
              }
              return;
            }
            if (windowsSupport.mode === 'desktop-ipc') {
              setFloatingMiniOpen(!desktopNotchVisible);
              return;
            }
            showToast(
              windowsSupport.reason === 'windows-only'
                ? 'Pemutar mini eksternal (keluar dari web) hanya tersedia khusus untuk Windows.'
                : 'Browser Windows ini belum mendukung jendela Picture-in-Picture. Gunakan Chrome/Edge terbaru atau SoundClear Desktop Windows.',
            );
          }}
          disabled={!currentTrack}
          aria-label={
            windowsSupport.mode === 'document-pip' || windowsSupport.mode === 'video-pip'
              ? externalNotchOpen
                ? 'Tutup pemutar mini eksternal Windows'
                : 'Keluarkan pemutar mini ke luar web (Khusus Windows)'
              : windowsSupport.mode === 'desktop-ipc'
                ? desktopNotchVisible
                  ? 'Sembunyikan pemutar mini Windows Desktop'
                  : 'Tampilkan pemutar mini Windows Desktop'
                : 'Pemutar mini eksternal (Khusus Windows)'
          }
          aria-pressed={
            windowsSupport.mode === 'document-pip' || windowsSupport.mode === 'video-pip'
              ? externalNotchOpen
              : windowsSupport.mode === 'desktop-ipc'
                ? desktopNotchVisible
                : false
          }
          title={
            windowsSupport.allowed
              ? 'Keluarkan Pemutar Mini ke Luar Web (Khusus Windows)'
              : 'Pemutar Mini Eksternal (Khusus Windows)'
          }
          className={`hidden md:flex w-11 h-11 rounded-full items-center justify-center transition-colors disabled:opacity-35 ${
            externalNotchOpen || desktopNotchVisible
              ? 'text-[#19EE8A]'
              : windowsSupport.allowed
                ? 'text-[#B3F7D1]/65 hover:text-[#E8FFF3]'
                : 'text-[#B3F7D1]/35 hover:text-[#B3F7D1]/65'
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
          className="hidden xl:flex w-11 h-11 rounded-full items-center justify-center text-[#B3F7D1]/65 hover:text-[#E8FFF3] disabled:opacity-35 transition-colors"
        >
          <Maximize2 className="w-4 h-4" strokeWidth={1.85} />
        </button>

        {/* Speaker Quick Controls Popover */}
        {speakerOpen && (
          <div
            role="dialog"
            aria-label="Kontrol suara cepat"
            className="absolute right-0 bottom-16 z-50 w-72 rounded-xl p-4 bg-[#0B0F0D]/85 backdrop-blur-2xl border border-white/[0.14] shadow-2xl space-y-4 text-xs"
          >
            {/* Volume & Mute */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[#E8FFF3]">Volume</span>
                <div className="flex items-center gap-2">
                  <span className="text-[#19EE8A] font-mono-num">{effectiveVolume}%</span>
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-pressed={isMuted}
                    className={`inline-flex items-center gap-1 min-h-[36px] px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                      isMuted
                        ? 'bg-[#19EE8A] text-[#0F1F17]'
                        : 'bg-white/[0.08] border border-white/[0.1] text-[#E8FFF3]/85 hover:bg-white/[0.14] hover:text-[#E8FFF3]'
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
                  background: `linear-gradient(to right, #19EE8A ${(effectiveVolume / maxVolumeCap) * 100}%, rgba(179,247,209,0.2) ${(effectiveVolume / maxVolumeCap) * 100}%)`,
                }}
                className="sc-range w-full h-1.5 rounded-full"
              />
            </div>

            {/* Playback Speed */}
            <div className="space-y-2 pt-4 border-t border-[#B3F7D1]/[0.1]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#E8FFF3]">Kecepatan Putar</span>
                <span className="text-[#19EE8A] font-mono-num">{playbackRate}x</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {PLAYBACK_RATE_OPTIONS.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setPlaybackRate(rate)}
                    className={`min-h-[36px] py-1 rounded-lg text-[11px] font-medium font-mono-num transition-colors ${
                      playbackRate === rate
                        ? 'bg-[#19EE8A] text-[#0F1F17] font-semibold'
                        : 'bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] text-[#B3F7D1]/80 hover:text-[#E8FFF3]'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            {/* Sleep Timer */}
            <div className="space-y-2 pt-4 border-t border-[#B3F7D1]/[0.1]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#E8FFF3] inline-flex items-center gap-2">
                  <Moon className="w-3.5 h-3.5 text-[#B3F7D1]/65" strokeWidth={1.8} />
                  Sleep Timer
                </span>
                <span className="text-[11px] text-[#19EE8A] font-mono-num">
                  {sleepTimerMode === 'end_of_track'
                    ? 'Akhir lagu'
                    : remainingSleepMin
                      ? `${remainingSleepMin} mnt`
                      : 'Mati'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSleepTimer('off')}
                  className={`min-h-[36px] py-1 rounded-lg text-[11px] font-medium ${
                    sleepTimerMode === 'off'
                      ? 'bg-[#19EE8A] text-[#0F1F17] font-semibold'
                      : 'bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] text-[#B3F7D1]/80 hover:text-[#E8FFF3]'
                  }`}
                >
                  Mati
                </button>
                {[15, 30, 45, 60].map((min) => {
                  const active = sleepTimerMode === 'minutes' && sleepTimerMinutes === min;
                  return (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setSleepTimer('minutes', min)}
                      aria-pressed={active}
                      className={`min-h-[36px] py-1 rounded-lg text-[11px] font-medium font-mono-num ${
                        active
                          ? 'bg-[#19EE8A] text-[#0F1F17] font-semibold'
                          : 'bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] text-[#B3F7D1]/80 hover:text-[#E8FFF3]'
                      }`}
                    >
                      {min}m
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setSleepTimer('end_of_track')}
                  className={`min-h-[36px] py-1 rounded-lg text-[11px] font-medium ${
                    sleepTimerMode === 'end_of_track'
                      ? 'bg-[#19EE8A] text-[#0F1F17] font-semibold'
                      : 'bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] text-[#B3F7D1]/80 hover:text-[#E8FFF3]'
                  }`}
                >
                  Akhir
                </button>
              </div>
            </div>

            {/* Pengaturan Audio & EQ button (always accessible) */}
            <div className="pt-4 border-t border-[#B3F7D1]/[0.1] space-y-2">
              {activeStreamMeta && (
                <div className="flex items-center justify-between text-[11px] text-[#B3F7D1]/70">
                  <span>Stream aktif</span>
                  <span className="font-mono-num text-[#E8FFF3] truncate max-w-[165px]">
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
                className="w-full min-h-[44px] flex items-center justify-center gap-2 py-2 px-4 rounded-full bg-sc-gradient text-[#0F1F17] font-semibold hover:brightness-105 transition-all"
              >
                <Sliders className="w-3.5 h-3.5" strokeWidth={2} />
                <span>Pengaturan Audio &amp; EQ</span>
              </button>
              {webAudioWarning && (
                <p className="text-[11px] text-[#19EE8A]/90 text-center leading-relaxed max-w-[65ch]">
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
