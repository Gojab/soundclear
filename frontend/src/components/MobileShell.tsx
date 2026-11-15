import { useRef, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  Compass,
  Heart,
  Home,
  Library,
  ListMusic,
  ListPlus,
  Mic2,
  Moon,
  Pause,
  Play,
  Plus,
  PlusCircle,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { MediaItem } from '../types/music';
import { getNextPlaybackRate } from '../utils/audioMath';
import { hasActiveCustomBackground } from '../utils/backgroundTheme';
import {
  formatArtists,
  formatTime,
  getTrackUniqueId,
} from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';
import { LyricsView } from './LyricsView';
import { QueueView } from './QueueView';

interface MobileShellProps {
  onAddToPlaylist: (track: MediaItem) => void;
  onOpenCreatePlaylist: () => void;
}

export function MobileShell({ onAddToPlaylist, onOpenCreatePlaylist }: MobileShellProps) {
  const [sheetTab, setSheetTab] = useState<'player' | 'lyrics' | 'queue'>('player');
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const touchStartYRef = useRef<number | null>(null);

  const currentRoute = useNavigationStore((s) => s.currentRoute);
  const navigate = useNavigationStore((s) => s.navigate);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const smartShuffle = usePlayerStore((s) => s.smartShuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const sleepTimerMode = usePlayerStore((s) => s.sleepTimerMode);
  const ambientColor = usePlayerStore((s) => s.ambientColor);
  const mobileExpanded = usePlayerStore((s) => s.mobileExpanded);
  const activeStreamMeta = usePlayerStore((s) => s.activeStreamMeta);

  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const requestSeek = usePlayerStore((s) => s.requestSeek);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const toggleSmartShuffle = usePlayerStore((s) => s.toggleSmartShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);
  const setMobileExpanded = usePlayerStore((s) => s.setMobileExpanded);
  const setKaraokeOpen = usePlayerStore((s) => s.setKaraokeOpen);

  const trackKey = getTrackUniqueId(currentTrack);
  const liked = useLibraryStore((s) => s.isLiked(trackKey));
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const customBackground = useSettingsStore((s) => s.customBackground);
  const bgActive = hasActiveCustomBackground(customBackground);
  const glassPanels = bgActive && customBackground.panelGlass;

  const safeDuration = duration > 0 ? duration : currentTrack?.durationSeconds || 0;
  const progressPct =
    safeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / safeDuration) * 100)) : 0;

  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;

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
          className={`md:hidden fixed left-2 right-2 bottom-[64px] z-30 rounded-xl overflow-hidden border border-white/[0.14] shadow-2xl ${
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

      {/* Mobile Full Player Sheet */}
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
            if (startY !== null && endY !== null && endY - startY > 72 && sheetTab === 'player') {
              setMobileExpanded(false);
            }
          }}
          className="md:hidden fixed inset-0 z-50 flex flex-col bg-black overflow-hidden"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 18%, rgba(${ambientColor.r}, ${ambientColor.g}, ${ambientColor.b}, 0.38), rgba(5,7,6,0.98) 70%)`,
          }}
        >
          <div className="pt-3 pb-2 px-4 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={() => setMobileExpanded(false)}
              aria-label="Tutup pemutar layar penuh"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[#B3F7D1]/80 hover:text-[#E8FFF3]"
            >
              <ChevronDown className="w-5 h-5" strokeWidth={1.75} />
            </button>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.11]">
              <button
                type="button"
                onClick={() => setSheetTab('player')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  sheetTab === 'player' ? 'bg-white/[0.14] text-[#19EE8A]' : 'text-[#B3F7D1]/70'
                }`}
              >
                Pemutar
              </button>
              <button
                type="button"
                onClick={() => setSheetTab('lyrics')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 ${
                  sheetTab === 'lyrics' ? 'bg-white/[0.14] text-[#19EE8A]' : 'text-[#B3F7D1]/70'
                }`}
              >
                <Mic2 className="w-3 h-3" strokeWidth={1.75} />
                Lirik
              </button>
              <button
                type="button"
                onClick={() => setSheetTab('queue')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 ${
                  sheetTab === 'queue' ? 'bg-white/[0.14] text-[#19EE8A]' : 'text-[#B3F7D1]/70'
                }`}
              >
                <ListMusic className="w-3 h-3" strokeWidth={1.75} />
                Antrean
              </button>
            </div>

            <button
              type="button"
              onClick={() => onAddToPlaylist(currentTrack)}
              aria-label="Simpan ke playlist"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[#B3F7D1]/80 hover:text-[#E8FFF3]"
            >
              <ListPlus className="w-5 h-5" strokeWidth={1.75} />
            </button>
          </div>

          {sheetTab === 'player' && (
            <div className="flex-1 flex flex-col justify-between px-6 pb-8 pt-4 overflow-y-auto">
              <div className="w-full max-w-[290px] aspect-square mx-auto my-auto">
                <ArtworkImage
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  type={currentTrack.type}
                  className="w-full h-full"
                  roundedClass="rounded-2xl"
                />
              </div>

              <div className="space-y-5 mt-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-[#E8FFF3] truncate">
                      {currentTrack.title}
                    </h2>
                    <p className="text-sm text-[#B3F7D1]/70 truncate mt-0.5">
                      {formatArtists(currentTrack.artists)}
                    </p>
                    {activeStreamMeta && (
                      <p
                        className={`text-[11px] font-medium truncate mt-0.5 ${
                          activeStreamMeta.hiRes
                            ? 'text-[#19EE8A]'
                            : activeStreamMeta.lossless
                              ? 'text-[#0AD36C]'
                              : 'text-[#B3F7D1]/60'
                        }`}
                      >
                        {activeStreamMeta.badgeLabel}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleLike(currentTrack)}
                    aria-label={liked ? 'Hapus dari lagu disukai' : 'Sukai lagu'}
                    className={`min-w-[44px] min-h-[44px] flex items-center justify-center ${
                      liked ? 'text-[#19EE8A]' : 'text-[#B3F7D1]/70'
                    }`}
                  >
                    <Heart
                      className={`w-5 h-5 ${liked ? 'fill-[#19EE8A]' : ''}`}
                      strokeWidth={1.75}
                    />
                  </button>
                </div>

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
                      background: `linear-gradient(to right, #19EE8A ${progressPct}%, rgba(179,247,209,0.2) ${progressPct}%)`,
                    }}
                    className="sc-range w-full h-1 rounded-full disabled:opacity-40"
                  />
                  <div className="flex justify-between text-xs text-[#B3F7D1]/55 tabular-nums">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(safeDuration)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={toggleShuffle}
                    aria-label="Acak urutan"
                    className={`min-w-[44px] min-h-[44px] flex items-center justify-center ${
                      shuffle ? 'text-[#19EE8A]' : 'text-[#B3F7D1]/65'
                    }`}
                  >
                    <Shuffle className="w-5 h-5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={prevTrack}
                    aria-label="Lagu sebelumnya"
                    className="min-w-[48px] min-h-[48px] flex items-center justify-center text-[#E8FFF3]"
                  >
                    <SkipBack className="w-6 h-6 fill-current" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={togglePlayPause}
                    aria-label={isPlaying ? 'Jeda' : 'Putar'}
                    className="w-16 h-16 rounded-full bg-sc-gradient text-[#0F1F17] flex items-center justify-center shadow-lg shadow-[#01BA53]/25"
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
                    className="min-w-[48px] min-h-[48px] flex items-center justify-center text-[#E8FFF3]"
                  >
                    <SkipForward className="w-6 h-6 fill-current" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={cycleRepeat}
                    aria-label={`Mode ulang: ${repeat}`}
                    className={`min-w-[44px] min-h-[44px] flex items-center justify-center ${
                      repeat !== 'off' ? 'text-[#19EE8A]' : 'text-[#B3F7D1]/65'
                    }`}
                  >
                    <RepeatIcon className="w-5 h-5" strokeWidth={1.75} />
                  </button>
                </div>

                {/* Extra quick toggles */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#B3F7D1]/[0.1] text-xs">
                  <button
                    type="button"
                    onClick={toggleSmartShuffle}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] ${
                      smartShuffle ? 'text-[#19EE8A]' : 'text-[#B3F7D1]/75'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Acak Pintar
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setSleepTimer(sleepTimerMode === 'off' ? 'minutes' : 'off', 30)
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] ${
                      sleepTimerMode !== 'off' ? 'text-[#19EE8A]' : 'text-[#B3F7D1]/75'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" strokeWidth={1.75} />
                    {sleepTimerMode !== 'off' ? 'Timer Aktif' : 'Timer 30m'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlaybackRate(getNextPlaybackRate(playbackRate))}
                    className="px-3 py-2 rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] text-[#E8FFF3]/85 tabular-nums"
                  >
                    {playbackRate}x
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMobileExpanded(false);
                      navigate({ name: 'settings', tab: 'sound', focusEq: false });
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#19EE8A]/15 border border-[#19EE8A]/35 text-[#19EE8A] font-medium"
                  >
                    <Sliders className="w-3.5 h-3.5" strokeWidth={1.85} />
                    Pengaturan Audio
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMobileExpanded(false);
                      setKaraokeOpen(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] text-[#E8FFF3]/85"
                  >
                    Karaoke
                  </button>
                </div>
              </div>
            </div>
          )}

          {sheetTab === 'lyrics' && (
            <div className="flex-1 overflow-y-auto px-5 pb-8">
              <LyricsView />
            </div>
          )}

          {sheetTab === 'queue' && (
            <div className="flex-1 overflow-y-auto px-5 pb-8">
              <QueueView />
            </div>
          )}
        </div>
      )}

      {/* Quick Create Menu Sheet (triggered by "Buat" tab) */}
      {createMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end justify-center p-3 pb-20">
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

      {/* Mobile Bottom Tab Bar (5 tabs matching IMG_4280 layout) */}
      <nav
        aria-label="Navigasi seluler"
        className={`md:hidden fixed bottom-0 left-0 right-0 z-40 h-[60px] backdrop-blur-2xl border-t border-white/[0.1] grid grid-cols-5 ${
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
