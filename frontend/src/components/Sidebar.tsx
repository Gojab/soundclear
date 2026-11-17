import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Disc3,
  Heart,
  Library,
  ListMusic,
  Maximize2,
  Pin,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { useSettingsStore } from '../store/settingsStore';
import { hasActiveCustomBackground } from '../utils/backgroundTheme';
import { ArtworkImage } from './ArtworkImage';

interface SidebarProps {
  onOpenCreatePlaylist: () => void;
}

type LibraryFilter = 'all' | 'playlist' | 'album' | 'artist';
type LibrarySort = 'recent' | 'alpha';

export function Sidebar({ onOpenCreatePlaylist }: SidebarProps) {
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [sortBy, setSortBy] = useState<LibrarySort>('recent');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusExpanded, setIsFocusExpanded] = useState(false);

  const isExpanded = isHovered || isFocusExpanded || searchOpen;

  const currentRoute = useNavigationStore((s) => s.currentRoute);
  const navigate = useNavigationStore((s) => s.navigate);

  const likedCount = useLibraryStore((s) => s.likedTracks.length);
  const playlists = useLibraryStore((s) => s.playlists);
  const savedAlbums = useLibraryStore((s) => s.savedAlbums);
  const followedArtists = useLibraryStore((s) => s.followedArtists);
  const savedPodcasts = useLibraryStore((s) => s.savedPodcasts);
  const customBackground = useSettingsStore((s) => s.customBackground);
  const bgActive = hasActiveCustomBackground(customBackground);
  const glassPanels = bgActive && customBackground.panelGlass;

  const q = searchTerm.trim().toLowerCase();

  const sortedPlaylists = useMemo(() => {
    const base = [...playlists].filter((p) => !q || p.name.toLowerCase().includes(q));
    return base.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      if (sortBy === 'alpha') return a.name.localeCompare(b.name);
      return (b.lastPlayedAt ?? b.createdAt) - (a.lastPlayedAt ?? a.createdAt);
    });
  }, [playlists, q, sortBy]);

  const filteredAlbums = useMemo(() => {
    const base = [...savedAlbums].filter(
      (a) => !q || a.item.title.toLowerCase().includes(q),
    );
    return base.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      if (sortBy === 'alpha') return a.item.title.localeCompare(b.item.title);
      return (b.lastPlayedAt ?? b.savedAt) - (a.lastPlayedAt ?? a.savedAt);
    });
  }, [savedAlbums, q, sortBy]);

  const filteredArtists = useMemo(() => {
    const base = [...followedArtists].filter(
      (a) => !q || a.item.title.toLowerCase().includes(q),
    );
    return base.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      if (sortBy === 'alpha') return a.item.title.localeCompare(b.item.title);
      return (b.lastPlayedAt ?? b.followedAt) - (a.lastPlayedAt ?? a.followedAt);
    });
  }, [followedArtists, q, sortBy]);

  const filteredPodcasts = useMemo(() => {
    if (filter !== 'all') return [];
    return [...savedPodcasts].filter((p) => !q || p.item.title.toLowerCase().includes(q));
  }, [savedPodcasts, filter, q]);

  const showLiked =
    (filter === 'all' || filter === 'playlist') &&
    (!q || 'lagu yang disukai'.includes(q));
  const showPlaylists = filter === 'all' || filter === 'playlist';
  const showAlbums = filter === 'all' || filter === 'album';
  const showArtists = filter === 'all' || filter === 'artist';

  const filterOptions: Array<{ id: LibraryFilter; label: string }> = [
    { id: 'all', label: 'Semua' },
    { id: 'playlist', label: 'Playlist' },
    { id: 'album', label: 'Album' },
    { id: 'artist', label: 'Artis' },
  ];

  const isEmpty =
    playlists.length === 0 &&
    savedAlbums.length === 0 &&
    followedArtists.length === 0 &&
    savedPodcasts.length === 0;

  return (
    <aside
      aria-label="Koleksi Kamu"
      data-expanded={isExpanded ? 'true' : 'false'}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={(e) => {
        if (e.target instanceof HTMLElement && e.target.matches(':focus-visible')) {
          setIsFocusExpanded(true);
        }
      }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsFocusExpanded(false);
        }
      }}
      className={`hidden md:flex flex-col shrink-0 rounded-lg overflow-hidden will-change-[width] transition-[width,background-color,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] border ${
        isExpanded
          ? 'w-[248px] lg:w-[272px] xl:w-[304px] border-white/[0.14] shadow-[8px_0_30px_rgba(0,0,0,0.38)]'
          : 'w-[80px] border-white/[0.08]'
      } ${
        glassPanels
          ? 'bg-black/35'
          : bgActive
            ? 'bg-black/65'
            : 'bg-white/[0.03] backdrop-blur-2xl'
      }`}
    >
      {/* Top Koleksi Kamu Header */}
      <div
        className={`pt-4 pb-2 flex items-center justify-between transition-[padding,gap] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isExpanded ? 'px-4 gap-2' : 'px-4 gap-0'
        }`}
      >
        <button
          type="button"
          onClick={() => navigate({ name: 'library' })}
          title="Koleksi Kamu"
          className="flex items-center min-h-[44px] text-[#B3F7D1]/80 hover:text-[#E8FFF3] transition-colors min-w-0"
        >
          <span
            className={`flex items-center justify-center shrink-0 transition-[width,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isExpanded ? 'w-5 mr-2' : 'w-12 mr-0'
            }`}
          >
            <Library className="w-4.5 h-4.5 xl:w-5 xl:h-5 shrink-0 text-[#19EE8A]" strokeWidth={2} />
          </span>
          <span
            className={`text-sm xl:text-[15px] font-bold tracking-tight whitespace-nowrap overflow-hidden transition-[opacity,max-width,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isExpanded
                ? 'opacity-100 max-w-[150px] translate-x-0'
                : 'opacity-0 max-w-0 -translate-x-1 pointer-events-none'
            }`}
          >
            Koleksi Kamu
          </span>
        </button>

        <div
          className={`flex items-center gap-2 shrink-0 overflow-hidden transition-[opacity,max-width,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isExpanded
              ? 'opacity-100 max-w-[160px] translate-x-0'
              : 'opacity-0 max-w-0 translate-x-1 pointer-events-none'
          }`}
        >
          <button
            type="button"
            onClick={() => navigate({ name: 'create-mix' })}
            aria-label="Buat mix baru"
            title="Buat mix baru"
            tabIndex={isExpanded ? 0 : -1}
            className={`w-10 h-10 xl:w-11 xl:h-11 rounded-full flex items-center justify-center transition-colors ${
              currentRoute.name === 'create-mix'
                ? 'bg-[#19EE8A]/20 text-[#19EE8A]'
                : 'text-[#B3F7D1]/70 hover:text-[#E8FFF3] hover:bg-white/[0.09]'
            }`}
          >
            <Disc3 className="w-4 h-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={onOpenCreatePlaylist}
            aria-label="Buat playlist baru"
            title="Buat playlist baru"
            tabIndex={isExpanded ? 0 : -1}
            className="w-10 h-10 xl:w-11 xl:h-11 rounded-full flex items-center justify-center text-[#B3F7D1]/70 hover:text-[#E8FFF3] hover:bg-white/[0.09] transition-colors"
          >
            <Plus className="w-4 h-4 xl:w-4.5 xl:h-4.5" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => navigate({ name: 'library' })}
            aria-label="Buka seluruh koleksi"
            title="Lihat semua koleksi"
            tabIndex={isExpanded ? 0 : -1}
            className="w-10 h-10 xl:w-11 xl:h-11 rounded-full flex items-center justify-center text-[#B3F7D1]/70 hover:text-[#E8FFF3] hover:bg-white/[0.09] transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Collapsible Filter Tabs + Search & Sort */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
        }`}
      >
        <div className="overflow-hidden min-h-0">
          {/* Interactive Filter Tabs */}
          <div className="px-4 pb-2 flex items-center gap-2 overflow-x-auto scrollbar-none">
            {filterOptions.map((opt) => {
              const active = filter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  tabIndex={isExpanded ? 0 : -1}
                  onClick={() => setFilter(active && opt.id !== 'all' ? 'all' : opt.id)}
                  className={`min-h-[36px] px-4 py-1 rounded-full text-[11px] xl:text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#19EE8A] text-[#0F1F17] font-semibold'
                      : 'bg-white/[0.06] text-[#E8FFF3]/85 hover:bg-white/[0.11]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Inline Search & Sort Row */}
          <div className="px-4 pb-2 flex items-center justify-between gap-2">
            {searchOpen ? (
              <div className="flex-1 min-h-[44px] flex items-center gap-2 bg-white/[0.06] backdrop-blur-md border border-white/[0.12] rounded-md px-2 py-1">
                <Search className="w-3.5 h-3.5 text-[#B3F7D1]/65 shrink-0" strokeWidth={2} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari di Koleksi..."
                  autoFocus
                  className="flex-1 min-w-0 bg-transparent text-xs text-[#E8FFF3] placeholder:text-[#B3F7D1]/45 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSearchOpen(false);
                  }}
                  aria-label="Tutup cari koleksi"
                  className="w-8 h-8 flex items-center justify-center text-[#B3F7D1]/55 hover:text-[#E8FFF3]"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                tabIndex={isExpanded ? 0 : -1}
                onClick={() => setSearchOpen(true)}
                aria-label="Cari di koleksi"
                className="w-11 h-11 rounded-full flex items-center justify-center text-[#B3F7D1]/65 hover:text-[#E8FFF3] hover:bg-white/[0.09] transition-colors"
              >
                <Search className="w-4 h-4" strokeWidth={1.9} />
              </button>
            )}

            <button
              type="button"
              tabIndex={isExpanded ? 0 : -1}
              onClick={() => setSortBy((s) => (s === 'recent' ? 'alpha' : 'recent'))}
              className="inline-flex items-center gap-2 min-h-[44px] text-xs font-medium text-[#B3F7D1]/70 hover:text-[#E8FFF3] px-2 py-1 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <span>{sortBy === 'recent' ? 'Baru diputar' : 'Abjad A–Z'}</span>
              <ArrowUpDown className="w-3.5 h-3.5" strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Collection Items */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4 space-y-1 scrollbar-none">
        {showLiked && (
          <button
            type="button"
            title="Lagu yang Disukai"
            onClick={() => navigate({ name: 'liked' })}
            className={`w-full flex items-center p-2 rounded-lg text-left transition-[gap,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isExpanded ? 'gap-4' : 'gap-0'
            } ${currentRoute.name === 'liked' ? 'bg-white/[0.1]' : 'hover:bg-white/[0.06]'}`}
          >
            <div className="w-12 h-12 rounded-md bg-gradient-to-br from-[#19EE8A] via-[#0AD36C] to-[#01BA53] flex items-center justify-center shrink-0">
              <Heart className="w-5 h-5 fill-[#0F1F17] text-[#0F1F17]" strokeWidth={2} />
            </div>
            <div
              className={`min-w-0 flex-1 overflow-hidden whitespace-nowrap transition-[opacity,max-width,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isExpanded
                  ? 'opacity-100 max-w-[200px] translate-x-0'
                  : 'opacity-0 max-w-0 -translate-x-1'
              }`}
            >
              <p
                className={`text-sm font-semibold truncate ${
                  currentRoute.name === 'liked' ? 'text-[#19EE8A]' : 'text-[#E8FFF3]'
                }`}
              >
                Lagu yang Disukai
              </p>
              <p className="text-xs text-[#B3F7D1]/60 truncate mt-0.5 tabular-nums">
                Playlist · {likedCount} lagu
              </p>
            </div>
          </button>
        )}

        {showPlaylists &&
          sortedPlaylists.map((pl) => {
            const active = currentRoute.name === 'local-playlist' && currentRoute.id === pl.id;
            const thumb = pl.coverUrl || pl.tracks[0]?.thumbnail;
            return (
              <button
                key={pl.id}
                type="button"
                title={pl.name}
                onClick={() => navigate({ name: 'local-playlist', id: pl.id })}
                className={`w-full flex items-center p-2 rounded-lg text-left transition-[gap,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isExpanded ? 'gap-3' : 'gap-0'
                } ${active ? 'bg-white/[0.1]' : 'hover:bg-white/[0.06]'}`}
              >
                {thumb ? (
                  <ArtworkImage
                    src={thumb}
                    alt={pl.name}
                    className="w-12 h-12 shrink-0"
                    roundedClass="rounded-md"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-md bg-white/[0.06] flex items-center justify-center shrink-0 text-[#B3F7D1]/55">
                    <ListMusic className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                )}
                <div
                  className={`min-w-0 flex-1 overflow-hidden whitespace-nowrap transition-[opacity,max-width,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isExpanded
                      ? 'opacity-100 max-w-[200px] translate-x-0'
                      : 'opacity-0 max-w-0 -translate-x-1'
                  }`}
                >
                  <p
                    className={`text-sm font-semibold truncate ${
                      active ? 'text-[#19EE8A]' : 'text-[#E8FFF3]'
                    }`}
                  >
                    {pl.name}
                  </p>
                  <p className="text-xs text-[#B3F7D1]/60 truncate mt-0.5 flex items-center gap-1 tabular-nums">
                    {pl.pinned && <Pin className="w-3 h-3 text-[#19EE8A] shrink-0" strokeWidth={2} />}
                    <span>Playlist · {pl.tracks.length} lagu</span>
                  </p>
                </div>
              </button>
            );
          })}

        {showAlbums &&
          filteredAlbums.map((entry) => {
            const active = currentRoute.name === 'album' && currentRoute.id === entry.id;
            return (
              <button
                key={`alb-${entry.id}`}
                type="button"
                title={entry.item.title}
                onClick={() =>
                  navigate({ name: 'album', id: entry.id, fallbackQuery: entry.item.title })
                }
                className={`w-full flex items-center p-2 rounded-lg text-left transition-[gap,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isExpanded ? 'gap-3' : 'gap-0'
                } ${active ? 'bg-white/[0.1]' : 'hover:bg-white/[0.06]'}`}
              >
                <ArtworkImage
                  src={entry.item.thumbnail}
                  alt={entry.item.title}
                  type="album"
                  className="w-12 h-12 shrink-0"
                  roundedClass="rounded-md"
                />
                <div
                  className={`min-w-0 flex-1 overflow-hidden whitespace-nowrap transition-[opacity,max-width,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isExpanded
                      ? 'opacity-100 max-w-[200px] translate-x-0'
                      : 'opacity-0 max-w-0 -translate-x-1'
                  }`}
                >
                  <p
                    className={`text-sm font-semibold truncate ${
                      active ? 'text-[#19EE8A]' : 'text-[#E8FFF3]'
                    }`}
                  >
                    {entry.item.title}
                  </p>
                  <p className="text-xs text-[#B3F7D1]/60 truncate mt-0.5">
                    Album · {entry.item.artists?.[0]?.name || 'Artis'}
                  </p>
                </div>
              </button>
            );
          })}

        {showArtists &&
          filteredArtists.map((entry) => {
            const active = currentRoute.name === 'artist' && currentRoute.id === entry.id;
            return (
              <button
                key={`art-${entry.id}`}
                type="button"
                title={entry.item.title}
                onClick={() =>
                  navigate({ name: 'artist', id: entry.id, fallbackQuery: entry.item.title })
                }
                className={`w-full flex items-center p-2 rounded-lg text-left transition-[gap,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isExpanded ? 'gap-3' : 'gap-0'
                } ${active ? 'bg-white/[0.1]' : 'hover:bg-white/[0.06]'}`}
              >
                <ArtworkImage
                  src={entry.item.thumbnail}
                  alt={entry.item.title}
                  type="artist"
                  className="w-12 h-12 shrink-0"
                  roundedClass="rounded-full"
                />
                <div
                  className={`min-w-0 flex-1 overflow-hidden whitespace-nowrap transition-[opacity,max-width,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isExpanded
                      ? 'opacity-100 max-w-[200px] translate-x-0'
                      : 'opacity-0 max-w-0 -translate-x-1'
                  }`}
                >
                  <p
                    className={`text-sm font-semibold truncate ${
                      active ? 'text-[#19EE8A]' : 'text-[#E8FFF3]'
                    }`}
                  >
                    {entry.item.title}
                  </p>
                  <p className="text-xs text-[#B3F7D1]/60 truncate mt-0.5">Artis</p>
                </div>
              </button>
            );
          })}

        {filteredPodcasts.map((entry) => {
          const active = currentRoute.name === 'podcast' && currentRoute.id === entry.id;
          return (
            <button
              key={`pod-${entry.id}`}
              type="button"
              title={entry.item.title}
              onClick={() =>
                navigate({ name: 'podcast', id: entry.id, fallbackQuery: entry.item.title })
              }
              className={`w-full flex items-center p-2 rounded-lg text-left transition-[gap,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isExpanded ? 'gap-3' : 'gap-0'
              } ${active ? 'bg-white/[0.1]' : 'hover:bg-white/[0.06]'}`}
            >
              <ArtworkImage
                src={entry.item.thumbnail}
                alt={entry.item.title}
                type="podcast"
                className="w-12 h-12 shrink-0"
                roundedClass="rounded-md"
              />
              <div
                className={`min-w-0 flex-1 overflow-hidden whitespace-nowrap transition-[opacity,max-width,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isExpanded
                    ? 'opacity-100 max-w-[200px] translate-x-0'
                    : 'opacity-0 max-w-0 -translate-x-1'
                }`}
              >
                <p
                  className={`text-sm font-semibold truncate ${
                    active ? 'text-[#19EE8A]' : 'text-[#E8FFF3]'
                  }`}
                >
                  {entry.item.title}
                </p>
                <p className="text-xs text-[#B3F7D1]/60 truncate mt-0.5">
                  Podcast · {entry.item.artists?.[0]?.name || 'Acara'}
                </p>
              </div>
            </button>
          );
        })}

        {isEmpty && (
          <>
            {!isExpanded && (
              <div className="pt-1 flex justify-center">
                <button
                  type="button"
                  onClick={onOpenCreatePlaylist}
                  aria-label="Buat playlist baru"
                  title="Buat playlist baru"
                  className="w-12 h-12 rounded-md bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[#B3F7D1]/80 hover:text-[#19EE8A] transition-colors"
                >
                  <Plus className="w-5 h-5" strokeWidth={2} />
                </button>
              </div>
            )}

            <div
              className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isExpanded
                  ? 'mx-2 mt-3 grid-rows-[1fr] opacity-100'
                  : 'mx-2 mt-0 grid-rows-[0fr] opacity-0 pointer-events-none'
              }`}
            >
              <div className="overflow-hidden min-h-0">
                <div className="p-4 rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] space-y-2">
                  <p className="text-xs font-semibold text-[#E8FFF3]">Buat playlist pertamamu</p>
                  <p className="text-xs text-[#B3F7D1]/65 leading-relaxed max-w-[65ch]">
                    Simpan lagu favorit, album, dan artis agar selalu siap diputar.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      type="button"
                      tabIndex={isExpanded ? 0 : -1}
                      onClick={onOpenCreatePlaylist}
                      className="min-h-[40px] px-4 py-2 rounded-full bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105 transition-transform"
                    >
                      Buat playlist
                    </button>
                    <button
                      type="button"
                      tabIndex={isExpanded ? 0 : -1}
                      onClick={() => navigate({ name: 'create-mix' })}
                      className="min-h-[40px] px-4 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-[#E8FFF3] text-xs font-semibold transition-colors"
                    >
                      Buat Mix
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
