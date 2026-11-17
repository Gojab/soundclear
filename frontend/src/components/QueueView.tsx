import { useMemo, useState } from 'react';
import { AudioWaveform, Disc3, GripVertical, Play, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { MediaItem, PlaylistMixSettings } from '../types/music';
import {
  computeBeatMatchPlan,
  estimateFallbackBpm,
  normalizePlaylistMixSettings,
} from '../utils/djMixLogic';
import { formatArtists, getPlayableVideoId, getTrackUniqueId, isLocalTrack } from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';
import {
  formatBpmChip,
  getTransitionStyleLabel,
  PlaylistMixPanel,
} from './PlaylistMixPanel';

function QueueTrackItem({
  track,
  idx,
  section,
  onPlay,
  onRemove,
  onDragStart,
  onDrop,
}: {
  track: MediaItem;
  idx: number;
  section: 'manual' | 'source';
  onPlay: () => void;
  onRemove: () => void;
  onDragStart: (section: 'manual' | 'source', idx: number) => void;
  onDrop: (section: 'manual' | 'source', idx: number) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(section, idx);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(section, idx);
      }}
      className="track-row group flex items-center gap-2 p-2 rounded-xl"
    >
      <span
        className="text-[#B3F7D1]/30 group-hover:text-[#B3F7D1]/65 cursor-grab active:cursor-grabbing shrink-0"
        aria-hidden="true"
      >
        <GripVertical className="w-3.5 h-3.5" strokeWidth={1.75} />
      </span>

      <button
        type="button"
        onClick={onPlay}
        aria-label={`Putar ${track.title}`}
        className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0"
      >
        <ArtworkImage
          src={track.thumbnail}
          alt={track.title}
          type={track.type}
          className="w-full h-full"
          roundedClass="rounded-lg"
        />
        <span className="absolute inset-0 bg-black/55 backdrop-blur-xs opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <Play className="w-3.5 h-3.5 text-[#19EE8A] fill-[#19EE8A]" strokeWidth={1.75} />
        </span>
      </button>

      <button type="button" onClick={onPlay} className="min-w-0 flex-1 text-left min-h-[44px] flex flex-col justify-center">
        <p className="text-xs font-medium text-[#E8FFF3] truncate">{track.title}</p>
        <p className="text-[11px] text-[#B3F7D1]/60 truncate">{formatArtists(track.artists)}</p>
      </button>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Hapus ${track.title} dari antrean`}
        className="w-11 h-11 rounded-lg flex items-center justify-center text-[#B3F7D1]/45 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 hover:text-[#E8FFF3] hover:bg-white/[0.1] transition-all shrink-0"
      >
        <X className="w-4 h-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}

function getBpmMapKey(track: MediaItem | null | undefined): string {
  if (!track) return '';
  if (isLocalTrack(track)) return getTrackUniqueId(track) || track.id;
  return getPlayableVideoId(track) || getTrackUniqueId(track) || track.id;
}

export function QueueView() {
  const [dragState, setDragState] = useState<{ section: 'manual' | 'source'; index: number } | null>(
    null,
  );
  const [mixSettingsOpen, setMixSettingsOpen] = useState(false);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const manualQueue = usePlayerStore((s) => s.manualQueue);
  const sourceQueue = usePlayerStore((s) => s.sourceQueue);
  const sourceLabel = usePlayerStore((s) => s.sourceLabel);
  const activeMixConfig = usePlayerStore((s) => s.activeMixConfig);
  const djTransitionStatus = usePlayerStore((s) => s.djTransitionStatus);
  const trackBpmMap = usePlayerStore((s) => s.trackBpmMap);
  const activeStreamSourceMode = usePlayerStore((s) => s.activeStreamMeta?.sourceMode ?? null);

  const localProfile = useSettingsStore((s) => s.localProfile);
  const updateDjMix = useSettingsStore((s) => s.updateDjMix);

  const setActiveMixConfig = usePlayerStore((s) => s.setActiveMixConfig);
  const triggerDjTransitionNow = usePlayerStore((s) => s.triggerDjTransitionNow);
  const playFromManualQueue = usePlayerStore((s) => s.playFromManualQueue);
  const playFromSourceQueue = usePlayerStore((s) => s.playFromSourceQueue);
  const removeFromManualQueue = usePlayerStore((s) => s.removeFromManualQueue);
  const removeFromSourceQueue = usePlayerStore((s) => s.removeFromSourceQueue);
  const reorderManualQueue = usePlayerStore((s) => s.reorderManualQueue);
  const reorderSourceQueue = usePlayerStore((s) => s.reorderSourceQueue);
  const clearManualQueue = usePlayerStore((s) => s.clearManualQueue);
  const clearSourceQueue = usePlayerStore((s) => s.clearSourceQueue);

  const effectiveDj = useMemo(
    () =>
      activeMixConfig
        ? normalizePlaylistMixSettings(activeMixConfig)
        : normalizePlaylistMixSettings(localProfile.djMix),
    [activeMixConfig, localProfile.djMix],
  );

  const upcomingTrack = manualQueue[0] ?? sourceQueue[0] ?? null;
  const curKey = getBpmMapKey(currentTrack);
  const nextKey = getBpmMapKey(upcomingTrack);

  const curBpmInfo =
    (curKey ? trackBpmMap[curKey] : undefined) ??
    (currentTrack ? estimateFallbackBpm(currentTrack) : null);
  const nextBpmInfo =
    (nextKey ? trackBpmMap[nextKey] : undefined) ??
    (upcomingTrack ? estimateFallbackBpm(upcomingTrack) : null);

  const beatPlan = useMemo(
    () =>
      computeBeatMatchPlan(
        curBpmInfo?.bpm ?? 120,
        nextBpmInfo?.bpm ?? 120,
        effectiveDj.beatMatch,
      ),
    [curBpmInfo?.bpm, nextBpmInfo?.bpm, effectiveDj.beatMatch],
  );

  if (!currentTrack && manualQueue.length === 0 && sourceQueue.length === 0) {
    return (
      <div className="py-12 text-center text-xs text-[#B3F7D1]/50">
        Antrean putar masih kosong. Pilih lagu untuk mulai mendengarkan.
      </div>
    );
  }

  const handleDragStart = (section: 'manual' | 'source', index: number) => {
    setDragState({ section, index });
  };

  const handleDrop = (targetSection: 'manual' | 'source', targetIndex: number) => {
    if (!dragState || dragState.section !== targetSection) {
      setDragState(null);
      return;
    }
    if (targetSection === 'manual') {
      reorderManualQueue(dragState.index, targetIndex);
    } else {
      reorderSourceQueue(dragState.index, targetIndex);
    }
    setDragState(null);
  };

  const handlePatchDj = (patch: Partial<PlaylistMixSettings>) => {
    const next = normalizePlaylistMixSettings({ ...effectiveDj, ...patch });
    updateDjMix(next);
    if (patch.enabled === false) {
      setActiveMixConfig(null);
    } else if (activeMixConfig !== null || patch.enabled === true) {
      setActiveMixConfig(next);
    }
  };

  const transitionPct = Math.round(Math.max(0, Math.min(1, djTransitionStatus.progress)) * 100);
  const tempoDeltaPct = Math.round((beatPlan.incomingStartRate - 1) * 1000) / 10;
  const tempoLabel = !effectiveDj.beatMatch
    ? 'Manual'
    : Math.abs(tempoDeltaPct) < 0.2
      ? 'Sinkron'
      : `${tempoDeltaPct > 0 ? '+' : ''}${tempoDeltaPct.toFixed(1)}%`;

  const isIframeMode = activeStreamSourceMode === 'youtube-iframe';

  return (
    <div className="space-y-4">
      {currentTrack && (
        <div>
          <h4 className="text-[11px] font-semibold text-[#B3F7D1]/65 mb-2">Sedang diputar</h4>
          <div className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.075] backdrop-blur-xl border border-[#19EE8A]/25">
            <ArtworkImage
              src={currentTrack.thumbnail}
              alt={currentTrack.title}
              type={currentTrack.type}
              className="w-10 h-10"
              roundedClass="rounded-lg"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[#19EE8A] truncate">{currentTrack.title}</p>
              <p className="text-[11px] text-[#B3F7D1]/65 truncate">{formatArtists(currentTrack.artists)}</p>
            </div>
          </div>
        </div>
      )}

      {currentTrack && (
        <section
          aria-label="Kontrol Mode Mix DJ"
          className={`rounded-xl border p-4 space-y-2 transition-colors ${
            djTransitionStatus.active || effectiveDj.enabled
              ? 'bg-[#19EE8A]/[0.06] border-[#19EE8A]/30'
              : 'bg-white/[0.04] border-white/[0.09]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  djTransitionStatus.active || effectiveDj.enabled
                    ? 'bg-[#19EE8A]/20 text-[#19EE8A]'
                    : 'bg-white/[0.07] text-[#B3F7D1]/70'
                }`}
              >
                <Disc3
                  className={`w-4 h-4 ${djTransitionStatus.active ? 'animate-spin' : ''}`}
                  strokeWidth={1.9}
                />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#E8FFF3] truncate">Mode Mix (DJ)</p>
                <p className="text-[11px] text-[#B3F7D1]/65 truncate">
                  {djTransitionStatus.active
                    ? `Transisi aktif · ${getTransitionStyleLabel(djTransitionStatus.style)} · ${transitionPct}%`
                    : effectiveDj.enabled
                      ? `${getTransitionStyleLabel(effectiveDj.transitionStyle)} · ${effectiveDj.durationSeconds} dtk${
                          effectiveDj.beatMatch ? ' · Beat Match' : ''
                        }`
                      : 'Campur transisi DJ antar lagu'}
                </p>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={effectiveDj.enabled}
              aria-label="Aktifkan Mode Mix DJ"
              onClick={() => handlePatchDj({ enabled: !effectiveDj.enabled })}
              className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center shrink-0 rounded-full"
            >
              <span
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  effectiveDj.enabled ? 'bg-sc-gradient' : 'bg-white/[0.15]'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                    effectiveDj.enabled
                      ? 'translate-x-5 bg-[#E8FFF3]'
                      : 'translate-x-0.5 bg-[#B3F7D1]/75'
                  }`}
                />
              </span>
            </button>
          </div>

          {djTransitionStatus.active && (
            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-white/[0.1] overflow-hidden">
                <div
                  className="h-full bg-sc-gradient transition-all duration-150"
                  style={{ width: `${transitionPct}%` }}
                />
              </div>
            </div>
          )}

          {(effectiveDj.enabled || djTransitionStatus.active) && upcomingTrack && !isIframeMode && (
            <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg bg-black/25 border border-white/[0.07] px-2.5 py-1.5 text-[11px]">
              <div className="flex items-center gap-1.5 min-w-0 text-[#B3F7D1]/80 font-mono-num tabular-nums">
                <span>{formatBpmChip(curBpmInfo) ?? '—'}</span>
                <span aria-hidden="true" className="text-[#19EE8A]">→</span>
                <span>{formatBpmChip(nextBpmInfo) ?? '—'}</span>
              </div>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold tabular-nums ${
                  beatPlan.beatMatched
                    ? 'bg-[#19EE8A]/15 text-[#19EE8A]'
                    : 'bg-white/[0.08] text-[#B3F7D1]/70'
                }`}
              >
                {tempoLabel}
              </span>
            </div>
          )}

          {isIframeMode && effectiveDj.enabled && (
            <p className="text-[11px] text-[#B3F7D1]/60">
              Sumber stream memakai pemutar tersemat — transisi lagu dilanjutkan otomatis saat selesai.
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            {upcomingTrack && !isIframeMode && (
              <button
                type="button"
                disabled={djTransitionStatus.active || localProfile.directMode}
                onClick={triggerDjTransitionNow}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#19EE8A]/15 hover:bg-[#19EE8A]/25 disabled:opacity-45 border border-[#19EE8A]/35 text-[11px] font-semibold text-[#19EE8A] transition-colors"
              >
                <AudioWaveform className="w-3.5 h-3.5" strokeWidth={2} />
                {djTransitionStatus.active ? 'Sedang Transisi...' : 'Mix Sekarang'}
              </button>
            )}
            <button
              type="button"
              aria-expanded={mixSettingsOpen}
              onClick={() => setMixSettingsOpen((v) => !v)}
              className={`min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-[11px] font-medium border transition-colors ${
                mixSettingsOpen
                  ? 'bg-white/[0.12] text-[#E8FFF3] border-white/[0.18]'
                  : 'bg-white/[0.05] text-[#B3F7D1]/75 hover:text-[#E8FFF3] hover:bg-white/[0.1] border-white/[0.08]'
              } ${!upcomingTrack || isIframeMode ? 'w-full' : ''}`}
            >
              <SlidersHorizontal className="w-3 h-3" strokeWidth={1.9} />
              Pengaturan
            </button>
          </div>

          {mixSettingsOpen && (
            <PlaylistMixPanel
              compact
              settings={effectiveDj}
              directModeActive={localProfile.directMode}
              onChange={handlePatchDj}
            />
          )}
        </section>
      )}

      {manualQueue.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-xs font-semibold text-[#B3F7D1]/65">
              Berikutnya dari antrean{' '}
              <span className="tabular-nums">({manualQueue.length})</span>
            </h4>
            <button
              type="button"
              onClick={clearManualQueue}
              className="inline-flex items-center gap-1 min-h-[44px] px-2 text-[11px] text-[#B3F7D1]/55 hover:text-[#E8FFF3] transition-colors"
            >
              <Trash2 className="w-3 h-3" strokeWidth={1.75} />
              Kosongkan
            </button>
          </div>
          <div className="space-y-1">
            {manualQueue.map((track, idx) => (
              <QueueTrackItem
                key={`manual-${track.id}-${idx}`}
                track={track}
                idx={idx}
                section="manual"
                onPlay={() => playFromManualQueue(idx)}
                onRemove={() => removeFromManualQueue(idx)}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h4 className="text-xs font-semibold text-[#B3F7D1]/65 truncate">
            Berikutnya dari {sourceLabel || 'sumber'}{' '}
            <span className="tabular-nums">({sourceQueue.length})</span>
          </h4>
          {sourceQueue.length > 0 && (
            <button
              type="button"
              onClick={clearSourceQueue}
              className="inline-flex items-center gap-1 min-h-[44px] px-2 text-[11px] text-[#B3F7D1]/55 hover:text-[#E8FFF3] transition-colors shrink-0"
            >
              <Trash2 className="w-3 h-3" strokeWidth={1.75} />
              Bersihkan
            </button>
          )}
        </div>

        {sourceQueue.length === 0 ? (
          <p className="text-xs text-[#B3F7D1]/45 py-2 leading-relaxed max-w-[65ch]">
            Radio otomatis akan mengisi antrean berikutnya saat lagu selesai.
          </p>
        ) : (
          <div className="space-y-1">
            {sourceQueue.map((track, idx) => (
              <QueueTrackItem
                key={`source-${track.id}-${idx}`}
                track={track}
                idx={idx}
                section="source"
                onPlay={() => playFromSourceQueue(idx)}
                onRemove={() => removeFromSourceQueue(idx)}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
