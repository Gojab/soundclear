import { useId } from 'react';
import { AudioWaveform, Disc3, SlidersHorizontal, Sparkles } from 'lucide-react';
import type {
  DjTransitionStyle,
  DjVolumeCurve,
  PlaylistMixSettings,
  TrackBpmAnalysis,
} from '../types/music';
import {
  DJ_TRANSITION_STYLES,
  DJ_VOLUME_CURVES,
  MAX_DJ_TRANSITION_SECONDS,
  MIN_DJ_TRANSITION_SECONDS,
} from '../utils/djMixLogic';

interface PlaylistMixPanelProps {
  settings: PlaylistMixSettings;
  onChange: (patch: Partial<PlaylistMixSettings>) => void;
  onStartMixPlayback?: () => void;
  canStartMix?: boolean;
  directModeActive?: boolean;
  compact?: boolean;
}

export function formatBpmChip(analysis?: TrackBpmAnalysis | null): string | null {
  if (!analysis || !Number.isFinite(analysis.bpm)) return null;
  return analysis.source === 'decoded'
    ? `${Math.round(analysis.bpm)} BPM`
    : `~${Math.round(analysis.bpm)} BPM`;
}

export function getTransitionStyleLabel(style: DjTransitionStyle): string {
  return DJ_TRANSITION_STYLES.find((s) => s.id === style)?.label ?? 'Tukar Bass';
}

