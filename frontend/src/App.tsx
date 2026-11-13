import { useEffect, useState, type FormEvent } from 'react';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Compass,
  Disc3,
  Home,
  Keyboard,
  PanelRightOpen,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { fetchAccountStatus } from './api/client';
import {
  FloatingMiniPlayerController,
  FullscreenKaraokeModal,
  FullscreenNowPlayingModal,
} from './components/FullscreenViews';
import { LocalAudioEngine } from './components/LocalAudioEngine';
import { MobileShell } from './components/MobileShell';
import { PlayerBar } from './components/PlayerBar';
import { PlaylistModal } from './components/PlaylistModal';
import { RightPanel } from './components/RightPanel';
import { Sidebar } from './components/Sidebar';
import { GlobalTrackContextMenu } from './components/TrackContextMenu';
import { YouTubePlayerBridge } from './components/YouTubePlayerBridge';
import { AlbumDetailPage, ArtistDetailPage, PlaylistDetailPage } from './pages/DetailPages';
import { HomePage } from './pages/HomePage';
import {
  LibraryOverviewPage,
  LikedTracksPage,
  LocalPlaylistPage,
} from './pages/LibraryPages';
import { MoodDetailPage, MoodsPage } from './pages/MoodsPage';
import { EpisodeDetailPage, PodcastDetailPage } from './pages/PodcastPages';
import { RecapPage } from './pages/RecapPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { ShortcutsPage } from './pages/ShortcutsPage';
import { useLibraryStore } from './store/libraryStore';
import { useNavigationStore } from './store/navigationStore';
import { usePlayerStore } from './store/playerStore';
import { useSettingsStore } from './store/settingsStore';
import type { LocalPlaylist, MediaItem } from './types/music';

