import { useEffect } from 'react';
import {
  BarChart3,
  ChevronRight,
  Clock,
  Heart,
  Keyboard,
  Palette,
  Plus,
  Settings,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { useSettingsStore } from '../store/settingsStore';

interface MobileProfileDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpenCreatePlaylist: () => void;
}

export function MobileProfileDrawer({
  open,
  onClose,
  onOpenCreatePlaylist,
}: MobileProfileDrawerProps) {
  const navigate = useNavigationStore((s) => s.navigate);
  const accountKey = useSettingsStore((s) => s.accountKey);
  const likedCount = useLibraryStore((s) => s.likedTracks.length);
  const playlistsCount = useLibraryStore((s) => s.playlists.length);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const go = (route: Parameters<typeof navigate>[0]) => {
    onClose();
    navigate(route);
  };

  return (
    <div className="fixed inset-0 z-50 md:hidden flex" role="dialog" aria-modal="true" aria-label="Menu profil dan navigasi">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Tutup menu profil"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* Left Slide-Over Drawer (IMG_4282 layout, SoundClear glass & mint design) */}
      <aside className="relative z-10 w-[84%] max-w-[330px] h-full bg-[#090D0B]/92 backdrop-blur-2xl border-r border-white/[0.12] flex flex-col overflow-y-auto px-4 pt-5 pb-8 shadow-2xl">
        {/* Top Stacked Profile Card */}
        <div className="rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.11] overflow-hidden mb-4">
          <div className="flex items-center justify-between gap-3 p-3.5">
            <button
              type="button"
              onClick={() => go({ name: 'library' })}
              className="flex items-center gap-3 min-w-0 flex-1 text-left"
            >
              <span className="w-11 h-11 rounded-full bg-sc-gradient text-[#0F1F17] text-base font-extrabold flex items-center justify-center shrink-0">
                S
              </span>
              <div className="min-w-0">
                <p className="text-base font-bold text-[#E8FFF3] truncate">SoundClear</p>
                <p className="text-xs text-[#B3F7D1]/65 truncate">
                  {accountKey === 'cloud' ? 'Streaming Audio' : 'Mode Lokal'} · Lihat koleksi
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup laci profil"
              className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[#B3F7D1]/70"
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenCreatePlaylist();
            }}
            className="w-full flex items-center gap-3 px-3.5 py-3 border-t border-white/[0.09] hover:bg-white/[0.08] text-left transition-colors"
          >
            <span className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center text-[#E8FFF3] shrink-0">
              <Plus className="w-4 h-4" strokeWidth={2} />
            </span>
            <span className="text-sm font-medium text-[#E8FFF3]">Buat playlist baru</span>
          </button>
        </div>

        {/* Main Drawer Links */}
        <nav aria-label="Menu profil" className="space-y-1">
          <button
            type="button"
            onClick={() => go({ name: 'recap' })}
            className="w-full flex items-center gap-3.5 px-2.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
          >
            <BarChart3 className="w-5 h-5 text-[#19EE8A] shrink-0" strokeWidth={1.9} />
            <span className="text-[15px] font-medium text-[#E8FFF3]">Statistik mendengarkan</span>
          </button>

          <button
            type="button"
            onClick={() => go({ name: 'library' })}
            className="w-full flex items-center gap-3.5 px-2.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
          >
            <Clock className="w-5 h-5 text-[#E8FFF3]/85 shrink-0" strokeWidth={1.9} />
            <span className="text-[15px] font-medium text-[#E8FFF3]">Baru Diputar &amp; Koleksi</span>
          </button>

          <button
            type="button"
            onClick={() => go({ name: 'settings', tab: 'appearance' })}
            className="w-full flex items-center gap-3.5 px-2.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
          >
            <Palette className="w-5 h-5 text-[#19EE8A] shrink-0" strokeWidth={1.9} />
            <span className="text-[15px] font-medium text-[#E8FFF3]">Latar Belakang &amp; Tampilan</span>
          </button>

          <button
            type="button"
            onClick={() => go({ name: 'settings', tab: 'sound', focusEq: true })}
            className="w-full flex items-center gap-3.5 px-2.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
          >
            <Sliders className="w-5 h-5 text-[#E8FFF3]/85 shrink-0" strokeWidth={1.9} />
            <span className="text-[15px] font-medium text-[#E8FFF3]">Pengaturan Audio &amp; EQ</span>
          </button>

          <button
            type="button"
            onClick={() => go({ name: 'shortcuts' })}
            className="w-full flex items-center gap-3.5 px-2.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
          >
            <Keyboard className="w-5 h-5 text-[#E8FFF3]/85 shrink-0" strokeWidth={1.9} />
            <span className="text-[15px] font-medium text-[#E8FFF3]">Pintasan &amp; Info Terkini</span>
          </button>

          <button
            type="button"
            onClick={() => go({ name: 'settings', tab: 'general' })}
            className="w-full flex items-center gap-3.5 px-2.5 py-3 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
          >
            <Settings className="w-5 h-5 text-[#E8FFF3]/85 shrink-0" strokeWidth={1.9} />
            <span className="text-[15px] font-medium text-[#E8FFF3]">Pengaturan dan privasi</span>
          </button>
        </nav>

        {/* Circular Quick Shortcuts (IMG_4282 middle icons section) */}
        <div className="flex items-start gap-5 px-2 py-5 border-t border-b border-white/[0.08] my-3">
          <button
            type="button"
            onClick={() => go({ name: 'liked' })}
            className="flex flex-col items-center gap-1.5 w-20 text-center group"
          >
            <span className="w-13 h-13 rounded-full bg-white/[0.07] border border-white/[0.12] group-hover:border-[#19EE8A]/50 flex items-center justify-center text-[#19EE8A] transition-colors">
              <Heart className="w-5 h-5 fill-[#19EE8A]" strokeWidth={1.85} />
            </span>
            <span className="text-xs font-medium text-[#E8FFF3]">Disukai</span>
            <span className="text-[11px] text-[#B3F7D1]/60">{likedCount} lagu</span>
          </button>

          <button
            type="button"
            onClick={() => go({ name: 'library' })}
            className="flex flex-col items-center gap-1.5 w-20 text-center group"
          >
            <span className="w-13 h-13 rounded-full bg-white/[0.07] border border-white/[0.12] group-hover:border-[#19EE8A]/50 flex items-center justify-center text-[#E8FFF3] transition-colors">
              <Sparkles className="w-5 h-5 text-[#19EE8A]" strokeWidth={1.85} />
            </span>
            <span className="text-xs font-medium text-[#E8FFF3]">Playlist</span>
            <span className="text-[11px] text-[#B3F7D1]/60">{playlistsCount} daftar</span>
          </button>
        </div>

        {/* Bottom Highlight Section */}
        <button
          type="button"
          onClick={() => go({ name: 'settings', tab: 'appearance' })}
          className="rounded-2xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] p-3.5 text-left transition-colors space-y-1.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-[#E8FFF3]">Kustomisasi Latar</span>
            <ChevronRight className="w-4 h-4 text-[#B3F7D1]/70" strokeWidth={2} />
          </div>
          <p className="text-xs text-[#B3F7D1]/70 leading-relaxed">
            Pasang wallpaper atau foto favoritmu secara jernih tanpa blur di layar utama SoundClear.
          </p>
        </button>
      </aside>
    </div>
  );
}
