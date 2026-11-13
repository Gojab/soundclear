import { useState } from 'react';
import { GripVertical, Play, Trash2, X } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import type { MediaItem } from '../types/music';
import { formatArtists } from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';

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
      className="track-row group flex items-center gap-2 p-1.5 rounded-xl"
    >
      <span
        className="text-white/25 group-hover:text-white/55 cursor-grab active:cursor-grabbing shrink-0"
        aria-hidden="true"
      >
        <GripVertical className="w-3.5 h-3.5" strokeWidth={1.75} />
      </span>

      <button
        type="button"
        onClick={onPlay}
        aria-label={`Putar ${track.title}`}
        className="relative w-9 h-9 rounded-lg overflow-hidden shrink-0"
      >
        <ArtworkImage
          src={track.thumbnail}
          alt={track.title}
          type={track.type}
          className="w-full h-full"
          roundedClass="rounded-lg"
        />
        <span className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <Play className="w-3.5 h-3.5 text-white fill-white" strokeWidth={1.75} />
        </span>
      </button>

      <button type="button" onClick={onPlay} className="min-w-0 flex-1 text-left">
        <p className="text-xs font-medium text-white truncate">{track.title}</p>
        <p className="text-[11px] text-white/50 truncate">{formatArtists(track.artists)}</p>
      </button>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Hapus ${track.title} dari antrean`}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-white hover:bg-white/[0.08] transition-all shrink-0"
      >
        <X className="w-3.5 h-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function QueueView() {
  const [dragState, setDragState] = useState<{ section: 'manual' | 'source'; index: number } | null>(
    null,
  );

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const manualQueue = usePlayerStore((s) => s.manualQueue);
  const sourceQueue = usePlayerStore((s) => s.sourceQueue);
  const sourceLabel = usePlayerStore((s) => s.sourceLabel);

  const playFromManualQueue = usePlayerStore((s) => s.playFromManualQueue);
  const playFromSourceQueue = usePlayerStore((s) => s.playFromSourceQueue);
  const removeFromManualQueue = usePlayerStore((s) => s.removeFromManualQueue);
  const removeFromSourceQueue = usePlayerStore((s) => s.removeFromSourceQueue);
  const reorderManualQueue = usePlayerStore((s) => s.reorderManualQueue);
  const reorderSourceQueue = usePlayerStore((s) => s.reorderSourceQueue);
  const clearManualQueue = usePlayerStore((s) => s.clearManualQueue);
  const clearSourceQueue = usePlayerStore((s) => s.clearSourceQueue);

  if (!currentTrack && manualQueue.length === 0 && sourceQueue.length === 0) {
    return (
      <div className="py-12 text-center text-xs text-white/45">
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

  return (
    <div className="space-y-5">
      {currentTrack && (
        <div>
          <h4 className="text-xs font-semibold text-white/55 mb-2">Sedang diputar</h4>
          <div className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.08]">
            <ArtworkImage
              src={currentTrack.thumbnail}
              alt={currentTrack.title}
              type={currentTrack.type}
              className="w-10 h-10"
              roundedClass="rounded-lg"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#2EE6A6] truncate">{currentTrack.title}</p>
              <p className="text-xs text-white/60 truncate">{formatArtists(currentTrack.artists)}</p>
            </div>
          </div>
        </div>
      )}

      {manualQueue.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-white/55">
              Berikutnya dari antrean{' '}
              <span className="tabular-nums">({manualQueue.length})</span>
            </h4>
            <button
              type="button"
              onClick={clearManualQueue}
              className="inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white transition-colors"
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
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-white/55 truncate">
            Berikutnya dari {sourceLabel || 'sumber'}{' '}
            <span className="tabular-nums">({sourceQueue.length})</span>
          </h4>
          {sourceQueue.length > 0 && (
            <button
              type="button"
              onClick={clearSourceQueue}
              className="inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white transition-colors shrink-0"
            >
              <Trash2 className="w-3 h-3" strokeWidth={1.75} />
              Bersihkan
            </button>
          )}
        </div>

        {sourceQueue.length === 0 ? (
          <p className="text-xs text-white/40 py-2">
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
