import {
  BarChart3,
  Compass,
  Disc3,
  Heart,
  Home,
  Keyboard,
  Library,
  ListMusic,
  Pin,
  Plus,
  Search,
  Settings,
} from 'lucide-react';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';

interface SidebarProps {
  onOpenCreatePlaylist: () => void;
}

export function Sidebar({ onOpenCreatePlaylist }: SidebarProps) {
  const currentRoute = useNavigationStore((s) => s.currentRoute);
  const navigate = useNavigationStore((s) => s.navigate);

  const likedCount = useLibraryStore((s) => s.likedTracks.length);
  const playlists = useLibraryStore((s) => s.playlists);

  const navItems = [
    { id: 'home' as const, label: 'Beranda', icon: Home },
    { id: 'search' as const, label: 'Cari', icon: Search },
    { id: 'moods' as const, label: 'Mood & Genre', icon: Compass },
    { id: 'library' as const, label: 'Koleksi', icon: Library },
    { id: 'recap' as const, label: 'Rekap', icon: BarChart3 },
  ];

  const sortedPlaylists = [...playlists].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return b.createdAt - a.createdAt;
  });

  return (
    <aside
      aria-label="Navigasi utama"
      className="hidden md:flex flex-col w-[248px] lg:w-[260px] shrink-0 glass-panel rounded-2xl overflow-hidden"
    >
      <div className="px-4 pt-4 pb-3 flex items-center gap-2.5 border-b border-white/[0.08]">
        <div className="w-8 h-8 rounded-lg bg-[#2EE6A6]/15 border border-[#2EE6A6]/30 flex items-center justify-center text-[#2EE6A6] shrink-0">
          <Disc3 className="w-4 h-4" strokeWidth={1.75} />
        </div>
        <span className="text-base font-semibold tracking-tight text-white whitespace-nowrap">
          SoundClear
        </span>
      </div>

      <nav className="p-2.5 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            currentRoute.name === item.id ||
            (item.id === 'moods' && currentRoute.name === 'mood-detail');
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate({ name: item.id })}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-white/[0.1] text-[#2EE6A6]'
                  : 'text-white/70 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mx-3 border-t border-white/[0.08]" />

      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <button
          type="button"
          onClick={() => navigate({ name: 'library' })}
          className="text-xs font-semibold text-white/55 hover:text-white tracking-wide transition-colors"
        >
          Playlist & Koleksi
        </button>
        <button
          type="button"
          onClick={onOpenCreatePlaylist}
          aria-label="Buat playlist baru"
          title="Buat playlist baru"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 pb-2 space-y-1">
        <button
          type="button"
          onClick={() => navigate({ name: 'liked' })}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors ${
            currentRoute.name === 'liked'
              ? 'bg-white/[0.1] text-[#2EE6A6] font-medium'
              : 'text-white/75 hover:text-white hover:bg-white/[0.05]'
          }`}
        >
          <span className="flex items-center gap-3 min-w-0">
            <Heart
              className={`w-4 h-4 shrink-0 ${
                currentRoute.name === 'liked' ? 'fill-[#2EE6A6] text-[#2EE6A6]' : 'text-[#2EE6A6]'
              }`}
              strokeWidth={1.75}
            />
            <span className="truncate">Lagu Disukai</span>
          </span>
          <span className="text-xs text-white/45 tabular-nums shrink-0">{likedCount}</span>
        </button>

        {sortedPlaylists.map((pl) => {
          const active = currentRoute.name === 'local-playlist' && currentRoute.id === pl.id;
          return (
            <button
              key={pl.id}
              type="button"
              onClick={() => navigate({ name: 'local-playlist', id: pl.id })}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                active
                  ? 'bg-white/[0.1] text-[#2EE6A6] font-medium'
                  : 'text-white/70 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <ListMusic className="w-4 h-4 shrink-0 text-white/50" strokeWidth={1.75} />
                <span className="truncate">{pl.name}</span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                {pl.pinned && <Pin className="w-3 h-3 text-[#2EE6A6]" strokeWidth={1.75} />}
                <span className="text-xs text-white/40 tabular-nums">{pl.tracks.length}</span>
              </span>
            </button>
          );
        })}

        {playlists.length === 0 && (
          <p className="px-3 pt-2 text-xs text-white/40 leading-relaxed">
            Belum ada playlist lokal. Tekan + untuk membuat.
          </p>
        )}
      </div>

      <div className="p-2.5 border-t border-white/[0.08] flex items-center gap-1">
        <button
          type="button"
          onClick={() => navigate({ name: 'settings' })}
          className={`flex-1 flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors ${
            currentRoute.name === 'settings'
              ? 'bg-white/[0.1] text-[#2EE6A6]'
              : 'text-white/65 hover:text-white hover:bg-white/[0.05]'
          }`}
        >
          <Settings className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>Pengaturan</span>
        </button>
        <button
          type="button"
          onClick={() => navigate({ name: 'shortcuts' })}
          aria-label="Pintasan Keyboard"
          title="Pintasan Keyboard"
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
            currentRoute.name === 'shortcuts'
              ? 'bg-white/[0.1] text-[#2EE6A6]'
              : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
          }`}
        >
          <Keyboard className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
}
