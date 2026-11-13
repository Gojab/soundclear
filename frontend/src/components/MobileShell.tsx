import { useRef, useState } from 'react';
import {
  ChevronDown,
  Compass,
  Heart,
  Home,
  Library,
  ListMusic,
  ListPlus,
  Mic2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import type { MediaItem } from '../types/music';
import { formatArtists, formatTime, getPlayableVideoId } from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';
import { LyricsView } from './LyricsView';
import { QueueView } from './QueueView';

interface MobileShellProps {
  onAddToPlaylist: (track: MediaItem) => void;
}

export function MobileShell({ onAddToPlaylist }: MobileShellProps) {
  const [sheetTab, setSheetTab] = useState<'player' | 'lyrics' | 'queue'>('player');
  const touchStartYRef = useRef<number | null>(null);

  const currentRoute = useNavigationStore((s) => s.currentRoute);
  const navigate = useNavigationStore((s) => s.navigate);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const ambientColor = usePlayerStore((s) => s.ambientColor);
  const mobileExpanded = usePlayerStore((s) => s.mobileExpanded);

  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const requestSeek = usePlayerStore((s) => s.requestSeek);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const setMobileExpanded = usePlayerStore((s) => s.setMobileExpanded);

  const trackKey = currentTrack ? getPlayableVideoId(currentTrack) || currentTrack.id : null;
  const liked = useLibraryStore((s) => s.isLiked(trackKey));
  const toggleLike = useLibraryStore((s) => s.toggleLike);

  const safeDuration = duration > 0 ? duration : currentTrack?.durationSeconds || 0;
  const progressPct =
    safeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / safeDuration) * 100)) : 0;

  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat;

  const tabs = [
    { id: 'home' as const, label: 'Beranda', icon: Home },
    { id: 'search' as const, label: 'Cari', icon: Search },
    { id: 'moods' as const, label: 'Mood', icon: Compass },
    { id: 'library' as const, label: 'Koleksi', icon: Library },
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
          className="md:hidden fixed left-2 right-2 bottom-[64px] z-30 glass-panel rounded-xl overflow-hidden bg-[#141418]/90"
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
                className="w-10 h-10"
                roundedClass="rounded-lg"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">{currentTrack.title}</p>
                <p className="text-[11px] text-white/55 truncate">
                  {formatArtists(currentTrack.artists)}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => toggleLike(currentTrack)}
              aria-label={liked ? 'Hapus dari lagu disukai' : 'Sukai lagu'}
              className={`min-w-[44px] min-h-[44px] flex items-center justify-center ${
                liked ? 'text-[#2EE6A6]' : 'text-white/65'
              }`}
            >
              <Heart className={`w-4 h-4 ${liked ? 'fill-[#2EE6A6]' : ''}`} strokeWidth={1.75} />
            </button>

            <button
              type="button"
              onClick={togglePlayPause}
              aria-label={isPlaying ? 'Jeda' : 'Putar'}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" strokeWidth={1.75} />
              ) : (
                <Play className="w-5 h-5 fill-current" strokeWidth={1.75} />
              )}
            </button>
          </div>
          <div className="h-[2px] w-full bg-white/10">
            <div
              className="h-full bg-[#2EE6A6] transition-[width] duration-200"
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
          className="md:hidden fixed inset-0 z-50 flex flex-col bg-[#0A0A0B] overflow-hidden"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 18%, rgba(${ambientColor.r}, ${ambientColor.g}, ${ambientColor.b}, 0.42), rgba(10,10,11,0.98) 70%)`,
          }}
        >
          <div className="pt-3 pb-2 px-4 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={() => setMobileExpanded(false)}
              aria-label="Tutup pemutar layar penuh"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/80"
            >
              <ChevronDown className="w-5 h-5" strokeWidth={1.75} />
            </button>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.06] border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setSheetTab('player')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  sheetTab === 'player' ? 'bg-white/[0.12] text-[#2EE6A6]' : 'text-white/65'
                }`}
              >
                Pemutar
              </button>
              <button
                type="button"
                onClick={() => setSheetTab('lyrics')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 ${
                  sheetTab === 'lyrics' ? 'bg-white/[0.12] text-[#2EE6A6]' : 'text-white/65'
                }`}
              >
                <Mic2 className="w-3 h-3" strokeWidth={1.75} />
                Lirik
              </button>
              <button
                type="button"
                onClick={() => setSheetTab('queue')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 ${
                  sheetTab === 'queue' ? 'bg-white/[0.12] text-[#2EE6A6]' : 'text-white/65'
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
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/80"
            >
              <ListPlus className="w-5 h-5" strokeWidth={1.75} />
            </button>
          </div>

          {sheetTab === 'player' && (
            <div className="flex-1 flex flex-col justify-between px-6 pb-8 pt-4 overflow-y-auto">
              <div className="w-full max-w-[320px] aspect-square mx-auto my-auto">
                <ArtworkImage
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className="w-full h-full"
                  roundedClass="rounded-2xl"
                />
              </div>

              <div className="space-y-6 mt-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-white truncate">
                      {currentTrack.title}
                    </h2>
                    <p className="text-sm text-white/60 truncate mt-0.5">
                      {formatArtists(currentTrack.artists)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleLike(currentTrack)}
                    aria-label={liked ? 'Hapus dari lagu disukai' : 'Sukai lagu'}
                    className={`min-w-[44px] min-h-[44px] flex items-center justify-center ${
                      liked ? 'text-[#2EE6A6]' : 'text-white/65'
                    }`}
                  >
                    <Heart
                      className={`w-5 h-5 ${liked ? 'fill-[#2EE6A6]' : ''}`}
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
                    onChange={(e) => requestSeek(Number(e.target.value))}
                    style={{
                      background: `linear-gradient(to right, #2EE6A6 ${progressPct}%, rgba(255,255,255,0.18) ${progressPct}%)`,
                    }}
                    className="sc-range w-full h-1 rounded-full"
                  />
                  <div className="flex justify-between text-xs text-white/50 tabular-nums">
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
                      shuffle ? 'text-[#2EE6A6]' : 'text-white/60'
                    }`}
                  >
                    <Shuffle className="w-5 h-5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={prevTrack}
                    aria-label="Lagu sebelumnya"
                    className="min-w-[48px] min-h-[48px] flex items-center justify-center text-white"
                  >
                    <SkipBack className="w-6 h-6 fill-current" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={togglePlayPause}
                    aria-label={isPlaying ? 'Jeda' : 'Putar'}
                    className="w-16 h-16 rounded-full bg-[#2EE6A6] text-[#06130E] flex items-center justify-center"
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
                    <SkipForward className="w-6 h-6 fill-current" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={cycleRepeat}
                    aria-label={`Mode ulang: ${repeat}`}
                    className={`min-w-[44px] min-h-[44px] flex items-center justify-center ${
                      repeat !== 'off' ? 'text-[#2EE6A6]' : 'text-white/60'
                    }`}
                  >
                    <RepeatIcon className="w-5 h-5" strokeWidth={1.75} />
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

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label="Navigasi seluler"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-[58px] bg-[#0E0E11]/90 backdrop-blur-xl border-t border-white/[0.08] grid grid-cols-4"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active =
            tab.id === 'library'
              ? isLibraryActive
              : tab.id === 'moods'
                ? currentRoute.name === 'moods' || currentRoute.name === 'mood-detail'
                : currentRoute.name === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigate({ name: tab.id })}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors ${
                active ? 'text-[#2EE6A6]' : 'text-white/55'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={1.75} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