export default function App() {
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [trackForPlaylist, setTrackForPlaylist] = useState<MediaItem | null>(null);
  const [editingPlaylist, setEditingPlaylist] = useState<LocalPlaylist | null>(null);
  const [topSearchInput, setTopSearchInput] = useState('');

  const currentRoute = useNavigationStore((s) => s.currentRoute);
  const navigate = useNavigationStore((s) => s.navigate);
  const goBack = useNavigationStore((s) => s.goBack);
  const goForward = useNavigationStore((s) => s.goForward);
  const canGoBack = useNavigationStore((s) => s.canGoBack());
  const canGoForward = useNavigationStore((s) => s.canGoForward());

  const ambientColor = usePlayerStore((s) => s.ambientColor);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const rightPanelOpen = usePlayerStore((s) => s.rightPanelOpen);
  const setRightPanelOpen = usePlayerStore((s) => s.setRightPanelOpen);

  useEffect(() => {
    const boot = async () => {
      await useSettingsStore.getState().hydrate();
      await useLibraryStore.getState().hydrate();
      await usePlayerStore.getState().hydrate();
      fetchAccountStatus()
        .then((status) => {
          void useSettingsStore
            .getState()
            .setAccountKey(status.authenticated ? 'ytmusic' : 'local');
        })
        .catch(() => {});
    };
    void boot();
  }, []);

  useEffect(() => {
    if (currentRoute.name === 'search' && currentRoute.query !== undefined) {
      setTopSearchInput(currentRoute.query);
    }
  }, [currentRoute]);

  const handleTopSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = topSearchInput.trim();
    navigate({ name: 'search', query: q || undefined });
  };

  const openCreatePlaylistModal = () => {
    setTrackForPlaylist(null);
    setEditingPlaylist(null);
    setPlaylistModalOpen(true);
  };

  const openAddToPlaylistModal = (track: MediaItem) => {
    setTrackForPlaylist(track);
    setEditingPlaylist(null);
    setPlaylistModalOpen(true);
  };

  const openEditPlaylistModal = (playlist: LocalPlaylist) => {
    setTrackForPlaylist(null);
    setEditingPlaylist(playlist);
    setPlaylistModalOpen(true);
  };

  const ambientBg = currentTrack
    ? `rgba(${ambientColor.r}, ${ambientColor.g}, ${ambientColor.b}, 0.34)`
    : 'rgba(46, 230, 166, 0.14)';

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white flex flex-col">
      {/* Windows Desktop Top Bar */}
      <header className="hidden md:flex items-center justify-between gap-4 h-15 px-3 bg-black shrink-0 z-20">
        {/* Left: Brand & History Navigation */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => navigate({ name: 'home' })}
            aria-label="SoundClear Beranda"
            className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-full hover:bg-white/[0.06] transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-[#2EE6A6] text-[#06130E] flex items-center justify-center shrink-0">
              <Disc3 className="w-4.5 h-4.5" strokeWidth={2.2} />
            </div>
            <span className="text-sm font-bold tracking-tight text-white hidden xl:inline whitespace-nowrap">
              SoundClear
            </span>
          </button>

          <div className="flex items-center gap-1 ml-1">
            <button
              type="button"
              onClick={goBack}
              disabled={!canGoBack}
              aria-label="Kembali"
              className="w-8 h-8 rounded-full bg-[#121212] hover:bg-[#1F1F1F] disabled:opacity-30 flex items-center justify-center text-white/85 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={goForward}
              disabled={!canGoForward}
              aria-label="Maju"
              className="w-8 h-8 rounded-full bg-[#121212] hover:bg-[#1F1F1F] disabled:opacity-30 flex items-center justify-center text-white/85 transition-colors"
            >
              <ChevronRight className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Center: Circular Home + Pill Search Bar with Moods Browse */}
        <div className="flex items-center gap-2 flex-1 max-w-[540px] mx-auto">
          <button
            type="button"
            onClick={() => navigate({ name: 'home' })}
            aria-label="Beranda"
            title="Beranda"
            className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              currentRoute.name === 'home'
                ? 'bg-[#282828] text-white'
                : 'bg-[#1F1F1F] text-white/75 hover:bg-[#282828] hover:text-white'
            }`}
          >
            <Home className="w-5 h-5" strokeWidth={2} />
          </button>

          <form
            onSubmit={handleTopSearchSubmit}
            className="flex-1 flex items-center h-11 rounded-full bg-[#1F1F1F] hover:bg-[#272727] focus-within:bg-[#272727] focus-within:ring-2 focus-within:ring-white/80 px-3.5 gap-2.5 transition-colors"
          >
            <Search className="w-4.5 h-4.5 text-white/65 shrink-0" strokeWidth={2} />
            <input
              type="search"
              value={topSearchInput}
              onChange={(e) => setTopSearchInput(e.target.value)}
              onFocus={() => {
                if (currentRoute.name !== 'search' && topSearchInput.trim()) {
                  navigate({ name: 'search', query: topSearchInput.trim() });
                }
              }}
              placeholder="Apa yang ingin kamu putar?"
              aria-label="Cari lagu, artis, atau podcast"
              className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-white/55 focus:outline-none"
            />
            {topSearchInput && (
              <button
                type="button"
                onClick={() => {
                  setTopSearchInput('');
                  if (currentRoute.name === 'search') {
                    navigate({ name: 'search', query: '' });
                  }
                }}
                aria-label="Hapus pencarian"
                className="text-white/55 hover:text-white transition-colors shrink-0"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            )}
            <span className="h-5 w-px bg-white/15 shrink-0" aria-hidden="true" />
            <button
              type="button"
              onClick={() => navigate({ name: 'moods' })}
              aria-label="Jelajahi Mood & Genre"
              title="Jelajahi Mood & Genre"
              className={`p-1 rounded-md transition-colors shrink-0 ${
                currentRoute.name === 'moods' || currentRoute.name === 'mood-detail'
                  ? 'text-[#2EE6A6]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <Compass className="w-4.5 h-4.5" strokeWidth={1.9} />
            </button>
          </form>
        </div>

        {/* Right: Real SoundClear utility controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => navigate({ name: 'recap' })}
            aria-label="Rekap Dengar"
            title="Rekap Dengar"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
              currentRoute.name === 'recap'
                ? 'bg-white text-black'
                : 'bg-[#1F1F1F] text-white/85 hover:bg-[#2A2A2A] hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" strokeWidth={2} />
            <span>Rekap</span>
          </button>

          <button
            type="button"
            onClick={() => navigate({ name: 'shortcuts' })}
            aria-label="Pintasan Keyboard"
            title="Pintasan Keyboard (?)"
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              currentRoute.name === 'shortcuts'
                ? 'bg-white text-black'
                : 'text-white/70 hover:text-white hover:bg-[#1F1F1F]'
            }`}
          >
            <Keyboard className="w-4 h-4" strokeWidth={1.85} />
          </button>

          <button
            type="button"
            onClick={() => navigate({ name: 'settings' })}
            aria-label="Pengaturan"
            title="Pengaturan"
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              currentRoute.name === 'settings'
                ? 'bg-white text-black'
                : 'text-white/70 hover:text-white hover:bg-[#1F1F1F]'
            }`}
          >
            <Settings className="w-4 h-4" strokeWidth={1.85} />
          </button>

          {!rightPanelOpen && (
            <button
              type="button"
              onClick={() => setRightPanelOpen(true)}
              aria-label="Buka panel sedang diputar"
              title="Buka panel sedang diputar"
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1F1F1F] hover:bg-[#2A2A2A] text-xs font-semibold text-white/85 hover:text-white transition-colors whitespace-nowrap"
            >
              <PanelRightOpen className="w-3.5 h-3.5 text-[#2EE6A6]" strokeWidth={2} />
              <span>Diputar</span>
            </button>
          )}
        </div>
      </header>

      {/* Main 3-pane desktop area */}
      <div className="relative z-10 flex-1 min-h-0 flex md:gap-2 md:px-2">
        <Sidebar onOpenCreatePlaylist={openCreatePlaylistModal} />

        <main className="flex-1 min-w-0 bg-[#121212] md:rounded-lg overflow-y-auto flex flex-col relative">
          {/* Top ambient cover color wash inside main viewport */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-72 transition-colors duration-700"
            style={{
              background: `linear-gradient(180deg, ${ambientBg} 0%, rgba(18, 18, 18, 0) 100%)`,
            }}
          />

          {/* Compact Mobile Header (hidden on Windows/desktop) */}
          <header className="md:hidden sticky top-0 z-20 flex items-center justify-between gap-4 px-4 py-3 bg-[#121212]/85 backdrop-blur-xl border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-[#2EE6A6]/15 border border-[#2EE6A6]/30 flex items-center justify-center text-[#2EE6A6]">
                <Disc3 className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <span className="text-sm font-semibold tracking-tight text-white">SoundClear</span>
              <button
                type="button"
                onClick={goBack}
                disabled={!canGoBack}
                aria-label="Kembali"
                className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-30 flex items-center justify-center text-white ml-1"
              >
                <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {currentRoute.name !== 'search' && (
                <button
                  type="button"
                  onClick={() => navigate({ name: 'search' })}
                  aria-label="Cari"
                  className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-white/75"
                >
                  <Search className="w-4 h-4" strokeWidth={1.75} />
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate({ name: 'settings' })}
                aria-label="Pengaturan"
                className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-white/75"
              >
                <Settings className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
          </header>

          {/* Scrollable page body */}
          <div
            className={`relative z-10 flex-1 px-4 sm:px-6 py-4 ${
              currentTrack ? 'pb-36 md:pb-8' : 'pb-20 md:pb-8'
            }`}
          >
            {currentRoute.name === 'home' && (
              <HomePage onAddToPlaylist={openAddToPlaylistModal} />
            )}

            {currentRoute.name === 'search' && (
              <SearchPage
                key={`${currentRoute.query || ''}-${currentRoute.filter || 'all'}`}
                initialQuery={currentRoute.query}
                initialFilter={currentRoute.filter}
                onAddToPlaylist={openAddToPlaylistModal}
              />
            )}

            {currentRoute.name === 'moods' && <MoodsPage />}

            {currentRoute.name === 'mood-detail' && (
              <MoodDetailPage params={currentRoute.params} title={currentRoute.title} />
            )}

            {currentRoute.name === 'artist' && (
              <ArtistDetailPage
                key={currentRoute.id}
                id={currentRoute.id}
                onAddToPlaylist={openAddToPlaylistModal}
              />
            )}

            {currentRoute.name === 'album' && (
              <AlbumDetailPage
                key={currentRoute.id}
                id={currentRoute.id}
                onAddToPlaylist={openAddToPlaylistModal}
              />
            )}

            {currentRoute.name === 'playlist' && (
              <PlaylistDetailPage
                key={currentRoute.id}
                id={currentRoute.id}
                onAddToPlaylist={openAddToPlaylistModal}
              />
            )}

            {currentRoute.name === 'podcast' && (
              <PodcastDetailPage key={currentRoute.id} id={currentRoute.id} />
            )}

            {currentRoute.name === 'episode' && (
              <EpisodeDetailPage key={currentRoute.id} id={currentRoute.id} />
            )}

            {currentRoute.name === 'library' && (
              <LibraryOverviewPage
                onAddToPlaylist={openAddToPlaylistModal}
                onOpenCreatePlaylist={openCreatePlaylistModal}
                onEditPlaylist={openEditPlaylistModal}
              />
            )}

            {currentRoute.name === 'liked' && (
              <LikedTracksPage onAddToPlaylist={openAddToPlaylistModal} />
            )}

            {currentRoute.name === 'local-playlist' && (
              <LocalPlaylistPage
                key={currentRoute.id}
                id={currentRoute.id}
                onAddToPlaylist={openAddToPlaylistModal}
                onEditPlaylist={openEditPlaylistModal}
              />
            )}

            {currentRoute.name === 'recap' && <RecapPage />}
            {currentRoute.name === 'settings' && (
              <SettingsPage
                initialTab={currentRoute.tab ?? 'general'}
                focusEq={Boolean(currentRoute.focusEq)}
              />
            )}
            {currentRoute.name === 'shortcuts' && <ShortcutsPage />}
          </div>
        </main>

        <RightPanel onAddToPlaylist={openAddToPlaylistModal} />
      </div>

      {/* Desktop fixed bottom player bar */}
      <PlayerBar onAddToPlaylist={openAddToPlaylistModal} />

      {/* Mobile mini player + expandable sheet + bottom tabs */}
      <MobileShell onAddToPlaylist={openAddToPlaylistModal} />

      {/* Playlist create / add / edit modal */}
      <PlaylistModal
        open={playlistModalOpen}
        trackToAdd={trackForPlaylist}
        editingPlaylist={editingPlaylist}
        onClose={() => setPlaylistModalOpen(false)}
      />

      {/* Global Context Menu + Song Credits Modal + Action Toast */}
      <GlobalTrackContextMenu onAddToPlaylist={openAddToPlaylistModal} />

      {/* Fullscreen Karaoke, Fullscreen Now Playing, and Desktop PiP / Mini Player */}
      <FullscreenKaraokeModal />
      <FullscreenNowPlayingModal />
      <FloatingMiniPlayerController />

      {/* Persistent YouTube IFrame Player API bridge + Web Audio API Local Engine */}
      <YouTubePlayerBridge />
      <LocalAudioEngine />
    </div>
  );
}
