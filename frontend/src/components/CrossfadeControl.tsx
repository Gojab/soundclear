import { useId } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { MAX_CROSSFADE_SECONDS } from '../utils/audioMath';

interface CrossfadeControlProps {
  variant?: 'general' | 'audio-tab';
}

export function CrossfadeControl({ variant = 'general' }: CrossfadeControlProps) {
  const labelId = useId();
  const localProfile = useSettingsStore((s) => s.localProfile);
  const toggleCrossfade = useSettingsStore((s) => s.toggleCrossfade);
  const setCrossfadeDuration = useSettingsStore((s) => s.setCrossfadeDuration);

  const isEnabled =
    localProfile.crossfadeEnabled !== undefined
      ? localProfile.crossfadeEnabled
      : localProfile.crossfadeSeconds > 0;
  const sliderValue = isEnabled ? localProfile.crossfadeSeconds : 0;
  const pct = (sliderValue / MAX_CROSSFADE_SECONDS) * 100;
  const isDirectBypassed = Boolean(localProfile.directMode);

  return (
    <div className={variant === 'general' ? 'py-4 space-y-4' : 'space-y-4'}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p id={labelId} className="text-sm font-medium text-[#E8FFF3]">
            {variant === 'general' ? 'Crossfade antar lagu' : 'Crossfade Equal-Power'}
          </p>
          <p className="text-xs text-[#B3F7D1]/65 mt-1 leading-relaxed max-w-[65ch]">
            {variant === 'general'
              ? 'Transisi volume bertahap antar lagu (0–12 detik) agar pergantian lagu terdengar mulus'
              : 'Dua deck audio bergantian dengan kurva equal-power (0–12 detik). Dinonaktifkan otomatis saat Mode Direct aktif.'}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          aria-labelledby={labelId}
          onClick={() => toggleCrossfade()}
          className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-[#19EE8A]"
        >
          <span
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isEnabled ? 'bg-sc-gradient' : 'bg-white/[0.12] hover:bg-white/[0.18]'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                isEnabled ? 'translate-x-6 bg-[#E8FFF3]' : 'translate-x-1 bg-[#B3F7D1]/70'
              }`}
            />
          </span>
        </button>
      </div>

      <div className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] px-4 py-4 space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-[#B3F7D1]/75 font-medium">Durasi transisi</span>
          <span
            className={`font-semibold tabular-nums ${
              isEnabled && !isDirectBypassed ? 'text-[#19EE8A]' : 'text-[#B3F7D1]/50'
            }`}
          >
            {isEnabled ? `${sliderValue} detik` : 'Mati'}
            {isEnabled && isDirectBypassed ? ' (Bypass Mode Direct)' : ''}
          </span>
        </div>

        <input
          type="range"
          aria-label={
            variant === 'general'
              ? 'Durasi crossfade antar lagu 0 sampai 12 detik'
              : 'Durasi crossfade 0 sampai 12 detik'
          }
          min={0}
          max={MAX_CROSSFADE_SECONDS}
          step={1}
          value={sliderValue}
          onChange={(e) => setCrossfadeDuration(Number(e.target.value))}
          style={{
            background: `linear-gradient(to right, ${isEnabled ? '#19EE8A' : 'rgba(179,247,209,0.35)'} ${pct}%, rgba(179,247,209,0.16) ${pct}%)`,
          }}
          className="sc-range-visible w-full min-h-[44px]"
        />

        <div className="flex items-center justify-between text-[11px] text-[#B3F7D1]/45 tabular-nums">
          <span>Mati (0 dtk)</span>
          <span>6 dtk</span>
          <span>12 dtk</span>
        </div>
      </div>
    </div>
  );
}
