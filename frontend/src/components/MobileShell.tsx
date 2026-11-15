import { useRef, useState } from 'react';
import {
  Ban,
  BarChart3,
  Check,
  ChevronDown,
  Compass,
  Disc3,
  Heart,
  Home,
  Library,
  ListMusic,
  ListPlus,
  MonitorSpeaker,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  PlusCircle,
  Search,
  Share,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  Timer,
  X,
} from 'lucide-react';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { MediaItem } from '../types/music';
import { hasActiveCustomBackground } from '../utils/backgroundTheme';
import {
  formatArtists,
  formatNegativeRemaining,
  formatTime,
  getPlayableVideoId,
  getTrackUniqueId,
} from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';
import { LyricsPreviewCard } from './LyricsPreviewCard';
import { QueueView } from './QueueView';
import { TrackActionSheet } from './TrackActionSheet';

interface MobileShellProps {
  onAddToPlaylist: (track: MediaItem) => void;
  onOpenCreatePlaylist: () => void;
}

export function MobileShell({ onAddToPlaylist, onOpenCreatePlaylist }: MobileShellProps) {
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [actionSheetSubView, setActionSheetSubView] = useState<'main' | 'sleep' | 'code'>('main');
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false);
  const touchStartYRef = useRef<number | null>(null);

  const currentRoute = useNavigationStore((s) => s.currentRoute);
  const navigate = useNavigationStore((s) => s.navigate);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const sourceLabel = usePlayerStore((s) => s.sourceLabel);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const sleepTimerMode = usePlayerStore((s) => s.sleepTimerMode);
  const ambientColor = usePlayerStore((s) => s.ambientColor);
  const mobileExpanded = usePlayerStore((s) => s.mobileExpanded);

  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const requestSeek = usePlayerStore((s) => s.requestSeek);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const setMobileExpanded = usePlayerStore((s) => s.setMobileExpanded);
  const setKaraokeOpen = usePlayerStore((s) => s.setKaraokeOpen);

  const trackKey = getTrackUniqueId(currentTrack);
  const liked = useLibraryStore((s) => s.isLiked(trackKey));
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const excludeFromTaste = useLibraryStore((s) => s.excludeFromTaste);

  const showToast = useContextMenuStore((s) => s.showToast);
  const customBackground = useSettingsStore((s) => s.customBackground);
  const bgActive = hasActiveCustomBackground(customBackground);
  const glassPanels = bgActive && customBackground.panelGlass;

  const safeDuration = duration > 0 ? duration : currentTrack?.durationSeconds || 0;
  const progressPct =
    safeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / safeDuration) * 100)) : 0;

  const tabs = [
    { id: 'home' as const, label: 'Beranda', icon: Home },
    { id: 'search' as const, label: 'Cari', icon: Search },
    { id: 'library' as const, label: 'Koleksi Kamu', icon: Library },
    { id: 'recap' as const, label: 'Rekap', icon: BarChart3 },
  ];

  const isLibraryActive =
    currentRoute.name === 'library' ||
    currentRoute.name === 'liked' ||
    currentRoute.name === 'local-playlist';

  const handleShareCurrent = async () => {
    if (!currentTrack) return;
    const vid = getPlayableVideoId(currentTrack);
    const url = vid
      ? `${window.location.origin}/?play=${encodeURIComponent(vid)}`
      : `${window.location.origin}/?open=${encodeURIComponent(currentTrack.type)}:${encodeURIComponent(currentTrack.id)}`;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: currentTrack.title,
          text: `${currentTrack.title} — ${formatArtists(currentTrack.artists)}`,
          url,
        });
        return;
      }
    } catch {
      // Fallback to clipboard
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Tautan lagu disalin ke papan klip');
    } catch {
      showToast('Gagal menyalin tautan');
    }
  };

  return (
    <>
      {/* Mobile Mini Player */}
      {currentTrack && !mobileExpanded && (
        <div
          onTouchStart={(e) => {
            touchStartYRef.current = e.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(e) => {
            const startY = touchStartYRef.current;
            const endY = e.changedTouches[0]?.clientY ?? null;
            touchStartYRef.current = null;
            if (startY !== null && endY !== null && startY - endY > 36) {
              setMobileExpanded(true);
            }
          }}
          className={`md:hidden fixed left-2 right-2 bottom-[calc(66px+env(safe-area-inset-bottom,0px))] z-30 rounded-xl overflow-hidden border border-white/[0.14] shadow-2xl ${
            glassPanels ? 'bg-black/60 backdrop-blur-2xl' : 'bg-[#0B0F0D]/85 backdrop-blur-2xl'
          }`}
        >
          <div className="flex items-center gap-3 px-3 py-2">
            <button
              type="button"
              onClick={() => setMobileExpanded(true)}
              aria-label="Buka pemutar layar penuh"
              className="flex items-center gap-3 min-w-0 flex-1 text-left min-h-[44px]"
            >
              <ArtworkImage
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                type={currentTrack.type}
                className="w-10 h-10"
                roundedClass="rounded-lg"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#E8FFF3] truncate">{currentTrack.title}</p>
                <p className="text-[11px] text-[#B3F7D1]/65 truncate">
                  {formatArtists(currentTrack.artists)}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate({ name: 'settings', tab: 'sound', focusEq: false })}
              aria-label="Pengaturan Audio DSP"
              className="min-w-[38px] min-h-[44px] flex items-center justify-center text-[#B3F7D1]/75 hover:text-[#19EE8A]"
            >
              <Sliders className="w-4 h-4" strokeWidth={1.85} />
            </button>

            <button
              type="button"
              onClick={() => toggleLike(currentTrack)}
              aria-label={liked ? 'Hapus dari lagu disukai' : 'Simpan lagu disukai'}
              className={`min-w-[38px] min-h-[44px] flex items-center justify-center ${
                liked ? 'text-[#19EE8A]' : 'text-[#B3F7D1]/75'
              }`}
            >
              {liked ? (
                <Heart className="w-4.5 h-4.5 fill-[#19EE8A]" strokeWidth={1.85} />
              ) : (
                <PlusCircle className="w-4.5 h-4.5" strokeWidth={1.85} />
              )}
            </button>

            <button
              type="button"
              onClick={togglePlayPause}
              aria-label={isPlaying ? 'Jeda' : 'Putar'}
              className="min-w-[40px] min-h-[44px] flex items-center justify-center text-[#E8FFF3]"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" strokeWidth={1.75} />
              ) : (
                <Play className="w-5 h-5 fill-current" strokeWidth={1.75} />
              )}
            </button>
          </div>
          <div className="h-[2px] w-full bg-[#B3F7D1]/15">
            <div
              className="h-full bg-[#19EE8A] transition-[width] duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Mobile Full Player Sheet (IMG_4317 reference layout) */}
      {currentTrack && mobileExpanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pemutar layar penuh"
          onTouchStart={(e) => {
            touchStartYRef.current = e.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(e) => {
            const startY = touchStartYRef.current;
            const endY = e.changedTouches[0]?.clientY ?? null;
            touchStartYRef.current = null;
            if (startY !== null && endY !== null && endY - startY > 72 && !actionSheetOpen && !queueDrawerOpen) {
              setMobileExpanded(false);
            }
          }}
          className="md:hidden fixed inset-0 z-50 flex flex-col bg-[#080B09] overflow-y-auto"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(${ambientColor.r}, ${ambientColor.g}, ${ambientColor.b}, 0.62) 0%, rgba(10, 14, 12, 0.96) 62%, #070A08 100%)`,
          }}
        >
          {/* Top Bar */}
          <div className="pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 px-4 flex items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setMobileExpanded(false)}
              aria-label="Tutup pemutar layar penuh"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/90"
            >
              <ChevronDown className="w-6 h-6" strokeWidth={2} />
            </button>

            <span className="text-xs font-semibold text-white/95 truncate text-center">
              {sourceLabel || `Radio ${currentTrack.title}`}
            </span>

            <button
              type="button"
              onClick={() => {
                setActionSheetSubView('main');
                setActionSheetOpen(true);
              }}
              aria-label="Opsi lagu lainnya"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/90"
            >
              <MoreHorizontal className="w-5 h-5" strokeWidth={2} />
            </button>
          </div>

          <div className="flex-1 flex flex-col justify-between px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-2 gap-6">
            {/* Large Square Cover Art */}
            <div className="w-[min(78vw,36svh,330px)] aspect-square mx-auto shadow-2xl shadow-black/60 rounded-2xl overflow-hidden">
              <ArtworkImage
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                type={currentTrack.type}
                className="w-full h-full"
                roundedClass="rounded-2xl"
              />
            </div>

            <div className="space-y-5">
              {/* Title + Artist on left, X (exclude) + Circular Plus/Check (like) on right */}
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-white truncate tracking-tight">
                    {currentTrack.title}
                  </h2>
                  <p className="text-sm text-white/70 truncate mt-0.5">
                    {formatArtists(currentTrack.artists)}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (trackKey) excludeFromTaste(trackKey);
                      showToast('Lagu dikecualikan dari profil selera');
                      nextTrack();
                    }}
                    aria-label="Kecualikan lagu dari selera"
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center text-white/80 hover:text-white"
                  >
                    <Ban className="w-5 h-5" strokeWidth={1.85} />
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleLike(currentTrack)}
                    aria-label={liked ? 'Hapus dari lagu disukai' : 'Simpan ke Lagu yang Disukai'}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                      liked
                        ? 'bg-[#19EE8A] text-[#0F1F17]'
                        : 'border-2 border-white/85 text-white'
                    }`}
                  >
                    {liked ? (
                      <Check className="w-4 h-4" strokeWidth={2.75} />
                    ) : (
                      <Plus className="w-4.5 h-4.5" strokeWidth={2.4} />
                    )}
                  </button>
                </div>
              </div>

              {/* Scrubber with elapsed and -remaining */}
              <div className="space-y-1.5">
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
                    background: `linear-gradient(to right, #FFFFFF ${progressPct}%, rgba(255,255,255,0.22) ${progressPct}%)`,
                  }}
                  className="sc-range w-full h-1 rounded-full disabled:opacity-40"
                />
                <div className="flex justify-between text-xs text-white/65 tabular-nums">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatNegativeRemaining(currentTime, safeDuration)}</span>
                </div>
              </div>

              {/* 5-Button Transport */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={toggleShuffle}
                  aria-label="Acak urutan"
                  aria-pressed={shuffle}
                  className={`relative min-w-[44px] min-h-[44px] flex items-center justify-center ${
                    shuffle ? 'text-[#19EE8A]' : 'text-white/75'
                  }`}
                >
                  <Shuffle className="w-5 h-5" strokeWidth={2} />
                  {shuffle && (
                    <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#19EE8A]" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={prevTrack}
                  aria-label="Lagu sebelumnya"
                  className="min-w-[48px] min-h-[48px] flex items-center justify-center text-white"
                >
                  <SkipBack className="w-7 h-7 fill-current" strokeWidth={1.75} />
                </button>

                <button
                  type="button"
                  onClick={togglePlayPause}
                  aria-label={isPlaying ? 'Jeda' : 'Putar'}
                  className="w-16 h-16 rounded-full bg-white text-[#0F1F17] flex items-center justify-center shadow-xl"
                >
                  {isPlaying ? (
                    <Pause className="w-7 h-7 fill-current" strokeWidth={2} />
                  ) : (
                    <Play className="w-7 h-7 fill-current ml-0.5" strokeWidth={2} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={nextTrack}
                  aria-label="Lagu berikutnya"
                  className="min-w-[48px] min-h-[48px] flex items-center justify-center text-white"
                >
                  <SkipForward className="w-7 h-7 fill-current" strokeWidth={1.75} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActionSheetSubView('sleep');
                    setActionSheetOpen(true);
                  }}
                  aria-label="Pengatur waktu tidur"
                  className={`relative min-w-[44px] min-h-[44px] flex items-center justify-center ${
                    sleepTimerMode !== 'off' ? 'text-[#19EE8A]' : 'text-white/75'
                  }`}
                >
                  <Timer className="w-5 h-5" strokeWidth={2} />
                  {sleepTimerMode !== 'off' && (
                    <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#19EE8A]" />
                  )}
                </button>
              </div>

              {/* Utility Row */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMobileExpanded(false);
                    navigate({ name: 'settings', tab: 'sound', focusEq: false });
                  }}
                  aria-label="Pengaturan Audio & Perangkat"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/80"
                >
                  <MonitorSpeaker className="w-5 h-5" strokeWidth={1.85} />
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void handleShareCurrent()}
                    aria-label="Bagikan lagu"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/80"
                  >
                    <Share className="w-5 h-5" strokeWidth={1.85} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueDrawerOpen(true)}
                    aria-label="Buka antrean"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/80"
                  >
                    <ListMusic className="w-5 h-5" strokeWidth={1.85} />
                  </button>
                </div>
              </div>

              {/* Pratinjau Lirik Card */}
              <LyricsPreviewCard
                onOpenKaraoke={() => {
                  setMobileExpanded(false);
                  setKaraokeOpen(true);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Queue Drawer */}
      {queueDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Antrean lagu"
          className="md:hidden fixed inset-0 z-[65] flex items-end justify-center"
        >
          <button
            type="button"
            aria-label="Tutup antrean"
            onClick={() => setQueueDrawerOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-h-[82dvh] rounded-t-3xl bg-[#101513] border-t border-white/[0.12] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#E8FFF3]">Antrean Pemutaran</h3>
              <button
                type="button"
                onClick={() => setQueueDrawerOpen(false)}
                aria-label="Tutup antrean"
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#B3F7D1]/70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
              <QueueView />
            </div>
          </div>
        </div>
      )}

      {/* Three-dots Track Action Sheet (IMG_4318) */}
      <TrackActionSheet
        open={actionSheetOpen}
        track={currentTrack}
        initialSubView={actionSheetSubView}
        onClose={() => setActionSheetOpen(false)}
        onAddToPlaylist={onAddToPlaylist}
      />

      {/* Quick Create Menu Sheet (triggered by "Buat" tab) */}
      {createMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end justify-center p-3 pb-[calc(76px+env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            aria-label="Tutup menu buat"
            onClick={() => setCreateMenuOpen(false)}
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-[#0B0F0D]/90 backdrop-blur-2xl border border-white/[0.14] p-3 space-y-1.5 shadow-2xl">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[#B3F7D1]/65">
                Buat &amp; Kelola
              </span>
              <button
                type="button"
                onClick={() => setCreateMenuOpen(false)}
                aria-label="Tutup"
                className="p-1 text-[#B3F7D1]/65 hover:text-[#E8FFF3]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setCreateMenuOpen(false);
                onOpenCreatePlaylist();
              }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-left transition-colors"
            >
              <span className="w-9 h-9 rounded-full bg-sc-gradient text-[#0F1F17] flex items-center justify-center shrink-0">
                <ListPlus className="w-4.5 h-4.5" strokeWidth={2} />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#E8FFF3]">Buat Playlist Baru</p>
                <p className="text-[11px] text-[#B3F7D1]/60">Kumpulkan lagu favoritmu dalam satu daftar putar</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateMenuOpen(false);
                navigate({ name: 'create-mix' });
              }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-left transition-colors"
            >
              <span className="w-9 h-9 rounded-full bg-white/[0.08] text-[#19EE8A] flex items-center justify-center shrink-0">
                <Disc3 className="w-4.5 h-4.5" strokeWidth={2} />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#E8FFF3]">Buat Mix Pilihan</p>
                <p className="text-[11px] text-[#B3F7D1]/60">
                  Racik daftar lagu dari lagu atau genre pilihanmu
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateMenuOpen(false);
                navigate({ name: 'moods' });
              }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-left transition-colors"
            >
              <span className="w-9 h-9 rounded-full bg-white/[0.08] text-[#19EE8A] flex items-center justify-center shrink-0">
                <Compass className="w-4.5 h-4.5" strokeWidth={2} />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#E8FFF3]">Jelajahi Mood &amp; Genre</p>
                <p className="text-[11px] text-[#B3F7D1]/60">Temukan musik sesuai suasana hati</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Mobile Bottom Tab Bar (5 tabs) */}
      <nav
        aria-label="Navigasi seluler"
        className={`md:hidden fixed bottom-0 left-0 right-0 z-40 h-[calc(60px+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-2xl border-t border-white/[0.1] grid grid-cols-5 ${
          glassPanels ? 'bg-black/65' : 'bg-[#080B09]/90'
        }`}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active =
            tab.id === 'library'
              ? isLibraryActive
              : currentRoute.name === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setCreateMenuOpen(false);
                navigate({ name: tab.id });
              }}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors ${
                active ? 'text-[#19EE8A]' : 'text-[#B3F7D1]/60'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={1.8} />
              <span className="text-[10px] font-medium leading-tight truncate max-w-full px-1">
                {tab.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setCreateMenuOpen((prev) => !prev)}
          aria-expanded={createMenuOpen}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors ${
            createMenuOpen ? 'text-[#19EE8A]' : 'text-[#B3F7D1]/60'
          }`}
        >
          <Plus className="w-5 h-5" strokeWidth={2} />
          <span className="text-[10px] font-medium leading-tight">Buat</span>
        </button>
      </nav>
    </>
  );
}
