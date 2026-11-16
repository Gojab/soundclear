import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Check,
  Cloud,
  ExternalLink,
  Heart,
  Keyboard,
  Library,
  LogIn,
  LogOut,
  Palette,
  Settings,
  Sliders,
  User,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
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

  const user = useAuthStore((s) => s.user);
  const signingIn = useAuthStore((s) => s.signingIn);
  const syncActive = useAuthStore((s) => s.syncActive);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signOutUser = useAuthStore((s) => s.signOutUser);

  const avatarLetter = (user?.displayName?.trim().charAt(0) || user?.email?.trim().charAt(0) || 'S').toUpperCase();

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
        title={user ? `${user.displayName || user.email} · Firestore` : 'Akun & Pengaturan'}
        className={`w-9 h-9 rounded-full p-1 flex items-center justify-center transition-transform hover:scale-105 ${
          open || currentRoute.name === 'settings'
            ? 'bg-white/[0.14] ring-2 ring-[#B3F7D1]/30'
            : 'bg-white/[0.06] hover:bg-white/[0.11]'
        }`}
      >
        {user?.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || 'Profil'}
            referrerPolicy="no-referrer"
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <span className="w-full h-full rounded-full bg-sc-gradient text-[#0F1F17] text-xs font-extrabold flex items-center justify-center">
            {avatarLetter}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Menu akun dan pengaturan"
          className="absolute right-0 mt-2 w-[290px] rounded-xl bg-[#0B0F0D]/90 backdrop-blur-2xl border border-white/[0.14] shadow-[0_16px_40px_rgba(0,0,0,0.8)] p-1.5 z-50 text-left"
        >
          {/* Firebase Account Card */}
          <div className="px-2.5 py-2.5 mb-1 rounded-lg bg-white/[0.05] border border-white/[0.08]">
            {user ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Profil'}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <span className="w-9 h-9 rounded-full bg-sc-gradient text-[#0F1F17] text-xs font-extrabold flex items-center justify-center shrink-0">
                      {avatarLetter}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#E8FFF3] truncate">
                      {user.displayName || 'Pengguna SoundClear'}
                    </p>
                    <p className="text-[11px] text-[#B3F7D1]/65 truncate">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#19EE8A]">
                    <Cloud className="w-3.5 h-3.5" strokeWidth={2} />
                    {syncActive ? 'Firestore Sinkron' : 'Menghubungkan...'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      void signOutUser();
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.08] hover:bg-red-500/20 text-[11px] font-medium text-[#E8FFF3] hover:text-red-200 transition-colors"
                  >
                    <LogOut className="w-3 h-3" strokeWidth={2} />
                    Keluar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#E8FFF3]">Mode Lokal / Tamu</p>
                  <p className="text-[11px] text-[#B3F7D1]/65 leading-snug mt-0.5">
                    Masuk dengan Google untuk menyinkronkan playlist, suka &amp; EQ ke Firestore.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={signingIn}
                  onClick={() => {
                    void signInWithGoogle();
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-sc-gradient text-[#0F1F17] text-xs font-bold hover:brightness-105 disabled:opacity-50 transition-all"
                >
                  <LogIn className="w-3.5 h-3.5" strokeWidth={2.2} />
                  {signingIn ? 'Menghubungkan Google...' : 'Masuk dengan Google'}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-0.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => go({ name: 'settings', tab: 'general' })}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[4px] text-[13px] font-medium text-[#E8FFF3]/90 hover:bg-white/[0.09] hover:text-[#E8FFF3] transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <User className="w-4 h-4 text-[#B3F7D1]/70" strokeWidth={1.9} />
                <span>
                  Akun ({user ? 'Firestore Cloud' : accountKey === 'cloud' ? 'Streaming Audio' : 'Mode Lokal'})
                </span>
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

          <div className="px-3 pt-1.5 pb-3">
            <p className="text-[13px] font-bold text-[#E8FFF3]">Status Sinkronisasi</p>
            <div className="mt-2.5 flex flex-col items-center text-center gap-1.5 px-2">
              <Check className="w-6 h-6 text-[#19EE8A]" strokeWidth={2} />
              <p className="text-xs font-bold text-[#E8FFF3]">
                {syncActive ? 'Pustaka tersinkron ke Firestore' : 'Penyimpanan lokal siap digunakan'}
              </p>
              <p className="text-[11px] leading-relaxed text-[#B3F7D1]/65">
                {user
                  ? 'Perubahan playlist, lagu disukai, dan preset EQ tersimpan real-time di akun Google Anda.'
                  : 'Masuk dengan Google kapan saja untuk mencadangkan pustaka ke cloud.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
