import { useEffect, useRef, useState } from 'react';
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
import { AudioSettingsTab } from '../components/AudioSettingsTab';
import { BackgroundSettingsSection } from '../components/BackgroundSettingsSection';
import { exportAllSoundClearData, importAllSoundClearData } from '../db/soundclearDb';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { HomeSectionId, NotchDisplayMode } from '../types/music';
import {
  isDesktopNotchHost,
  listAvailableNotchMonitors,
} from '../utils/notchDesktopBridge';
import {
  closeWindowsExternalNotch,
  openWindowsExternalNotch,
  useExternalPiPWindow,
} from '../utils/notchExternalPiP';
import {
  DEFAULT_NOTCH_MONITOR_OPTIONS,
  isWindowsPlatform,
  resolveWindowsExternalNotchSupport,
  supportsDocumentPictureInPicture,
  type NotchMonitorOption,
} from '../utils/notchPlayer';

const SECTION_LABELS: Record<HomeSectionId, string> = {
  continue: 'Lanjutkan (Terakhir Diputar)',
  daily_mix: 'Mix Hari Ini (Sesuai Waktu)',
  frequent: 'Sering Diputar & Putar Ulang',
  artist_releases: 'Rilisan Baru Artis Diikuti',
  for_you_mix: 'Mix Untukmu',
  charts: 'Tangga Lagu Indonesia',
  home_feed: 'Beranda Rekomendasi',
  moods: 'Rak Mood & Genre',
};

interface SettingsPageProps {
  initialTab?: 'general' | 'appearance' | 'sound';
  focusEq?: boolean;
}

