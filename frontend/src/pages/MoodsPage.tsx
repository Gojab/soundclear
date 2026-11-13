import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { fetchMoodPlaylists, fetchMoods } from '../api/client';
import { MediaCard } from '../components/MediaCard';
import { CardGridSkeleton, ErrorBanner } from '../components/Skeletons';
import { useNavigationStore } from '../store/navigationStore';

export function MoodsPage() {
  const navigate = useNavigationStore((s) => s.navigate);

  const moodsQuery = useQuery({
    queryKey: ['moods'],
    queryFn: ({ signal }) => fetchMoods(signal),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
          Mood & Genre
        </h1>
        <p className="text-xs text-white/55 mt-0.5">
          Jelajahi daftar putar sesuai suasana hati dan genre favorit
        </p>
      </div>

      {moodsQuery.isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 animate-pulse">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-white/[0.06]" />
          ))}
        </div>
      ) : moodsQuery.isError ? (
        <ErrorBanner
          message={
            moodsQuery.error instanceof Error
              ? moodsQuery.error.message
              : 'Gagal memuat kategori mood.'
          }
          onRetry={() => void moodsQuery.refetch()}
        />
      ) : (
        <div className="space-y-8">
          {moodsQuery.data?.groups.map((group) => (
            <section key={group.title} className="space-y-3">
              <h2 className="text-base font-semibold text-white">{group.title}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {group.items.map((cat) => (
                  <button
                    key={cat.params}
                    type="button"
                    onClick={() =>
                      navigate({ name: 'mood-detail', params: cat.params, title: cat.title })
                    }
                    className="glass-card rounded-xl px-4 py-3.5 flex items-center justify-between gap-2 text-left group"
                  >
                    <span className="text-sm font-medium text-white truncate">{cat.title}</span>
                    <ChevronRight
                      className="w-4 h-4 text-white/40 group-hover:text-[#2EE6A6] transition-colors shrink-0"
                      strokeWidth={1.75}
                    />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function MoodDetailPage({ params, title }: { params: string; title: string }) {
  const navigate = useNavigationStore((s) => s.navigate);
  const cleanParams = params.trim();

  const query = useQuery({
    queryKey: ['mood-playlists', cleanParams],
    queryFn: ({ signal }) => fetchMoodPlaylists(cleanParams, signal),
    enabled: Boolean(cleanParams),
  });

  if (!cleanParams) {
    return (
      <ErrorBanner
        message="Kategori mood tidak valid."
        onGoHome={() => navigate({ name: 'moods' })}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-white/50">Mood & Genre</p>
        <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight mt-0.5">
          {title}
        </h1>
      </div>

      {query.isLoading ? (
        <CardGridSkeleton count={10} />
      ) : query.isError ? (
        <ErrorBanner
          message={
            query.error instanceof Error
              ? query.error.message
              : 'Gagal memuat playlist untuk kategori ini.'
          }
          onRetry={() => void query.refetch()}
          onGoHome={() => navigate({ name: 'moods' })}
        />
      ) : query.data && query.data.playlists.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {query.data.playlists.map((pl) => (
            <MediaCard key={pl.id} item={pl} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-white/50">Tidak ada playlist ditemukan untuk kategori ini.</p>
      )}
    </div>
  );
}
