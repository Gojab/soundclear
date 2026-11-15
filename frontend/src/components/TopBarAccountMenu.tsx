import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Check,
  ExternalLink,
  Heart,
  Keyboard,
  Library,
  Palette,
  Settings,
  Sliders,
  User,
} from 'lucide-react';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { useSettingsStore } from '../store/settingsStore';

export function TopBarAccountMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const currentRoute = useNavigationStore((s) => s.currentRoute);
  const navigate = useNavigationStore((s) => s.navigate);
  const accountKey = useSettingsStore((s) => s.accountKey);
  const likedCount = useLibraryStore((s) => s.likedTracks.length);
  const playlistsCount = useLibraryStore((s) => s.playlists.length);

  const avatarLetter = 'S';

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const go = (route: Parameters<typeof navigate>[0]) => {
    setOpen(false);
    navigate(route);
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu akun dan pengaturan"
        title="Akun & Pengaturan"
        className={`w-9 h-9 rounded-full p-1 flex items-center justify-center transition-transform hover:scale-105 ${
          open || currentRoute.name === 'settings'
            ? 'bg-white/[0.14] ring-2 ring-[#B3F7D1]/30'
            : 'bg-white/[0.06] hover:bg-white/[0.11]'
        }`}
      >
        <span className="w-full h-full rounded-full bg-sc-gradient text-[#0F1F17] text-xs font-extrabold flex items-center justify-center">
          {avatarLetter}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Menu akun dan pengaturan"
          className="absolute right-0 mt-2 w-[280px] rounded-xl bg-[#0B0F0D]/85 backdrop-blur-2xl border border-white/[0.14] shadow-[0_16px_40px_rgba(0,0,0,0.8)] p-1.5 z-50 text-left"
        >
          <div className="space-y-0.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => go({ name: 'settings', tab: 'general' })}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[4px] text-[13px] font-medium text-[#E8FFF3]/90 hover:bg-white/[0.09] hover:text-[#E8FFF3] transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <User className="w-4 h-4 text-[#B3F7D1]/70" strokeWidth={1.9} />
                <span>Profil ({accountKey === 'cloud' ? 'Streaming Audio' : 'Mode Lokal'})</span>
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-[#B3F7D1]/50" strokeWidth={1.8} />
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => go({ name: 'library' })}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[4px] text-[13px] font-medium text-[#E8FFF3]/90 hover:bg-white/[0.09] hover:text-[#E8FFF3] transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <Library className="w-4 h-4 text-[#B3F7D1]/70" strokeWidth={1.9} />
                <span>Koleksi Kamu</span>
              </span>
              <span className="text-[11px] text-[#B3F7D1]/50 font-mono-num">{playlistsCount}</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => go({ name: 'liked' })}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[4px] text-[13px] font-medium text-[#E8FFF3]/90 hover:bg-white/[0.09] hover:text-[#E8FFF3] transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <Heart className="w-4 h-4 text-[#B3F7D1]/70" strokeWidth={1.9} />
                <span>Lagu yang Disukai</span>
              </span>
              <span className="text-[11px] text-[#B3F7D1]/50 font-mono-num">{likedCount}</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => go({ name: 'recap' })}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[4px] text-[13px] font-medium text-[#E8FFF3]/90 hover:bg-white/[0.09] hover:text-[#E8FFF3] transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 text-[#B3F7D1]/70" strokeWidth={1.9} />
                <span>Rekap Dengar</span>
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => go({ name: 'settings', tab: 'appearance' })}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[4px] text-[13px] font-medium text-[#E8FFF3]/90 hover:bg-white/[0.09] hover:text-[#E8FFF3] transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <Palette className="w-4 h-4 text-[#19EE8A]" strokeWidth={1.9} />
                <span>Latar Belakang &amp; Tampilan</span>
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => go({ name: 'settings', tab: 'sound', focusEq: true })}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[4px] text-[13px] font-medium text-[#E8FFF3]/90 hover:bg-white/[0.09] hover:text-[#E8FFF3] transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <Sliders className="w-4 h-4 text-[#19EE8A]" strokeWidth={1.9} />
                <span>Pengaturan Audio &amp; EQ</span>
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => go({ name: 'shortcuts' })}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[4px] text-[13px] font-medium text-[#E8FFF3]/90 hover:bg-white/[0.09] hover:text-[#E8FFF3] transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <Keyboard className="w-4 h-4 text-[#B3F7D1]/70" strokeWidth={1.9} />
                <span>Pintasan Keyboard</span>
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => go({ name: 'settings', tab: 'general' })}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[4px] text-[13px] font-medium transition-colors ${
                currentRoute.name === 'settings'
                  ? 'bg-white/[0.09] text-[#19EE8A]'
                  : 'text-[#E8FFF3]/90 hover:bg-white/[0.09] hover:text-[#E8FFF3]'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Settings className="w-4 h-4 text-[#B3F7D1]/70" strokeWidth={1.9} />
                <span>Pengaturan</span>
              </span>
            </button>
          </div>

          <div className="my-1.5 border-t border-[#B3F7D1]/[0.12]" />

          <div className="px-3 pt-1.5 pb-4">
            <p className="text-[13px] font-bold text-[#E8FFF3]">Info Terkini</p>
            <div className="mt-4 flex flex-col items-center text-center gap-2 px-2">
              <Check className="w-7 h-7 text-[#19EE8A]" strokeWidth={2} />
              <p className="text-xs font-bold text-[#E8FFF3]">Kamu sudah lihat semuanya</p>
              <p className="text-[11px] leading-relaxed text-[#B3F7D1]/65">
                Pantau terus bagian ini untuk pembaruan pemutar audio, playlist, dan pustaka lokal Anda.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
