import { useRef, useState } from 'react';
import {
  Check,
  Image as ImageIcon,
  Layers,
  Palette,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useContextMenuStore } from '../store/contextMenuStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { BackgroundMode } from '../types/music';
import { resolvePresetAssetUrl } from '../utils/backgroundAssets';
import {
  BACKGROUND_PRESETS,
  computeBackgroundPresentation,
  getBackgroundPreset,
  QUICK_GRADIENT_PAIRS,
  QUICK_SOLID_COLORS,
} from '../utils/backgroundTheme';
import { resizeImageFileToDataUrl } from '../utils/imageResize';

const MODE_OPTIONS: Array<{
  id: BackgroundMode;
  label: string;
  desc: string;
}> = [
  { id: 'default', label: 'Default', desc: 'Hitam gelap klasik' },
  { id: 'preset', label: 'Galeri Preset', desc: 'Wallpaper & gradasi kurasi' },
  { id: 'ambient', label: 'Sampul Lagu', desc: 'Mengikuti lagu diputar' },
  { id: 'gradient', label: 'Gradasi', desc: 'Dua warna & sudut bebas' },
  { id: 'color', label: 'Warna Solid', desc: 'Warna datar pilihanmu' },
  { id: 'image', label: 'Unggah Foto', desc: 'Gambar kustom dari perangkat' },
];

const ANGLE_OPTIONS = [45, 90, 135, 180, 225];

