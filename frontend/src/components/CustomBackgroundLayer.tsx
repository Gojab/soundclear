import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { resolvePresetAssetUrl } from '../utils/backgroundAssets';
import { computeBackgroundPresentation, getBackgroundPreset } from '../utils/backgroundTheme';

export function CustomBackgroundLayer() {
  const customBackground = useSettingsStore((s) => s.customBackground);
  const currentTrackThumb = usePlayerStore((s) => s.currentTrack?.thumbnail ?? null);
  const ambientColor = usePlayerStore((s) => s.ambientColor);

  const preset = getBackgroundPreset(customBackground.presetId);
  const resolvedPresetImageUrl =
    customBackground.mode === 'preset' && preset.kind === 'image'
      ? resolvePresetAssetUrl(preset.assetKey)
      : null;

  const presentation = computeBackgroundPresentation(customBackground, {
    currentTrackThumbnail: currentTrackThumb,
    ambientColor,
    resolvedPresetImageUrl,
  });

  if (!presentation.isActive) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      data-testid="custom-background-layer"
      data-bg-mode={customBackground.mode}
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black"
    >
      {/* Gradient / Solid / Ambient Base */}
      <div
        className="absolute inset-0 transition-all duration-500"
        style={{ background: presentation.backgroundCss }}
      />

      {/* Optional Wallpaper / Uploaded Photo / Track Cover */}
      {presentation.imageUrl && (
        <img
          src={presentation.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-all duration-500"
          style={{
            filter: presentation.blurPx > 0 ? `blur(${presentation.blurPx}px)` : undefined,
            transform: presentation.blurPx > 0 ? 'scale(1.08)' : 'scale(1)',
          }}
        />
      )}

      {/* Contrast Scrim + Subtle Vignette for WCAG AA Legibility */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          backgroundColor: `rgba(5, 6, 9, ${presentation.scrimOpacity})`,
          backgroundImage:
            'radial-gradient(circle at 50% 35%, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.48) 100%)',
        }}
      />
    </div>
  );
}
