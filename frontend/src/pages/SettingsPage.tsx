import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowDownCircle,
  ArrowUp,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Keyboard,
  MonitorSmartphone,
  Music,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Sliders,
  Trash2,
  Upload,
  UserCircle,
  Volume2,
  X,
} from 'lucide-react';
import { fetchAccountLibrary, fetchAccountStatus } from '../api/client';
import { AudioSettingsTab } from '../components/AudioSettingsTab';
import { BackgroundSettingsSection } from '../components/BackgroundSettingsSection';
import { CrossfadeControl } from '../components/CrossfadeControl';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { exportAllSoundClearData, importAllSoundClearData } from '../db/soundclearDb';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
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
  useExternalPiPState,
} from '../utils/notchExternalPiP';
import {
  DEFAULT_NOTCH_MONITOR_OPTIONS,
  isTopLevelBrowsingContext,
  isWindowsPlatform,
  resolveWindowsExternalNotchSupport,
  supportsDocumentPictureInPicture,
  supportsVideoPictureInPicture,
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

type SettingsCategoryId =
  | 'content'
  | 'playback'
  | 'audio'
  | 'offline'
  | 'devices'
  | 'account';

interface SettingsCategoryItem {
  id: SettingsCategoryId;
  title: string;
  subtitle: string;
  keywords: string;
  icon: (active: boolean) => ReactNode;
}

interface SettingsPageProps {
  initialTab?: 'general' | 'appearance' | 'sound';
  focusEq?: boolean;
}

function resolveInitialCategory(initialTab: 'general' | 'appearance' | 'sound'): SettingsCategoryId {
  if (initialTab === 'sound') return 'audio';
  return 'content';
}

export function SettingsPage({ initialTab = 'general', focusEq = false }: SettingsPageProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>(() =>
    resolveInitialCategory(initialTab),
  );
  // On mobile (< lg), start at the IMG_4281 hub unless routed specifically to appearance or sound
  const [mobileSubView, setMobileSubView] = useState<SettingsCategoryId | null>(() =>
    initialTab === 'general' ? null : resolveInitialCategory(initialTab),
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [monitorOptions, setMonitorOptions] = useState<NotchMonitorOption[]>(
    DEFAULT_NOTCH_MONITOR_OPTIONS,
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const eqSectionRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const navigate = useNavigationStore((s) => s.navigate);
  const goBack = useNavigationStore((s) => s.goBack);
  const canGoBack = useNavigationStore((s) => s.canGoBack);

  useEffect(() => {
    void listAvailableNotchMonitors().then((opts) => {
      if (opts.length > 0) setMonitorOptions(opts);
    });
  }, []);

  useEffect(() => {
    if (initialTab === 'sound') {
      setActiveCategory('audio');
      setMobileSubView('audio');
    } else if (initialTab === 'appearance') {
      setActiveCategory('content');
      setMobileSubView('content');
    } else {
      setMobileSubView(null);
    }
  }, [initialTab]);

  useEffect(() => {
    if (activeCategory === 'audio' && focusEq && eqSectionRef.current) {
      window.setTimeout(() => {
        eqSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  }, [activeCategory, focusEq]);

  useEffect(() => {
    if (searchOpen) {
      window.setTimeout(() => searchInputRef.current?.focus(), 40);
    }
  }, [searchOpen]);

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
  const pipState = useExternalPiPState();
  const externalPipOpen = pipState.open;
  const windowsExternalSupport = resolveWindowsExternalNotchSupport({
    isWindows: isWindowsPlatform(),
    hasDesktopHost: isDesktopNotchHost(),
    hasDocumentPiP: supportsDocumentPictureInPicture(),
    hasVideoPiP: supportsVideoPictureInPicture(),
    isTopLevel: isTopLevelBrowsingContext(),
  });

  const hiddenTrackIds = useLibraryStore((s) => s.hiddenTrackIds);
  const offlineDownloads = useLibraryStore((s) => s.offlineDownloads);
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

  const categories = useMemo<SettingsCategoryItem[]>(
    () => [
      {
        id: 'content',
        title: 'Konten dan tampilan',
        subtitle: 'Latar kustom tanpa blur • Filter eksplisit • Urutan beranda',
        keywords:
          'latar belakang background custom wallpaper foto blur tampilan eksplisit beranda section panel kanan tersembunyi',
        icon: (active) => (
          <Music
            className={`w-5 h-5 ${active ? 'text-[#19EE8A]' : 'text-[#E8FFF3]/80'}`}
            strokeWidth={1.8}
          />
        ),
      },
      {
        id: 'playback',
        title: 'Playback',
        subtitle: `Playback tanpa jeda • Autoplay ${autoplay ? 'aktif' : 'nonaktif'}`,
        keywords: 'playback autoplay putar otomatis crossfade transisi jeda panel kanan',
        icon: (active) => (
          <Volume2
            className={`w-5 h-5 ${active ? 'text-[#19EE8A]' : 'text-[#E8FFF3]/80'}`}
            strokeWidth={1.8}
          />
        ),
      },
      {
        id: 'audio',
        title: 'Kualitas media & Equalizer',
        subtitle: 'Equalizer 10-band • Pre-amp • Normalisasi LUFS',
        keywords:
          'equalizer eq audio suara dsp preamp bass boost normalisasi lufs kualitas streaming hifi codec sample rate',
        icon: (active) => (
          <Sliders
            className={`w-5 h-5 ${active ? 'text-[#19EE8A]' : 'text-[#E8FFF3]/80'}`}
            strokeWidth={1.8}
          />
        ),
      },
      {
        id: 'offline',
        title: 'Mode hemat data dan offline',
        subtitle: `Mode hemat data • ${offlineDownloads.length} lagu tersimpan offline`,
        keywords: 'hemat data kuota thumbnail download unduhan offline cache lokal',
        icon: (active) => (
          <ArrowDownCircle
            className={`w-5 h-5 ${active ? 'text-[#19EE8A]' : 'text-[#E8FFF3]/80'}`}
            strokeWidth={1.8}
          />
        ),
      },
      {
        id: 'devices',
        title: 'App dan perangkat',
        subtitle: 'Aplikasi PWA • Pemutar mini Windows • Pintasan keyboard',
        keywords: 'pwa install pasang aplikasi perangkat windows notch pip eksternal pintasan keyboard',
        icon: (active) => (
          <MonitorSmartphone
            className={`w-5 h-5 ${active ? 'text-[#19EE8A]' : 'text-[#E8FFF3]/80'}`}
            strokeWidth={1.8}
          />
        ),
      },
      {
        id: 'account',
        title: 'Akun, data lokal & cadangan',
        subtitle: 'Mode katalog • Ekspor / impor JSON • Bersihkan riwayat',
        keywords: 'akun katalog sinkronisasi ekspor impor json backup cadangan hapus riwayat',
        icon: (active) => (
          <UserCircle
            className={`w-5 h-5 ${active ? 'text-[#19EE8A]' : 'text-[#E8FFF3]/80'}`}
            strokeWidth={1.8}
          />
        ),
      },
    ],
    [autoplay, offlineDownloads.length],
  );

  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (cat) =>
        cat.title.toLowerCase().includes(q) ||
        cat.subtitle.toLowerCase().includes(q) ||
        cat.keywords.toLowerCase().includes(q),
    );
  }, [categories, searchQuery]);

  const activeCategoryMeta = categories.find((c) => c.id === activeCategory) ?? categories[0];

  const openCategory = (id: SettingsCategoryId) => {
    setActiveCategory(id);
    setMobileSubView(id);
  };

  const handleHeaderBack = () => {
    if (mobileSubView !== null) {
      setMobileSubView(null);
      return;
    }
    if (canGoBack()) {
      goBack();
    } else {
      navigate({ name: 'home' });
    }
  };

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

  const renderCategoryContent = (categoryId: SettingsCategoryId) => {
    switch (categoryId) {
      case 'content':
        return (
          <div className="space-y-5">
            <BackgroundSettingsSection />

            <section className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-5 space-y-1">
              <h2 className="text-base font-bold text-[#E8FFF3] pb-2">Tampilan &amp; Filter Konten</h2>
              <div className="divide-y divide-[#B3F7D1]/[0.08]">
                <div className="flex items-center justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p id="lbl-hide-explicit" className="text-sm font-medium text-[#E8FFF3]">
                      Sembunyikan konten eksplisit
                    </p>
                    <p className="text-xs text-[#B3F7D1]/60 mt-0.5">
                      Saring lagu yang ditandai eksplisit di beranda dan pencarian
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={hideExplicit}
                    aria-labelledby="lbl-hide-explicit"
                    onClick={() => updateSetting('hideExplicit', !hideExplicit)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-[#19EE8A] ${
                      hideExplicit ? 'bg-sc-gradient' : 'bg-white/[0.12] hover:bg-white/[0.18]'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                        hideExplicit
                          ? 'translate-x-6 bg-[#E8FFF3]'
                          : 'translate-x-1 bg-[#B3F7D1]/70'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 pt-3.5 pb-1">
                  <div className="min-w-0">
                    <p id="lbl-right-panel-content" className="text-sm font-medium text-[#E8FFF3]">
                      Tampilkan panel kanan &ldquo;Sedang diputar&rdquo;
                    </p>
                    <p className="text-xs text-[#B3F7D1]/60 mt-0.5">
                      Tampilkan pemutar, antrean, lirik, dan kredit lagu di sisi kanan
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showRightPanel}
                    aria-labelledby="lbl-right-panel-content"
                    onClick={() => setRightPanelOpen(!showRightPanel)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-[#19EE8A] ${
                      showRightPanel ? 'bg-sc-gradient' : 'bg-white/[0.12] hover:bg-white/[0.18]'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                        showRightPanel
                          ? 'translate-x-6 bg-[#E8FFF3]'
                          : 'translate-x-1 bg-[#B3F7D1]/70'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </section>

            {/* Urutan Bagian Beranda */}
            <section className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[#E8FFF3]">Urutan Bagian Beranda</h2>
                  <p className="text-xs text-[#B3F7D1]/55">
                    Atur prioritas tampilan rak di halaman Beranda
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetHomeSectionOrder}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.1] text-xs text-[#E8FFF3]/85"
                >
                  <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Reset
                </button>
              </div>

              <div className="space-y-1.5">
                {homeSectionOrder.map((secId, idx) => (
                  <div
                    key={secId}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08]"
                  >
                    <span className="text-xs sm:text-sm text-[#E8FFF3]/90">
                      <span className="text-[#B3F7D1]/45 tabular-nums mr-2">{idx + 1}.</span>
                      {SECTION_LABELS[secId as HomeSectionId] || secId}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveHomeSection(secId as HomeSectionId, 'up')}
                        aria-label={`Naikkan ${secId}`}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#B3F7D1]/65 hover:text-[#E8FFF3] hover:bg-white/[0.1] disabled:opacity-25"
                      >
                        <ArrowUp className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        disabled={idx === homeSectionOrder.length - 1}
                        onClick={() => moveHomeSection(secId as HomeSectionId, 'down')}
                        aria-label={`Turunkan ${secId}`}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#B3F7D1]/65 hover:text-[#E8FFF3] hover:bg-white/[0.1] disabled:opacity-25"
                      >
                        <ArrowDown className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Lagu Disembunyikan */}
            {hiddenTrackIds.length > 0 && (
              <section className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-5 space-y-3">
                <h2 className="text-base font-semibold text-[#E8FFF3]">
                  Lagu Disembunyikan ({hiddenTrackIds.length})
                </h2>
                <div className="space-y-1.5">
                  {hiddenTrackIds.map((id) => (
                    <div
                      key={id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08]"
                    >
                      <span className="text-xs text-[#E8FFF3]/80 font-mono">{id}</span>
                      <button
                        type="button"
                        onClick={() => unhideTrack(id)}
                        className="inline-flex items-center gap-1 text-xs text-[#19EE8A] hover:underline"
                      >
                        <Eye className="w-3.5 h-3.5" strokeWidth={1.75} />
                        Tampilkan kembali
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        );

      case 'playback':
        return (
          <div className="space-y-5">
            <section className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-5 space-y-1">
              <h2 className="text-base font-bold text-[#E8FFF3] pb-2">Kontrol Playback</h2>
              <div className="divide-y divide-[#B3F7D1]/[0.08]">
                <div className="flex items-center justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p id="lbl-autoplay" className="text-sm font-medium text-[#E8FFF3]">
                      Putar otomatis (Autoplay radio)
                    </p>
                    <p className="text-xs text-[#B3F7D1]/60 mt-0.5">
                      Lanjutkan otomatis dengan lagu terkait saat antrean habis
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoplay}
                    aria-labelledby="lbl-autoplay"
                    onClick={() => updateSetting('autoplay', !autoplay)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-[#19EE8A] ${
                      autoplay ? 'bg-sc-gradient' : 'bg-white/[0.12] hover:bg-white/[0.18]'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                        autoplay ? 'translate-x-6 bg-[#E8FFF3]' : 'translate-x-1 bg-[#B3F7D1]/70'
                      }`}
                    />
                  </button>
                </div>

                <CrossfadeControl variant="general" />

                <div className="flex items-center justify-between gap-4 pt-3.5 pb-1">
                  <div className="min-w-0">
                    <p id="lbl-right-panel" className="text-sm font-medium text-[#E8FFF3]">
                      Tampilkan panel kanan &ldquo;Sedang diputar&rdquo;
                    </p>
                    <p className="text-xs text-[#B3F7D1]/60 mt-0.5">
                      Tampilkan pemutar, antrean, lirik, dan kredit lagu di sisi kanan
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showRightPanel}
                    aria-labelledby="lbl-right-panel"
                    onClick={() => setRightPanelOpen(!showRightPanel)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-[#19EE8A] ${
                      showRightPanel ? 'bg-sc-gradient' : 'bg-white/[0.12] hover:bg-white/[0.18]'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                        showRightPanel
                          ? 'translate-x-6 bg-[#E8FFF3]'
                          : 'translate-x-1 bg-[#B3F7D1]/70'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#E8FFF3]">Equalizer 10-Band &amp; DSP Lanjutan</h3>
                <p className="text-xs text-[#B3F7D1]/60 mt-0.5">
                  Atur kurva EQ, preamp, bass boost, normalisasi LUFS, dan kecepatan pemutaran
                </p>
              </div>
              <button
                type="button"
                onClick={() => openCategory('audio')}
                className="px-4 py-2 rounded-full bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105 shrink-0 self-start sm:self-auto"
              >
                Buka EQ &amp; DSP
              </button>
            </section>
          </div>
        );

      case 'audio':
        return (
          <div ref={eqSectionRef}>
            <AudioSettingsTab />
          </div>
        );

      case 'offline':
        return (
          <div className="space-y-5">
            <section className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-5 space-y-1">
              <h2 className="text-base font-bold text-[#E8FFF3] pb-2">Hemat Data</h2>
              <div className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p id="lbl-datasaver" className="text-sm font-medium text-[#E8FFF3]">
                    Mode hemat data
                  </p>
                  <p className="text-xs text-[#B3F7D1]/60 mt-0.5">
                    Muat thumbnail beresolusi lebih kecil untuk menghemat kuota jaringan seluler
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={dataSaver}
                  aria-labelledby="lbl-datasaver"
                  onClick={() => updateSetting('dataSaver', !dataSaver)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-[#19EE8A] ${
                    dataSaver ? 'bg-sc-gradient' : 'bg-white/[0.12] hover:bg-white/[0.18]'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                      dataSaver ? 'translate-x-6 bg-[#E8FFF3]' : 'translate-x-1 bg-[#B3F7D1]/70'
                    }`}
                  />
                </button>
              </div>
            </section>

            <section className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-[#E8FFF3]">Cache &amp; Unduhan Offline</h2>
                  <p className="text-xs text-[#B3F7D1]/60 mt-0.5">
                    {offlineDownloads.length > 0
                      ? `${offlineDownloads.length} lagu siap diputar tanpa koneksi internet.`
                      : 'Belum ada lagu yang diunduh ke penyimpanan offline browser.'}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-white/[0.08] border border-white/[0.1] text-xs font-semibold text-[#19EE8A] tabular-nums shrink-0">
                  {offlineDownloads.length} Lagu
                </span>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => openCategory('audio')}
                  className="px-4 py-2 rounded-full bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105"
                >
                  Atur Kualitas Streaming &amp; Unduhan
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ name: 'library' })}
                  className="px-4 py-2 rounded-full bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-[#E8FFF3]"
                >
                  Buka Koleksi Offline
                </button>
              </div>
            </section>
          </div>
        );

      case 'devices':
        return (
          <div className="space-y-5">
            <PWAInstallButton variant="card" />

            {/* Pemutar Mini Eksternal (Khusus Windows) */}
            <section className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-[#E8FFF3]">Pemutar Mini Eksternal</h2>
                  <p className="text-xs text-[#B3F7D1]/60 mt-0.5">
                    Pemutar mini tidak tampil di dalam web — hanya dapat dikeluarkan ke jendela terpisah khusus Windows
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-[#19EE8A]/15 border border-[#19EE8A]/30 text-[11px] font-semibold text-[#19EE8A] shrink-0 whitespace-nowrap">
                  Khusus Windows
                </span>
              </div>

              <div className="space-y-4 pt-1 border-t border-[#B3F7D1]/[0.08]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#E8FFF3]">
                      Jendela Eksternal di Luar Web (Windows)
                    </p>
                    <p className="text-xs text-[#B3F7D1]/60 mt-0.5">
                      {windowsExternalSupport.mode === 'desktop-ipc'
                        ? 'Aktif otomatis di jendela desktop Windows (tanpa bingkai, selalu di atas, area transparan tembus klik).'
                        : windowsExternalSupport.mode === 'document-pip' ||
                            windowsExternalSupport.mode === 'video-pip'
                          ? externalPipOpen
                            ? 'Jendela pemutar mini Windows sedang aktif mengambang di luar browser.'
                            : windowsExternalSupport.mode === 'video-pip'
                              ? 'Keluarkan pemutar mini mengambang di luar browser Windows (mode PiP kompatibel pratinjau & tab).'
                              : 'Keluarkan pemutar mini menjadi jendela melayang di luar browser Windows (Chrome / Edge).'
                          : windowsExternalSupport.reason === 'windows-only'
                            ? 'Fitur pemutar mini keluar jendela hanya tersedia khusus untuk sistem operasi Windows dan tidak ditampilkan di dalam web.'
                            : 'Browser Windows ini belum mendukung Picture-in-Picture; gunakan Chrome/Edge terbaru atau aplikasi SoundClear Desktop Windows.'}
                    </p>
                  </div>
                  {windowsExternalSupport.mode === 'document-pip' ||
                  windowsExternalSupport.mode === 'video-pip' ? (
                    <button
                      type="button"
                      disabled={!currentTrack}
                      onClick={() => {
                        if (externalPipOpen) {
                          closeWindowsExternalNotch();
                        } else {
                          void openWindowsExternalNotch().then((res) => {
                            if (!res.ok) {
                              showToast(
                                'Gagal membuka jendela pemutar mini Windows. Pastikan izin Picture-in-Picture browser aktif.',
                              );
                            }
                          });
                        }
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shrink-0 disabled:opacity-40 ${
                        externalPipOpen
                          ? 'bg-white/[0.08] border border-white/[0.12] text-[#E8FFF3] hover:bg-white/[0.14]'
                          : 'bg-sc-gradient text-[#0F1F17] hover:brightness-105'
                      }`}
                    >
                      {externalPipOpen
                        ? 'Tutup Jendela Eksternal'
                        : currentTrack
                          ? 'Keluarkan dari Web (Windows)'
                          : 'Putar Lagu Terlebih Dahulu'}
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 rounded-xl bg-white/[0.08] border border-white/[0.1] text-xs font-medium text-[#B3F7D1]/70 shrink-0">
                      {windowsExternalSupport.mode === 'desktop-ipc'
                        ? 'Mode Desktop Aktif'
                        : 'Khusus Windows'}
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#B3F7D1]/[0.08]">
                  <div className="min-w-0">
                    <p id="lbl-notch-mode" className="text-sm font-medium text-[#E8FFF3]">
                      Tampilkan notch (Windows Desktop)
                    </p>
                    <p className="text-xs text-[#B3F7D1]/60 mt-0.5">
                      Pilih kapan notch melayang tampil saat dijalankan di aplikasi Desktop Windows
                    </p>
                  </div>
                  <div
                    role="radiogroup"
                    aria-labelledby="lbl-notch-mode"
                    className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.045] backdrop-blur-xl border border-white/[0.1] shrink-0 self-start sm:self-auto"
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
                            ? 'bg-sc-gradient text-[#0F1F17] font-semibold'
                            : 'text-[#B3F7D1]/70 hover:text-[#E8FFF3]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#B3F7D1]/[0.08]">
                  <div className="min-w-0">
                    <label
                      htmlFor="select-notch-monitor"
                      className="text-sm font-medium text-[#E8FFF3] block"
                    >
                      Pilihan monitor (Windows Desktop)
                    </label>
                    <p className="text-xs text-[#B3F7D1]/60 mt-0.5">
                      Monitor target tempat notch melayang saat dijalankan di pembungkus Desktop Windows
                    </p>
                  </div>
                  <select
                    id="select-notch-monitor"
                    value={notchMonitor}
                    onChange={(e) => updateSetting('notchMonitor', e.target.value)}
                    className="px-3 py-2 rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.12] text-xs text-[#E8FFF3] focus:outline-none focus:ring-2 focus:ring-[#19EE8A] shrink-0"
                  >
                    {monitorOptions.map((opt) => (
                      <option key={opt.id} value={opt.id} className="bg-[#0B0F0D] text-[#E8FFF3]">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white/[0.07] border border-white/[0.1] flex items-center justify-center shrink-0 text-[#19EE8A]">
                  <Keyboard className="w-5 h-5" strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[#E8FFF3]">Pintasan Keyboard</h3>
                  <p className="text-xs text-[#B3F7D1]/60 truncate">
                    Lihat daftar lengkap tombol cepat untuk pemutar dan navigasi
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate({ name: 'shortcuts' })}
                className="px-4 py-2 rounded-full bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-[#E8FFF3] shrink-0"
              >
                Buka
              </button>
            </section>
          </div>
        );

      case 'account':
        return (
          <div className="space-y-5">
            {/* Mode Katalog & Pustaka */}
            <section className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-5 space-y-3">
              <h2 className="text-base font-semibold text-[#E8FFF3]">Mode Katalog &amp; Pustaka</h2>
              <p className="text-xs text-[#B3F7D1]/65">
                {accountStatusQuery.data?.message ||
                  'Mode tanpa login aktif. Katalog musik tersedia langsung tanpa memerlukan masuk akun.'}
              </p>
              {accountStatusQuery.data?.authenticated && (
                <button
                  type="button"
                  disabled={syncing}
                  onClick={() => void handleSyncAccount()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`}
                    strokeWidth={2}
                  />
                  {syncing ? 'Menyinkronkan...' : 'Sinkronkan Koleksi Akun'}
                </button>
              )}
            </section>

            {/* Ekspor / Impor & Hapus Riwayat */}
            <section className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-[#E8FFF3]">Data Lokal &amp; Cadangan</h2>
                <p className="text-xs text-[#B3F7D1]/60 mt-0.5">
                  Cadangkan playlist, pengaturan EQ, dan preferensi tampilan ke file JSON
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => void handleExportJson()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105"
                >
                  <Download className="w-4 h-4" strokeWidth={2} />
                  Ekspor Data JSON
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-[#E8FFF3]"
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
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.07] border border-white/[0.1] hover:bg-red-500/20 hover:border-red-400/30 text-xs font-medium text-[#E8FFF3]/85 hover:text-red-200 transition-colors"
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
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.07] border border-white/[0.1] hover:bg-red-500/20 hover:border-red-400/30 text-xs font-medium text-[#E8FFF3]/85 hover:text-red-200 transition-colors"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                  Hapus Pencarian Terakhir
                </button>
              </div>
            </section>
          </div>
        );
    }
  };

  return (
    <div className="space-y-5 max-w-6xl">
      {/* IMG_4281-inspired Header: < Back | Centered Pengaturan | Search */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleHeaderBack}
          aria-label={mobileSubView !== null ? 'Kembali ke daftar pengaturan' : 'Kembali'}
          className="w-10 h-10 rounded-full bg-white/[0.06] backdrop-blur-xl border border-white/[0.11] hover:bg-white/[0.12] flex items-center justify-center text-[#E8FFF3] transition-colors shrink-0"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={2} />
        </button>

        <h1 className="text-base sm:text-xl font-bold text-[#E8FFF3] tracking-tight text-center truncate">
          {mobileSubView !== null ? (
            <>
              <span className="lg:hidden">{activeCategoryMeta.title}</span>
              <span className="hidden lg:inline">Pengaturan</span>
            </>
          ) : (
            'Pengaturan'
          )}
        </h1>

        <button
          type="button"
          onClick={() => {
            if (searchOpen) {
              setSearchOpen(false);
              setSearchQuery('');
            } else {
              setSearchOpen(true);
            }
          }}
          aria-label={searchOpen ? 'Tutup pencarian pengaturan' : 'Cari pengaturan'}
          className={`w-10 h-10 rounded-full backdrop-blur-xl border flex items-center justify-center transition-colors shrink-0 ${
            searchOpen
              ? 'bg-sc-gradient text-[#0F1F17] border-transparent'
              : 'bg-white/[0.06] border-white/[0.11] hover:bg-white/[0.12] text-[#E8FFF3]'
          }`}
        >
          {searchOpen ? <X className="w-4 h-4" strokeWidth={2.2} /> : <Search className="w-4 h-4" strokeWidth={2} />}
        </button>
      </div>

      {/* Expandable Search Input */}
      {searchOpen && (
        <div className="relative">
          <Search
            className="w-4 h-4 text-[#B3F7D1]/60 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            strokeWidth={1.9}
          />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari pengaturan (mis. Equalizer, Latar, Crossfade, JSON)..."
            aria-label="Cari kategori pengaturan"
            className="w-full h-11 pl-10 pr-10 rounded-full bg-white/[0.06] backdrop-blur-xl border border-white/[0.12] text-sm text-[#E8FFF3] placeholder-[#B3F7D1]/45 focus:outline-none focus:ring-2 focus:ring-[#19EE8A]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Bersihkan pencarian pengaturan"
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#B3F7D1]/70 hover:text-[#E8FFF3] hover:bg-white/[0.1] absolute right-2 top-1/2 -translate-y-1/2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Master-Detail Layout: Left/Hub follows IMG_4281 structure; Right renders detail on lg+ */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        {/* HUB COLUMN (visible on desktop lg+, or on mobile when mobileSubView === null) */}
        <div
          className={`w-full lg:w-[390px] xl:w-[410px] shrink-0 space-y-5 ${
            mobileSubView !== null ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* 2-Column Quick Toggle Cards (IMG_4281 top grid) */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={dataSaver}
              onClick={() => updateSetting('dataSaver', !dataSaver)}
              className={`rounded-2xl backdrop-blur-xl border px-3 py-4 flex flex-col items-center justify-center text-center gap-1.5 transition-all ${
                dataSaver
                  ? 'bg-white/[0.09] border-[#19EE8A]/45'
                  : 'bg-white/[0.055] border-white/[0.11] hover:bg-white/[0.085]'
              }`}
            >
              <BarChart2
                className={`w-5 h-5 ${dataSaver ? 'text-[#19EE8A]' : 'text-[#E8FFF3]/80'}`}
                strokeWidth={2}
              />
              <span className="text-xs sm:text-sm font-bold text-[#E8FFF3]">
                Mode hemat data
              </span>
              <span
                className={`text-xs font-medium ${
                  dataSaver ? 'text-[#19EE8A]' : 'text-[#B3F7D1]/60'
                }`}
              >
                {dataSaver ? 'Aktif' : 'Nonaktif'}
              </span>
            </button>

            <button
              type="button"
              role="switch"
              aria-checked={autoplay}
              onClick={() => updateSetting('autoplay', !autoplay)}
              className={`rounded-2xl backdrop-blur-xl border px-3 py-4 flex flex-col items-center justify-center text-center gap-1.5 transition-all ${
                autoplay
                  ? 'bg-white/[0.09] border-[#19EE8A]/45'
                  : 'bg-white/[0.055] border-white/[0.11] hover:bg-white/[0.085]'
              }`}
            >
              <PlayCircle
                className={`w-5 h-5 ${autoplay ? 'text-[#19EE8A]' : 'text-[#E8FFF3]/80'}`}
                strokeWidth={2}
              />
              <span className="text-xs sm:text-sm font-bold text-[#E8FFF3]">
                Putar otomatis
              </span>
              <span
                className={`text-xs font-medium ${
                  autoplay ? 'text-[#19EE8A]' : 'text-[#B3F7D1]/60'
                }`}
              >
                {autoplay ? 'Aktif' : 'Nonaktif'}
              </span>
            </button>
          </div>

          {/* Status & Quick Equalizer CTA Row (IMG_4281 status strip) */}
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#E8FFF3] truncate">Mode Streaming Audio</p>
              <p className="text-xs text-[#B3F7D1]/60 truncate">
                {accountStatusQuery.data?.authenticated
                  ? 'Pustaka terhubung & DSP siap'
                  : 'Streaming & Audio Lokal Siap'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openCategory('audio')}
              className="px-4 py-2 rounded-full bg-sc-gradient text-[#0F1F17] text-xs font-bold hover:brightness-105 transition-all shrink-0 whitespace-nowrap"
            >
              Atur Equalizer
            </button>
          </div>

          {/* Grouped Vertical List of Setting Categories (IMG_4281 rows) */}
          <div className="rounded-2xl bg-white/[0.045] backdrop-blur-xl border border-white/[0.1] divide-y divide-white/[0.07] overflow-hidden">
            {filteredCategories.length === 0 ? (
              <div className="p-6 text-center space-y-2">
                <p className="text-sm font-semibold text-[#E8FFF3]">
                  Tidak ada pengaturan yang cocok
                </p>
                <p className="text-xs text-[#B3F7D1]/60">
                  Coba kata kunci lain seperti Equalizer, Latar, Crossfade, atau JSON.
                </p>
              </div>
            ) : (
              filteredCategories.map((cat) => {
                const isSelected = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => openCategory(cat.id)}
                    className={`w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition-colors ${
                      isSelected
                        ? 'lg:bg-white/[0.08] hover:bg-white/[0.09]'
                        : 'hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.09] flex items-center justify-center shrink-0">
                      {cat.icon(isSelected)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#E8FFF3] truncate">{cat.title}</p>
                      <p className="text-xs text-[#B3F7D1]/60 truncate mt-0.5">{cat.subtitle}</p>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 ${
                        isSelected ? 'lg:text-[#19EE8A] text-[#B3F7D1]/55' : 'text-[#B3F7D1]/55'
                      }`}
                      strokeWidth={2}
                    />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* DETAIL COLUMN (always shown on lg+, or on mobile when drilled into a category) */}
        <div
          className={`flex-1 min-w-0 ${
            mobileSubView === null ? 'hidden lg:block' : 'block'
          }`}
        >
          {renderCategoryContent(activeCategory)}
        </div>
      </div>
    </div>
  );
}