export function SettingsPage({ initialTab = 'general', focusEq = false }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'sound'>(initialTab);
  const [syncing, setSyncing] = useState(false);
  const [monitorOptions, setMonitorOptions] = useState<NotchMonitorOption[]>(
    DEFAULT_NOTCH_MONITOR_OPTIONS,
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const eqSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void listAvailableNotchMonitors().then((opts) => {
      if (opts.length > 0) setMonitorOptions(opts);
    });
  }, []);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (activeTab === 'sound' && focusEq && eqSectionRef.current) {
      window.setTimeout(() => {
        eqSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  }, [activeTab, focusEq]);

  const hideExplicit = useSettingsStore((s) => s.hideExplicit);
  const autoplay = useSettingsStore((s) => s.autoplay);
  const dataSaver = useSettingsStore((s) => s.dataSaver);
  const showRightPanel = useSettingsStore((s) => s.showRightPanel);
  const homeSectionOrder = useSettingsStore((s) => s.homeSectionOrder);
  const notchDisplayMode = useSettingsStore((s) => s.notchDisplayMode);
  const notchMonitor = useSettingsStore((s) => s.notchMonitor);

  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const moveHomeSection = useSettingsStore((s) => s.moveHomeSection);
  const resetHomeSectionOrder = useSettingsStore((s) => s.resetHomeSectionOrder);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const setRightPanelOpen = usePlayerStore((s) => s.setRightPanelOpen);
  const hydratePlayer = usePlayerStore((s) => s.hydrate);
  const pipWindow = useExternalPiPWindow();
  const externalPipOpen = Boolean(pipWindow && !pipWindow.closed);
  const windowsExternalSupport = resolveWindowsExternalNotchSupport({
    isWindows: isWindowsPlatform(),
    hasDesktopHost: isDesktopNotchHost(),
    hasDocumentPiP: supportsDocumentPictureInPicture(),
  });

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
      showToast('Gagal menyinkronkan koleksi pustaka');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
            Pengaturan
          </h1>
          <p className="text-xs text-white/55 mt-0.5">
            Preferensi umum, latar belakang kustom, kualitas streaming, dan equalizer 10-band
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.06] border border-white/[0.08] self-start shrink-0 overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'general' ? 'bg-[#2EE6A6] text-[#06130E] font-semibold' : 'text-white/70 hover:text-white'
            }`}
          >
            Umum
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('appearance')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'appearance' ? 'bg-[#2EE6A6] text-[#06130E] font-semibold' : 'text-white/70 hover:text-white'
            }`}
          >
            Latar &amp; Tampilan
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sound')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'sound' ? 'bg-[#2EE6A6] text-[#06130E] font-semibold' : 'text-white/70 hover:text-white'
            }`}
          >
            Pengaturan Audio
          </button>
        </div>
      </div>

      {activeTab === 'sound' ? (
        <div ref={eqSectionRef}>
          <AudioSettingsTab />
        </div>
      ) : activeTab === 'appearance' ? (
        <BackgroundSettingsSection />
      ) : (
        <div className="space-y-5">
          {/* Preferensi Umum */}
          <section className="rounded-xl bg-[#181818] border border-white/[0.07] p-5 space-y-1">
            <h2 className="text-base font-bold text-white pb-2">Pemutaran &amp; Tampilan</h2>

            <div className="divide-y divide-white/[0.07]">
              <div className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <p id="lbl-hide-explicit" className="text-sm font-medium text-white">
                    Sembunyikan konten eksplisit
                  </p>
                  <p className="text-xs text-white/55 mt-0.5">
                    Saring lagu yang ditandai eksplisit di beranda dan pencarian
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={hideExplicit}
                  aria-labelledby="lbl-hide-explicit"
                  onClick={() => updateSetting('hideExplicit', !hideExplicit)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-[#2EE6A6] ${
                    hideExplicit ? 'bg-[#2EE6A6]' : 'bg-white/20 hover:bg-white/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                      hideExplicit
                        ? 'translate-x-6 bg-[#06130E]'
                        : 'translate-x-1 bg-white'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <p id="lbl-autoplay" className="text-sm font-medium text-white">
                    Putar otomatis (Autoplay radio)
                  </p>
                  <p className="text-xs text-white/55 mt-0.5">
                    Lanjutkan otomatis dengan lagu terkait saat antrean habis
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoplay}
                  aria-labelledby="lbl-autoplay"
                  onClick={() => updateSetting('autoplay', !autoplay)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-[#2EE6A6] ${
                    autoplay ? 'bg-[#2EE6A6]' : 'bg-white/20 hover:bg-white/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                      autoplay ? 'translate-x-6 bg-[#06130E]' : 'translate-x-1 bg-white'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <p id="lbl-datasaver" className="text-sm font-medium text-white">
                    Mode hemat data
                  </p>
                  <p className="text-xs text-white/55 mt-0.5">
                    Muat thumbnail beresolusi lebih kecil untuk menghemat kuota
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={dataSaver}
                  aria-labelledby="lbl-datasaver"
                  onClick={() => updateSetting('dataSaver', !dataSaver)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-[#2EE6A6] ${
                    dataSaver ? 'bg-[#2EE6A6]' : 'bg-white/20 hover:bg-white/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                      dataSaver ? 'translate-x-6 bg-[#06130E]' : 'translate-x-1 bg-white'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 pt-3.5 pb-1">
                <div className="min-w-0">
                  <p id="lbl-right-panel" className="text-sm font-medium text-white">
                    Tampilkan panel kanan &ldquo;Sedang diputar&rdquo;
                  </p>
                  <p className="text-xs text-white/55 mt-0.5">
                    Tampilkan pemutar, antrean, lirik, dan kredit lagu di sisi kanan
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showRightPanel}
                  aria-labelledby="lbl-right-panel"
                  onClick={() => setRightPanelOpen(!showRightPanel)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-[#2EE6A6] ${
                    showRightPanel ? 'bg-[#2EE6A6]' : 'bg-white/20 hover:bg-white/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                      showRightPanel
                        ? 'translate-x-6 bg-[#06130E]'
                        : 'translate-x-1 bg-white'
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* Pemutar Mini Notch */}
          <section className="rounded-xl bg-[#181818] border border-white/[0.07] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-white">Pemutar Mini Notch</h2>
                <p className="text-xs text-white/55 mt-0.5">
                  Pemutar mini keluar dari web khusus Windows (selalu di atas aplikasi lain)
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-white/[0.07] border border-white/[0.08] text-[11px] font-medium text-white/80">
                Khusus Windows
              </span>
            </div>

            <div className="space-y-4 pt-1 border-t border-white/[0.07]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    Jendela Eksternal di Luar Web (Windows)
                  </p>
                  <p className="text-xs text-white/55 mt-0.5">
                    {windowsExternalSupport.mode === 'desktop-ipc'
                      ? 'Aktif otomatis di jendela desktop Windows (tanpa bingkai, selalu di atas, area transparan tembus klik).'
                      : windowsExternalSupport.mode === 'document-pip'
                        ? externalPipOpen
                          ? 'Jendela pemutar mini Windows sedang aktif di luar browser.'
                          : 'Buka pemutar mini mengambang di desktop Windows (Chrome / Edge).'
                        : windowsExternalSupport.reason === 'windows-only'
                          ? 'Mode keluar jendela khusus untuk sistem operasi Windows. Di perangkat ini pemutar mini tetap tampil di dalam web.'
                          : 'Browser Windows ini belum mendukung Document Picture-in-Picture; gunakan Chrome/Edge terbaru atau aplikasi Desktop Windows.'}
                  </p>
                </div>
                {windowsExternalSupport.mode === 'document-pip' ? (
                  <button
                    type="button"
                    disabled={!currentTrack}
                    onClick={() => {
                      if (externalPipOpen) {
                        closeWindowsExternalNotch();
                      } else {
                        void openWindowsExternalNotch();
                      }
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shrink-0 disabled:opacity-40 ${
                      externalPipOpen
                        ? 'bg-white/[0.12] text-white hover:bg-white/[0.18]'
                        : 'bg-[#2EE6A6] text-[#06130E] hover:brightness-105'
                    }`}
                  >
                    {externalPipOpen
                      ? 'Tutup Jendela Eksternal'
                      : currentTrack
                        ? 'Keluarkan dari Web (Windows)'
                        : 'Putar Lagu Terlebih Dahulu'}
                  </button>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl bg-white/[0.06] text-xs font-medium text-white/60 shrink-0">
                    {windowsExternalSupport.mode === 'desktop-ipc'
                      ? 'Mode Desktop Aktif'
                      : 'Khusus Windows'}
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-white/[0.07]">
                <div className="min-w-0">
                  <p id="lbl-notch-mode" className="text-sm font-medium text-white">
                    Tampilkan notch
                  </p>
                  <p className="text-xs text-white/55 mt-0.5">
                    Pilih kapan pemutar mini notch tampil saat lagu diputar
                  </p>
                </div>
                <div
                  role="radiogroup"
                  aria-labelledby="lbl-notch-mode"
                  className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.06] border border-white/[0.08] shrink-0 self-start sm:self-auto"
                >
                  {(
                    [
                      { value: 'always', label: 'Selalu' },
                      { value: 'background', label: 'Saat di latar' },
                      { value: 'off', label: 'Mati' },
                    ] as Array<{ value: NotchDisplayMode; label: string }>
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={notchDisplayMode === opt.value}
                      onClick={() => updateSetting('notchDisplayMode', opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                        notchDisplayMode === opt.value
                          ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                          : 'text-white/70 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-white/[0.07]">
                <div className="min-w-0">
                  <label htmlFor="select-notch-monitor" className="text-sm font-medium text-white block">
                    Pilihan monitor (Windows Desktop)
                  </label>
                  <p className="text-xs text-white/55 mt-0.5">
                    Monitor target tempat notch melayang saat dijalankan di pembungkus Desktop Windows
                  </p>
                </div>
                <select
                  id="select-notch-monitor"
                  value={notchMonitor}
                  onChange={(e) => updateSetting('notchMonitor', e.target.value)}
                  className="px-3 py-2 rounded-xl bg-white/[0.07] border border-white/[0.1] text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#2EE6A6] shrink-0"
                >
                  {monitorOptions.map((opt) => (
                    <option key={opt.id} value={opt.id} className="bg-[#181818] text-white">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Urutan Bagian Beranda */}
          <section className="rounded-xl bg-[#181818] border border-white/[0.07] p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Urutan Bagian Beranda</h2>
                <p className="text-xs text-white/50">
                  Atur prioritas tampilan rak di halaman Beranda
                </p>
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

          {/* Mode Katalog & Pustaka */}
          <section className="rounded-xl bg-[#181818] border border-white/[0.07] p-5 space-y-3">
            <h2 className="text-base font-semibold text-white">Mode Katalog &amp; Pustaka</h2>
            <p className="text-xs text-white/60">
              {accountStatusQuery.data?.message ||
                'Mode tanpa login aktif. Katalog musik tersedia langsung tanpa memerlukan masuk akun.'}
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
            <section className="rounded-xl bg-[#181818] border border-white/[0.07] p-5 space-y-3">
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
          <section className="rounded-xl bg-[#181818] border border-white/[0.07] p-5 space-y-4">
            <h2 className="text-base font-semibold text-white">Data Lokal &amp; Cadangan</h2>
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
      )}
    </div>
  );
}
