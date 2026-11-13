import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { fetchAccountLibrary, fetchAccountStatus } from '../api/client';
import { exportAllSoundClearData, importAllSoundClearData } from '../db/soundclearDb';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { HomeSectionId } from '../types/music';

const SECTION_LABELS: Record<HomeSectionId, string> = {
  continue: 'Lanjutkan (Terakhir Diputar)',
  daily_mix: 'Mix Hari Ini (Sesuai Waktu)',
  frequent: 'Sering Diputar & Putar Ulang',
  artist_releases: 'Rilisan Baru Artis Diikuti',
  for_you_mix: 'Mix Untukmu',
  charts: 'Tangga Lagu Indonesia',
  home_feed: 'Beranda YouTube Music',
  moods: 'Rak Mood & Genre',
};

export function SettingsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [syncing, setSyncing] = useState(false);

  const hideExplicit = useSettingsStore((s) => s.hideExplicit);
  const autoplay = useSettingsStore((s) => s.autoplay);
  const dataSaver = useSettingsStore((s) => s.dataSaver);
  const showRightPanel = useSettingsStore((s) => s.showRightPanel);
  const homeSectionOrder = useSettingsStore((s) => s.homeSectionOrder);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const moveHomeSection = useSettingsStore((s) => s.moveHomeSection);
  const resetHomeSectionOrder = useSettingsStore((s) => s.resetHomeSectionOrder);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);

  const setRightPanelOpen = usePlayerStore((s) => s.setRightPanelOpen);
  const hydratePlayer = usePlayerStore((s) => s.hydrate);

  const hiddenTrackIds = useLibraryStore((s) => s.hiddenTrackIds);
  const unhideTrack = useLibraryStore((s) => s.unhideTrack);
  const clearPlayHistory = useLibraryStore((s) => s.clearPlayHistory);
  const clearRecentSearches = useLibraryStore((s) => s.clearRecentSearches);
  const hydrateLibrary = useLibraryStore((s) => s.hydrate);
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const isLiked = useLibraryStore((s) => s.isLiked);
  const toggleFollowArtist = useLibraryStore((s) => s.toggleFollowArtist);
  const isArtistFollowed = useLibraryStore((s) => s.isArtistFollowed);
  const toggleSaveAlbum = useLibraryStore((s) => s.toggleSaveAlbum);
  const isAlbumSaved = useLibraryStore((s) => s.isAlbumSaved);

  const showToast = useContextMenuStore((s) => s.showToast);

  const accountStatusQuery = useQuery({
    queryKey: ['account-status'],
    queryFn: ({ signal }) => fetchAccountStatus(signal),
  });

  const handleExportJson = async () => {
    try {
      const data = await exportAllSoundClearData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `soundclear-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Data SoundClear berhasil diekspor ke JSON');
    } catch {
      showToast('Gagal mengekspor data');
    }
  };

  const handleImportJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      await importAllSoundClearData(parsed);
      await hydrateSettings();
      await hydrateLibrary();
      await hydratePlayer();
      showToast('Data JSON berhasil diimpor');
    } catch {
      showToast('File JSON tidak valid atau gagal diimpor');
    }
  };

  const handleSyncAccount = async () => {
    setSyncing(true);
    try {
      const lib = await fetchAccountLibrary();
      let added = 0;
      for (const song of lib.likedSongs) {
        if (!isLiked(song.videoId || song.id)) {
          toggleLike(song);
          added += 1;
        }
      }
      for (const artist of [...lib.artists, ...lib.subscriptions]) {
        const aid = artist.browseId || artist.id;
        if (aid && !isArtistFollowed(aid)) {
          toggleFollowArtist(artist);
          added += 1;
        }
      }
      for (const album of lib.albums) {
        const alid = album.browseId || album.id;
        if (alid && !isAlbumSaved(alid)) {
          toggleSaveAlbum(album);
          added += 1;
        }
      }
      showToast(`Sinkronisasi selesai (${added} item baru ditambahkan)`);
    } catch {
      showToast('Gagal menyinkronkan akun YouTube Music');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">Pengaturan</h1>
        <p className="text-xs text-white/55 mt-0.5">
          Preferensi pemutaran, tampilan beranda, akun, dan cadangan data lokal
        </p>
      </div>

      {/* Preferensi Umum */}
      <section className="glass-card rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-semibold text-white">Pemutaran & Tampilan</h2>

        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <p className="text-sm font-medium text-white">Sembunyikan konten eksplisit</p>
            <p className="text-xs text-white/50">Saring lagu yang ditandai eksplisit di beranda dan pencarian</p>
          </div>
          <input
            type="checkbox"
            checked={hideExplicit}
            onChange={(e) => updateSetting('hideExplicit', e.target.checked)}
            className="w-4 h-4 accent-[#2EE6A6]"
          />
        </label>

        <label className="flex items-center justify-between gap-4 cursor-pointer pt-3 border-t border-white/[0.07]">
          <div>
            <p className="text-sm font-medium text-white">Putar otomatis (Autoplay radio)</p>
            <p className="text-xs text-white/50">Lanjutkan otomatis dengan lagu terkait saat antrean habis</p>
          </div>
          <input
            type="checkbox"
            checked={autoplay}
            onChange={(e) => updateSetting('autoplay', e.target.checked)}
            className="w-4 h-4 accent-[#2EE6A6]"
          />
        </label>

        <label className="flex items-center justify-between gap-4 cursor-pointer pt-3 border-t border-white/[0.07]">
          <div>
            <p className="text-sm font-medium text-white">Mode hemat data</p>
            <p className="text-xs text-white/50">Muat thumbnail beresolusi lebih kecil untuk menghemat kuota</p>
          </div>
          <input
            type="checkbox"
            checked={dataSaver}
            onChange={(e) => updateSetting('dataSaver', e.target.checked)}
            className="w-4 h-4 accent-[#2EE6A6]"
          />
        </label>

        <label className="flex items-center justify-between gap-4 cursor-pointer pt-3 border-t border-white/[0.07]">
          <div>
            <p className="text-sm font-medium text-white">Tampilkan panel kanan &ldquo;Sedang diputar&rdquo;</p>
            <p className="text-xs text-white/50">Tampilkan pemutar YouTube, antrean, lirik, dan kredit lagu</p>
          </div>
          <input
            type="checkbox"
            checked={showRightPanel}
            onChange={(e) => setRightPanelOpen(e.target.checked)}
            className="w-4 h-4 accent-[#2EE6A6]"
          />
        </label>
      </section>

      {/* Urutan Bagian Beranda */}
      <section className="glass-card rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Urutan Bagian Beranda</h2>
            <p className="text-xs text-white/50">Atur prioritas tampilan rak di halaman Beranda</p>
          </div>
          <button
            type="button"
            onClick={resetHomeSectionOrder}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-xs text-white/80"
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
            Reset
          </button>
        </div>

        <div className="space-y-1.5">
          {homeSectionOrder.map((secId, idx) => (
            <div
              key={secId}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]"
            >
              <span className="text-xs sm:text-sm text-white/90">
                <span className="text-white/40 tabular-nums mr-2">{idx + 1}.</span>
                {SECTION_LABELS[secId as HomeSectionId] || secId}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveHomeSection(secId as HomeSectionId, 'up')}
                  aria-label={`Naikkan ${secId}`}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] disabled:opacity-25"
                >
                  <ArrowUp className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  disabled={idx === homeSectionOrder.length - 1}
                  onClick={() => moveHomeSection(secId as HomeSectionId, 'down')}
                  aria-label={`Turunkan ${secId}`}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] disabled:opacity-25"
                >
                  <ArrowDown className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Akun YouTube Music Opsional */}
      <section className="glass-card rounded-2xl p-5 space-y-3">
        <h2 className="text-base font-semibold text-white">Akun YouTube Music (Opsional)</h2>
        <p className="text-xs text-white/60">
          {accountStatusQuery.data?.message ||
            'Memeriksa konfigurasi autentikasi backend (YTMUSIC_AUTH_FILE)...'}
        </p>
        {accountStatusQuery.data?.authenticated && (
          <button
            type="button"
            disabled={syncing}
            onClick={() => void handleSyncAccount()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} strokeWidth={2} />
            {syncing ? 'Menyinkronkan...' : 'Sinkronkan Koleksi Akun'}
          </button>
        )}
      </section>

      {/* Lagu Disembunyikan */}
      {hiddenTrackIds.length > 0 && (
        <section className="glass-card rounded-2xl p-5 space-y-3">
          <h2 className="text-base font-semibold text-white">
            Lagu Disembunyikan ({hiddenTrackIds.length})
          </h2>
          <div className="space-y-1.5">
            {hiddenTrackIds.map((id) => (
              <div
                key={id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/[0.04]"
              >
                <span className="text-xs text-white/75 font-mono">{id}</span>
                <button
                  type="button"
                  onClick={() => unhideTrack(id)}
                  className="inline-flex items-center gap-1 text-xs text-[#2EE6A6] hover:underline"
                >
                  <Eye className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Tampilkan kembali
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Ekspor / Impor & Hapus Riwayat */}
      <section className="glass-card rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-semibold text-white">Data Lokal & Cadangan</h2>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => void handleExportJson()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold hover:brightness-105"
          >
            <Download className="w-4 h-4" strokeWidth={2} />
            Ekspor Data JSON
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white"
          >
            <Upload className="w-4 h-4" strokeWidth={1.75} />
            Impor Data JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportJson(file);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={async () => {
              await clearPlayHistory();
              showToast('Riwayat putar berhasil dihapus');
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.07] hover:bg-red-500/20 text-xs font-medium text-white/80 hover:text-red-200 transition-colors"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.75} />
            Hapus Riwayat Putar
          </button>

          <button
            type="button"
            onClick={() => {
              clearRecentSearches();
              showToast('Riwayat pencarian dihapus');
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.07] hover:bg-red-500/20 text-xs font-medium text-white/80 hover:text-red-200 transition-colors"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.75} />
            Hapus Pencarian Terakhir
          </button>
        </div>
      </section>
    </div>
  );
}
