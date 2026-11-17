import { useEffect, useId, useMemo, useState } from 'react';
import {
  Activity,
  Check,
  Download,
  Edit2,
  Headphones,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sliders,
  Trash2,
  Volume2,
  VolumeX,
  Waves,
  X,
} from 'lucide-react';
import {
  getAudioDiagnosticsSnapshot,
  listAudioOutputDevices,
  resumeAudioContext,
  setAudioOutputDevice,
  startTestTone,
  stopTestTone,
  subscribeAudioDiagnostics,
  type AudioDiagnosticsSnapshot,
  type TestToneMode,
} from '../audio/soundclearAudioEngine';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore, type AudioSettingsSection } from '../store/settingsStore';
import type {
  ConcreteQualityTier,
  NormalizationTarget,
  StreamQualityTier,
} from '../types/music';
import {
  buildSmoothSvgCurvePath,
  BUILTIN_EQ_PRESETS,
  clampYoutubeVolume,
  computeEqFrequencyResponseCurve,
  EQ_FREQUENCIES,
  EQ_FREQUENCY_LABELS,
  formatEqBandShortLabel,
  formatEqDb,
  PLAYBACK_RATE_OPTIONS,
  STREAM_QUALITY_TIERS,
} from '../utils/audioMath';
import {
  isMobileAudioEnvironment,
  resolvePlaybackEngineSummary,
} from '../utils/backgroundAudioLogic';
import { getTrackUniqueId, hasPlayableOfflineAudio, isLocalTrack } from '../utils/playerLogic';
import { CrossfadeControl } from './CrossfadeControl';
import { SpectrumAnalyzer } from './SpectrumAnalyzer';

function PillSwitch({
  checked,
  onChange,
  ariaLabel,
  ariaLabelledBy,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onClick={() => onChange(!checked)}
      className="min-w-[44px] min-h-[44px] shrink-0 inline-flex items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-[#19EE8A] cursor-pointer"
    >
      <span
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-sc-gradient' : 'bg-white/[0.12] hover:bg-white/[0.18]'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
            checked ? 'translate-x-6 bg-[#E8FFF3]' : 'translate-x-1 bg-[#B3F7D1]/70'
          }`}
        />
      </span>
    </button>
  );
}

function EqResponseCurveSvg({
  eqEnabled,
  directMode,
  preampDb,
  bands,
  bassBoostEnabled,
  bassBoostLevel,
  sampleRate,
}: {
  eqEnabled: boolean;
  directMode: boolean;
  preampDb: number;
  bands: number[];
  bassBoostEnabled: boolean;
  bassBoostLevel: number;
  sampleRate: number;
}) {
  const gradId = useId();
  const { pathD, fillD, minDb, maxDb } = useMemo(() => {
    const pts = computeEqFrequencyResponseCurve({
      eqEnabled,
      directMode,
      preampDb,
      bands,
      bassBoostEnabled,
      bassBoostLevel,
      sampleRate,
      pointCount: 72,
    });
    const width = 560;
    const height = 104;
    const padX = 12;
    const padY = 10;
    const minLog = Math.log10(20);
    const maxLog = Math.log10(20000);
    const minD = -18;
    const maxD = 18;

    const coords = pts.map((p) => {
      const x =
        padX + ((Math.log10(p.freq) - minLog) / (maxLog - minLog)) * (width - padX * 2);
      const clampedDb = Math.max(minD, Math.min(maxD, p.db));
      const y =
        padY + ((maxD - clampedDb) / (maxD - minD)) * (height - padY * 2);
      return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    });

    const midY = padY + (maxD / (maxD - minD)) * (height - padY * 2);
    const { strokePath, fillPath } = buildSmoothSvgCurvePath(coords, midY);
    return { pathD: strokePath, fillD: fillPath, minDb: minD, maxDb: maxD };
  }, [eqEnabled, directMode, preampDb, bands, bassBoostEnabled, bassBoostLevel, sampleRate]);

  const bypassed = directMode || !eqEnabled;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-[#B3F7D1]/55">
        <span>Respons Frekuensi (20 Hz – 20 kHz)</span>
        <span className="font-mono-num text-[10px]">
          {directMode ? 'Bypass Direct' : !eqEnabled ? 'EQ Nonaktif' : '±18 dB'}
        </span>
      </div>
      <div className="relative rounded-xl bg-black/35 border border-white/[0.06] px-2 py-1.5">
        <svg
          viewBox="0 0 560 104"
          className="w-full h-[88px] block"
          role="img"
          aria-label="Grafik kurva respons frekuensi equalizer"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={bypassed ? 'rgba(179,247,209,0.14)' : 'rgba(25,238,138,0.28)'}
              />
              <stop offset="100%" stopColor="rgba(25,238,138,0.01)" />
            </linearGradient>
          </defs>
          {[12, 0, -12].map((db) => {
            const y = 10 + ((maxDb - db) / (maxDb - minDb)) * (104 - 20);
            return (
              <line
                key={db}
                x1={12}
                y1={y}
                x2={548}
                y2={y}
                stroke={db === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)'}
                strokeDasharray={db === 0 ? '3 3' : undefined}
                strokeWidth={1}
              />
            );
          })}
          <path d={fillD} fill={`url(#${gradId})`} />
          <path
            d={pathD}
            fill="none"
            stroke={bypassed ? 'rgba(179,247,209,0.4)' : '#19EE8A'}
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  onReset,
  resetLabel = 'Reset bagian',
}: {
  title: string;
  subtitle: string;
  onReset?: () => void;
  resetLabel?: string;
}) {
  return (
    <div className="flex flex-col @[520px]:flex-row @[520px]:items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-[#E8FFF3]">{title}</h2>
        <p className="text-xs text-[#B3F7D1]/60 mt-1 leading-relaxed max-w-[65ch]">{subtitle}</p>
      </div>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] backdrop-blur-md border border-white/[0.11] text-[11px] font-medium text-[#B3F7D1]/80 hover:text-[#E8FFF3] self-start shrink-0 transition-colors"
        >
          <RotateCcw className="w-3 h-3" strokeWidth={1.8} />
          {resetLabel}
        </button>
      )}
    </div>
  );
}

