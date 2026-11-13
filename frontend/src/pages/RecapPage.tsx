import { useMemo, useState } from 'react';
import { BarChart3, Clock, Disc3, Play, Users } from 'lucide-react';
import { ArtworkImage } from '../components/ArtworkImage';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { computeRecapSummary, type RecapRange } from '../utils/recapLogic';

const RANGE_OPTIONS: Array<{ id: RecapRange; label: string }> = [
  { id: '4w', label: '4 Minggu' },
  { id: '6m', label: '6 Bulan' },
  { id: 'all', label: 'Semua Waktu' },
];

export function RecapPage() {
  const [range, setRange] = useState<RecapRange>('4w');
  const playHistory = useLibraryStore((s) => s.playHistory);
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const navigate = useNavigationStore((s) => s.navigate);

  const stats = useMemo(() => computeRecapSummary(playHistory, range), [playHistory, range]);
  const maxMonthMinutes = Math.max(1, ...stats.monthlyBreakdown.map((m) => m.minutes));

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
            Rekap Mendengar
          </h1>
          <p className="text-xs text-white/55 mt-0.5">
            Ringkasan statistik lokal dari riwayat putar Anda
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Rentang waktu rekap"
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.05] border border-white/[0.08] self-start"
        >
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={range === opt.id}
              onClick={() => setRange(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                range === opt.id
                  ? 'bg-[#2EE6A6] text-[#06130E] font-semibold'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass-card rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-white/50">
            <span className="text-xs">Total Menit</span>
            <Clock className="w-4 h-4 text-[#2EE6A6]" strokeWidth={1.75} />
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{stats.totalMinutes}</p>
        </div>

        <div className="glass-card rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-white/50">
            <span className="text-xs">Total Pemutaran</span>
            <Play className="w-4 h-4 text-[#2EE6A6]" strokeWidth={1.75} />
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{stats.totalPlays}</p>
        </div>

        <div className="glass-card rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-white/50">
            <span className="text-xs">Artis Unik</span>
            <Users className="w-4 h-4 text-[#2EE6A6]" strokeWidth={1.75} />
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{stats.uniqueArtists}</p>
        </div>

        <div className="glass-card rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between text-white/50">
            <span className="text-xs">Lagu Unik</span>
            <Disc3 className="w-4 h-4 text-[#2EE6A6]" strokeWidth={1.75} />
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{stats.uniqueTracks}</p>
        </div>
      </div>

      {stats.totalPlays === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center space-y-2">
          <BarChart3 className="w-8 h-8 text-white/35 mx-auto" strokeWidth={1.75} />
          <p className="text-sm font-medium text-white/85">Belum ada data mendengarkan di rentang ini</p>
          <p className="text-xs text-white/50">
            Putar lagu minimal 15 detik agar statistik mulai tercatat otomatis.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Monthly Bar Chart */}
          {stats.monthlyBreakdown.length > 0 && (
            <section className="glass-card rounded-2xl p-5 space-y-4">
              <h2 className="text-base font-semibold text-white">Menit Mendengar per Bulan</h2>
              <div className="flex items-end gap-3 h-40 pt-4">
                {stats.monthlyBreakdown.map((m) => {
                  const pct = Math.max(8, Math.round((m.minutes / maxMonthMinutes) * 100));
                  return (
                    <div key={m.monthKey} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                      <span className="text-[11px] text-white/70 tabular-nums">{m.minutes}m</span>
                      <div className="w-full max-w-[44px] h-24 flex items-end">
                        <div
                          className="w-full rounded-t-lg bg-[#2EE6A6]/85 transition-all duration-300"
                          style={{ height: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-white/45 truncate max-w-full tabular-nums">
                        {m.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Songs */}
            <section className="glass-card rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Lagu Teratas</h2>
                {stats.topTracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      playTrackList(
                        stats.topTracks.map((t) => t.item),
                        0,
                        'Rekap Lagu Teratas',
                      )
                    }
                    className="text-xs font-medium text-[#2EE6A6] hover:underline"
                  >
                    Putar semua
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {stats.topTracks.map((entry, idx) => (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() =>
                      playTrackList(
                        stats.topTracks.map((t) => t.item),
                        idx,
                        'Rekap Lagu Teratas',
                      )
                    }
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.06] text-left transition-colors"
                  >
                    <span className="w-5 text-xs text-white/45 tabular-nums text-center">
                      {idx + 1}
                    </span>
                    <ArtworkImage
                      src={entry.item.thumbnail}
                      alt={entry.item.title}
                      className="w-10 h-10"
                      roundedClass="rounded-lg"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{entry.item.title}</p>
                      <p className="text-xs text-white/50 truncate">
                        {entry.item.artists.map((a) => a.name).join(', ')}
                      </p>
                    </div>
                    <span className="text-xs text-[#2EE6A6] tabular-nums shrink-0">
                      {entry.plays}x
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* Top Artists & Top Genres */}
            <div className="space-y-6">
              <section className="glass-card rounded-2xl p-5 space-y-3">
                <h2 className="text-base font-semibold text-white">Artis Teratas</h2>
                <div className="space-y-2">
                  {stats.topArtists.map((art, idx) => (
                    <button
                      key={art.key}
                      type="button"
                      disabled={!art.item.id}
                      onClick={() => {
                        if (art.item.id) {
                          navigate({ name: 'artist', id: art.item.id, fallbackQuery: art.item.name });
                        }
                      }}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] disabled:hover:bg-white/[0.03] text-left transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-5 text-xs text-white/45 tabular-nums">{idx + 1}</span>
                        <span className="text-sm font-medium text-white truncate">{art.item.name}</span>
                      </div>
                      <span className="text-xs text-white/55 tabular-nums shrink-0">
                        {art.plays} putar · {art.minutes}m
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {stats.topGenres.length > 0 && (
                <section className="glass-card rounded-2xl p-5 space-y-3">
                  <h2 className="text-base font-semibold text-white">Kategori / Genre Teratas</h2>
                  <div className="space-y-2.5">
                    {stats.topGenres.map((g) => {
                      const pct = Math.min(
                        100,
                        Math.round((g.plays / Math.max(1, stats.topGenres[0].plays)) * 100),
                      );
                      return (
                        <div key={g.key} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-white/85 font-medium">{g.item.name}</span>
                            <span className="text-white/50 tabular-nums">{g.plays} putar</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full bg-[#2EE6A6]" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
