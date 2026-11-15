import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  CornerDownRight,
  Home,
  Keyboard,
  PanelRightOpen,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { fetchAccountStatus, fetchSuggest, fetchWatchPlaylist } from './api/client';
import { CustomBackgroundLayer } from './components/CustomBackgroundLayer';
import {
  FullscreenKaraokeModal,
  FullscreenNowPlayingModal,
} from './components/FullscreenViews';
import { Footer } from './components/Footer';
import { LocalAudioEngine } from './components/LocalAudioEngine';
import { MobileShell } from './components/MobileShell';
import { NotchMiniPlayer } from './components/NotchMiniPlayer';
import { PlayerBar } from './components/PlayerBar';
import { PlaylistModal } from './components/PlaylistModal';
import { RightPanel } from './components/RightPanel';
import { Sidebar } from './components/Sidebar';
import { TopBarAccountMenu } from './components/TopBarAccountMenu';
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
import { hasActiveCustomBackground } from './utils/backgroundTheme';
import { isExcludedRegionalText, parseDeepLinkSearch } from './utils/playerLogic';
import type { LocalPlaylist, MediaItem, SearchFilter } from './types/music';

export default function App() {
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [trackForPlaylist, setTrackForPlaylist] = useState<MediaItem | null>(null);
  const [editingPlaylist, setEditingPlaylist] = useState<LocalPlaylist | null>(null);
  const [topSearchInput, setTopSearchInput] = useState('');
  const [topSearchOpen, setTopSearchOpen] = useState(false);
  const [topSuggestions, setTopSuggestions] = useState<string[]>([]);
  const topSearchWrapperRef = useRef<HTMLDivElement | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);

  const recentSearches = useLibraryStore((s) => s.recentSearches);
  const addRecentSearch = useLibraryStore((s) => s.addRecentSearch);

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
  const customBackground = useSettingsStore((s) => s.customBackground);
  const bgActive = hasActiveCustomBackground(customBackground);
  const glassPanels = bgActive && customBackground.panelGlass;

  useEffect(() => {
    const boot = async () => {
      const deepLink = parseDeepLinkSearch(window.location.search);
      if (deepLink) {
        window.history.replaceState({}, '', window.location.pathname || '/');
      }
      await useSettingsStore.getState().hydrate();
      await useLibraryStore.getState().hydrate();
      await usePlayerStore.getState().hydrate();
      if (deepLink?.kind === 'open') {
        useNavigationStore.getState().navigate({
          name: deepLink.itemType,
          id: deepLink.id,
        });
      } else if (deepLink?.kind === 'play') {
        fetchWatchPlaylist(deepLink.videoId, true)
          .then((watch) => {
            const matched =
              watch.tracks.find((t) => (t.videoId || t.id) === deepLink.videoId) ??
              watch.tracks[0];
            const track: MediaItem = matched ?? {
              id: deepLink.videoId,
              videoId: deepLink.videoId,
              title: 'Lagu dibagikan',
              artists: [{ id: null, name: 'YouTube Music' }],
              type: 'song',
            };
            usePlayerStore.getState().playTrack(track);
          })
          .catch(() => {
            usePlayerStore.getState().playTrack({
              id: deepLink.videoId,
              videoId: deepLink.videoId,
              title: 'Lagu dibagikan',
              artists: [{ id: null, name: 'YouTube Music' }],
              type: 'song',
            });
          });
      }
      fetchAccountStatus()
        .then((status) => {
          void useSettingsStore
            .getState()
            .setAccountKey(status.mode === 'cloud' || status.authenticated ? 'cloud' : 'local');
        })
        .catch(() => {});
    };
    void boot();
  }, []);

  useEffect(() => {
    if (currentRoute.name === 'search' && currentRoute.query !== undefined) {
      setTopSearchInput(currentRoute.query);
    }
    mainScrollRef.current?.scrollTo({ top: 0 });
  }, [currentRoute]);

  useEffect(() => {
    if (!topSearchOpen) return;
    const clean = topSearchInput.trim();
    if (clean.length < 2) {
      setTopSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchSuggest(clean, controller.signal)
        .then((res) => {
          const safe = (res.suggestions || []).filter((s) => !isExcludedRegionalText(s)).slice(0, 6);
          setTopSuggestions(safe);
        })
        .catch(() => {
          if (!controller.signal.aborted) setTopSuggestions([]);
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [topSearchInput, topSearchOpen]);

  useEffect(() => {
    if (!topSearchOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (
        topSearchWrapperRef.current &&
        !topSearchWrapperRef.current.contains(e.target as Node)
      ) {
        setTopSearchOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTopSearchOpen(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [topSearchOpen]);

  const submitTopSearch = (query: string, filter: SearchFilter = 'all') => {
    const clean = query.trim();
    setTopSearchOpen(false);
    if (!clean) {
      navigate({ name: 'search', query: undefined });
      return;
    }
    setTopSearchInput(clean);
    addRecentSearch(clean);
    navigate({ name: 'search', query: clean, filter });
  };

  const handleTopSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitTopSearch(topSearchInput);
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
    <div
      className={`relative h-screen w-screen overflow-hidden ${
        bgActive ? 'bg-transparent' : 'bg-black'
      } text-white flex flex-col`}
    >
      <CustomBackgroundLayer />

      {/* Desktop Top Bar */}
      <header
        className={`relative hidden md:flex items-center justify-between gap-4 px-3 h-15 shrink-0 z-20 transition-[background-color,padding,height] duration-300 ${
          glassPanels
            ? 'bg-black/40 backdrop-blur-md border-b border-white/[0.06]'
            : bgActive
              ? 'bg-black/75 backdrop-blur-sm'
              : 'bg-black'
        }`}
      >
        {/* Left: Brand & History Navigation */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => navigate({ name: 'home' })}
            aria-label="SoundClear Beranda"
            className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-full hover:bg-white/[0.06] transition-colors"
          >
            <img
              src="/soundclear-logo.png"
              alt="SoundClear"
              className="w-8 h-8 rounded-lg object-contain shrink-0"
            />
            <span className="text-sm font-bold tracking-tight text-white hidden sm:inline whitespace-nowrap">
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

          <div ref={topSearchWrapperRef} className="relative flex-1">
            <form
              onSubmit={handleTopSearchSubmit}
              className="flex items-center h-11 rounded-full bg-[#1F1F1F] hover:bg-[#272727] focus-within:bg-[#272727] focus-within:ring-2 focus-within:ring-white/80 px-3.5 gap-2.5 transition-colors"
            >
              <Search className="w-4.5 h-4.5 text-white/65 shrink-0" strokeWidth={2} />
              <input
                type="text"
                enterKeyHint="search"
                value={topSearchInput}
                onChange={(e) => {
                  setTopSearchInput(e.target.value);
                  setTopSearchOpen(true);
                }}
                onFocus={() => setTopSearchOpen(true)}
                placeholder="Apa yang ingin kamu putar?"
                aria-label="Cari lagu, artis, atau podcast"
                className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-white/55 focus:outline-none"
              />
              {topSearchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setTopSearchInput('');
                    setTopSuggestions([]);
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
                onClick={() => {
                  setTopSearchOpen(false);
                  navigate({ name: 'moods' });
                }}
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

            {topSearchOpen &&
              (topSuggestions.length > 0 ||
                topSearchInput.trim().length >= 2 ||
                recentSearches.length > 0) && (
                <div
                  role="listbox"
                  aria-label="Saran dan follow-up pencarian"
                  className="absolute left-0 right-0 top-12 z-50 rounded-2xl bg-[#18181D]/98 border border-white/[0.12] shadow-2xl p-2 space-y-1.5 backdrop-blur-xl"
                >
                  {topSuggestions.length > 0 && (
                    <div className="space-y-0.5">
                      {topSuggestions.map((suggestion) => (
                        <button
                          key={`top-sug-${suggestion}`}
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={() => submitTopSearch(suggestion)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs sm:text-sm text-white/85 hover:bg-white/[0.08] hover:text-white transition-colors"
                        >
                          <Search className="w-3.5 h-3.5 text-white/45 shrink-0" strokeWidth={1.8} />
                          <span className="truncate">{suggestion}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {topSearchInput.trim().length >= 2 && !isExcludedRegionalText(topSearchInput) && (
                    <div className="pt-1 border-t border-white/[0.08] flex flex-wrap items-center gap-1.5 px-1.5 pb-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-white/40 mr-0.5">
                        Follow-up:
                      </span>
                      <button
                        type="button"
                        onClick={() => submitTopSearch(topSearchInput, 'songs')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.07] hover:bg-[#2EE6A6]/20 text-[11px] text-white/85 hover:text-white transition-colors"
                      >
                        <CornerDownRight className="w-3 h-3 text-[#2EE6A6]" strokeWidth={2} />
                        Lagu &ldquo;{topSearchInput.trim()}&rdquo;
                      </button>
                      <button
                        type="button"
                        onClick={() => submitTopSearch(topSearchInput, 'albums')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.07] hover:bg-[#2EE6A6]/20 text-[11px] text-white/85 hover:text-white transition-colors"
                      >
                        <CornerDownRight className="w-3 h-3 text-[#2EE6A6]" strokeWidth={2} />
                        Album
                      </button>
                      <button
                        type="button"
                        onClick={() => submitTopSearch(topSearchInput, 'playlists')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.07] hover:bg-[#2EE6A6]/20 text-[11px] text-white/85 hover:text-white transition-colors"
                      >
                        <CornerDownRight className="w-3 h-3 text-[#2EE6A6]" strokeWidth={2} />
                        Playlist
                      </button>
                    </div>
                  )}

                  {topSearchInput.trim().length < 2 && recentSearches.length > 0 && (
                    <div className="space-y-0.5">
                      <p className="px-3 py-1 text-[11px] font-medium text-white/45">
                        Pencarian Terakhir
                      </p>
                      {recentSearches
                        .filter((entry) => !isExcludedRegionalText(entry.query))
                        .slice(0, 5)
                        .map((entry, idx) => (
                          <button
                            key={`top-rec-${entry.query}-${idx}`}
                            type="button"
                            role="option"
                            aria-selected={false}
                            onClick={() => submitTopSearch(entry.query)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs sm:text-sm text-white/80 hover:bg-white/[0.08] hover:text-white transition-colors"
                          >
                            <Clock className="w-3.5 h-3.5 text-white/40 shrink-0" strokeWidth={1.8} />
                            <span className="truncate">{entry.query}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
          </div>
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

          <TopBarAccountMenu />
        </div>
      </header>

      {/* Main 3-pane desktop area */}
      <div className="relative z-10 flex-1 min-h-0 flex md:gap-2 md:px-2">
        <Sidebar onOpenCreatePlaylist={openCreatePlaylistModal} />

        <main
          ref={mainScrollRef}
          className={`flex-1 min-w-0 md:rounded-lg overflow-y-auto flex flex-col relative transition-colors duration-300 ${
            glassPanels
              ? 'bg-[#121212]/62 backdrop-blur-xl border border-white/[0.07]'
              : bgActive
                ? 'bg-[#121212]/88 backdrop-blur-md border border-white/[0.05]'
                : 'bg-[#121212]'
          }`}
        >
          {/* Top ambient cover color wash inside main viewport */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-72 transition-colors duration-700"
            style={{
              background: `linear-gradient(180deg, ${ambientBg} 0%, rgba(18, 18, 18, 0) 100%)`,
            }}
          />

          {/* Compact Mobile Header (hidden on Windows/desktop) */}
          <header
            style={{ top: 'env(safe-area-inset-top, 0px)' }}
            className={`md:hidden sticky z-20 flex items-center justify-between gap-4 px-4 py-3 backdrop-blur-xl border-b border-white/[0.06] shrink-0 ${
              glassPanels ? 'bg-[#121212]/62' : 'bg-[#121212]/85'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <img
                src="/soundclear-logo.png"
                alt="SoundClear"
                className="w-7 h-7 rounded-lg object-contain shrink-0"
              />
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
                fallbackQuery={currentRoute.fallbackQuery}
                onAddToPlaylist={openAddToPlaylistModal}
              />
            )}

            {currentRoute.name === 'album' && (
              <AlbumDetailPage
                key={currentRoute.id}
                id={currentRoute.id}
                fallbackQuery={currentRoute.fallbackQuery}
                onAddToPlaylist={openAddToPlaylistModal}
              />
            )}

            {currentRoute.name === 'playlist' && (
              <PlaylistDetailPage
                key={currentRoute.id}
                id={currentRoute.id}
                fallbackQuery={currentRoute.fallbackQuery}
                onAddToPlaylist={openAddToPlaylistModal}
              />
            )}

            {currentRoute.name === 'podcast' && (
              <PodcastDetailPage
                key={currentRoute.id}
                id={currentRoute.id}
                fallbackQuery={currentRoute.fallbackQuery}
              />
            )}

            {currentRoute.name === 'episode' && (
              <EpisodeDetailPage
                key={currentRoute.id}
                id={currentRoute.id}
                fallbackQuery={currentRoute.fallbackQuery}
              />
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

          <Footer />
          <div className={currentTrack ? 'h-32 md:h-2 shrink-0' : 'h-16 md:h-2 shrink-0'} aria-hidden="true" />
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

      {/* Fullscreen Karaoke, Fullscreen Now Playing, and Top Notch Mini Player */}
      <FullscreenKaraokeModal />
      <FullscreenNowPlayingModal />
      <NotchMiniPlayer />

      {/* Persistent Hidden Streaming Audio Bridge + Web Audio API Local Engine */}
      <YouTubePlayerBridge />
      <LocalAudioEngine />
    </div>
  );
}
