import { useState } from 'react';
import { ChevronLeft, ChevronRight, Disc3, PanelRightOpen, Search } from 'lucide-react';
import { MobileShell } from './components/MobileShell';
import { PlayerBar } from './components/PlayerBar';
import { PlaylistModal } from './components/PlaylistModal';
import { RightPanel } from './components/RightPanel';
import { Sidebar } from './components/Sidebar';
import { YouTubePlayerBridge } from './components/YouTubePlayerBridge';
import { AlbumDetailPage, ArtistDetailPage, PlaylistDetailPage } from './pages/DetailPages';
import { HomePage } from './pages/HomePage';
import { LibraryOverviewPage, LikedTracksPage, LocalPlaylistPage } from './pages/LibraryPages';
import { MoodDetailPage, MoodsPage } from './pages/MoodsPage';
import { SearchPage } from './pages/SearchPage';
import { useNavigationStore } from './store/navigationStore';
import { usePlayerStore } from './store/playerStore';
import type { MediaItem } from './types/music';

export default function App() {
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [trackForPlaylist, setTrackForPlaylist] = useState<MediaItem | null>(null);

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

  const openCreatePlaylistModal = () => {
    setTrackForPlaylist(null);
    setPlaylistModalOpen(true);
  };

  const openAddToPlaylistModal = (track: MediaItem) => {
    setTrackForPlaylist(track);
    setPlaylistModalOpen(true);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0A0A0B] text-white flex flex-col md:p-2 md:gap-2">
      {/* Ambient dominant cover color layer */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-500"
        style={{
          opacity: currentTrack ? 1 : 0.45,
        }}
      >
        <div
          className="absolute -top-32 left-1/4 right-1/4 h-[460px] rounded-full blur-[120px] transition-colors duration-700"
          style={{
            backgroundColor: `rgba(${ambientColor.r}, ${ambientColor.g}, ${ambientColor.b}, 0.28)`,
          }}
        />
      </div>

      {/* Main 3-pane desktop area */}
      <div className="relative z-10 flex-1 min-h-0 flex gap-2">
        <Sidebar onOpenCreatePlaylist={openCreatePlaylistModal} />

        <main className="flex-1 min-w-0 md:glass-panel md:rounded-2xl overflow-y-auto flex flex-col">
          {/* Compact Sticky Navigation Header */}
          <header className="sticky top-0 z-20 flex items-center justify-between gap-4 px-4 sm:px-6 py-3 bg-[#0A0A0B]/70 backdrop-blur-xl border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center gap-2 md:hidden mr-1">
                <div className="w-7 h-7 rounded-lg bg-[#2EE6A6]/15 border border-[#2EE6A6]/30 flex items-center justify-center text-[#2EE6A6]">
                  <Disc3 className="w-4 h-4" strokeWidth={1.75} />
                </div>
                <span className="text-sm font-semibold tracking-tight text-white">SoundClear</span>
              </div>

              <button
                type="button"
                onClick={goBack}
                disabled={!canGoBack}
                aria-label="Kembali"
                className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-30 flex items-center justify-center text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={goForward}
                disabled={!canGoForward}
                aria-label="Maju"
                className="hidden sm:flex w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-30 items-center justify-center text-white transition-colors"
              >
                <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {currentRoute.name !== 'search' && (
                <button
                  type="button"
                  onClick={() => navigate({ name: 'search' })}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs text-white/70 hover:text-white transition-colors whitespace-nowrap"
                >
                  <Search className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span className="hidden sm:inline">Cari lagu atau artis</span>
                </button>
              )}

              {!rightPanelOpen && (
                <button
                  type="button"
                  onClick={() => setRightPanelOpen(true)}
                  aria-label="Buka panel sedang diputar"
                  className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs text-white/75 hover:text-white transition-colors whitespace-nowrap"
                >
                  <PanelRightOpen className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Sedang diputar</span>
                </button>
              )}
            </div>
          </header>

          {/* Scrollable page body */}
          <div
            className={`flex-1 px-4 sm:px-6 py-5 ${
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

            {currentRoute.name === 'library' && (
              <LibraryOverviewPage
                onAddToPlaylist={openAddToPlaylistModal}
                onOpenCreatePlaylist={openCreatePlaylistModal}
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
              />
            )}
          </div>
        </main>

        <RightPanel onAddToPlaylist={openAddToPlaylistModal} />
      </div>

      {/* Desktop fixed bottom player bar */}
      <PlayerBar onAddToPlaylist={openAddToPlaylistModal} />

      {/* Mobile mini player + expandable sheet + bottom tabs */}
      <MobileShell onAddToPlaylist={openAddToPlaylistModal} />

      {/* Playlist create / add modal */}
      <PlaylistModal
        open={playlistModalOpen}
        trackToAdd={trackForPlaylist}
        onClose={() => setPlaylistModalOpen(false)}
      />

      {/* Hidden YouTube IFrame Player API bridge */}
      <YouTubePlayerBridge />
    </div>
  );
}
