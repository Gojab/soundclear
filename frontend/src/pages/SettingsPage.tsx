import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { fetchAccountLibrary, fetchAccountStatus } from '../api/client';
import { SpectrumAnalyzer } from '../components/SpectrumAnalyzer';
import { exportAllSoundClearData, importAllSoundClearData } from '../db/soundclearDb';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { HomeSectionId, NormalizationTarget } from '../types/music';
import {
  BUILTIN_EQ_PRESETS,
  clampYoutubeVolume,
  EQ_FREQUENCY_LABELS,
  PLAYBACK_RATE_OPTIONS,
} from '../utils/audioMath';
import { isLocalTrack } from '../utils/playerLogic';

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

interface SettingsPageProps {
  initialTab?: 'general' | 'sound';
  focusEq?: boolean;
}

export function SettingsPage({ initialTab = 'general', focusEq = false }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'sound'>(initialTab);
  const [presetNameInput, setPresetNameInput] = useState('');
  const [syncing, setSyncing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const eqSectionRef = useRef<HTMLDivElement | null>(null);

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
  const youtubeSound = useSettingsStore((s) => s.youtubeSound);
  const localProfile = useSettingsStore((s) => s.localProfile);
  const accountKey = useSettingsStore((s) => s.accountKey);

  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const updateYoutubeSound = useSettingsStore((s) => s.updateYoutubeSound);
  const updateLocalProfile = useSettingsStore((s) => s.updateLocalProfile);
  const applyEqPreset = useSettingsStore((s) => s.applyEqPreset);
  const setEqBandGain = useSettingsStore((s) => s.setEqBandGain);
  const setEqPreamp = useSettingsStore((s) => s.setEqPreamp);
  const saveCustomPreset = useSettingsStore((s) => s.saveCustomPreset);
  const deleteCustomPreset = useSettingsStore((s) => s.deleteCustomPreset);
  const moveHomeSection = useSettingsStore((s) => s.moveHomeSection);
  const resetHomeSectionOrder = useSettingsStore((s) => s.resetHomeSectionOrder);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const sleepTimerMode = usePlayerStore((s) => s.sleepTimerMode);
  const sleepTimerEndsAt = usePlayerStore((s) => s.sleepTimerEndsAt);

  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);
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

  const ytEffectiveVol = clampYoutubeVolume(volume, youtubeSound.maxVolumeLimit, isMuted);
  const remainingSleepMin =
    sleepTimerMode === 'minutes' && sleepTimerEndsAt
      ? Math.max(1, Math.ceil((sleepTimerEndsAt - Date.now()) / 60000))
      : null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
            Pengaturan
          </h1>
          <p className="text-xs text-white/55 mt-0.5">
            Preferensi umum, pengaturan suara YouTube, serta mesin audio file lokal
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.06] border border-white/[0.08] self-start">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'general' ? 'bg-[#2EE6A6] text-[#06130E] font-semibold' : 'text-white/70 hover:text-white'
            }`}
          >
            Umum
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sound')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'sound' ? 'bg-[#2EE6A6] text-[#06130E] font-semibold' : 'text-white/70 hover:text-white'
            }`}
          >
            Suara
          </button>
        </div>
      </div>

      {activeTab === 'sound' ? (
        <div className="space-y-6">
          {/* A. Lagu YouTube (Player IFrame) */}
          <section className="glass-card rounded-2xl p-5 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">
                  A. Lagu YouTube (Player IFrame)
                </h2>
                <p className="text-xs text-white/50 mt-0.5">
                  Kontrol volume, batas pemutar, kecepatan, fade antar lagu, dan sleep timer
                </p>
              </div>
              <span className="text-[11px] text-white/45 shrink-0">IFrame API</span>
            </div>

            {/* Volume utama & bisu */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">Volume Utama</span>
                <div className="flex items-center gap-2.5">
                  <span className="text-xs text-[#2EE6A6] tabular-nums">{ytEffectiveVol}%</span>
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-pressed={isMuted}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      isMuted
                        ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                        : 'bg-white/[0.08] text-white/80 hover:text-white'
                    }`}
                  >
                    {isMuted ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5" strokeWidth={1.75} />
                        Dibisukan
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        Bisukan
                      </>
                    )}
                  </button>
                </div>
              </div>
              <input
                type="range"
                aria-label="Volume utama"
                min={0}
                max={youtubeSound.maxVolumeLimit}
                value={ytEffectiveVol}
                onChange={(e) => setVolume(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #2EE6A6 ${(ytEffectiveVol / youtubeSound.maxVolumeLimit) * 100}%, rgba(255,255,255,0.16) ${(ytEffectiveVol / youtubeSound.maxVolumeLimit) * 100}%)`,
                }}
                className="sc-range w-full h-1.5 rounded-full"
              />
            </div>

            {/* Batas volume maksimum */}
            <div className="space-y-2 pt-3 border-t border-white/[0.07]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Batas Volume Maksimum</p>
                  <p className="text-xs text-white/50">
                    Pembatas volume di sisi aplikasi untuk melindungi telinga
                  </p>
                </div>
                <span className="text-xs text-[#2EE6A6] tabular-nums">
                  {youtubeSound.maxVolumeLimit}%
                </span>
              </div>
              <input
                type="range"
                aria-label="Batas volume maksimum"
                min={20}
                max={100}
                step={5}
                value={youtubeSound.maxVolumeLimit}
                onChange={(e) => {
                  const cap = Number(e.target.value);
                  updateYoutubeSound('maxVolumeLimit', cap);
                  if (volume > cap) setVolume(cap);
                }}
                style={{
                  background: `linear-gradient(to right, #2EE6A6 ${((youtubeSound.maxVolumeLimit - 20) / 80) * 100}%, rgba(255,255,255,0.16) ${((youtubeSound.maxVolumeLimit - 20) / 80) * 100}%)`,
                }}
                className="sc-range w-full h-1.5 rounded-full"
              />
            </div>

            {/* Volume awal saat aplikasi dibuka */}
            <div className="space-y-2.5 pt-3 border-t border-white/[0.07]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-white">Volume Awal Saat Aplikasi Dibuka</p>
                  <p className="text-xs text-white/50">
                    Gunakan volume terakhir atau tetapkan level tetap saat mulai
                  </p>
                </div>
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.05] border border-white/[0.08] self-start">
                  <button
                    type="button"
                    onClick={() => updateYoutubeSound('startupVolumeMode', 'last')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium ${
                      youtubeSound.startupVolumeMode === 'last'
                        ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                        : 'text-white/70'
                    }`}
                  >
                    Terakhir
                  </button>
                  <button
                    type="button"
                    onClick={() => updateYoutubeSound('startupVolumeMode', 'fixed')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium ${
                      youtubeSound.startupVolumeMode === 'fixed'
                        ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                        : 'text-white/70'
                    }`}
                  >
                    Tetap
                  </button>
                </div>
              </div>

              {youtubeSound.startupVolumeMode === 'fixed' && (
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    aria-label="Volume tetap saat aplikasi dibuka"
                    min={5}
                    max={youtubeSound.maxVolumeLimit}
                    value={Math.min(youtubeSound.startupFixedVolume, youtubeSound.maxVolumeLimit)}
                    onChange={(e) => updateYoutubeSound('startupFixedVolume', Number(e.target.value))}
                    className="sc-range flex-1 h-1.5 rounded-full"
                  />
                  <span className="text-xs text-[#2EE6A6] tabular-nums w-10 text-right">
                    {Math.min(youtubeSound.startupFixedVolume, youtubeSound.maxVolumeLimit)}%
                  </span>
                </div>
              )}
            </div>

            {/* Kecepatan putar 0.25x - 2x */}
            <div className="space-y-2 pt-3 border-t border-white/[0.07]">
              <div>
                <p className="text-sm font-medium text-white">Kecepatan Putar Default</p>
                <p className="text-xs text-white/50">
                  Rentang 0,25x–2x. Episode podcast juga dapat diatur terpisah di halaman episode.
                </p>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                {PLAYBACK_RATE_OPTIONS.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => {
                      updateYoutubeSound('defaultPlaybackRate', rate);
                      if (currentTrack?.type !== 'episode') {
                        setPlaybackRate(rate);
                      }
                    }}
                    className={`py-1.5 rounded-xl text-xs font-medium tabular-nums transition-colors ${
                      youtubeSound.defaultPlaybackRate === rate
                        ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                        : 'bg-white/[0.06] text-white/75 hover:text-white'
                    }`}
                  >
                    {String(rate).replace('.', ',')}x
                  </button>
                ))}
              </div>
            </div>

            {/* Fade antar lagu 0-12 detik & Micro-fades */}
            <div className="space-y-3 pt-3 border-t border-white/[0.07]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Fade Antar Lagu</p>
                  <p className="text-xs text-white/50">
                    Fade-out di akhir lagu dan fade-in di awal lagu berikutnya (tanpa tumpang tindih)
                  </p>
                </div>
                <span className="text-xs text-[#2EE6A6] tabular-nums">
                  {youtubeSound.trackFadeSeconds} detik
                </span>
              </div>
              <input
                type="range"
                aria-label="Durasi fade antar lagu YouTube"
                min={0}
                max={12}
                step={1}
                value={youtubeSound.trackFadeSeconds}
                onChange={(e) => updateYoutubeSound('trackFadeSeconds', Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #2EE6A6 ${(youtubeSound.trackFadeSeconds / 12) * 100}%, rgba(255,255,255,0.16) ${(youtubeSound.trackFadeSeconds / 12) * 100}%)`,
                }}
                className="sc-range w-full h-1.5 rounded-full"
              />

              <label className="flex items-center justify-between gap-4 cursor-pointer pt-1">
                <div>
                  <p className="text-sm font-medium text-white">Fade singkat saat jeda / lanjut</p>
                  <p className="text-xs text-white/50">
                    Redupkan volume sejenak saat tombol jeda atau putar ditekan
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={youtubeSound.fadeOnPauseResume}
                  onChange={(e) => updateYoutubeSound('fadeOnPauseResume', e.target.checked)}
                  className="w-4 h-4 accent-[#2EE6A6]"
                />
              </label>

              <label className="flex items-center justify-between gap-4 cursor-pointer pt-1">
                <div>
                  <p className="text-sm font-medium text-white">Fade-out saat sleep timer habis</p>
                  <p className="text-xs text-white/50">
                    Turunkan volume perlahan sebelum pemutaran berhenti otomatis
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={youtubeSound.fadeOutOnSleepTimer}
                  onChange={(e) => updateYoutubeSound('fadeOutOnSleepTimer', e.target.checked)}
                  className="w-4 h-4 accent-[#2EE6A6]"
                />
              </label>
            </div>

            {/* Sleep timer */}
            <div className="space-y-2 pt-3 border-t border-white/[0.07]">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">Sleep Timer</p>
                <span className="text-xs text-[#2EE6A6] tabular-nums">
                  {sleepTimerMode === 'end_of_track'
                    ? 'Akhir lagu ini'
                    : remainingSleepMin
                      ? `${remainingSleepMin} menit tersisa`
                      : 'Mati'}
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                <button
                  type="button"
                  onClick={() => setSleepTimer('off')}
                  className={`py-1.5 rounded-xl text-xs font-medium ${
                    sleepTimerMode === 'off'
                      ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                      : 'bg-white/[0.06] text-white/75 hover:text-white'
                  }`}
                >
                  Mati
                </button>
                {[15, 30, 45, 60].map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setSleepTimer('minutes', min)}
                    className="py-1.5 rounded-xl text-xs font-medium bg-white/[0.06] text-white/75 hover:text-white tabular-nums"
                  >
                    {min} mnt
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSleepTimer('end_of_track')}
                  className={`py-1.5 rounded-xl text-xs font-medium ${
                    sleepTimerMode === 'end_of_track'
                      ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                      : 'bg-white/[0.06] text-white/75 hover:text-white'
                  }`}
                >
                  Akhir lagu
                </button>
              </div>
            </div>

            {/* Autoplay, Lanjut posisi terakhir, Auto-start */}
            <div className="space-y-3 pt-3 border-t border-white/[0.07]">
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-white">Autoplay lagu terkait</p>
                  <p className="text-xs text-white/50">
                    Putar lagu radio terkait secara otomatis saat antrean selesai
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={autoplay}
                  onChange={(e) => updateSetting('autoplay', e.target.checked)}
                  className="w-4 h-4 accent-[#2EE6A6]"
                />
              </label>

              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-white">Lanjut dari posisi terakhir</p>
                  <p className="text-xs text-white/50">
                    Ingat detik terakhir lagu dan lanjutkan saat aplikasi dibuka kembali
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={youtubeSound.resumeLastPosition}
                  onChange={(e) => updateYoutubeSound('resumeLastPosition', e.target.checked)}
                  className="w-4 h-4 accent-[#2EE6A6]"
                />
              </label>

              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-white">
                    Mulai putar otomatis saat aplikasi dibuka
                  </p>
                  <p className="text-xs text-white/50">
                    Otomatis mulai memutar lagu terakhir yang tersimpan ketika SoundClear dimuat
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={youtubeSound.autoStartOnOpen}
                  onChange={(e) => updateYoutubeSound('autoStartOnOpen', e.target.checked)}
                  className="w-4 h-4 accent-[#2EE6A6]"
                />
              </label>
            </div>

            <p className="text-xs text-white/45 pt-2 border-t border-white/[0.06]">
              Equalizer, normalisasi, dan crossfade tersedia untuk File Lokal.
            </p>
          </section>

          {/* B. File Lokal (Web Audio API) */}
          <section ref={eqSectionRef} className="glass-card rounded-2xl p-5 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">
                  B. File Lokal (Web Audio API)
                </h2>
                <p className="text-xs text-white/50 mt-0.5">
                  Equalizer 10-band, preamp, normalisasi volume, audio mono, balance, dan
                  crossfade/gapless untuk file milik Anda sendiri (profil akun: {accountKey}).
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-white cursor-pointer shrink-0">
                <span>Aktifkan EQ</span>
                <input
                  type="checkbox"
                  checked={localProfile.eqEnabled}
                  onChange={(e) => updateLocalProfile({ eqEnabled: e.target.checked })}
                  className="w-4 h-4 accent-[#2EE6A6]"
                />
              </label>
            </div>

            {/* Spectrum Analyzer */}
            <SpectrumAnalyzer />

            {/* Preset Selector */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-white/75">Preset Equalizer</p>
                {isLocalTrack(currentTrack) && (
                  <span className="text-[11px] text-[#2EE6A6]">Sedang diterapkan langsung</span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {BUILTIN_EQ_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyEqPreset(preset.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                      localProfile.presetId === preset.id
                        ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                        : 'bg-white/[0.06] text-white/75 hover:text-white'
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
                {localProfile.customPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className={`inline-flex items-center rounded-xl overflow-hidden ${
                      localProfile.presetId === preset.id
                        ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                        : 'bg-white/[0.08] text-white/85'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => applyEqPreset(preset.id)}
                      className="pl-3 pr-1.5 py-1.5 text-xs"
                    >
                      {preset.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCustomPreset(preset.id)}
                      aria-label={`Hapus preset ${preset.name}`}
                      className="pr-2 pl-1 py-1.5 hover:text-red-400"
                    >
                      <Trash2 className="w-3 h-3" strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Save Custom Preset */}
              <div className="flex items-center gap-2 pt-1 max-w-sm">
                <input
                  type="text"
                  value={presetNameInput}
                  onChange={(e) => setPresetNameInput(e.target.value)}
                  placeholder="Nama preset baru..."
                  className="flex-1 h-9 px-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-xs text-white placeholder:text-white/35 focus:outline-none focus:border-[#2EE6A6]"
                />
                <button
                  type="button"
                  disabled={!presetNameInput.trim()}
                  onClick={() => {
                    const created = saveCustomPreset(presetNameInput);
                    if (created) {
                      setPresetNameInput('');
                      showToast(`Preset "${created.name}" disimpan`);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-3 h-9 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] text-xs font-medium text-white disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Simpan Preset
                </button>
              </div>
            </div>

            {/* Preamp + 10-Band EQ Sliders */}
            <div className="space-y-4 pt-2 border-t border-white/[0.07]">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-medium text-white/80">Preamp</span>
                <input
                  type="range"
                  aria-label="Preamp dB"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={localProfile.preampDb}
                  onChange={(e) => setEqPreamp(Number(e.target.value))}
                  className="sc-range flex-1 max-w-sm h-1.5 rounded-full"
                />
                <span className="w-16 text-right text-xs text-[#2EE6A6] tabular-nums">
                  {localProfile.preampDb > 0 ? `+${localProfile.preampDb}` : localProfile.preampDb}{' '}
                  dB
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {EQ_FREQUENCY_LABELS.map((freqLabel, idx) => {
                  const val = localProfile.bands[idx] ?? 0;
                  return (
                    <div
                      key={freqLabel}
                      className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-2.5 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-white/65">{freqLabel}</span>
                        <span className="text-[#2EE6A6] tabular-nums">
                          {val > 0 ? `+${val}` : val} dB
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label={`Equalizer ${freqLabel}`}
                        min={-12}
                        max={12}
                        step={0.5}
                        value={val}
                        onChange={(e) => setEqBandGain(idx, Number(e.target.value))}
                        className="sc-range w-full h-1.5 rounded-full"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Normalisasi Volume */}
            <div className="space-y-2 pt-3 border-t border-white/[0.07]">
              <div>
                <p className="text-sm font-medium text-white">Normalisasi Volume</p>
                <p className="text-xs text-white/50">
                  Menyesuaikan level loudness otomatis antar file lokal saat diputar
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    { id: 'off', label: 'Mati' },
                    { id: 'quiet', label: 'Pelan (-18 LUFS)' },
                    { id: 'normal', label: 'Normal (-14 LUFS)' },
                    { id: 'loud', label: 'Keras (-11 LUFS)' },
                  ] as Array<{ id: NormalizationTarget; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateLocalProfile({ normalizationTarget: opt.id })}
                    className={`py-2 px-2.5 rounded-xl text-xs font-medium transition-colors ${
                      localProfile.normalizationTarget === opt.id
                        ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                        : 'bg-white/[0.06] text-white/75 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mono Audio & L/R Balance */}
            <div className="space-y-4 pt-3 border-t border-white/[0.07]">
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-white">Audio Mono</p>
                  <p className="text-xs text-white/50">
                    Gabungkan kanal kiri dan kanan menjadi satu keluaran mono
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={localProfile.monoAudio}
                  onChange={(e) => updateLocalProfile({ monoAudio: e.target.checked })}
                  className="w-4 h-4 accent-[#2EE6A6]"
                />
              </label>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Penyeimbang Kiri / Kanan</span>
                  <button
                    type="button"
                    onClick={() => updateLocalProfile({ balance: 0 })}
                    className="text-xs text-[#2EE6A6] tabular-nums hover:underline"
                  >
                    {localProfile.balance === 0
                      ? 'Tengah (0%)'
                      : localProfile.balance < 0
                        ? `Kiri ${Math.abs(Math.round(localProfile.balance * 100))}%`
                        : `Kanan ${Math.round(localProfile.balance * 100)}%`}
                  </button>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-white/50">
                  <span>Kiri</span>
                  <input
                    type="range"
                    aria-label="Penyeimbang kiri dan kanan"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={localProfile.balance}
                    onChange={(e) => updateLocalProfile({ balance: Number(e.target.value) })}
                    className="sc-range flex-1 h-1.5 rounded-full"
                  />
                  <span>Kanan</span>
                </div>
              </div>
            </div>

            {/* Crossfade & Gapless Playback */}
            <div className="space-y-3 pt-3 border-t border-white/[0.07]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Crossfade Tumpang Tindih</p>
                  <p className="text-xs text-white/50">
                    Transisi mulus 0–12 detik antar file lokal menggunakan dua deck audio bergantian
                  </p>
                </div>
                <span className="text-xs text-[#2EE6A6] tabular-nums">
                  {localProfile.crossfadeSeconds} detik
                </span>
              </div>
              <input
                type="range"
                aria-label="Durasi crossfade tumpang tindih file lokal"
                min={0}
                max={12}
                step={1}
                value={localProfile.crossfadeSeconds}
                onChange={(e) => updateLocalProfile({ crossfadeSeconds: Number(e.target.value) })}
                style={{
                  background: `linear-gradient(to right, #2EE6A6 ${(localProfile.crossfadeSeconds / 12) * 100}%, rgba(255,255,255,0.16) ${(localProfile.crossfadeSeconds / 12) * 100}%)`,
                }}
                className="sc-range w-full h-1.5 rounded-full"
              />

              <label className="flex items-center justify-between gap-4 cursor-pointer pt-1">
                <div>
                  <p className="text-sm font-medium text-white">Gapless Playback</p>
                  <p className="text-xs text-white/50">
                    Praload lagu berikutnya di deck cadangan agar pindah trek tanpa jeda hening
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={localProfile.gaplessPlayback}
                  onChange={(e) => updateLocalProfile({ gaplessPlayback: e.target.checked })}
                  className="w-4 h-4 accent-[#2EE6A6]"
                />
              </label>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Preferensi Umum */}
          <section className="glass-card rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-white">Pemutaran &amp; Tampilan</h2>

            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-white">Sembunyikan konten eksplisit</p>
                <p className="text-xs text-white/50">
                  Saring lagu yang ditandai eksplisit di beranda dan pencarian
                </p>
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
                <p className="text-xs text-white/50">
                  Lanjutkan otomatis dengan lagu terkait saat antrean habis
                </p>
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
                <p className="text-xs text-white/50">
                  Muat thumbnail beresolusi lebih kecil untuk menghemat kuota
                </p>
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
                <p className="text-sm font-medium text-white">
                  Tampilkan panel kanan &ldquo;Sedang diputar&rdquo;
                </p>
                <p className="text-xs text-white/50">
                  Tampilkan pemutar YouTube, antrean, lirik, dan kredit lagu
                </p>
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
