import { useEffect, useMemo, useState } from 'react';
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
  ShieldAlert,
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
  BUILTIN_EQ_PRESETS,
  clampYoutubeVolume,
  computeEqFrequencyResponseCurve,
  EQ_FREQUENCY_LABELS,
  PLAYBACK_RATE_OPTIONS,
  STREAM_QUALITY_TIERS,
} from '../utils/audioMath';
import { getTrackUniqueId, isLocalTrack } from '../utils/playerLogic';
import { SpectrumAnalyzer } from './SpectrumAnalyzer';

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
    const height = 112;
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

    const d = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'}${c.x} ${c.y}`)
      .join(' ');
    const midY = padY + (maxD / (maxD - minD)) * (height - padY * 2);
    const area = `${d} L${coords[coords.length - 1].x} ${midY} L${coords[0].x} ${midY} Z`;
    return { pathD: d, fillD: area, minDb: minD, maxDb: maxD };
  }, [eqEnabled, directMode, preampDb, bands, bassBoostEnabled, bassBoostLevel, sampleRate]);

  const bypassed = directMode || !eqEnabled;

  return (
    <div className="rounded-xl bg-black/40 border border-white/[0.08] p-3 space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-white/55">
        <span>Kurva Respons Frekuensi Filter Asli (20 Hz – 20 kHz)</span>
        <span className="text-white/40 tabular-nums">
          {directMode ? 'Bypass (Mode Direct)' : !eqEnabled ? 'EQ Nonaktif' : '±18 dB'}
        </span>
      </div>
      <svg
        viewBox="0 0 560 112"
        className="w-full h-[96px] block"
        role="img"
        aria-label="Grafik kurva respons frekuensi equalizer"
      >
        {/* Reference horizontal lines (+12, 0, -12 dB) */}
        {[12, 0, -12].map((db) => {
          const y = 10 + ((maxDb - db) / (maxDb - minDb)) * (112 - 20);
          return (
            <line
              key={db}
              x1={12}
              y1={y}
              x2={548}
              y2={y}
              stroke={db === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)'}
              strokeDasharray={db === 0 ? '3 3' : undefined}
              strokeWidth={1}
            />
          );
        })}
        <path
          d={fillD}
          fill={bypassed ? 'rgba(255,255,255,0.06)' : 'rgba(46,230,166,0.16)'}
        />
        <path
          d={pathD}
          fill="none"
          stroke={bypassed ? 'rgba(255,255,255,0.45)' : '#2EE6A6'}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>
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
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <p className="text-xs text-white/50 mt-0.5">{subtitle}</p>
      </div>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-medium text-white/75 hover:text-white self-start shrink-0 transition-colors"
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

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const sleepTimerMode = usePlayerStore((s) => s.sleepTimerMode);
  const sleepTimerEndsAt = usePlayerStore((s) => s.sleepTimerEndsAt);
  const activeStreamMeta = usePlayerStore((s) => s.activeStreamMeta);
  const streamOptions = usePlayerStore((s) => s.streamOptions);
  const selectedQualityOverride = usePlayerStore((s) => s.selectedQualityOverride);
  const webAudioWarning = usePlayerStore((s) => s.webAudioWarning);
  const networkEffectiveType = usePlayerStore((s) => s.networkEffectiveType);
  const bufferingStallCount = usePlayerStore((s) => s.bufferingStallCount);

  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);
  const setSelectedQualityOverride = usePlayerStore((s) => s.setSelectedQualityOverride);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const offlineDownloads = useLibraryStore((s) => s.offlineDownloads);
  const downloadTrackOffline = useLibraryStore((s) => s.downloadTrackOffline);
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
  const downloadAllowedForCurrent = Boolean(
    currentTrack && (localPlaying || streamOptions?.audiodownload_allowed),
  );

  const connectionApiSupported =
    typeof navigator !== 'undefined' &&
    Boolean((navigator as Navigator & { connection?: unknown }).connection);

  return (
    <div className="space-y-6">
      {/* Top Action & Global Warning */}
      <div className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            Pengaturan Audio Lengkap ({accountKey})
          </p>
          <p className="text-xs text-white/55 mt-0.5">
            Semua kontrol diterapkan langsung ke mesin audio tanpa memuat ulang halaman.
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleResetSection('all', 'Seluruh pengaturan audio')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white shrink-0 self-start sm:self-auto transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.85} />
          Reset ke default
        </button>
      </div>

      {webAudioWarning && (
        <div
          role="status"
          className="rounded-2xl bg-amber-500/10 border border-amber-400/25 px-4 py-3 flex items-start gap-3"
        >
          <ShieldAlert className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" strokeWidth={1.9} />
          <div className="text-xs space-y-0.5">
            <p className="font-semibold text-amber-200">{webAudioWarning}</p>
            <p className="text-amber-100/75">
              Lagu tetap diputar normal. Untuk menguji Equalizer, Bass Boost, Stereo Widener,
              Mono, dan Balance secara langsung sekarang, putar file lokal atau gunakan tombol{' '}
              <span className="font-semibold text-white">Tes Nada</span> di panel Diagnostik
              Audio di bawah.
            </p>
          </div>
        </div>
      )}

      {/* 1. KUALITAS STREAMING */}
      <section className="glass-card rounded-2xl p-5 space-y-5">
        <SectionHeader
          title="1. Kualitas Streaming"
          subtitle="Atur target bitrate dan resolusi lossless terpisah untuk WiFi serta data seluler"
          onReset={() => handleResetSection('streaming', 'Kualitas Streaming')}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-1.5 block">
            <span className="text-xs font-medium text-white/80 block">Kualitas WiFi</span>
            <select
              aria-label="Kualitas streaming WiFi"
              value={localProfile.wifiQuality}
              onChange={(e) =>
                updateLocalProfile({ wifiQuality: e.target.value as StreamQualityTier })
              }
              className="w-full h-10 px-3 rounded-xl bg-[#18181B] border border-white/[0.12] text-xs text-white focus:outline-none focus:border-[#2EE6A6]"
            >
              {STREAM_QUALITY_TIERS.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.shortLabel}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 block">
            <span className="text-xs font-medium text-white/80 block">Kualitas Data Seluler</span>
            <select
              aria-label="Kualitas streaming Data Seluler"
              value={localProfile.cellularQuality}
              onChange={(e) =>
                updateLocalProfile({ cellularQuality: e.target.value as StreamQualityTier })
              }
              className="w-full h-10 px-3 rounded-xl bg-[#18181B] border border-white/[0.12] text-xs text-white focus:outline-none focus:border-[#2EE6A6]"
            >
              {STREAM_QUALITY_TIERS.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.shortLabel}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-3 pt-3 border-t border-white/[0.07]">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-medium text-white">Auto-Adjust Quality</p>
              <p className="text-xs text-white/50">
                Turunkan kualitas saat jaringan melemah atau buffering berulang, lalu naikkan lagi saat stabil
                {connectionApiSupported
                  ? ` (jaringan terdeteksi: ${networkEffectiveType || 'stabil'}, stall: ${bufferingStallCount})`
                  : ' (navigator.connection tidak didukung browser ini — menggunakan deteksi stall)'}
              </p>
            </div>
            <input
              type="checkbox"
              checked={localProfile.autoAdjustQuality}
              onChange={(e) => updateLocalProfile({ autoAdjustQuality: e.target.checked })}
              className="w-4 h-4 accent-[#2EE6A6]"
            />
          </label>

          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-medium text-white">Mode Hemat Data</p>
              <p className="text-xs text-white/50">
                Paksa kualitas audio terendah yang tersedia dan perkecil resolusi gambar sampul
              </p>
            </div>
            <input
              type="checkbox"
              checked={dataSaver}
              onChange={(e) => updateSetting('dataSaver', e.target.checked)}
              className="w-4 h-4 accent-[#2EE6A6]"
            />
          </label>
        </div>

        {/* Real stream availability from get_stream_options(track_id) */}
        <div className="pt-3 border-t border-white/[0.07] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-white/80">
              Ketersediaan Kualitas Nyata Pada Lagu Aktif
            </p>
            {selectedQualityOverride && (
              <button
                type="button"
                onClick={() => setSelectedQualityOverride(null)}
                className="text-[11px] text-[#2EE6A6] hover:underline"
              >
                Kembali ke pemutar default
              </button>
            )}
          </div>

          {!currentTrack ? (
            <p className="text-xs text-white/45">
              Putar sebuah lagu untuk melihat codec, bitrate, sample rate, dan tier kualitas asli dari sumbernya.
            </p>
          ) : localPlaying ? (
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <p className="font-semibold text-white">
                  File Lokal: {activeStreamMeta?.badgeLabel || 'Memuat metadata...'}
                </p>
                <p className="text-white/50 mt-0.5">
                  Kualitas sesuai berkas asli tanpa upsampling palsu.
                </p>
              </div>
              {activeStreamMeta?.hiRes && (
                <span className="px-2 py-1 rounded-lg bg-[#2EE6A6]/15 text-[#2EE6A6] font-semibold">
                  Hi-Res Lossless
                </span>
              )}
              {!activeStreamMeta?.hiRes && activeStreamMeta?.lossless && (
                <span className="px-2 py-1 rounded-lg bg-[#2EE6A6]/15 text-[#2EE6A6] font-semibold">
                  Lossless
                </span>
              )}
            </div>
          ) : streamOptions ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {streamOptions.options.map((opt) => {
                const isSelected = selectedQualityOverride === opt.tier;
                const specParts = [
                  opt.codec,
                  opt.bitrateKbps ? `${opt.bitrateKbps} kbps` : null,
                  opt.sampleRateHz ? `${(opt.sampleRateHz / 1000).toFixed(1)} kHz` : null,
                  opt.bitDepth ? `${opt.bitDepth}-bit` : null,
                ].filter(Boolean);

                return (
                  <button
                    key={opt.tier}
                    type="button"
                    disabled={!opt.available}
                    onClick={() => {
                      if (!opt.available) return;
                      setSelectedQualityOverride(opt.tier);
                      showToast(
                        `Beralih ke stream ${opt.label} (${specParts.join(' · ')}) tanpa mengulang posisi`,
                      );
                    }}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      !opt.available
                        ? 'bg-white/[0.02] border-white/[0.05] text-white/35 cursor-not-allowed'
                        : isSelected
                          ? 'bg-[#2EE6A6]/15 border-[#2EE6A6]/50 text-white'
                          : 'bg-white/[0.05] border-white/[0.08] hover:bg-white/[0.09] text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{opt.label}</span>
                      {opt.available ? (
                        <span className="text-[10px] font-medium text-[#2EE6A6]">
                          {opt.isPreview ? 'Pratinjau CORS' : 'Tersedia'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-white/40">Tidak tersedia</span>
                      )}
                    </div>
                    <p className="text-[11px] text-white/50 mt-0.5">
                      {opt.available
                        ? specParts.join(' · ') || 'Stream langsung tersedia'
                        : opt.unavailableReason || 'Tidak tersedia untuk lagu ini'}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-white/45">Memeriksa opsi stream dari backend...</p>
          )}
        </div>
      </section>

      {/* 2. KUALITAS UNDUHAN & OFFLINE */}
      <section className="glass-card rounded-2xl p-5 space-y-4">
        <SectionHeader
          title="2. Kualitas Unduhan & Offline"
          subtitle="Unduhan offline hanya diizinkan jika sumber lagu menetapkan audiodownload_allowed = true"
          onReset={() => handleResetSection('download', 'Kualitas Unduhan')}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <label className="space-y-1.5 block">
            <span className="text-xs font-medium text-white/80 block">Kualitas Unduhan</span>
            <select
              aria-label="Kualitas unduhan offline"
              value={localProfile.downloadQuality}
              onChange={(e) =>
                updateLocalProfile({
                  downloadQuality: e.target.value as ConcreteQualityTier,
                })
              }
              className="w-full h-10 px-3 rounded-xl bg-[#18181B] border border-white/[0.12] text-xs text-white focus:outline-none focus:border-[#2EE6A6]"
            >
              {STREAM_QUALITY_TIERS.filter((t) => t.id !== 'auto').map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.shortLabel}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            disabled={!currentTrack || !downloadAllowedForCurrent || downloadingOffline}
            onClick={() => void handleDownloadCurrentTrack()}
            className="h-10 px-4 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold inline-flex items-center justify-center gap-2 hover:brightness-105 disabled:bg-white/[0.08] disabled:text-white/35 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" strokeWidth={2} />
            {downloadingOffline
              ? 'Menyimpan...'
              : alreadyOffline
                ? 'Perbarui Salinan Offline'
                : 'Simpan Lagu Aktif Offline'}
          </button>
        </div>

        {currentTrack && !downloadAllowedForCurrent && (
          <p className="text-xs text-white/50">
            {streamOptions?.downloadDisabledReason ||
              'Unduhan offline dinonaktifkan: sumber lagu katalog ini tidak mengizinkan unduhan (audiodownload_allowed = false). File lokal milik Anda sendiri tetap dapat di-cache ke penyimpanan offline.'}
          </p>
        )}

        {offlineDownloads.length > 0 && (
          <div className="pt-3 border-t border-white/[0.07] space-y-2">
            <p className="text-xs font-semibold text-white/75">
              Tersimpan Offline ({offlineDownloads.length} lagu · IndexedDB + Cache Storage)
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {offlineDownloads.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{rec.track.title}</p>
                    <p className="text-[11px] text-white/50 truncate">
                      {rec.codec}
                      {rec.bitrateKbps ? ` · ${rec.bitrateKbps} kbps` : ''}
                      {rec.sampleRateHz ? ` · ${(rec.sampleRateHz / 1000).toFixed(1)} kHz` : ''}
                      {rec.bitDepth ? ` · ${rec.bitDepth}-bit` : ''} ·{' '}
                      {(rec.fileSize / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        playTrack(rec.track, { sourceLabel: 'Unduhan Offline' })
                      }
                      className="px-2.5 py-1 rounded-lg bg-[#2EE6A6]/15 text-[#2EE6A6] text-[11px] font-medium hover:bg-[#2EE6A6]/25 inline-flex items-center gap-1"
                    >
                      <Play className="w-3 h-3 fill-current" strokeWidth={2} />
                      Putar
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteOfflineDownload(rec.id)}
                      aria-label={`Hapus unduhan offline ${rec.track.title}`}
                      className="p-1.5 rounded-lg text-white/50 hover:text-red-300 hover:bg-white/[0.08]"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 3. EQUALIZER & EFEK SPASIAL */}
      <section className="glass-card rounded-2xl p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">
              3. Equalizer 10-Band, Bass Boost & Stereo Widener
            </h2>
            <p className="text-xs text-white/50 mt-0.5">
              10 BiquadFilter (31 Hz–16 kHz, ±12 dB), preamp, 19 preset, preset kustom, dan kurva
              respons terhitung asli
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleResetSection('eq', 'Equalizer & Efek')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-medium text-white/75 hover:text-white"
            >
              <RotateCcw className="w-3 h-3" strokeWidth={1.8} />
              Reset EQ
            </button>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-white cursor-pointer">
              <span>Aktifkan EQ</span>
              <input
                type="checkbox"
                checked={localProfile.eqEnabled}
                onChange={(e) => updateLocalProfile({ eqEnabled: e.target.checked })}
                className="w-4 h-4 accent-[#2EE6A6]"
              />
            </label>
          </div>
        </div>

        <SpectrumAnalyzer />

        <EqResponseCurveSvg
          eqEnabled={localProfile.eqEnabled}
          directMode={localProfile.directMode}
          preampDb={localProfile.preampDb}
          bands={localProfile.bands}
          bassBoostEnabled={localProfile.bassBoostEnabled}
          bassBoostLevel={localProfile.bassBoostLevel}
          sampleRate={diagnostics.sampleRate ?? 48000}
        />

        {/* 19 Built-in Presets + Custom Presets */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-white/75">
              Preset Equalizer ({BUILTIN_EQ_PRESETS.length} bawaan
              {localProfile.customPresets.length > 0
                ? ` + ${localProfile.customPresets.length} kustom`
                : ''}
              )
            </p>
            {localProfile.directMode && (
              <span className="text-[11px] text-amber-300">Mode Direct aktif (EQ dilewati)</span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {BUILTIN_EQ_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyEqPreset(preset.id)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors ${
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
                {renamingPresetId === preset.id ? (
                  <div className="flex items-center gap-1 px-2 py-1">
                    <input
                      type="text"
                      aria-label={`Ubah nama preset ${preset.name}`}
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      className="w-28 px-1.5 py-0.5 rounded bg-black/50 text-white text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label="Simpan nama baru"
                      onClick={() => {
                        if (renameCustomPreset(preset.id, renameDraft)) {
                          showToast('Nama preset diperbarui');
                        }
                        setRenamingPresetId(null);
                      }}
                      className="p-0.5 hover:opacity-80"
                    >
                      <Check className="w-3 h-3" strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      aria-label="Batal ubah nama"
                      onClick={() => setRenamingPresetId(null)}
                      className="p-0.5 hover:opacity-80"
                    >
                      <X className="w-3 h-3" strokeWidth={2.2} />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => applyEqPreset(preset.id)}
                      className="pl-2.5 pr-1.5 py-1.5 text-xs"
                    >
                      {preset.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingPresetId(preset.id);
                        setRenameDraft(preset.name);
                      }}
                      aria-label={`Ganti nama preset ${preset.name}`}
                      className="p-1 hover:opacity-75"
                    >
                      <Edit2 className="w-3 h-3" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCustomPreset(preset.id)}
                      aria-label={`Hapus preset ${preset.name}`}
                      className="pr-2 pl-1 py-1.5 hover:text-red-400"
                    >
                      <Trash2 className="w-3 h-3" strokeWidth={1.75} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1 max-w-sm">
            <input
              type="text"
              value={presetNameInput}
              onChange={(e) => setPresetNameInput(e.target.value)}
              placeholder="Nama preset kustom baru..."
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
              Simpan
            </button>
          </div>
        </div>

        {/* Preamp + 10-Band EQ Sliders */}
        <div className="space-y-4 pt-3 border-t border-white/[0.07]">
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
              style={{
                background: `linear-gradient(to right, #2EE6A6 ${((localProfile.preampDb + 12) / 24) * 100}%, rgba(255,255,255,0.16) ${((localProfile.preampDb + 12) / 24) * 100}%)`,
              }}
              className="sc-range-visible flex-1 max-w-sm"
            />
            <span className="w-16 text-right text-xs text-[#2EE6A6] tabular-nums">
              {localProfile.preampDb > 0 ? `+${localProfile.preampDb}` : localProfile.preampDb} dB
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {EQ_FREQUENCY_LABELS.map((freqLabel, idx) => {
              const val = localProfile.bands[idx] ?? 0;
              const pct = ((val + 12) / 24) * 100;
              return (
                <div
                  key={freqLabel}
                  className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-2.5 space-y-2"
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
                    style={{
                      background: `linear-gradient(to right, #2EE6A6 ${pct}%, rgba(255,255,255,0.16) ${pct}%)`,
                    }}
                    className="sc-range-visible w-full"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Bass Boost & Stereo Widener */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/[0.07]">
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3.5 space-y-2.5">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-xs font-semibold text-white">Bass Boost (Lowshelf 80 Hz)</p>
                <p className="text-[11px] text-white/50">
                  Intensitas: {localProfile.bassBoostEnabled ? `${localProfile.bassBoostLevel}%` : 'Mati'}
                </p>
              </div>
              <input
                type="checkbox"
                checked={localProfile.bassBoostEnabled}
                onChange={(e) => updateLocalProfile({ bassBoostEnabled: e.target.checked })}
                className="w-4 h-4 accent-[#2EE6A6]"
              />
            </label>
            <input
              type="range"
              aria-label="Intensitas Bass Boost"
              min={0}
              max={100}
              step={5}
              disabled={!localProfile.bassBoostEnabled}
              value={localProfile.bassBoostLevel}
              onChange={(e) => updateLocalProfile({ bassBoostLevel: Number(e.target.value) })}
              style={{
                background: `linear-gradient(to right, #2EE6A6 ${localProfile.bassBoostLevel}%, rgba(255,255,255,0.16) ${localProfile.bassBoostLevel}%)`,
              }}
              className="sc-range-visible w-full disabled:opacity-40"
            />
          </div>

          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3.5 space-y-2.5">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-xs font-semibold text-white">Stereo Widener (Matriks M/S)</p>
                <p className="text-[11px] text-white/50">
                  Intensitas:{' '}
                  {localProfile.stereoWidenerEnabled ? `${localProfile.stereoWidenerLevel}%` : 'Mati'}
                </p>
              </div>
              <input
                type="checkbox"
                checked={localProfile.stereoWidenerEnabled}
                onChange={(e) => updateLocalProfile({ stereoWidenerEnabled: e.target.checked })}
                className="w-4 h-4 accent-[#2EE6A6]"
              />
            </label>
            <input
              type="range"
              aria-label="Intensitas Stereo Widener"
              min={0}
              max={100}
              step={5}
              disabled={!localProfile.stereoWidenerEnabled}
              value={localProfile.stereoWidenerLevel}
              onChange={(e) => updateLocalProfile({ stereoWidenerLevel: Number(e.target.value) })}
              style={{
                background: `linear-gradient(to right, #2EE6A6 ${localProfile.stereoWidenerLevel}%, rgba(255,255,255,0.16) ${localProfile.stereoWidenerLevel}%)`,
              }}
              className="sc-range-visible w-full disabled:opacity-40"
            />
          </div>
        </div>
      </section>

      {/* 4. VOLUME & NORMALISASI */}
      <section className="glass-card rounded-2xl p-5 space-y-5">
        <SectionHeader
          title="4. Volume & Normalisasi Loudness"
          subtitle="Target Keras (-11 LUFS), Normal (-14 LUFS), Pelan (-19 LUFS), ReplayGain, dan limiter anti-clipping"
          onReset={() => handleResetSection('normalization', 'Volume & Normalisasi')}
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">Volume Master</span>
            <div className="flex items-center gap-2.5">
              <span className="text-xs text-[#2EE6A6] tabular-nums">{effectiveVolume}%</span>
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
            aria-label="Volume master"
            min={0}
            max={maxVolumeCap}
            value={effectiveVolume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{
              background: `linear-gradient(to right, #2EE6A6 ${(effectiveVolume / maxVolumeCap) * 100}%, rgba(255,255,255,0.16) ${(effectiveVolume / maxVolumeCap) * 100}%)`,
            }}
            className="sc-range-visible w-full"
          />
        </div>

        <div className="space-y-2 pt-3 border-t border-white/[0.07]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">Target Normalisasi</p>
            <span className="text-[11px] text-white/50">
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

          <label className="flex items-center justify-between gap-4 cursor-pointer pt-2">
            <div>
              <p className="text-sm font-medium text-white">Prioritaskan Tag ReplayGain</p>
              <p className="text-xs text-white/50">
                Gunakan tag ReplayGain bila tersedia di metadata berkas, jika tidak ukur loudness
                awal secara dinamis
              </p>
            </div>
            <input
              type="checkbox"
              checked={localProfile.useReplayGain}
              onChange={(e) => updateLocalProfile({ useReplayGain: e.target.checked })}
              className="w-4 h-4 accent-[#2EE6A6]"
            />
          </label>

          <label className="flex items-center justify-between gap-4 cursor-pointer pt-1">
            <div>
              <p className="text-sm font-medium text-white">Limiter Anti-Clipping</p>
              <p className="text-xs text-white/50">
                DynamicsCompressorNode (-1 dB, rasio 20:1) agar gain normalisasi/EQ tidak pecah
              </p>
            </div>
            <input
              type="checkbox"
              checked={localProfile.limiterEnabled}
              onChange={(e) => updateLocalProfile({ limiterEnabled: e.target.checked })}
              className="w-4 h-4 accent-[#2EE6A6]"
            />
          </label>
        </div>

        <div className="space-y-2 pt-3 border-t border-white/[0.07]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Batas Volume Maksimum (Player Web)</p>
              <p className="text-xs text-white/50">
                Pembatas volume pelindung pendengaran untuk pemutar sematan
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
            className="sc-range-visible w-full"
          />
        </div>
      </section>

      {/* 5. PEMUTARAN */}
      <section className="glass-card rounded-2xl p-5 space-y-5">
        <SectionHeader
          title="5. Pemutaran"
          subtitle="Crossfade equal-power 0–12 detik, gapless, fade play/pause, skip silence, dan kecepatan 0,5x–2x"
          onReset={() => handleResetSection('playback', 'Pengaturan Pemutaran')}
        />

        {/* Crossfade */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Crossfade Equal-Power</p>
              <p className="text-xs text-white/50">
                Dua deck audio bergantian (0–12 detik). Dinonaktifkan otomatis saat Mode Direct aktif.
              </p>
            </div>
            <span className="text-xs text-[#2EE6A6] tabular-nums">
              {localProfile.crossfadeSeconds} detik
            </span>
          </div>
          <input
            type="range"
            aria-label="Durasi crossfade 0 sampai 12 detik"
            min={0}
            max={12}
            step={1}
            value={localProfile.crossfadeSeconds}
            onChange={(e) => updateLocalProfile({ crossfadeSeconds: Number(e.target.value) })}
            style={{
              background: `linear-gradient(to right, #2EE6A6 ${(localProfile.crossfadeSeconds / 12) * 100}%, rgba(255,255,255,0.16) ${(localProfile.crossfadeSeconds / 12) * 100}%)`,
            }}
            className="sc-range-visible w-full"
          />
        </div>

        <div className="space-y-3 pt-3 border-t border-white/[0.07]">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-medium text-white">Gapless Playback</p>
              <p className="text-xs text-white/50">
                Praload lagu berikutnya dan mulai tepat waktu. Catatan: File MP3 dapat memiliki
                jeda mikro karena padding encoder, sedangkan FLAC dan OGG lebih aman untuk gapless.
              </p>
            </div>
            <input
              type="checkbox"
              checked={localProfile.gaplessPlayback}
              onChange={(e) => updateLocalProfile({ gaplessPlayback: e.target.checked })}
              className="w-4 h-4 accent-[#2EE6A6]"
            />
          </label>

          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-medium text-white">Fade In / Out Saat Play & Jeda</p>
              <p className="text-xs text-white/50">
                Transisi volume lembut saat memulai atau menjeda pemutaran
              </p>
            </div>
            <input
              type="checkbox"
              checked={localProfile.fadeOnPlayPause}
              onChange={(e) => updateLocalProfile({ fadeOnPlayPause: e.target.checked })}
              className="w-4 h-4 accent-[#2EE6A6]"
            />
          </label>

          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-medium text-white">
                Skip Silence (Deteksi Hening Real-Time)
              </p>
              <p className="text-xs text-white/50">
                Pantau level RMS via AnalyserNode dan lompati bagian hening panjang
                {diagnostics.skipSilenceCount > 0
                  ? ` (terlompati: ${diagnostics.skipSilenceCount} kali)`
                  : ''}
              </p>
            </div>
            <input
              type="checkbox"
              checked={localProfile.skipSilence}
              onChange={(e) => updateLocalProfile({ skipSilence: e.target.checked })}
              className="w-4 h-4 accent-[#2EE6A6]"
            />
          </label>
        </div>

        {/* Playback speed 0.5x - 2x with pitch preserved */}
        <div className="space-y-2.5 pt-3 border-t border-white/[0.07]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Kecepatan Putar (0,5x – 2x)</p>
              <p className="text-xs text-white/50">
                Pitch tetap terjaga (preservesPitch &amp; webkitPreservesPitch aktif)
              </p>
            </div>
            <span className="text-xs text-[#2EE6A6] font-mono-num">{playbackRate}x</span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
            {PLAYBACK_RATE_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => {
                  updateYoutubeSound('defaultPlaybackRate', rate);
                  setPlaybackRate(rate);
                }}
                className={`py-1.5 rounded-xl text-xs font-medium tabular-nums transition-colors ${
                  playbackRate === rate
                    ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                    : 'bg-white/[0.06] text-white/75 hover:text-white'
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
              background: `linear-gradient(to right, #2EE6A6 ${((playbackRate - 0.5) / 1.5) * 100}%, rgba(255,255,255,0.16) ${((playbackRate - 0.5) / 1.5) * 100}%)`,
            }}
            className="sc-range-visible w-full"
          />
        </div>

        {/* Sleep Timer & Continuity */}
        <div className="space-y-3 pt-3 border-t border-white/[0.07]">
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

          <label className="flex items-center justify-between gap-4 cursor-pointer pt-1">
            <div>
              <p className="text-sm font-medium text-white">Autoplay lagu terkait</p>
              <p className="text-xs text-white/50">
                Lanjutkan otomatis dengan lagu radio terkait saat antrean selesai
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
                Simpan posisi detik terakhir ketika aplikasi ditutup
              </p>
            </div>
            <input
              type="checkbox"
              checked={youtubeSound.resumeLastPosition}
              onChange={(e) => updateYoutubeSound('resumeLastPosition', e.target.checked)}
              className="w-4 h-4 accent-[#2EE6A6]"
            />
          </label>
        </div>
      </section>

      {/* 6. OUTPUT AUDIO */}
      <section className="glass-card rounded-2xl p-5 space-y-5">
        <SectionHeader
          title="6. Output Audio"
          subtitle="Mono downmix, balance kiri-kanan, pemilih perangkat output (setSinkId), dan Mode Direct"
          onReset={() => handleResetSection('output', 'Output Audio')}
        />

        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <p className="text-sm font-medium text-white">Audio Mono</p>
            <p className="text-xs text-white/50">
              Gabungkan kanal kiri &amp; kanan (channelCount = 1, channelCountMode = explicit)
            </p>
          </div>
          <input
            type="checkbox"
            checked={localProfile.monoAudio}
            onChange={(e) => updateLocalProfile({ monoAudio: e.target.checked })}
            className="w-4 h-4 accent-[#2EE6A6]"
          />
        </label>

        <div className="space-y-1.5 pt-3 border-t border-white/[0.07]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">Balance Kiri / Kanan</span>
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
              style={{
                background: `linear-gradient(to right, #2EE6A6 ${((localProfile.balance + 1) / 2) * 100}%, rgba(255,255,255,0.16) ${((localProfile.balance + 1) / 2) * 100}%)`,
              }}
              className="sc-range-visible flex-1"
            />
            <span>Kanan</span>
          </div>
        </div>

        {/* Output Device Picker via setSinkId */}
        <div className="space-y-2 pt-3 border-t border-white/[0.07]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-white">Perangkat Output Audio (setSinkId)</p>
              <p className="text-xs text-white/50">
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
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] text-white/80 shrink-0"
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
            className="w-full h-10 px-3 rounded-xl bg-[#18181B] border border-white/[0.12] text-xs text-white disabled:opacity-45 disabled:cursor-not-allowed focus:outline-none focus:border-[#2EE6A6]"
          >
            <option value="">Default Sistem</option>
            {outputDevicesState.devices.map((dev, idx) => (
              <option key={dev.deviceId || idx} value={dev.deviceId}>
                {dev.label || `Perangkat Output ${idx + 1}`}
              </option>
            ))}
          </select>
        </div>

        {/* Mode Direct */}
        <div className="pt-3 border-t border-white/[0.07] space-y-1.5">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-medium text-white">Mode Direct (Bypass DSP)</p>
              <p className="text-xs text-white/50">
                Melewati EQ, normalisasi, limiter, crossfade, bass boost, dan stereo widener agar
                sinyal lossless tidak dimodifikasi
              </p>
            </div>
            <input
              type="checkbox"
              checked={localProfile.directMode}
              onChange={(e) => updateLocalProfile({ directMode: e.target.checked })}
              className="w-4 h-4 accent-[#2EE6A6]"
            />
          </label>
          <p className="text-[11px] text-amber-200/80 bg-amber-500/10 border border-amber-400/20 rounded-xl px-3 py-2">
            Catatan kejujuran: Mode Direct melewati seluruh pengolahan DSP internal browser, tetapi
            browser web tetap melalui mixer audio sistem operasi dan tidak menjamin keluaran
            bit-perfect eksklusif ke DAC eksternal.
          </p>
        </div>
      </section>

      {/* 7. DIAGNOSTIK AUDIO & TES NADA */}
      <section className="glass-card rounded-2xl p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#2EE6A6]" strokeWidth={2} />
              7. Diagnostik Audio &amp; Tes Nada
            </h2>
            <p className="text-xs text-white/50 mt-0.5">
              Status AudioContext, rantai node aktif, metadata stream aktual, dan generator tes nada
              melalui rantai efek yang sama
            </p>
          </div>
          {diagnostics.contextState === 'suspended' && (
            <button
              type="button"
              onClick={() => void resumeAudioContext()}
              className="px-3 py-1.5 rounded-xl bg-[#2EE6A6] text-[#06130E] text-xs font-semibold shrink-0 self-start sm:self-auto"
            >
              Aktifkan AudioContext
            </button>
          )}
        </div>

        {/* AudioContext & Engine Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
            <p className="text-white/50 text-[11px]">Status AudioContext</p>
            <p className="font-semibold text-white mt-0.5 uppercase">
              {diagnostics.contextState}
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
            <p className="text-white/50 text-[11px]">Sample Rate Context</p>
            <p className="font-semibold text-white mt-0.5 tabular-nums">
              {diagnostics.sampleRate ? `${diagnostics.sampleRate.toLocaleString('id-ID')} Hz` : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
            <p className="text-white/50 text-[11px]">Latensi Dasar / Output</p>
            <p className="font-semibold text-white mt-0.5 tabular-nums">
              {diagnostics.baseLatencyMs !== null ? `${diagnostics.baseLatencyMs} ms` : '—'} /{' '}
              {diagnostics.outputLatencyMs !== null ? `${diagnostics.outputLatencyMs} ms` : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
            <p className="text-white/50 text-[11px]">setSinkId Browser</p>
            <p className="font-semibold text-white mt-0.5">
              {diagnostics.sinkIdSupported ? `Didukung (${diagnostics.sinkIdMethod})` : 'Tidak didukung'}
            </p>
          </div>
        </div>

        {/* Live Active Node Chain */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-white/75 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-[#2EE6A6]" strokeWidth={1.9} />
            Rantai Node Web Audio Aktif
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {diagnostics.activeNodes.map((node, idx) => (
              <div
                key={node.id}
                className={`rounded-xl px-3 py-2 border text-[11px] ${
                  node.status === 'active'
                    ? 'bg-[#2EE6A6]/10 border-[#2EE6A6]/30 text-white'
                    : node.status === 'bypassed'
                      ? 'bg-white/[0.03] border-white/[0.08] text-white/55'
                      : 'bg-black/30 border-white/[0.05] text-white/35'
                }`}
              >
                <p className="font-semibold truncate">
                  {idx + 1}. {node.label}
                </p>
                <p className="mt-0.5 text-[10px]">
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
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-white flex items-center gap-1.5">
              <Headphones className="w-3.5 h-3.5 text-[#2EE6A6]" strokeWidth={1.9} />
              Perbandingan Kualitas Diminta vs Aktual Diputar
            </span>
            {activeStreamMeta && (
              <span className="text-[11px] text-[#2EE6A6] font-medium">
                {activeStreamMeta.badgeLabel}
              </span>
            )}
          </div>
          {activeStreamMeta ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-white/75">
              <div>
                <span className="text-white/45 block">Diminta (Profil)</span>
                <span className="font-medium text-white">
                  {STREAM_QUALITY_TIERS.find((t) => t.id === activeStreamMeta.requestedTier)
                    ?.label || activeStreamMeta.requestedTier}
                </span>
              </div>
              <div>
                <span className="text-white/45 block">Dipakai Aktual</span>
                <span className="font-medium text-white uppercase">
                  {activeStreamMeta.actualTier}
                  {activeStreamMeta.proxiedViaBackend ? ' (Proxy CORS)' : ''}
                </span>
              </div>
              <div>
                <span className="text-white/45 block">Codec &amp; Bitrate</span>
                <span className="font-medium text-white tabular-nums">
                  {activeStreamMeta.codec}
                  {activeStreamMeta.bitrateKbps ? ` · ${activeStreamMeta.bitrateKbps} kbps` : ''}
                </span>
              </div>
              <div>
                <span className="text-white/45 block">Sample Rate / Bit Depth</span>
                <span className="font-medium text-white tabular-nums">
                  {activeStreamMeta.sampleRateHz
                    ? `${(activeStreamMeta.sampleRateHz / 1000).toFixed(1)} kHz`
                    : '—'}
                  {activeStreamMeta.bitDepth ? ` / ${activeStreamMeta.bitDepth}-bit` : ''}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-white/45">
              Belum ada stream lagu aktif. Putar lagu atau jalankan Tes Nada untuk memeriksa
              metadata aktual.
            </p>
          )}
        </div>

        {/* Tes Nada Generator */}
        <div className="pt-3 border-t border-white/[0.07] space-y-2.5">
          <div>
            <p className="text-sm font-medium text-white flex items-center gap-1.5">
              <Waves className="w-4 h-4 text-[#2EE6A6]" strokeWidth={1.9} />
              Tes Nada (Uji Rantai Web Audio Tanpa Lagu)
            </p>
            <p className="text-xs text-white/50">
              Putar sweep 20 Hz–20 kHz atau pink noise stereo melalui Preamp, EQ, Bass Boost,
              Stereo Widener, Normalisasi/Limiter, Mono, Balance, dan Volume secara real-time.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleToggleTestTone('sweep')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                diagnostics.testToneMode === 'sweep'
                  ? 'bg-[#2EE6A6] text-[#06130E]'
                  : 'bg-white/[0.08] hover:bg-white/[0.14] text-white'
              }`}
            >
              {diagnostics.testToneMode === 'sweep'
                ? 'Hentikan Sweep (Aktif)'
                : 'Tes Nada: Sweep 20Hz–20kHz'}
            </button>
            <button
              type="button"
              onClick={() => void handleToggleTestTone('pink')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                diagnostics.testToneMode === 'pink'
                  ? 'bg-[#2EE6A6] text-[#06130E]'
                  : 'bg-white/[0.08] hover:bg-white/[0.14] text-white'
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
                className="px-3.5 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs font-semibold"
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