export function AudioSettingsTab() {
  const [presetNameInput, setPresetNameInput] = useState('');
  const [renamingPresetId, setRenamingPresetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [downloadingOffline, setDownloadingOffline] = useState(false);
  const [outputDevicesState, setOutputDevicesState] = useState<{
    supported: boolean;
    devices: MediaDeviceInfo[];
    reason?: string;
  }>({ supported: false, devices: [] });

  const localProfile = useSettingsStore((s) => s.localProfile);
  const youtubeSound = useSettingsStore((s) => s.youtubeSound);
  const autoplay = useSettingsStore((s) => s.autoplay);
  const dataSaver = useSettingsStore((s) => s.dataSaver);
  const accountKey = useSettingsStore((s) => s.accountKey);

  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const updateYoutubeSound = useSettingsStore((s) => s.updateYoutubeSound);
  const updateLocalProfile = useSettingsStore((s) => s.updateLocalProfile);
  const applyEqPreset = useSettingsStore((s) => s.applyEqPreset);
  const setEqBandGain = useSettingsStore((s) => s.setEqBandGain);
  const setEqPreamp = useSettingsStore((s) => s.setEqPreamp);
  const saveCustomPreset = useSettingsStore((s) => s.saveCustomPreset);
  const renameCustomPreset = useSettingsStore((s) => s.renameCustomPreset);
  const deleteCustomPreset = useSettingsStore((s) => s.deleteCustomPreset);
  const resetAudioProfileSection = useSettingsStore((s) => s.resetAudioProfileSection);
  const enableAllDsp = useSettingsStore((s) => s.enableAllDsp);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const sleepTimerMode = usePlayerStore((s) => s.sleepTimerMode);
  const sleepTimerMinutes = usePlayerStore((s) => s.sleepTimerMinutes);
  const sleepTimerEndsAt = usePlayerStore((s) => s.sleepTimerEndsAt);
  const activeStreamMeta = usePlayerStore((s) => s.activeStreamMeta);
  const networkEffectiveType = usePlayerStore((s) => s.networkEffectiveType);
  const bufferingStallCount = usePlayerStore((s) => s.bufferingStallCount);

  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const likedTracks = useLibraryStore((s) => s.likedTracks);
  const offlineDownloads = useLibraryStore((s) => s.offlineDownloads);
  const downloadTrackOffline = useLibraryStore((s) => s.downloadTrackOffline);
  const downloadTracksOffline = useLibraryStore((s) => s.downloadTracksOffline);
  const deleteOfflineDownload = useLibraryStore((s) => s.deleteOfflineDownload);
  const showToast = useContextMenuStore((s) => s.showToast);

  const [diagnostics, setDiagnostics] = useState<AudioDiagnosticsSnapshot>(() =>
    getAudioDiagnosticsSnapshot(activeStreamMeta?.sourceMode),
  );

  useEffect(() => {
    const syncDiag = () => {
      setDiagnostics(
        getAudioDiagnosticsSnapshot(usePlayerStore.getState().activeStreamMeta?.sourceMode),
      );
    };
    syncDiag();
    return subscribeAudioDiagnostics(syncDiag);
  }, [activeStreamMeta?.sourceMode, localProfile]);

  const refreshOutputDevices = async () => {
    const res = await listAudioOutputDevices();
    setOutputDevicesState(res);
  };

  useEffect(() => {
    void refreshOutputDevices();
  }, []);

  const handleResetSection = (section: AudioSettingsSection, label: string) => {
    resetAudioProfileSection(section);
    showToast(`${label} dikembalikan ke setelan default`);
  };

  const handleToggleTestTone = async (mode: TestToneMode) => {
    if (diagnostics.testToneMode === mode) {
      stopTestTone();
      return;
    }
    await startTestTone(mode);
  };

  const handleDownloadCurrentTrack = async () => {
    if (!currentTrack) return;
    setDownloadingOffline(true);
    try {
      const res = await downloadTrackOffline(currentTrack, localProfile.downloadQuality);
      if (res.ok) {
        showToast(`"${currentTrack.title}" tersimpan untuk pemutaran offline`);
      } else {
        showToast(res.reason || 'Unduhan offline tidak diizinkan oleh sumber lagu ini');
      }
    } finally {
      setDownloadingOffline(false);
    }
  };

  const handleDownloadLikedBatch = async () => {
    if (likedTracks.length === 0) return;
    setDownloadingOffline(true);
    try {
      const { savedCount } = await downloadTracksOffline(
        likedTracks,
        localProfile.downloadQuality,
      );
      showToast(`${savedCount} lagu disukai tersimpan untuk akses offline`);
    } finally {
      setDownloadingOffline(false);
    }
  };

  const localPlaying = isLocalTrack(currentTrack);
  const effectiveVolume = localPlaying
    ? isMuted
      ? 0
      : Math.min(100, volume)
    : clampYoutubeVolume(volume, youtubeSound.maxVolumeLimit, isMuted);
  const maxVolumeCap = localPlaying ? 100 : youtubeSound.maxVolumeLimit;

  const remainingSleepMin =
    sleepTimerMode === 'minutes' && sleepTimerEndsAt
      ? Math.max(1, Math.ceil((sleepTimerEndsAt - Date.now()) / 60000))
      : null;

  const currentTrackId = getTrackUniqueId(currentTrack);
  const alreadyOffline = Boolean(
    currentTrackId && offlineDownloads.some((d) => d.id === currentTrackId),
  );
  const downloadAllowedForCurrent = Boolean(currentTrack);

  const connectionApiSupported =
    typeof navigator !== 'undefined' &&
    Boolean((navigator as Navigator & { connection?: unknown }).connection);

  const isMobileEnv = isMobileAudioEnvironment();
  const playbackSummary = resolvePlaybackEngineSummary({
    sourceMode: activeStreamMeta?.sourceMode,
    directMode: localProfile.directMode,
    isMobile: isMobileEnv,
  });

  return (
    <div className="space-y-6">
      {/* Top Action & Global DSP Controls */}
      <div className="glass-card rounded-2xl p-4 sm:p-6 flex flex-col @[640px]:flex-row @[640px]:items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#E8FFF3]">
            Pengaturan Audio Lengkap ({accountKey})
          </p>
          <p className="text-xs text-[#B3F7D1]/65 mt-1 leading-relaxed max-w-[65ch]">
            {playbackSummary.topBannerSummary}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              enableAllDsp();
              showToast('Semua modul DSP aktif (EQ, Bass Boost, Stereo Widener, Normalisasi, Limiter, Crossfade)');
            }}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105 transition-all whitespace-nowrap"
          >
            <Sliders className="w-3.5 h-3.5" strokeWidth={2} />
            Aktifkan Semua DSP
          </button>
          <button
            type="button"
            onClick={() => handleResetSection('all', 'Seluruh pengaturan audio')}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] backdrop-blur-md border border-white/[0.12] text-xs font-medium text-[#E8FFF3] transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.85} />
            Reset ke default
          </button>
        </div>
      </div>

      {/* 1. KUALITAS STREAMING */}
      <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-6">
        <SectionHeader
          title="1. Kualitas Streaming"
          subtitle="Atur target bitrate dan resolusi lossless terpisah untuk WiFi serta data seluler"
          onReset={() => handleResetSection('streaming', 'Kualitas Streaming')}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-2 block">
            <span className="text-xs font-medium text-[#E8FFF3]/85 block">Kualitas WiFi</span>
            <select
              aria-label="Kualitas streaming WiFi"
              value={localProfile.wifiQuality}
              onChange={(e) =>
                updateLocalProfile({ wifiQuality: e.target.value as StreamQualityTier })
              }
              className="w-full h-11 px-4 rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.13] text-xs text-[#E8FFF3] focus:outline-none focus:border-[#19EE8A]"
            >
              {STREAM_QUALITY_TIERS.map((tier) => (
                <option key={tier.id} value={tier.id} className="bg-[#0B0F0D] text-[#E8FFF3]">
                  {tier.shortLabel}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 block">
            <span className="text-xs font-medium text-[#E8FFF3]/85 block">Kualitas Data Seluler</span>
            <select
              aria-label="Kualitas streaming Data Seluler"
              value={localProfile.cellularQuality}
              onChange={(e) =>
                updateLocalProfile({ cellularQuality: e.target.value as StreamQualityTier })
              }
              className="w-full h-11 px-4 rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.13] text-xs text-[#E8FFF3] focus:outline-none focus:border-[#19EE8A]"
            >
              {STREAM_QUALITY_TIERS.map((tier) => (
                <option key={tier.id} value={tier.id} className="bg-[#0B0F0D] text-[#E8FFF3]">
                  {tier.shortLabel}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-4 pt-4 border-t border-[#B3F7D1]/[0.1]">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#E8FFF3]">Auto-Adjust Quality</p>
              <p className="text-xs text-[#B3F7D1]/60 leading-relaxed max-w-[65ch]">
                Turunkan kualitas saat jaringan melemah atau buffering berulang, lalu naikkan lagi saat stabil
                {connectionApiSupported
                  ? ` (jaringan terdeteksi: ${networkEffectiveType || 'stabil'}, stall: ${bufferingStallCount})`
                  : ' (navigator.connection tidak didukung browser ini — menggunakan deteksi stall)'}
              </p>
            </div>
            <PillSwitch
              ariaLabel="Auto-Adjust Quality"
              checked={localProfile.autoAdjustQuality}
              onChange={(next) => updateLocalProfile({ autoAdjustQuality: next })}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#E8FFF3]">Mode Hemat Data</p>
              <p className="text-xs text-[#B3F7D1]/60 leading-relaxed max-w-[65ch]">
                Paksa kualitas audio terendah yang tersedia dan perkecil resolusi gambar sampul
              </p>
            </div>
            <PillSwitch
              ariaLabel="Mode Hemat Data"
              checked={dataSaver}
              onChange={(next) => updateSetting('dataSaver', next)}
            />
          </div>
        </div>

        {/* Active stream status */}
        <div className="pt-4 border-t border-[#B3F7D1]/[0.1] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[#E8FFF3]/85">
              Status Kualitas Pada Lagu Aktif
            </p>
          </div>

          {!currentTrack ? (
            <p className="text-xs text-[#B3F7D1]/55">
              Putar sebuah lagu atau impor berkas audio lokal untuk melihat informasi pemutaran aktif.
            </p>
          ) : localPlaying ? (
            <div className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <p className="font-semibold text-[#E8FFF3]">
                  File Lokal: {activeStreamMeta?.badgeLabel || 'Memuat metadata...'}
                </p>
                <p className="text-[#B3F7D1]/60 mt-0.5">
                  Kualitas sesuai berkas asli tanpa upsampling palsu.
                </p>
              </div>
              {activeStreamMeta?.hiRes && (
                <span className="px-2 py-1 rounded-lg bg-[#19EE8A]/15 text-[#19EE8A] font-semibold">
                  Hi-Res Lossless
                </span>
              )}
              {!activeStreamMeta?.hiRes && activeStreamMeta?.lossless && (
                <span className="px-2 py-1 rounded-lg bg-[#19EE8A]/15 text-[#19EE8A] font-semibold">
                  Lossless
                </span>
              )}
            </div>
          ) : activeStreamMeta?.sourceMode === 'youtube-iframe' ? (
            <div className="rounded-xl bg-white/[0.05] backdrop-blur-md border border-white/[0.1] p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <p className="font-semibold text-[#E8FFF3]">
                  {activeStreamMeta.badgeLabel || 'Cloud Audio'}
                </p>
                <p className="text-[#B3F7D1]/60 mt-0.5">
                  Diputar langsung lewat pemutar cloud di browser (Web Audio DSP dilewati).
                </p>
              </div>
              <span className="px-2 py-1 rounded-lg bg-amber-400/15 text-amber-300 font-semibold">
                Cloud Audio (DSP Bypass)
              </span>
            </div>
          ) : (
            <div className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <p className="font-semibold text-[#E8FFF3]">
                  {activeStreamMeta?.badgeLabel || 'Streaming Audio'}
                </p>
                <p className="text-[#B3F7D1]/60 mt-0.5">{playbackSummary.activeDetailText}</p>
              </div>
              <span
                className={`px-2 py-1 rounded-lg font-semibold ${
                  playbackSummary.dspActive
                    ? 'bg-[#19EE8A]/15 text-[#19EE8A]'
                    : 'bg-amber-400/15 text-amber-300'
                }`}
              >
                {playbackSummary.activeBadgeLabel}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* 2. PENYIMPANAN & UNDUHAN OFFLINE */}
      <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-4">
        <SectionHeader
          title="2. Penyimpanan & Unduhan Offline"
          subtitle="Simpan semua lagu pilihan Anda—file audio lokal maupun katalog online—ke cache offline browser (IndexedDB + Cache Storage)"
          onReset={() => handleResetSection('download', 'Kualitas Unduhan')}
        />

        <div className="grid grid-cols-1 @[520px]:grid-cols-2 gap-4 items-end">
          <label className="space-y-2 block min-w-0">
            <span className="text-xs font-medium text-[#E8FFF3]/85 block">Preferensi Kualitas Offline</span>
            <select
              aria-label="Kualitas unduhan offline"
              value={localProfile.downloadQuality}
              onChange={(e) =>
                updateLocalProfile({
                  downloadQuality: e.target.value as ConcreteQualityTier,
                })
              }
              className="w-full h-11 px-4 rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.13] text-xs text-[#E8FFF3] focus:outline-none focus:border-[#19EE8A]"
            >
              {STREAM_QUALITY_TIERS.filter((t) => t.id !== 'auto').map((tier) => (
                <option key={tier.id} value={tier.id} className="bg-[#0B0F0D] text-[#E8FFF3]">
                  {tier.shortLabel}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <button
              type="button"
              disabled={!downloadAllowedForCurrent || downloadingOffline}
              onClick={() => void handleDownloadCurrentTrack()}
              className="flex-1 min-w-[160px] h-11 px-4 rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap hover:brightness-105 disabled:bg-none disabled:bg-white/[0.06] disabled:text-[#B3F7D1]/40 disabled:cursor-not-allowed transition-all"
            >
              <Download className="w-4 h-4 shrink-0" strokeWidth={2} />
              {downloadingOffline
                ? 'Menyimpan...'
                : !currentTrack
                  ? 'Putar Lagu untuk Unduh'
                  : alreadyOffline
                    ? 'Perbarui Salinan Offline'
                    : 'Unduh Lagu Aktif Offline'}
            </button>
            {likedTracks.length > 0 && (
              <button
                type="button"
                disabled={downloadingOffline}
                onClick={() => void handleDownloadLikedBatch()}
                className="h-11 px-4 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] backdrop-blur-md border border-white/[0.12] text-xs font-medium text-[#E8FFF3] inline-flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-45 transition-colors shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-[#19EE8A]" strokeWidth={2} />
                Unduh Disukai ({likedTracks.length})
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-[#B3F7D1]/60 leading-relaxed max-w-[65ch]">
          Unduhan offline menyimpan berkas audio utuh (lokal maupun katalog online) beserta metadata dan sampul album ke IndexedDB &amp; Cache Storage browser.
        </p>

        {offlineDownloads.length > 0 && (
          <div className="pt-4 border-t border-[#B3F7D1]/[0.1] space-y-2">
            <p className="text-xs font-semibold text-[#E8FFF3]/80">
              Tersimpan Offline ({offlineDownloads.length} lagu · IndexedDB + Cache Storage)
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {offlineDownloads.map((rec) => {
                const fullBlob = hasPlayableOfflineAudio(rec);
                return (
                  <div
                    key={rec.id}
                    className="flex items-center justify-between gap-2 px-4 py-2 rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11]"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#E8FFF3] truncate">{rec.track.title}</p>
                      <p className="text-[11px] text-[#B3F7D1]/60 truncate tabular-nums">
                        {rec.codec}
                        {rec.bitrateKbps ? ` · ${rec.bitrateKbps} kbps` : ''}
                        {rec.sampleRateHz ? ` · ${(rec.sampleRateHz / 1000).toFixed(1)} kHz` : ''}
                        {rec.bitDepth ? ` · ${rec.bitDepth}-bit` : ''} ·{' '}
                        {fullBlob
                          ? `${(rec.fileSize / (1024 * 1024)).toFixed(2)} MB (Audio Lokal)`
                          : 'Cache Katalog'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          playTrack(rec.track, { sourceLabel: 'Unduhan Offline' })
                        }
                        className="min-h-[44px] px-4 py-2 rounded-lg bg-[#19EE8A]/15 text-[#19EE8A] text-[11px] font-medium hover:bg-[#19EE8A]/25 inline-flex items-center gap-1"
                      >
                        <Play className="w-3 h-3 fill-current" strokeWidth={2} />
                        Putar
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteOfflineDownload(rec.id)}
                        aria-label={`Hapus unduhan offline ${rec.track.title}`}
                        className="w-11 h-11 rounded-lg flex items-center justify-center text-[#B3F7D1]/60 hover:text-red-300 hover:bg-white/[0.1]"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 3. EQUALIZER & EFEK SPASIAL */}
      <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#E8FFF3]">3. Equalizer</h2>
            <p className="text-xs text-[#B3F7D1]/60 mt-1 leading-relaxed max-w-[65ch]">
              10-band grafis ±12 dB dengan preamp dan kurva respons real-time
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                handleResetSection('eq', 'Equalizer & Efek');
                void resumeAudioContext();
              }}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-[11px] font-medium text-[#B3F7D1]/80 hover:text-[#E8FFF3] transition-colors"
            >
              <RotateCcw className="w-3 h-3" strokeWidth={1.8} />
              Reset EQ
            </button>
            <PillSwitch
              ariaLabel="Aktifkan EQ"
              checked={localProfile.eqEnabled}
              onChange={(next) => {
                updateLocalProfile({ eqEnabled: next });
                if (next) void resumeAudioContext();
              }}
            />
          </div>
        </div>

        {playbackSummary.eqBypassNotice && (
          <p className="text-[11px] text-amber-200/85 bg-amber-500/10 border border-amber-400/20 rounded-xl px-4 py-2 leading-relaxed max-w-[65ch]">
            {playbackSummary.eqBypassNotice}
          </p>
        )}

        {/* Clean Preset Bar (Spotify-style dropdown + custom preset controls) */}
        <div className="flex flex-col @[640px]:flex-row @[640px]:items-center gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <select
              aria-label="Pilih preset equalizer"
              value={localProfile.presetId}
              onPointerDown={() => void resumeAudioContext()}
              onTouchStart={() => void resumeAudioContext()}
              onChange={(e) => {
                const nextId = e.target.value;
                if (nextId !== 'custom') {
                  applyEqPreset(nextId);
                  void resumeAudioContext();
                }
              }}
              className="flex-1 min-w-0 h-11 px-4 rounded-xl bg-white/[0.06] border border-white/[0.12] text-xs font-medium text-[#E8FFF3] focus:outline-none focus:border-[#19EE8A]"
            >
              {localProfile.presetId === 'custom' && (
                <option value="custom" className="bg-[#0B0F0D] text-[#19EE8A]">
                  Kustom (Disetel Manual)
                </option>
              )}
              <optgroup label="Preset Bawaan" className="bg-[#0B0F0D] text-[#B3F7D1]">
                {BUILTIN_EQ_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id} className="bg-[#0B0F0D] text-[#E8FFF3]">
                    {preset.name}
                  </option>
                ))}
              </optgroup>
              {localProfile.customPresets.length > 0 && (
                <optgroup label="Preset Kustom" className="bg-[#0B0F0D] text-[#B3F7D1]">
                  {localProfile.customPresets.map((preset) => (
                    <option key={preset.id} value={preset.id} className="bg-[#0B0F0D] text-[#E8FFF3]">
                      {preset.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            {(() => {
              const selectedCustom = localProfile.customPresets.find(
                (p) => p.id === localProfile.presetId,
              );
              if (!selectedCustom) return null;
              if (renamingPresetId === selectedCustom.id) {
                return (
                  <div className="flex items-center gap-2 bg-white/[0.06] border border-white/[0.12] rounded-xl px-2 h-11 shrink-0">
                    <input
                      type="text"
                      aria-label={`Ubah nama preset ${selectedCustom.name}`}
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (renameCustomPreset(selectedCustom.id, renameDraft)) {
                            showToast('Nama preset diperbarui');
                          }
                          setRenamingPresetId(null);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setRenamingPresetId(null);
                        }
                      }}
                      className="w-24 bg-transparent text-xs text-[#E8FFF3] focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label="Simpan nama baru"
                      onClick={() => {
                        if (renameCustomPreset(selectedCustom.id, renameDraft)) {
                          showToast('Nama preset diperbarui');
                        }
                        setRenamingPresetId(null);
                      }}
                      className="w-11 h-11 inline-flex items-center justify-center text-[#19EE8A] hover:opacity-80"
                    >
                      <Check className="w-4 h-4" strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      aria-label="Batal ubah nama"
                      onClick={() => setRenamingPresetId(null)}
                      className="w-11 h-11 inline-flex items-center justify-center text-[#B3F7D1]/70 hover:text-white"
                    >
                      <X className="w-4 h-4" strokeWidth={2.2} />
                    </button>
                  </div>
                );
              }
              return (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingPresetId(selectedCustom.id);
                      setRenameDraft(selectedCustom.name);
                    }}
                    aria-label={`Ganti nama preset ${selectedCustom.name}`}
                    className="h-11 w-11 inline-flex items-center justify-center rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] text-[#B3F7D1]/80 hover:text-[#E8FFF3]"
                  >
                    <Edit2 className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCustomPreset(selectedCustom.id)}
                    aria-label={`Hapus preset ${selectedCustom.name}`}
                    className="h-11 w-11 inline-flex items-center justify-center rounded-xl bg-white/[0.06] hover:bg-red-500/20 border border-white/[0.12] text-[#B3F7D1]/80 hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              );
            })()}
          </div>

          <div className="flex items-center gap-2 w-full @[640px]:w-64 shrink-0">
            <input
              type="text"
              value={presetNameInput}
              onChange={(e) => setPresetNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && presetNameInput.trim()) {
                  e.preventDefault();
                  const created = saveCustomPreset(presetNameInput);
                  if (created) {
                    setPresetNameInput('');
                    showToast(`Preset "${created.name}" disimpan`);
                  }
                }
              }}
              placeholder="Nama preset kustom baru..."
              className="flex-1 min-w-0 h-11 px-4 rounded-xl bg-white/[0.06] border border-white/[0.12] text-xs text-[#E8FFF3] placeholder:text-[#B3F7D1]/40 focus:outline-none focus:border-[#19EE8A]"
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
              className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-medium text-[#E8FFF3] disabled:opacity-40 transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
              Simpan
            </button>
          </div>
        </div>

        {/* Spotify-Clean Studio Console: Smooth Curve + 10 Vertical Faders + Preamp */}
        <div className="rounded-2xl bg-[#0B0F0D]/80 border border-white/[0.08] p-2.5 sm:p-4 space-y-4">
          <EqResponseCurveSvg
            eqEnabled={localProfile.eqEnabled}
            directMode={localProfile.directMode}
            preampDb={localProfile.preampDb}
            bands={localProfile.bands}
            bassBoostEnabled={localProfile.bassBoostEnabled}
            bassBoostLevel={localProfile.bassBoostLevel}
            sampleRate={diagnostics.sampleRate ?? 48000}
          />

          {/* 10 Vertical Faders Console */}
          <div className="overflow-x-auto scrollbar-none">
            <div className="min-w-[280px] grid grid-cols-[20px_repeat(10,minmax(0,1fr))] gap-0.5 sm:gap-1.5 items-stretch pt-1">
              <div className="flex flex-col justify-between py-5 text-[8px] sm:text-[9px] font-mono-num text-[#B3F7D1]/45 text-right pr-0.5 select-none">
                <span>+12</span>
                <span>0</span>
                <span>-12</span>
              </div>
              {EQ_FREQUENCY_LABELS.map((freqLabel, idx) => {
                const val = localProfile.bands[idx] ?? 0;
                const active = localProfile.eqEnabled && !localProfile.directMode;
                const ratio01 = (val + 12) / 24;
                const barHeightPct = (Math.abs(val) / 12) * 50;
                const shortFreq = formatEqBandShortLabel(EQ_FREQUENCIES[idx]);
                return (
                  <div key={freqLabel} className="flex flex-col items-center gap-1.5 select-none">
                    <span
                      className={`text-[10px] font-mono-num leading-none ${
                        !active
                          ? 'text-[#B3F7D1]/40'
                          : val === 0
                            ? 'text-[#B3F7D1]/55'
                            : 'text-[#19EE8A]'
                      }`}
                    >
                      {formatEqDb(val)}
                    </span>

                    <div className="relative h-36 sm:h-40 w-full flex items-center justify-center">
                      {/* Center 0 dB tick */}
                      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 w-3 h-px bg-white/[0.18]" />

                      {/* Vertical rail + bidirectional emerald fill from 0 dB */}
                      <div className="pointer-events-none relative w-[3px] h-full rounded-full bg-white/[0.12] overflow-hidden">
                        {val >= 0 ? (
                          <div
                            style={{ bottom: '50%', height: `${barHeightPct}%` }}
                            className={`absolute left-0 right-0 rounded-t-full transition-[height] duration-75 ${
                              active ? 'bg-[#19EE8A]' : 'bg-[#B3F7D1]/35'
                            }`}
                          />
                        ) : (
                          <div
                            style={{ top: '50%', height: `${barHeightPct}%` }}
                            className={`absolute left-0 right-0 rounded-b-full transition-[height] duration-75 ${
                              active ? 'bg-[#19EE8A]' : 'bg-[#B3F7D1]/35'
                            }`}
                          />
                        )}
                      </div>

                      {/* Thumb indicator */}
                      <div
                        style={{ bottom: `calc(${ratio01 * 100}% - 6px)` }}
                        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full shadow-md transition-[bottom] duration-75 ${
                          active
                            ? 'bg-[#E8FFF3] ring-2 ring-[#19EE8A]/70'
                            : 'bg-[#B3F7D1]/50 ring-1 ring-white/20'
                        }`}
                      />

                      {/* Interactive native vertical range overlay */}
                      <input
                        type="range"
                        aria-label={`Equalizer ${freqLabel}`}
                        min={-12}
                        max={12}
                        step={0.5}
                        value={val}
                        onPointerDown={() => void resumeAudioContext()}
                        onTouchStart={() => void resumeAudioContext()}
                        onChange={(e) => {
                          setEqBandGain(idx, Number(e.target.value));
                          void resumeAudioContext();
                        }}
                        className="sc-eq-vertical absolute inset-0 w-full h-full opacity-0"
                      />
                    </div>

                    <span className="text-[10px] font-medium text-[#B3F7D1]/65 leading-none">
                      {shortFreq}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Preamp Compact Bar */}
          <div className="flex items-center gap-4 pt-4 border-t border-white/[0.08]">
            <span className="text-xs font-medium text-[#E8FFF3]/80 shrink-0">Preamp</span>
            <input
              type="range"
              aria-label="Preamp dB"
              min={-12}
              max={12}
              step={0.5}
              value={localProfile.preampDb}
              onPointerDown={() => void resumeAudioContext()}
              onTouchStart={() => void resumeAudioContext()}
              onChange={(e) => {
                setEqPreamp(Number(e.target.value));
                void resumeAudioContext();
              }}
              style={{
                background: `linear-gradient(to right, #19EE8A ${((localProfile.preampDb + 12) / 24) * 100}%, rgba(179,247,209,0.2) ${((localProfile.preampDb + 12) / 24) * 100}%)`,
              }}
              className="sc-range-visible flex-1 min-w-0 min-h-[44px]"
            />
            <span className="w-14 text-right text-xs font-mono-num text-[#19EE8A] shrink-0">
              {formatEqDb(localProfile.preampDb)} dB
            </span>
          </div>
        </div>

        <SpectrumAnalyzer />

        {/* Bass Boost & Stereo Widener */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="rounded-xl bg-white/[0.045] border border-white/[0.09] p-4 space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#E8FFF3]">Bass Boost (Lowshelf 80 Hz)</p>
                <p className="text-[11px] text-[#B3F7D1]/60">
                  Intensitas: {localProfile.bassBoostEnabled ? `${localProfile.bassBoostLevel}%` : 'Mati'}
                </p>
              </div>
              <PillSwitch
                ariaLabel="Bass Boost"
                checked={localProfile.bassBoostEnabled}
                onChange={(next) => {
                  updateLocalProfile({ bassBoostEnabled: next });
                  if (next) void resumeAudioContext();
                }}
              />
            </div>
            <input
              type="range"
              aria-label="Intensitas Bass Boost"
              min={0}
              max={100}
              step={5}
              value={localProfile.bassBoostLevel}
              onPointerDown={() => void resumeAudioContext()}
              onTouchStart={() => void resumeAudioContext()}
              onChange={(e) => {
                const level = Number(e.target.value);
                updateLocalProfile({
                  bassBoostEnabled: level > 0,
                  bassBoostLevel: level,
                });
                if (level > 0) void resumeAudioContext();
              }}
              style={{
                background: `linear-gradient(to right, #19EE8A ${localProfile.bassBoostLevel}%, rgba(179,247,209,0.2) ${localProfile.bassBoostLevel}%)`,
              }}
              className="sc-range-visible w-full min-h-[44px]"
            />
          </div>

          <div className="rounded-xl bg-white/[0.045] border border-white/[0.09] p-4 space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#E8FFF3]">Stereo Widener (Matriks M/S)</p>
                <p className="text-[11px] text-[#B3F7D1]/60">
                  Intensitas:{' '}
                  {localProfile.stereoWidenerEnabled ? `${localProfile.stereoWidenerLevel}%` : 'Mati'}
                </p>
              </div>
              <PillSwitch
                ariaLabel="Stereo Widener"
                checked={localProfile.stereoWidenerEnabled}
                onChange={(next) => {
                  updateLocalProfile({ stereoWidenerEnabled: next });
                  if (next) void resumeAudioContext();
                }}
              />
            </div>
            <input
              type="range"
              aria-label="Intensitas Stereo Widener"
              min={0}
              max={100}
              step={5}
              value={localProfile.stereoWidenerLevel}
              onPointerDown={() => void resumeAudioContext()}
              onTouchStart={() => void resumeAudioContext()}
              onChange={(e) => {
                const level = Number(e.target.value);
                updateLocalProfile({
                  stereoWidenerEnabled: level > 0,
                  stereoWidenerLevel: level,
                });
                if (level > 0) void resumeAudioContext();
              }}
              style={{
                background: `linear-gradient(to right, #19EE8A ${localProfile.stereoWidenerLevel}%, rgba(179,247,209,0.2) ${localProfile.stereoWidenerLevel}%)`,
              }}
              className="sc-range-visible w-full min-h-[44px]"
            />
          </div>
        </div>
      </section>

      {/* 4. VOLUME & NORMALISASI */}
      <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-6">
        <SectionHeader
          title="4. Volume & Normalisasi Loudness"
          subtitle="Target Keras (-11 LUFS), Normal (-14 LUFS), Pelan (-19 LUFS), ReplayGain, dan limiter anti-clipping"
          onReset={() => handleResetSection('normalization', 'Volume & Normalisasi')}
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-[#E8FFF3]">Volume Master</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#19EE8A] tabular-nums">{effectiveVolume}%</span>
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={isMuted}
                className={`inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg text-xs font-medium transition-colors border ${
                  isMuted
                    ? 'bg-sc-gradient border-transparent text-[#0F1F17] font-semibold'
                    : 'bg-white/[0.06] border-white/[0.11] text-[#B3F7D1]/85 hover:text-[#E8FFF3] hover:bg-white/[0.12]'
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
            aria-label="Volume master"
            min={0}
            max={maxVolumeCap}
            value={effectiveVolume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{
              background: `linear-gradient(to right, #19EE8A ${(effectiveVolume / maxVolumeCap) * 100}%, rgba(179,247,209,0.2) ${(effectiveVolume / maxVolumeCap) * 100}%)`,
            }}
            className="sc-range-visible w-full min-h-[44px]"
          />
        </div>

        <div className="space-y-4 pt-4 border-t border-[#B3F7D1]/[0.1]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-[#E8FFF3]">Target Normalisasi</p>
            <span className="text-[11px] text-[#B3F7D1]/60">
              {diagnostics.measuredLufs !== null
                ? `Terukur dinamis: ${diagnostics.measuredLufs} LUFS`
                : 'Otomatis via ReplayGain / RMS awal'}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                { id: 'off', label: 'Mati' },
                { id: 'quiet', label: 'Pelan (-19 LUFS)' },
                { id: 'normal', label: 'Normal (-14 LUFS)' },
                { id: 'loud', label: 'Keras (-11 LUFS)' },
              ] as Array<{ id: NormalizationTarget; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateLocalProfile({ normalizationTarget: opt.id })}
                className={`min-h-[44px] py-2 px-4 rounded-xl text-xs font-medium transition-colors border ${
                  localProfile.normalizationTarget === opt.id
                    ? 'bg-sc-gradient border-transparent text-[#0F1F17] font-semibold'
                    : 'bg-white/[0.055] border-white/[0.1] text-[#B3F7D1]/80 hover:text-[#E8FFF3] hover:bg-white/[0.11]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4 pt-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#E8FFF3]">Prioritaskan Tag ReplayGain</p>
              <p className="text-xs text-[#B3F7D1]/60 leading-relaxed max-w-[65ch]">
                Gunakan tag ReplayGain bila tersedia di metadata berkas, jika tidak ukur loudness
                awal secara dinamis
              </p>
            </div>
            <PillSwitch
              ariaLabel="Prioritaskan Tag ReplayGain"
              checked={localProfile.useReplayGain}
              onChange={(next) => updateLocalProfile({ useReplayGain: next })}
            />
          </div>

          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#E8FFF3]">Limiter Anti-Clipping</p>
              <p className="text-xs text-[#B3F7D1]/60 leading-relaxed max-w-[65ch]">
                DynamicsCompressorNode (-1 dB, rasio 20:1) agar gain normalisasi/EQ tidak pecah
              </p>
            </div>
            <PillSwitch
              ariaLabel="Limiter Anti-Clipping"
              checked={localProfile.limiterEnabled}
              onChange={(next) => updateLocalProfile({ limiterEnabled: next })}
            />
          </div>
        </div>

        <div className="space-y-2 pt-4 border-t border-[#B3F7D1]/[0.1]">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#E8FFF3]">Batas Volume Maksimum (Player Web)</p>
              <p className="text-xs text-[#B3F7D1]/60 leading-relaxed max-w-[65ch]">
                Pembatas volume pelindung pendengaran untuk pemutar streaming
              </p>
            </div>
            <span className="text-xs text-[#19EE8A] tabular-nums shrink-0">
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
              background: `linear-gradient(to right, #19EE8A ${((youtubeSound.maxVolumeLimit - 20) / 80) * 100}%, rgba(179,247,209,0.2) ${((youtubeSound.maxVolumeLimit - 20) / 80) * 100}%)`,
            }}
            className="sc-range-visible w-full min-h-[44px]"
          />
        </div>
      </section>

      {/* 5. PEMUTARAN */}
      <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-6">
        <SectionHeader
          title="5. Pemutaran"
          subtitle="Crossfade equal-power 0–12 detik, gapless, fade play/pause, skip silence, dan kecepatan 0,5x–2x"
          onReset={() => handleResetSection('playback', 'Pengaturan Pemutaran')}
        />

        {/* Crossfade */}
        <CrossfadeControl variant="audio-tab" />

        <div className="space-y-4 pt-4 border-t border-[#B3F7D1]/[0.1]">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#E8FFF3]">Gapless Playback</p>
              <p className="text-xs text-[#B3F7D1]/60 leading-relaxed max-w-[65ch]">
                Praload lagu berikutnya dan mulai tepat waktu. Catatan: File MP3 dapat memiliki
                jeda mikro karena padding encoder, sedangkan FLAC dan OGG lebih aman untuk gapless.
              </p>
            </div>
            <PillSwitch
              ariaLabel="Gapless Playback"
              checked={localProfile.gaplessPlayback}
              onChange={(next) => updateLocalProfile({ gaplessPlayback: next })}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#E8FFF3]">Fade In / Out Saat Play & Jeda</p>
              <p className="text-xs text-[#B3F7D1]/60 leading-relaxed max-w-[65ch]">
                Transisi volume lembut saat memulai atau menjeda pemutaran
              </p>
            </div>
            <PillSwitch
              ariaLabel="Fade In / Out Saat Play dan Jeda"
              checked={localProfile.fadeOnPlayPause}
              onChange={(next) => updateLocalProfile({ fadeOnPlayPause: next })}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#E8FFF3]">
                Skip Silence (Deteksi Hening Real-Time)
              </p>
              <p className="text-xs text-[#B3F7D1]/60 leading-relaxed max-w-[65ch]">
                Pantau level RMS via AnalyserNode dan lompati bagian hening panjang
                {diagnostics.skipSilenceCount > 0
                  ? ` (terlompati: ${diagnostics.skipSilenceCount} kali)`
                  : ''}
              </p>
            </div>
            <PillSwitch
              ariaLabel="Skip Silence"
              checked={localProfile.skipSilence}
              onChange={(next) => updateLocalProfile({ skipSilence: next })}
            />
          </div>
        </div>

        {/* Playback speed 0.5x - 2x with pitch preserved */}
        <div className="space-y-2 pt-4 border-t border-[#B3F7D1]/[0.1]">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#E8FFF3]">Kecepatan Putar (0,5x – 2x)</p>
              <p className="text-xs text-[#B3F7D1]/60 leading-relaxed max-w-[65ch]">
                Pitch tetap terjaga (preservesPitch &amp; webkitPreservesPitch aktif)
              </p>
            </div>
            <span className="text-xs text-[#19EE8A] font-mono-num shrink-0">{playbackRate}x</span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {PLAYBACK_RATE_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => {
                  updateYoutubeSound('defaultPlaybackRate', rate);
                  setPlaybackRate(rate);
                }}
                className={`min-h-[44px] py-2 rounded-xl text-xs font-medium tabular-nums transition-colors border ${
                  playbackRate === rate
                    ? 'bg-sc-gradient border-transparent text-[#0F1F17] font-semibold'
                    : 'bg-white/[0.055] border-white/[0.1] text-[#B3F7D1]/80 hover:text-[#E8FFF3] hover:bg-white/[0.11]'
                }`}
              >
                {String(rate).replace('.', ',')}x
              </button>
            ))}
          </div>
          <input
            type="range"
            aria-label="Slider kecepatan putar 0.5x sampai 2x"
            min={0.5}
            max={2}
            step={0.05}
            value={playbackRate}
            onChange={(e) => {
              const rate = Number(e.target.value);
              updateYoutubeSound('defaultPlaybackRate', rate);
              setPlaybackRate(rate);
            }}
            style={{
              background: `linear-gradient(to right, #19EE8A ${((playbackRate - 0.5) / 1.5) * 100}%, rgba(179,247,209,0.2) ${((playbackRate - 0.5) / 1.5) * 100}%)`,
            }}
            className="sc-range-visible w-full min-h-[44px]"
          />
        </div>

        {/* Sleep Timer & Continuity */}
        <div className="space-y-4 pt-4 border-t border-[#B3F7D1]/[0.1]">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-[#E8FFF3]">Sleep Timer</p>
            <span className="text-xs text-[#19EE8A] tabular-nums">
              {sleepTimerMode === 'end_of_track'
                ? 'Akhir lagu ini'
                : remainingSleepMin
                  ? `${remainingSleepMin} menit tersisa`
                  : 'Mati'}
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <button
              type="button"
              aria-pressed={sleepTimerMode === 'off'}
              onClick={() => setSleepTimer('off')}
              className={`min-h-[44px] py-2 rounded-xl text-xs font-medium border transition-colors ${
                sleepTimerMode === 'off'
                  ? 'bg-sc-gradient border-transparent text-[#0F1F17] font-semibold'
                  : 'bg-white/[0.055] border-white/[0.1] text-[#B3F7D1]/80 hover:text-[#E8FFF3] hover:bg-white/[0.11]'
              }`}
            >
              Mati
            </button>
            {[15, 30, 45, 60].map((min) => {
              const active = sleepTimerMode === 'minutes' && sleepTimerMinutes === min;
              return (
                <button
                  key={min}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSleepTimer('minutes', min)}
                  className={`min-h-[44px] py-2 rounded-xl text-xs font-medium tabular-nums border transition-colors ${
                    active
                      ? 'bg-sc-gradient border-transparent text-[#0F1F17] font-semibold'
                      : 'bg-white/[0.055] border-white/[0.1] text-[#B3F7D1]/80 hover:text-[#E8FFF3] hover:bg-white/[0.11]'
                  }`}
                >
                  {min} mnt
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={sleepTimerMode === 'end_of_track'}
              onClick={() => setSleepTimer('end_of_track')}
              className={`min-h-[44px] py-2 rounded-xl text-xs font-medium border transition-colors ${
                sleepTimerMode === 'end_of_track'
                  ? 'bg-sc-gradient border-transparent text-[#0F1F17] font-semibold'
                  : 'bg-white/[0.055] border-white/[0.1] text-[#B3F7D1]/80 hover:text-[#E8FFF3] hover:bg-white/[0.11]'
              }`}
            >
              Akhir lagu
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 pt-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#E8FFF3]">Autoplay lagu terkait</p>
              <p className="text-xs text-[#B3F7D1]/60 leading-relaxed max-w-[65ch]">
                Lanjutkan otomatis dengan lagu radio terkait saat antrean selesai
              </p>
            </div>
            <PillSwitch
              ariaLabel="Autoplay lagu terkait"
              checked={autoplay}
              onChange={(next) => updateSetting('autoplay', next)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#E8FFF3]">Lanjut dari posisi terakhir</p>
              <p className="text-xs text-[#B3F7D1]/60 leading-relaxed max-w-[65ch]">
                Simpan posisi detik terakhir ketika aplikasi ditutup
              </p>
            </div>
            <PillSwitch
              ariaLabel="Lanjut dari posisi terakhir"
              checked={youtubeSound.resumeLastPosition}
              onChange={(next) => updateYoutubeSound('resumeLastPosition', next)}
            />
          </div>
        </div>
      </section>

      {/* 6. OUTPUT AUDIO */}
      <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-6">
        <SectionHeader
          title="6. Output Audio"
          subtitle="Mono downmix, balance kiri-kanan, pemilih perangkat output (setSinkId), dan Mode Direct"
          onReset={() => handleResetSection('output', 'Output Audio')}
        />

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#E8FFF3]">Audio Mono</p>
            <p className="text-xs text-[#B3F7D1]/60 leading-relaxed max-w-[65ch]">
              Gabungkan kanal kiri &amp; kanan (channelCount = 1, channelCountMode = explicit)
            </p>
          </div>
          <PillSwitch
            ariaLabel="Audio Mono"
            checked={localProfile.monoAudio}
            onChange={(next) => updateLocalProfile({ monoAudio: next })}
          />
        </div>

        <div className="space-y-2 pt-4 border-t border-[#B3F7D1]/[0.1]">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-[#E8FFF3]">Balance Kiri / Kanan</span>
            <button
              type="button"
              onClick={() => updateLocalProfile({ balance: 0 })}
              className="text-xs text-[#19EE8A] tabular-nums hover:underline min-h-[44px] inline-flex items-center"
            >
              {localProfile.balance === 0
                ? 'Tengah (0%)'
                : localProfile.balance < 0
                  ? `Kiri ${Math.abs(Math.round(localProfile.balance * 100))}%`
                  : `Kanan ${Math.round(localProfile.balance * 100)}%`}
            </button>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-[#B3F7D1]/60">
            <span>Kiri</span>
            <input
              type="range"
              aria-label="Penyeimbang kiri dan kanan"
              min={-1}
              max={1}
              step={0.05}
              value={localProfile.balance}
              onChange={(e) => updateLocalProfile({ balance: Number(e.target.value) })}
              style={{
                background: `linear-gradient(to right, #19EE8A ${((localProfile.balance + 1) / 2) * 100}%, rgba(179,247,209,0.2) ${((localProfile.balance + 1) / 2) * 100}%)`,
              }}
              className="sc-range-visible flex-1 min-h-[44px]"
            />
            <span>Kanan</span>
          </div>
        </div>

        {/* Output Device Picker via setSinkId */}
        <div className="space-y-2 pt-4 border-t border-[#B3F7D1]/[0.1]">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#E8FFF3]">Perangkat Output Audio (setSinkId)</p>
              <p className="text-xs text-[#B3F7D1]/60 leading-relaxed max-w-[65ch]">
                {outputDevicesState.supported
                  ? 'Arahkan keluaran Web Audio ke speaker atau DAC pilihan'
                  : outputDevicesState.reason ||
                    'Tidak didukung oleh browser saat ini (setSinkId tidak tersedia).'}
              </p>
            </div>
            {outputDevicesState.supported && (
              <button
                type="button"
                onClick={() => void refreshOutputDevices()}
                className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] backdrop-blur-md border border-white/[0.11] text-[11px] text-[#E8FFF3]/85 shrink-0 transition-colors"
              >
                <RefreshCw className="w-3 h-3" strokeWidth={1.8} />
                Segarkan
              </button>
            )}
          </div>

          <select
            aria-label="Pilih perangkat output audio"
            disabled={!outputDevicesState.supported}
            value={localProfile.outputDeviceId}
            onChange={async (e) => {
              const id = e.target.value;
              updateLocalProfile({ outputDeviceId: id });
              const res = await setAudioOutputDevice(id);
              if (!res.ok) {
                showToast(res.reason || 'Gagal mengubah perangkat output');
              } else {
                showToast('Perangkat output audio diperbarui');
              }
            }}
            className="w-full h-11 px-4 rounded-xl bg-white/[0.06] backdrop-blur-xl border border-white/[0.13] text-xs text-[#E8FFF3] disabled:opacity-45 disabled:cursor-not-allowed focus:outline-none focus:border-[#19EE8A]"
          >
            <option value="" className="bg-[#0B0F0D] text-[#E8FFF3]">Default Sistem</option>
            {outputDevicesState.devices.map((dev, idx) => (
              <option key={dev.deviceId || idx} value={dev.deviceId} className="bg-[#0B0F0D] text-[#E8FFF3]">
                {dev.label || `Perangkat Output ${idx + 1}`}
              </option>
            ))}
          </select>
        </div>

        {/* Mode Direct */}
        <div className="pt-4 border-t border-[#B3F7D1]/[0.1] space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#E8FFF3]">Mode Direct (Bypass DSP)</p>
              <p className="text-xs text-[#B3F7D1]/60 leading-relaxed max-w-[65ch]">
                Melewati EQ, normalisasi, limiter, crossfade, bass boost, dan stereo widener agar
                sinyal lossless tidak dimodifikasi
              </p>
            </div>
            <PillSwitch
              ariaLabel="Mode Direct (Bypass DSP)"
              checked={localProfile.directMode}
              onChange={(next) => updateLocalProfile({ directMode: next })}
            />
          </div>
          <p className="text-[11px] text-amber-200/80 bg-amber-500/10 border border-amber-400/20 rounded-xl px-4 py-2 leading-relaxed max-w-[65ch]">
            Catatan kejujuran: Mode Direct melewati seluruh pengolahan DSP internal browser, tetapi
            browser web tetap melalui mixer audio sistem operasi dan tidak menjamin keluaran
            bit-perfect eksklusif ke DAC eksternal.
          </p>
        </div>
      </section>

      {/* 7. DIAGNOSTIK AUDIO & TES NADA */}
      <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#E8FFF3] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#19EE8A]" strokeWidth={2} />
              7. Diagnostik Audio &amp; Tes Nada
            </h2>
            <p className="text-xs text-[#B3F7D1]/60 mt-1 leading-relaxed max-w-[65ch]">
              Status AudioContext, rantai node aktif, metadata stream aktual, dan generator tes nada
              melalui rantai efek yang sama
            </p>
          </div>
          {diagnostics.contextState === 'suspended' && (
            <button
              type="button"
              onClick={() => void resumeAudioContext()}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-semibold shrink-0 self-start sm:self-auto hover:brightness-105 transition"
            >
              Aktifkan AudioContext
            </button>
          )}
        </div>

        {/* AudioContext & Engine Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-xl bg-white/[0.05] backdrop-blur-xl border border-white/[0.1] p-4">
            <p className="text-[#B3F7D1]/60 text-[11px]">Status AudioContext</p>
            <p className="font-semibold text-[#E8FFF3] mt-1 uppercase">
              {diagnostics.contextState}
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.05] backdrop-blur-xl border border-white/[0.1] p-4">
            <p className="text-[#B3F7D1]/60 text-[11px]">Sample Rate Context</p>
            <p className="font-semibold text-[#E8FFF3] mt-1 tabular-nums">
              {diagnostics.sampleRate ? `${diagnostics.sampleRate.toLocaleString('id-ID')} Hz` : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.05] backdrop-blur-xl border border-white/[0.1] p-4">
            <p className="text-[#B3F7D1]/60 text-[11px]">Latensi Dasar / Output</p>
            <p className="font-semibold text-[#E8FFF3] mt-1 tabular-nums">
              {diagnostics.baseLatencyMs !== null ? `${diagnostics.baseLatencyMs} ms` : '—'} /{' '}
              {diagnostics.outputLatencyMs !== null ? `${diagnostics.outputLatencyMs} ms` : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.05] backdrop-blur-xl border border-white/[0.1] p-4">
            <p className="text-[#B3F7D1]/60 text-[11px]">setSinkId Browser</p>
            <p className="font-semibold text-[#E8FFF3] mt-1">
              {diagnostics.sinkIdSupported ? `Didukung (${diagnostics.sinkIdMethod})` : 'Tidak didukung'}
            </p>
          </div>
        </div>

        {/* Live Active Node Chain */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#E8FFF3]/80 flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-[#19EE8A]" strokeWidth={1.9} />
            Rantai Node Web Audio Aktif
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {diagnostics.activeNodes.map((node, idx) => (
              <div
                key={node.id}
                className={`rounded-xl px-4 py-2 border backdrop-blur-md text-[11px] ${
                  node.status === 'active'
                    ? 'bg-[#19EE8A]/12 border-[#19EE8A]/35 text-[#E8FFF3]'
                    : node.status === 'bypassed'
                      ? 'bg-white/[0.055] border-white/[0.1] text-[#B3F7D1]/60'
                      : 'bg-white/[0.025] border-white/[0.07] text-[#B3F7D1]/40'
                }`}
              >
                <p className="font-semibold truncate">
                  {idx + 1}. {node.label}
                </p>
                <p className="mt-1 text-[10px]">
                  {node.status === 'active'
                    ? `Aktif${node.detail ? ` (${node.detail})` : ''}`
                    : node.status === 'bypassed'
                      ? 'Dilewati'
                      : 'Nonaktif'}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Requested vs Actual Stream Metadata Comparison */}
        <div className="rounded-xl bg-white/[0.05] backdrop-blur-xl border border-white/[0.1] p-4 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-[#E8FFF3] flex items-center gap-2">
              <Headphones className="w-3.5 h-3.5 text-[#19EE8A]" strokeWidth={1.9} />
              Perbandingan Kualitas Diminta vs Aktual Diputar
            </span>
            {activeStreamMeta && (
              <span className="text-[11px] text-[#19EE8A] font-medium">
                {activeStreamMeta.badgeLabel}
              </span>
            )}
          </div>
          {activeStreamMeta ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-[#B3F7D1]/80">
              <div>
                <span className="text-[#B3F7D1]/55 block">Diminta (Profil)</span>
                <span className="font-medium text-[#E8FFF3]">
                  {STREAM_QUALITY_TIERS.find((t) => t.id === activeStreamMeta.requestedTier)
                    ?.label || activeStreamMeta.requestedTier}
                </span>
              </div>
              <div>
                <span className="text-[#B3F7D1]/55 block">Dipakai Aktual</span>
                <span className="font-medium text-[#E8FFF3] uppercase">
                  {activeStreamMeta.sourceMode === 'youtube-iframe'
                    ? 'Cloud Audio'
                    : activeStreamMeta.actualTier}
                  {activeStreamMeta.proxiedViaBackend ? ' (Proxy CORS)' : ''}
                </span>
              </div>
              <div>
                <span className="text-[#B3F7D1]/55 block">Codec &amp; Bitrate</span>
                <span className="font-medium text-[#E8FFF3] tabular-nums">
                  {activeStreamMeta.codec}
                  {activeStreamMeta.bitrateKbps ? ` · ${activeStreamMeta.bitrateKbps} kbps` : ''}
                </span>
              </div>
              <div>
                <span className="text-[#B3F7D1]/55 block">Sample Rate / Bit Depth</span>
                <span className="font-medium text-[#E8FFF3] tabular-nums">
                  {activeStreamMeta.sampleRateHz
                    ? `${(activeStreamMeta.sampleRateHz / 1000).toFixed(1)} kHz`
                    : '—'}
                  {activeStreamMeta.bitDepth ? ` / ${activeStreamMeta.bitDepth}-bit` : ''}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-[#B3F7D1]/55 leading-relaxed max-w-[65ch]">
              Belum ada stream lagu aktif. Putar lagu atau jalankan Tes Nada untuk memeriksa
              metadata aktual.
            </p>
          )}
        </div>

        {/* Tes Nada Generator */}
        <div className="pt-4 border-t border-[#B3F7D1]/[0.1] space-y-2">
          <div>
            <p className="text-sm font-medium text-[#E8FFF3] flex items-center gap-2">
              <Waves className="w-4 h-4 text-[#19EE8A]" strokeWidth={1.9} />
              Tes Nada (Uji Rantai Web Audio Tanpa Lagu)
            </p>
            <p className="text-xs text-[#B3F7D1]/60 leading-relaxed max-w-[65ch] mt-1">
              Putar sweep 20 Hz–20 kHz atau pink noise stereo melalui Preamp, EQ, Bass Boost,
              Stereo Widener, Normalisasi/Limiter, Mono, Balance, dan Volume secara real-time.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleToggleTestTone('sweep')}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors border ${
                diagnostics.testToneMode === 'sweep'
                  ? 'bg-sc-gradient border-transparent text-[#0F1F17]'
                  : 'bg-white/[0.07] hover:bg-white/[0.13] backdrop-blur-md border-white/[0.12] text-[#E8FFF3]'
              }`}
            >
              {diagnostics.testToneMode === 'sweep'
                ? 'Hentikan Sweep (Aktif)'
                : 'Tes Nada: Sweep 20Hz–20kHz'}
            </button>
            <button
              type="button"
              onClick={() => void handleToggleTestTone('pink')}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors border ${
                diagnostics.testToneMode === 'pink'
                  ? 'bg-sc-gradient border-transparent text-[#0F1F17]'
                  : 'bg-white/[0.07] hover:bg-white/[0.13] backdrop-blur-md border-white/[0.12] text-[#E8FFF3]'
              }`}
            >
              {diagnostics.testToneMode === 'pink'
                ? 'Hentikan Pink Noise (Aktif)'
                : 'Tes Nada: Pink Noise Stereo'}
            </button>
            {diagnostics.testToneMode && (
              <button
                type="button"
                onClick={stopTestTone}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs font-semibold"
              >
                Stop Tes Nada
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
