import { useEffect } from 'react';
import {
  BarChart3,
  ChevronRight,
  Clock,
  Cloud,
  Heart,
  Keyboard,
  ListMusic,
  LogIn,
  LogOut,
  Palette,
  Plus,
  Settings,
  Sliders,
  X,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
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

  const user = useAuthStore((s) => s.user);
  const signingIn = useAuthStore((s) => s.signingIn);
  const syncActive = useAuthStore((s) => s.syncActive);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signOutUser = useAuthStore((s) => s.signOutUser);

  const avatarLetter = (user?.displayName?.trim().charAt(0) || user?.email?.trim().charAt(0) || 'S').toUpperCase();

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
      <aside className="relative z-10 w-[84%] max-w-[330px] h-full bg-[#090D0B]/92 backdrop-blur-2xl border-r border-white/[0.12] flex flex-col overflow-y-auto px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] shadow-2xl">
        {/* Top Stacked Profile Card */}
        <div className="rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.11] overflow-hidden mb-4">
          <div className="flex items-center justify-between gap-2 p-4">
            <button
              type="button"
              onClick={() => go({ name: 'library' })}
              className="flex items-center gap-3 min-w-0 flex-1 text-left"
            >
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Profil'}
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-full object-cover shrink-0"
                />
              ) : (
                <span className="w-11 h-11 rounded-full bg-sc-gradient text-[#0F1F17] text-base font-extrabold flex items-center justify-center shrink-0">
                  {avatarLetter}
                </span>
              )}
              <div className="min-w-0">
                <p className="text-base font-bold text-[#E8FFF3] truncate">
                  {user?.displayName || 'SoundClear'}
                </p>
                <p className="text-xs text-[#B3F7D1]/65 truncate flex items-center gap-1">
                  {user ? (
                    <>
                      <Cloud className="w-3 h-3 text-[#19EE8A] shrink-0" strokeWidth={2} />
                      <span className="truncate">
                        {syncActive ? 'Firestore Aktif' : user.email || 'Akun Google'}
                      </span>
                    </>
                  ) : (
                    <span>
                      {accountKey === 'cloud' ? 'Streaming Audio' : 'Mode Lokal'} · Lihat koleksi
                    </span>
                  )}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup laci profil"
              className="w-11 h-11 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[#B3F7D1]/70 shrink-0"
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>

          <div className="px-4 pb-4 flex items-center gap-2">
            {user ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void signOutUser();
                }}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-red-500/20 text-xs font-semibold text-[#E8FFF3] hover:text-red-200 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" strokeWidth={2} />
                Keluar dari Google
              </button>
            ) : (
              <button
                type="button"
                disabled={signingIn}
                onClick={() => {
                  void signInWithGoogle();
                }}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-bold hover:brightness-105 disabled:opacity-50 transition-all"
              >
                <LogIn className="w-3.5 h-3.5" strokeWidth={2.2} />
                {signingIn ? 'Menghubungkan Google...' : 'Masuk dengan Google (Firestore)'}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenCreatePlaylist();
            }}
            className="w-full min-h-[48px] flex items-center gap-4 px-4 py-2 border-t border-white/[0.09] hover:bg-white/[0.08] text-left transition-colors"
          >
            <span className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center text-[#E8FFF3] shrink-0">
              <Plus className="w-4 h-4" strokeWidth={2} />
            </span>
            <span className="text-sm font-medium text-[#E8FFF3]">Buat playlist baru</span>
          </button>
        </div>

        {/* Main Drawer Links */}
        <nav aria-label="Menu profil" className="space-y-2">
          <button
            type="button"
            onClick={() => go({ name: 'recap' })}
            className="w-full min-h-[44px] flex items-center gap-4 px-2 py-2 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
          >
            <BarChart3 className="w-5 h-5 text-[#19EE8A] shrink-0" strokeWidth={1.9} />
            <span className="text-[15px] font-medium text-[#E8FFF3]">Statistik mendengarkan</span>
          </button>

          <button
            type="button"
            onClick={() => go({ name: 'library' })}
            className="w-full min-h-[44px] flex items-center gap-4 px-2 py-2 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
          >
            <Clock className="w-5 h-5 text-[#E8FFF3]/85 shrink-0" strokeWidth={1.9} />
            <span className="text-[15px] font-medium text-[#E8FFF3]">Baru Diputar &amp; Koleksi</span>
          </button>

          <button
            type="button"
            onClick={() => go({ name: 'settings', tab: 'appearance' })}
            className="w-full min-h-[44px] flex items-center gap-4 px-2 py-2 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
          >
            <Palette className="w-5 h-5 text-[#19EE8A] shrink-0" strokeWidth={1.9} />
            <span className="text-[15px] font-medium text-[#E8FFF3]">Latar Belakang &amp; Tampilan</span>
          </button>

          <button
            type="button"
            onClick={() => go({ name: 'settings', tab: 'sound', focusEq: true })}
            className="w-full min-h-[44px] flex items-center gap-4 px-2 py-2 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
          >
            <Sliders className="w-5 h-5 text-[#E8FFF3]/85 shrink-0" strokeWidth={1.9} />
            <span className="text-[15px] font-medium text-[#E8FFF3]">Pengaturan Audio &amp; EQ</span>
          </button>

          <button
            type="button"
            onClick={() => go({ name: 'shortcuts' })}
            className="w-full min-h-[44px] flex items-center gap-4 px-2 py-2 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
          >
            <Keyboard className="w-5 h-5 text-[#E8FFF3]/85 shrink-0" strokeWidth={1.9} />
            <span className="text-[15px] font-medium text-[#E8FFF3]">Pintasan &amp; Info Terkini</span>
          </button>

          <button
            type="button"
            onClick={() => go({ name: 'settings', tab: 'general' })}
            className="w-full min-h-[44px] flex items-center gap-4 px-2 py-2 rounded-xl hover:bg-white/[0.07] text-left transition-colors"
          >
            <Settings className="w-5 h-5 text-[#E8FFF3]/85 shrink-0" strokeWidth={1.9} />
            <span className="text-[15px] font-medium text-[#E8FFF3]">Pengaturan dan privasi</span>
          </button>
        </nav>

        {/* Circular Quick Shortcuts (IMG_4282 middle icons section) */}
        <div className="flex items-start gap-6 px-2 py-6 border-t border-b border-white/[0.08] my-4">
          <button
            type="button"
            onClick={() => go({ name: 'liked' })}
            className="flex flex-col items-center gap-2 w-20 text-center group"
          >
            <span className="w-14 h-14 rounded-full bg-white/[0.07] border border-white/[0.12] group-hover:border-[#19EE8A]/50 flex items-center justify-center text-[#19EE8A] transition-colors">
              <Heart className="w-5 h-5 fill-[#19EE8A]" strokeWidth={1.85} />
            </span>
            <span className="text-xs font-medium text-[#E8FFF3]">Disukai</span>
            <span className="text-[11px] text-[#B3F7D1]/60">{likedCount} lagu</span>
          </button>

          <button
            type="button"
            onClick={() => go({ name: 'library' })}
            className="flex flex-col items-center gap-2 w-20 text-center group"
          >
            <span className="w-14 h-14 rounded-full bg-white/[0.07] border border-white/[0.12] group-hover:border-[#19EE8A]/50 flex items-center justify-center text-[#E8FFF3] transition-colors">
              <ListMusic className="w-5 h-5 text-[#19EE8A]" strokeWidth={1.85} />
            </span>
            <span className="text-xs font-medium text-[#E8FFF3]">Playlist</span>
            <span className="text-[11px] text-[#B3F7D1]/60">{playlistsCount} daftar</span>
          </button>
        </div>

        {/* Bottom Highlight Section */}
        <button
          type="button"
          onClick={() => go({ name: 'settings', tab: 'appearance' })}
          className="rounded-2xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] p-4 text-left transition-colors space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-[#E8FFF3]">Kustomisasi Latar</span>
            <ChevronRight className="w-4 h-4 text-[#B3F7D1]/70" strokeWidth={2} />
          </div>
          <p className="text-xs text-[#B3F7D1]/70 leading-relaxed max-w-[65ch]">
            Pasang wallpaper atau foto favoritmu secara jernih tanpa blur di layar utama SoundClear.
          </p>
        </button>
      </aside>
    </div>
  );
}
