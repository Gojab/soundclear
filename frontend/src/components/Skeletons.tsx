export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass-card rounded-2xl p-4 animate-pulse">
          <div className="aspect-square w-full rounded-xl bg-white/[0.08] mb-2" />
          <div className="h-4 w-3/4 rounded bg-white/[0.08] mb-2" />
          <div className="h-3 w-1/2 rounded bg-white/[0.06]" />
        </div>
      ))}
    </div>
  );
}

export function TrackListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-2 rounded-xl animate-pulse">
          <div className="w-11 h-11 rounded-lg bg-white/[0.08] shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/5 rounded bg-white/[0.08]" />
            <div className="h-3 w-1/4 rounded bg-white/[0.06]" />
          </div>
          <div className="w-10 h-3 rounded bg-white/[0.06]" />
        </div>
      ))}
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
  onGoHome,
}: {
  message: string;
  onRetry?: () => void;
  onGoHome?: () => void;
}) {
  return (
    <div className="glass-panel rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-red-400/20">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-white">Gagal memuat konten</h3>
        <p className="text-xs text-white/65 mt-1 leading-relaxed max-w-[65ch]">{message}</p>
      </div>
      {(onRetry || onGoHome) && (
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          {onGoHome && (
            <button
              type="button"
              onClick={onGoHome}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-white/85 transition-colors"
            >
              Ke Beranda
            </button>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] text-xs font-medium text-white transition-colors"
            >
              Coba Lagi
            </button>
          )}
        </div>
      )}
    </div>
  );
}