export function PlaylistMixPanel({
  settings,
  onChange,
  onStartMixPlayback,
  canStartMix = true,
  directModeActive = false,
  compact = false,
}: PlaylistMixPanelProps) {
  const beatMatchId = useId();
  const eqBlendId = useId();

  const durationPct =
    ((settings.durationSeconds - MIN_DJ_TRANSITION_SECONDS) /
      (MAX_DJ_TRANSITION_SECONDS - MIN_DJ_TRANSITION_SECONDS)) *
    100;

  return (
    <section
      aria-label="Pengaturan Mix DJ"
      className={`rounded-2xl bg-white/[0.045] backdrop-blur-xl border border-[#19EE8A]/25 ${
        compact ? 'p-4 space-y-4' : 'p-4 sm:p-6 space-y-4'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-[#19EE8A]/15 text-[#19EE8A] flex items-center justify-center shrink-0">
            <Disc3 className="w-4 h-4" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#E8FFF3] truncate">
              Mode Mix DJ
            </p>
            <p className="text-[11px] text-[#B3F7D1]/65 truncate">
              {getTransitionStyleLabel(settings.transitionStyle)} ·{' '}
              <span className="tabular-nums">{settings.durationSeconds} dtk</span>
              {settings.beatMatch ? ' · Beat Match' : ''}
            </p>
          </div>
        </div>

        {onStartMixPlayback && canStartMix && (
          <button
            type="button"
            onClick={onStartMixPlayback}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-full bg-sc-gradient text-[#0F1F17] text-[11px] font-bold hover:brightness-105 transition-all shrink-0"
          >
            <AudioWaveform className="w-3.5 h-3.5" strokeWidth={2} />
            Putar dengan Mix
          </button>
        )}
      </div>

      {directModeActive && (
        <p className="text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-400/20 rounded-xl px-4 py-2 leading-relaxed max-w-[65ch]">
          Mode Direct sedang aktif — transisi DJ dan EQ dilewati hingga Mode Direct dimatikan.
        </p>
      )}

      {/* Duration slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#B3F7D1]/75 font-medium">Durasi transisi</span>
          <span className="text-[#19EE8A] font-semibold font-mono-num tabular-nums">
            {settings.durationSeconds} detik
          </span>
        </div>
        <input
          type="range"
          aria-label="Durasi transisi Mix DJ"
          min={MIN_DJ_TRANSITION_SECONDS}
          max={MAX_DJ_TRANSITION_SECONDS}
          step={1}
          value={settings.durationSeconds}
          onChange={(e) => onChange({ durationSeconds: Number(e.target.value) })}
          style={{
            background: `linear-gradient(to right, #19EE8A ${durationPct}%, rgba(179,247,209,0.18) ${durationPct}%)`,
          }}
          className="sc-range-visible w-full min-h-[44px]"
        />
        <div className="flex items-center justify-between text-[10px] text-[#B3F7D1]/45 tabular-nums">
          <span>1 dtk</span>
          <span>6 dtk</span>
          <span>12 dtk</span>
        </div>
      </div>

      {/* Transition styles */}
      <div className="space-y-2">
        <p className="text-[11px] font-medium text-[#B3F7D1]/75 flex items-center gap-2">
          <SlidersHorizontal className="w-3 h-3 text-[#19EE8A]" strokeWidth={1.9} />
          Gaya transisi
        </p>
        <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
          {DJ_TRANSITION_STYLES.map((st) => {
            const active = settings.transitionStyle === st.id;
            return (
              <button
                key={st.id}
                type="button"
                aria-pressed={active}
                title={st.description}
                onClick={() => onChange({ transitionStyle: st.id })}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-[11px] font-semibold text-left transition-colors border ${
                  active
                    ? 'bg-[#19EE8A]/15 text-[#19EE8A] border-[#19EE8A]/40'
                    : 'bg-white/[0.045] text-[#B3F7D1]/75 hover:text-[#E8FFF3] hover:bg-white/[0.08] border-white/[0.08]'
                }`}
              >
                <span className="block truncate">{st.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* EQ Blend, Beat Match, & Volume Curve */}
      <div className={`grid gap-2 pt-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'}`}>
        <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2">
          <div className="min-w-0">
            <p id={beatMatchId} className="text-xs font-medium text-[#E8FFF3] truncate">
              Beat Matching
            </p>
            <p className="text-[10px] text-[#B3F7D1]/55 truncate">
              Selaraskan tempo &amp; ketukan
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.beatMatch}
            aria-labelledby={beatMatchId}
            onClick={() => onChange({ beatMatch: !settings.beatMatch })}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center shrink-0 rounded-full"
          >
            <span
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                settings.beatMatch ? 'bg-sc-gradient' : 'bg-white/[0.14]'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                  settings.beatMatch ? 'translate-x-5 bg-[#E8FFF3]' : 'translate-x-0.5 bg-[#B3F7D1]/75'
                }`}
              />
            </span>
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2">
          <div className="min-w-0">
            <p id={eqBlendId} className="text-xs font-medium text-[#E8FFF3] truncate">
              Blend EQ
            </p>
            <p className="text-[10px] text-[#B3F7D1]/55 truncate">
              Atur bass &amp; mid saat overlap
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.eqBlend}
            aria-labelledby={eqBlendId}
            onClick={() => onChange({ eqBlend: !settings.eqBlend })}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center shrink-0 rounded-full"
          >
            <span
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                settings.eqBlend ? 'bg-sc-gradient' : 'bg-white/[0.14]'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                  settings.eqBlend ? 'translate-x-5 bg-[#E8FFF3]' : 'translate-x-0.5 bg-[#B3F7D1]/75'
                }`}
              />
            </span>
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-2">
          <label
            htmlFor="dj-volume-curve"
            className="text-xs font-medium text-[#E8FFF3] shrink-0 flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3 text-[#19EE8A]" strokeWidth={1.9} />
            Kurva
          </label>
          <select
            id="dj-volume-curve"
            value={settings.volumeCurve}
            onChange={(e) => onChange({ volumeCurve: e.target.value as DjVolumeCurve })}
            className="min-h-[44px] bg-black/40 border border-white/[0.12] rounded-lg px-2 py-1 text-[11px] font-medium text-[#E8FFF3] focus:outline-none focus:border-[#19EE8A]"
          >
            {DJ_VOLUME_CURVES.map((c) => (
              <option key={c.id} value={c.id} className="bg-[#0B0F0D] text-[#E8FFF3]">
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