export function BackgroundSettingsSection() {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const customBackground = useSettingsStore((s) => s.customBackground);
  const updateCustomBackground = useSettingsStore((s) => s.updateCustomBackground);
  const setCustomBackgroundImage = useSettingsStore((s) => s.setCustomBackgroundImage);
  const resetCustomBackground = useSettingsStore((s) => s.resetCustomBackground);

  const currentTrackThumb = usePlayerStore((s) => s.currentTrack?.thumbnail ?? null);
  const ambientColor = usePlayerStore((s) => s.ambientColor);
  const showToast = useContextMenuStore((s) => s.showToast);

  const activePreset = getBackgroundPreset(customBackground.presetId);
  const resolvedPresetImageUrl =
    customBackground.mode === 'preset' && activePreset.kind === 'image'
      ? resolvePresetAssetUrl(activePreset.assetKey)
      : null;

  const previewPresentation = computeBackgroundPresentation(customBackground, {
    currentTrackThumbnail: currentTrackThumb,
    ambientColor,
    resolvedPresetImageUrl,
  });

  const handleImageFile = async (file: File) => {
    setUploading(true);
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 1920, 0.86);
      await setCustomBackgroundImage(dataUrl, file.name);
      showToast('Foto latar belakang berhasil diterapkan');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Gagal memuat gambar latar belakang';
      showToast(message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveUploadedImage = async () => {
    await setCustomBackgroundImage(null, null);
    showToast('Foto latar belakang dihapus');
  };

  const handleReset = async () => {
    await resetCustomBackground();
    showToast('Latar belakang dikembalikan ke default');
  };

  return (
    <div className="space-y-6">
      {/* Live Preview Card */}
      <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#E8FFF3] flex items-center gap-2">
              <Palette className="w-4 h-4 text-[#19EE8A]" strokeWidth={2} />
              Custom Background &amp; Tampilan
            </h2>
            <p className="text-xs text-[#B3F7D1]/65 mt-1 leading-relaxed max-w-[65ch]">
              Ubah latar belakang aplikasi dengan galeri wallpaper, gradasi, warna solid, sampul lagu, atau fotomu sendiri.
            </p>
          </div>
          {customBackground.mode !== 'default' && (
            <button
              type="button"
              onClick={() => void handleReset()}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] backdrop-blur-md border border-white/[0.12] text-xs font-medium text-[#E8FFF3] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.85} />
              Reset Default
            </button>
          )}
        </div>

        {/* Miniature Interactive Workspace Preview */}
        <div
          aria-label="Pratinjau latar belakang"
          className="relative h-44 sm:h-48 w-full rounded-xl overflow-hidden border border-[#B3F7D1]/[0.14] bg-black"
        >
          <div
            className="absolute inset-0 transition-all duration-300"
            style={{ background: previewPresentation.backgroundCss }}
          />
          {previewPresentation.imageUrl && (
            <img
              src={previewPresentation.imageUrl}
              alt="Pratinjau latar belakang"
              className="absolute inset-0 h-full w-full object-cover transition-all duration-300"
              style={{
                filter:
                  previewPresentation.blurPx > 0
                    ? `blur(${Math.round(previewPresentation.blurPx * 0.55)}px)`
                    : undefined,
                transform: previewPresentation.blurPx > 0 ? 'scale(1.08)' : 'scale(1)',
              }}
            />
          )}
          <div
            className="absolute inset-0 transition-opacity duration-300"
            style={{
              backgroundColor: `rgba(8, 18, 13, ${previewPresentation.scrimOpacity})`,
            }}
          />

          {/* Mini SoundClear Mock Frame */}
          <div className="relative z-10 h-full p-2.5 flex flex-col gap-2">
            <div className="flex-1 min-h-0 flex gap-2">
              <div
                className={`w-20 sm:w-28 rounded-lg p-2 flex flex-col gap-1.5 border border-white/[0.1] ${
                  previewPresentation.useGlassPanels
                    ? 'bg-black/35'
                    : previewPresentation.isActive
                      ? 'bg-black/65'
                      : 'bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <img
                    src="/soundclear-logo.png"
                    alt="SoundClear"
                    className="w-3.5 h-3.5 rounded object-contain shrink-0"
                  />
                  <span className="text-[10px] font-bold text-[#E8FFF3] truncate">Koleksi</span>
                </div>
                <div className="h-2 w-4/5 rounded bg-[#B3F7D1]/20" />
                <div className="h-2 w-3/5 rounded bg-[#B3F7D1]/12" />
                <div className="h-2 w-3/4 rounded bg-[#B3F7D1]/12" />
              </div>

              <div
                className={`flex-1 rounded-lg p-3 flex flex-col justify-between border border-white/[0.1] ${
                  previewPresentation.useGlassPanels
                    ? 'bg-black/30'
                    : previewPresentation.isActive
                      ? 'bg-black/60'
                      : 'bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-[#E8FFF3]">Pratinjau Tampilan</p>
                    <p className="text-[10px] text-[#B3F7D1]/65">
                      Mode: {MODE_OPTIONS.find((m) => m.id === customBackground.mode)?.label}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-sc-gradient text-[#0F1F17] text-[10px] font-bold">
                    Aktif
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-11 rounded-md bg-white/[0.07] border border-white/[0.1]" />
                  <div className="h-11 rounded-md bg-white/[0.07] border border-white/[0.1]" />
                  <div className="h-11 rounded-md bg-white/[0.07] border border-white/[0.1]" />
                </div>
              </div>
            </div>

            <div
              className={`h-7 rounded-lg px-2.5 flex items-center justify-between border border-white/[0.1] ${
                previewPresentation.useGlassPanels
                  ? 'bg-black/55 backdrop-blur-md'
                  : previewPresentation.isActive
                    ? 'bg-black/80'
                    : 'bg-black'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 rounded bg-[#19EE8A]/35" />
                <div className="h-1.5 w-16 rounded bg-[#B3F7D1]/25" />
              </div>
              <div className="h-1 w-24 rounded-full bg-sc-gradient" />
              <div className="h-1.5 w-8 rounded bg-[#B3F7D1]/20" />
            </div>
          </div>
        </div>

        {/* Mode Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Pilih sumber latar belakang">
          {MODE_OPTIONS.map((opt) => {
            const active = customBackground.mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => updateCustomBackground({ mode: opt.id })}
                className={`text-left min-h-[48px] px-4 py-2 rounded-xl border transition-all backdrop-blur-md ${
                  active
                    ? 'bg-[#19EE8A]/15 border-[#19EE8A] text-[#E8FFF3]'
                    : 'bg-white/[0.05] border-white/[0.1] text-[#E8FFF3]/80 hover:bg-white/[0.1]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{opt.label}</span>
                  {active && <Check className="w-3.5 h-3.5 text-[#19EE8A] shrink-0" strokeWidth={2.5} />}
                </div>
                <p className="text-[11px] text-[#B3F7D1]/60 mt-1 truncate">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Mode-Specific Controls */}
      {customBackground.mode === 'preset' && (
        <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-4">
          <h3 className="text-sm font-bold text-[#E8FFF3] flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#19EE8A]" strokeWidth={2} />
            Galeri Wallpaper &amp; Gradasi
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {BACKGROUND_PRESETS.map((preset) => {
              const selected = customBackground.presetId === preset.id;
              const assetUrl =
                preset.kind === 'image' ? resolvePresetAssetUrl(preset.assetKey) : null;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    updateCustomBackground({ mode: 'preset', presetId: preset.id })
                  }
                  aria-pressed={selected}
                  className={`group relative rounded-xl overflow-hidden border text-left transition-all ${
                    selected
                      ? 'border-[#19EE8A] ring-2 ring-[#19EE8A]/40'
                      : 'border-[#B3F7D1]/[0.12] hover:border-[#B3F7D1]/35'
                  }`}
                >
                  <div
                    className="h-24 w-full relative"
                    style={{ background: preset.previewGradient }}
                  >
                    {assetUrl && (
                      <img
                        src={assetUrl}
                        alt={preset.name}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                    {selected && (
                      <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-sc-gradient text-[#0F1F17] flex items-center justify-center">
                        <Check className="w-3.5 h-3.5" strokeWidth={2.6} />
                      </span>
                    )}
                    <div className="absolute bottom-2 left-2.5 right-2.5">
                      <p className="text-xs font-bold text-[#E8FFF3] truncate">{preset.name}</p>
                      <p className="text-[10px] text-[#B3F7D1]/75 truncate">{preset.subtitle}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {customBackground.mode === 'ambient' && (
        <section className="glass-card rounded-2xl p-4 sm:p-6 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#19EE8A]/15 text-[#19EE8A] flex items-center justify-center shrink-0">
            <Palette className="w-4.5 h-4.5" strokeWidth={2} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#E8FFF3]">Latar Sampul Lagu Aktif</h3>
            <p className="text-xs text-[#B3F7D1]/65 mt-1 leading-relaxed max-w-[65ch]">
              Latar belakang secara otomatis menampilkan sampul dan warna dominan lagu yang sedang kamu putar secara jernih tanpa blur bawaan.
            </p>
          </div>
        </section>
      )}

      {customBackground.mode === 'color' && (
        <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[#E8FFF3]">Pilih Warna Solid</h3>
              <p className="text-xs text-[#B3F7D1]/65 mt-1 leading-relaxed max-w-[65ch]">
                Gunakan warna gelap agar teks dan tombol tetap nyaman dibaca.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.06] backdrop-blur-md border border-white/[0.13] cursor-pointer">
              <input
                type="color"
                aria-label="Pemilih warna solid"
                value={customBackground.solidColor}
                onChange={(e) =>
                  updateCustomBackground({ mode: 'color', solidColor: e.target.value })
                }
                className="w-7 h-7 rounded border-0 bg-transparent cursor-pointer"
              />
              <span className="text-xs font-mono-num text-[#E8FFF3]">
                {customBackground.solidColor}
              </span>
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {QUICK_SOLID_COLORS.map((swatch) => {
              const selected =
                customBackground.solidColor.toUpperCase() === swatch.value.toUpperCase();
              return (
                <button
                  key={swatch.value}
                  type="button"
                  onClick={() =>
                    updateCustomBackground({ mode: 'color', solidColor: swatch.value })
                  }
                  className={`flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border text-left transition-colors backdrop-blur-md ${
                    selected
                      ? 'border-[#19EE8A] bg-[#19EE8A]/12'
                      : 'border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1]'
                  }`}
                >
                  <span
                    className="w-5 h-5 rounded-md border border-[#B3F7D1]/25 shrink-0"
                    style={{ backgroundColor: swatch.value }}
                  />
                  <span className="text-xs font-medium text-[#E8FFF3] truncate">{swatch.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {customBackground.mode === 'gradient' && (
        <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-4">
          <h3 className="text-sm font-bold text-[#E8FFF3]">Kustomisasi Gradasi</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex items-center justify-between gap-4 min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.055] backdrop-blur-md border border-white/[0.12] cursor-pointer">
              <span className="text-xs font-medium text-[#E8FFF3]/90">Warna Awal</span>
              <span className="inline-flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Warna awal gradasi"
                  value={customBackground.gradientFrom}
                  onChange={(e) =>
                    updateCustomBackground({ mode: 'gradient', gradientFrom: e.target.value })
                  }
                  className="w-7 h-7 rounded bg-transparent border-0 cursor-pointer"
                />
                <span className="text-xs font-mono-num text-[#B3F7D1]/85">
                  {customBackground.gradientFrom}
                </span>
              </span>
            </label>

            <label className="flex items-center justify-between gap-4 min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.055] backdrop-blur-md border border-white/[0.12] cursor-pointer">
              <span className="text-xs font-medium text-[#E8FFF3]/90">Warna Akhir</span>
              <span className="inline-flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Warna akhir gradasi"
                  value={customBackground.gradientTo}
                  onChange={(e) =>
                    updateCustomBackground({ mode: 'gradient', gradientTo: e.target.value })
                  }
                  className="w-7 h-7 rounded bg-transparent border-0 cursor-pointer"
                />
                <span className="text-xs font-mono-num text-[#B3F7D1]/85">
                  {customBackground.gradientTo}
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-[#B3F7D1]/70">Sudut Gradasi</span>
            <div className="flex flex-wrap items-center gap-2">
              {ANGLE_OPTIONS.map((deg) => (
                <button
                  key={deg}
                  type="button"
                  onClick={() =>
                    updateCustomBackground({ mode: 'gradient', gradientAngle: deg })
                  }
                  className={`min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg text-xs font-mono-num transition-colors border ${
                    customBackground.gradientAngle === deg
                      ? 'bg-sc-gradient border-transparent text-[#0F1F17] font-semibold'
                      : 'bg-white/[0.055] border-white/[0.1] text-[#B3F7D1]/80 hover:text-[#E8FFF3] hover:bg-white/[0.11]'
                  }`}
                >
                  {deg}°
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            {QUICK_GRADIENT_PAIRS.map((pair) => (
              <button
                key={pair.label}
                type="button"
                onClick={() =>
                  updateCustomBackground({
                    mode: 'gradient',
                    gradientFrom: pair.from,
                    gradientTo: pair.to,
                    gradientAngle: pair.angle,
                  })
                }
                className="rounded-xl overflow-hidden border border-[#B3F7D1]/[0.12] hover:border-[#19EE8A]/60 transition-colors text-left"
              >
                <div
                  className="h-10 w-full"
                  style={{
                    background: `linear-gradient(${pair.angle}deg, ${pair.from}, ${pair.to})`,
                  }}
                />
                <div className="px-2.5 py-1.5 bg-white/[0.06] backdrop-blur-md text-[11px] font-medium text-[#E8FFF3] truncate">
                  {pair.label}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {customBackground.mode === 'image' && (
        <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[#E8FFF3] flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#19EE8A]" strokeWidth={2} />
                Foto Latar Belakang Sendiri
              </h3>
              <p className="text-xs text-[#B3F7D1]/65 mt-1 leading-relaxed max-w-[65ch]">
                Unggah gambar JPG, PNG, WebP, atau AVIF. Gambar otomatis dioptimalkan dan tersimpan lokal di browser.
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            aria-label="Unggah gambar latar belakang"
            accept="image/png,image/jpeg,image/webp,image/avif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleImageFile(file);
              }
              e.target.value = '';
            }}
          />

          {customBackground.customImageDataUrl ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11]">
              <div className="flex items-center gap-4 min-w-0">
                <img
                  src={customBackground.customImageDataUrl}
                  alt={customBackground.customImageName || 'Foto latar kustom'}
                  className="w-16 h-11 rounded-lg object-cover border border-[#B3F7D1]/20 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#E8FFF3] truncate">
                    {customBackground.customImageName || 'Gambar kustom aktif'}
                  </p>
                  <p className="text-[11px] text-[#19EE8A] mt-1">
                    Tersimpan di browser (IndexedDB)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-sc-gradient text-[#0F1F17] text-xs font-semibold hover:brightness-105 disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" strokeWidth={2} />
                  {uploading ? 'Memproses...' : 'Ganti Foto'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRemoveUploadedImage()}
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.07] hover:bg-red-500/20 border border-white/[0.1] text-xs font-medium text-[#E8FFF3]/85 hover:text-red-200 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.85} />
                  Hapus
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-8 px-4 rounded-xl border border-dashed border-white/[0.2] hover:border-[#19EE8A] bg-white/[0.04] hover:bg-[#19EE8A]/[0.08] backdrop-blur-md flex flex-col items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <Upload className="w-6 h-6 text-[#19EE8A]" strokeWidth={1.85} />
              <span className="text-xs font-semibold text-[#E8FFF3]">
                {uploading ? 'Mengoptimalkan foto...' : 'Pilih Foto dari Perangkat'}
              </span>
              <span className="text-[11px] text-[#B3F7D1]/60">
                Disarankan rasio lanskap 16:9 (maksimal 20 MB)
              </span>
            </button>
          )}
        </section>
      )}

      {/* Fine Tuning Controls */}
      {customBackground.mode !== 'default' && (
        <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-4">
          <h3 className="text-sm font-bold text-[#E8FFF3]">Penyesuaian Kontras &amp; Kaca</h3>

          {(customBackground.mode === 'preset' && activePreset.kind === 'image') ||
          customBackground.mode === 'ambient' ||
          customBackground.mode === 'image' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="bg-blur-slider" className="font-medium text-[#E8FFF3]/90">
                  Blur Latar Belakang
                </label>
                <span className="font-mono-num text-[#19EE8A]">
                  {customBackground.blurPx === 0 ? '0 px (Jernih / Tanpa Blur)' : `${customBackground.blurPx} px`}
                </span>
              </div>
              <input
                id="bg-blur-slider"
                type="range"
                min={0}
                max={40}
                step={1}
                value={customBackground.blurPx}
                onChange={(e) =>
                  updateCustomBackground({ blurPx: Number(e.target.value) })
                }
                className="sc-range-visible w-full min-h-[44px]"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="bg-dim-slider" className="font-medium text-[#E8FFF3]/90">
                Kegelapan Lapisan (Agar Teks Jelas)
              </label>
              <span className="font-mono-num text-[#19EE8A]">{customBackground.dimOpacity}%</span>
            </div>
            <input
              id="bg-dim-slider"
              type="range"
              min={25}
              max={90}
              step={1}
              value={customBackground.dimOpacity}
              onChange={(e) =>
                updateCustomBackground({ dimOpacity: Number(e.target.value) })
              }
              className="sc-range-visible w-full min-h-[44px]"
            />
          </div>

          <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#B3F7D1]/[0.1]">
            <div className="min-w-0">
              <p id="lbl-panel-glass" className="text-sm font-medium text-[#E8FFF3]">
                Efek Kaca Transparan Panel
              </p>
              <p className="text-xs text-[#B3F7D1]/65 mt-1 leading-relaxed max-w-[65ch]">
                Tampilkan latar menembus Sidebar, Beranda, Panel Kanan, dan Pemutar
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={customBackground.panelGlass}
              aria-labelledby="lbl-panel-glass"
              onClick={() =>
                updateCustomBackground({ panelGlass: !customBackground.panelGlass })
              }
              className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-[#19EE8A]"
            >
              <span
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  customBackground.panelGlass ? 'bg-sc-gradient' : 'bg-white/[0.12] hover:bg-white/[0.18]'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                    customBackground.panelGlass
                      ? 'translate-x-6 bg-[#E8FFF3]'
                      : 'translate-x-1 bg-[#B3F7D1]/70'
                  }`}
                />
              </span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
