import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Check,
  Download,
  Headphones,
  Info,
  ListMusic,
  ListPlus,
  Maximize2,
  Mic2,
  MoreHorizontal,
  Plus,
  Sliders,
  X,
} from 'lucide-react';
import { fetchSongCredits, fetchSongRelated } from '../api/client';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { useNavigationStore } from '../store/navigationStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import type { MediaItem } from '../types/music';
import { hasActiveCustomBackground } from '../utils/backgroundTheme';
import { formatArtists, getPlayableVideoId, getTrackUniqueId, isLocalTrack } from '../utils/playerLogic';
import { ArtworkImage } from './ArtworkImage';
import { LyricsView } from './LyricsView';
import { QueueView } from './QueueView';

interface RightPanelProps {
  onAddToPlaylist: (track: MediaItem) => void;
}

function LocalFileDetails({ track }: { track: MediaItem }) {
  const localFiles = useLibraryStore((s) => s.localFiles);
  const navigate = useNavigationStore((s) => s.navigate);
  const localId = getTrackUniqueId(track);
  const record = localFiles.find((f) => f.id === localId);

  return (
    <div className="space-y-3 text-xs">
      <div className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-4 space-y-2.5">
        <p className="text-sm font-bold text-[#E8FFF3]">Informasi File Lokal</p>
        <div className="space-y-1.5 text-[#B3F7D1]/70">
          <p>
            Judul: <span className="text-[#E8FFF3] font-medium">{track.title}</span>
          </p>
          <p>
            Artis: <span className="text-[#E8FFF3] font-medium">{formatArtists(track.artists)}</span>
          </p>
          {track.album?.name && (
            <p>
              Album: <span className="text-[#E8FFF3] font-medium">{track.album.name}</span>
            </p>
          )}
          {record && (
            <>
              <p className="tabular-nums">
                Perkiraan Loudness:{' '}
                <span className="text-[#19EE8A] font-mono-num">
                  {record.estimatedLufs.toFixed(1)} LUFS
                </span>
              </p>
              <p className="tabular-nums">
                Ukuran:{' '}
                <span className="text-[#E8FFF3] font-mono-num">
                  {(record.fileSize / (1024 * 1024)).toFixed(1)} MB
                </span>
              </p>
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate({ name: 'settings', tab: 'sound', focusEq: true })}
        className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-full bg-sc-gradient text-[#0F1F17] font-semibold hover:brightness-105 transition-all"
      >
        <Sliders className="w-3.5 h-3.5" strokeWidth={2} />
        Buka Equalizer &amp; Efek Lokal
      </button>
    </div>
  );
}

function SongDetailsAndRelated({
  track,
  onAddToPlaylist,
}: {
  track: MediaItem;
  onAddToPlaylist: (track: MediaItem) => void;
}) {
  const [showAllCredits, setShowAllCredits] = useState(false);
  const videoId = getPlayableVideoId(track) || '';
  const playTrackList = usePlayerStore((s) => s.playTrackList);
  const navigate = useNavigationStore((s) => s.navigate);

  const creditsQuery = useQuery({
    queryKey: ['song-credits', videoId, track.album?.id, track.creditsBrowseId],
    queryFn: ({ signal }) =>
      fetchSongCredits(videoId, track.album?.id, track.creditsBrowseId, signal),
    enabled: Boolean(videoId),
  });

  const relatedQuery = useQuery({
    queryKey: ['song-related', videoId],
    queryFn: ({ signal }) => fetchSongRelated(videoId, signal),
    enabled: Boolean(videoId),
  });

  const allCredits = creditsQuery.data?.credits ?? [];
  const visibleCredits = showAllCredits ? allCredits : allCredits.slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Credits Card */}
      <div className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-[#E8FFF3]">Kredit</h4>
          {allCredits.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllCredits((v) => !v)}
              className="text-xs font-semibold text-[#B3F7D1]/70 hover:text-[#19EE8A] hover:underline"
            >
              {showAllCredits ? 'Ringkas' : 'Tampilkan semua'}
            </button>
          )}
        </div>

        {creditsQuery.isLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-9 rounded-lg bg-white/[0.09]" />
            <div className="h-9 rounded-lg bg-white/[0.09]" />
          </div>
        ) : visibleCredits.length > 0 ? (
          <div className="space-y-3">
            {visibleCredits.map((credit) => (
              <div key={credit.role} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#E8FFF3] truncate">
                    {credit.names.join(', ')}
                  </p>
                  <p className="text-xs text-[#B3F7D1]/60 truncate mt-0.5">{credit.role}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#E8FFF3]">{formatArtists(track.artists)}</p>
            <p className="text-xs text-[#B3F7D1]/60">
              {track.album?.name ? `Album · ${track.album.name}` : 'Artis Utama'}
            </p>
          </div>
        )}
      </div>

      {/* Related Tracks Card */}
      <div className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-4 space-y-3">
        <h4 className="text-sm font-bold text-[#E8FFF3]">Lagu Terkait</h4>
        {relatedQuery.isLoading ? (
          <div className="space-y-2 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-11 rounded-lg bg-white/[0.09]" />
            ))}
          </div>
        ) : relatedQuery.data && relatedQuery.data.tracks.length > 0 ? (
          <div className="space-y-1">
            {relatedQuery.data.tracks.slice(0, 7).map((rel, idx) => (
              <button
                key={`${rel.id}-${idx}`}
                type="button"
                onClick={() => playTrackList(relatedQuery.data.tracks, idx, 'Lagu Terkait')}
                className="w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white/[0.09] text-left transition-colors"
              >
                <ArtworkImage
                  src={rel.thumbnail}
                  alt={rel.title}
                  className="w-10 h-10 shrink-0"
                  roundedClass="rounded-md"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#E8FFF3] truncate">{rel.title}</p>
                  <p className="text-[11px] text-[#B3F7D1]/60 truncate mt-0.5">
                    {formatArtists(rel.artists)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#B3F7D1]/50">Belum ada lagu terkait untuk lagu ini.</p>
        )}
      </div>

      {relatedQuery.data && relatedQuery.data.artists.length > 0 && (
        <div className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-4 space-y-3">
          <h4 className="text-sm font-bold text-[#E8FFF3]">Artis Serupa</h4>
          <div className="space-y-1">
            {relatedQuery.data.artists.slice(0, 5).map((art) => (
              <button
                key={art.id}
                type="button"
                onClick={() =>
                  navigate({ name: 'artist', id: art.browseId || art.id, fallbackQuery: art.title })
                }
                className="w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white/[0.09] text-left transition-colors"
              >
                <ArtworkImage
                  src={art.thumbnail}
                  alt={art.title}
                  type="artist"
                  className="w-9 h-9 shrink-0"
                  roundedClass="rounded-full"
                />
                <span className="text-xs font-semibold text-[#E8FFF3] truncate">{art.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onAddToPlaylist(track)}
        className="w-full py-2.5 rounded-full bg-white/[0.055] backdrop-blur-xl hover:bg-white/[0.11] border border-[#19EE8A]/35 text-xs font-semibold text-[#19EE8A] transition-colors"
      >
        Simpan ke Playlist
      </button>
    </div>
  );
}

export function RightPanel({ onAddToPlaylist }: RightPanelProps) {
  const rightPanelOpen = usePlayerStore((s) => s.rightPanelOpen);
  const rightPanelTab = usePlayerStore((s) => s.rightPanelTab);
  const setRightPanelOpen = usePlayerStore((s) => s.setRightPanelOpen);
  const setRightPanelTab = usePlayerStore((s) => s.setRightPanelTab);
  const setFullscreenNowPlaying = usePlayerStore((s) => s.setFullscreenNowPlaying);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playerError = usePlayerStore((s) => s.playerError);
  const activeStreamMeta = usePlayerStore((s) => s.activeStreamMeta);
  const webAudioWarning = usePlayerStore((s) => s.webAudioWarning);

  const navigate = useNavigationStore((s) => s.navigate);
  const openMenu = useContextMenuStore((s) => s.openMenu);
  const showToast = useContextMenuStore((s) => s.showToast);

  const trackKey = getTrackUniqueId(currentTrack);
  const localPlaying = isLocalTrack(currentTrack);
  const liked = useLibraryStore((s) => s.isLiked(trackKey));
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const isOffline = useLibraryStore((s) => s.isTrackDownloadedOffline(trackKey));
  const downloadTrackOffline = useLibraryStore((s) => s.downloadTrackOffline);
  const deleteOfflineDownload = useLibraryStore((s) => s.deleteOfflineDownload);
  const downloadQuality = useSettingsStore((s) => s.localProfile.downloadQuality);
  const customBackground = useSettingsStore((s) => s.customBackground);
  const bgActive = hasActiveCustomBackground(customBackground);
  const glassPanels = bgActive && customBackground.panelGlass;

  if (!rightPanelOpen) return null;

  return (
    <aside
      aria-label="Panel sedang diputar"
      className={`hidden lg:flex flex-col w-[312px] xl:w-[348px] shrink-0 rounded-lg overflow-hidden transition-all duration-200 border border-white/[0.08] ${
        glassPanels
          ? 'bg-black/45 backdrop-blur-2xl'
          : bgActive
            ? 'bg-[#090C0B]/80 backdrop-blur-xl'
            : 'bg-white/[0.03] backdrop-blur-2xl'
      }`}
    >
      {/* Header matching Windows Now Playing Sidebar */}
      <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[#E8FFF3] truncate">
          {currentTrack ? currentTrack.title : 'Sedang diputar'}
        </h2>
        <div className="flex items-center gap-0.5 shrink-0">
          {currentTrack && (
            <button
              type="button"
              onClick={() => setFullscreenNowPlaying(true)}
              aria-label="Buka tampilan penuh"
              title="Layar Penuh"
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#B3F7D1]/65 hover:text-[#E8FFF3] hover:bg-white/[0.09] transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setRightPanelOpen(false)}
            aria-label="Tutup panel sedang diputar"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#B3F7D1]/65 hover:text-[#E8FFF3] hover:bg-white/[0.09] transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {currentTrack ? (
          <div className="space-y-3.5">
            {localPlaying ? (
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-white/[0.05] border border-white/[0.08]">
                {currentTrack.thumbnail ? (
                  <ArtworkImage
                    src={currentTrack.thumbnail}
                    alt={currentTrack.title}
                    type="local"
                    className="w-full h-full"
                    roundedClass="rounded-lg"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-[#B3F7D1]/55">
                    <Headphones className="w-10 h-10 text-[#19EE8A]/80" strokeWidth={1.6} />
                    <span className="text-xs">Audio File Lokal</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-white/[0.05] border border-white/[0.08]">
                <ArtworkImage
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  type={currentTrack.type}
                  className="w-full h-full opacity-100"
                  roundedClass="rounded-lg"
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-bold text-[#E8FFF3] truncate tracking-tight">
                  {currentTrack.title}
                </h3>
                <div className="flex flex-wrap items-center gap-x-1 text-sm text-[#B3F7D1]/70 mt-0.5">
                  {currentTrack.artists.map((artist, idx) => (
                    <span key={`${artist.name}-${idx}`} className="inline-flex items-center">
                      {idx > 0 && <span className="mr-1">,</span>}
                      {artist.id ? (
                        <button
                          type="button"
                          onClick={() =>
                            navigate({ name: 'artist', id: artist.id!, fallbackQuery: artist.name })
                          }
                          className="hover:text-[#E8FFF3] hover:underline text-left"
                        >
                          {artist.name}
                        </button>
                      ) : (
                        <span>{artist.name}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleLike(currentTrack)}
                  aria-label={liked ? 'Hapus dari lagu disukai' : 'Sukai lagu ini'}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                    liked
                      ? 'bg-[#19EE8A] text-[#0F1F17]'
                      : 'border border-[#B3F7D1]/40 text-[#B3F7D1]/75 hover:border-[#19EE8A] hover:text-[#E8FFF3]'
                  }`}
                >
                  {liked ? (
                    <Check className="w-4 h-4" strokeWidth={2.5} />
                  ) : (
                    <Plus className="w-4 h-4" strokeWidth={2.2} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!currentTrack || !trackKey) return;
                    if (isOffline) {
                      void deleteOfflineDownload(trackKey);
                      showToast(`"${currentTrack.title}" dihapus dari penyimpanan offline`);
                    } else {
                      void downloadTrackOffline(currentTrack, downloadQuality)
                        .then((res) => {
                          if (res.ok) {
                            showToast(`"${currentTrack.title}" tersimpan offline`);
                          } else {
                            showToast(res.reason || 'Gagal menyimpan lagu offline');
                          }
                        })
                        .catch(() => {
                          showToast('Gagal menyimpan lagu offline');
                        });
                    }
                  }}
                  aria-label={isOffline ? 'Hapus dari offline' : 'Simpan lagu offline'}
                  title={isOffline ? 'Tersimpan offline (klik untuk hapus)' : 'Simpan ke offline'}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    isOffline
                      ? 'bg-[#19EE8A]/15 text-[#19EE8A]'
                      : 'text-[#B3F7D1]/65 hover:text-[#E8FFF3] hover:bg-white/[0.09]'
                  }`}
                >
                  <Download className="w-4 h-4" strokeWidth={1.9} />
                </button>
                <button
                  type="button"
                  onClick={() => onAddToPlaylist(currentTrack)}
                  aria-label="Simpan lagu ke playlist"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#B3F7D1]/65 hover:text-[#E8FFF3] hover:bg-white/[0.09] transition-colors"
                >
                  <ListPlus className="w-4 h-4" strokeWidth={1.9} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    openMenu(rect.right - 220, rect.bottom + 6, currentTrack, { onAddToPlaylist });
                  }}
                  aria-label="Opsi lagu sedang diputar"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#B3F7D1]/65 hover:text-[#E8FFF3] hover:bg-white/[0.09] transition-colors"
                >
                  <MoreHorizontal className="w-4 h-4" strokeWidth={1.9} />
                </button>
              </div>
            </div>

            {activeStreamMeta && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] px-3 py-2">
                <span
                  className={`text-[11px] font-medium truncate ${
                    activeStreamMeta.hiRes
                      ? 'text-[#19EE8A]'
                      : activeStreamMeta.lossless
                        ? 'text-[#0AD36C]'
                        : 'text-[#B3F7D1]/75'
                  }`}
                >
                  {activeStreamMeta.badgeLabel}
                </span>
                <button
                  type="button"
                  onClick={() => navigate({ name: 'settings', tab: 'sound', focusEq: false })}
                  className="inline-flex items-center gap-1 text-[11px] text-[#19EE8A] hover:underline shrink-0"
                >
                  <Sliders className="w-3 h-3" strokeWidth={1.9} />
                  Audio
                </button>
              </div>
            )}

            {webAudioWarning && (
              <p className="text-[11px] text-[#19EE8A] bg-[#19EE8A]/10 border border-[#19EE8A]/25 rounded-xl px-3 py-2">
                {webAudioWarning}
              </p>
            )}

            {playerError && (
              <p className="text-xs text-red-300 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">
                {playerError}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-white/[0.055] backdrop-blur-xl border border-white/[0.11] p-5 text-center space-y-2">
            <p className="text-sm font-semibold text-[#E8FFF3]">Belum ada lagu diputar</p>
            <p className="text-xs text-[#B3F7D1]/65">
              Pilih lagu dari Beranda atau Cari untuk mulai memutar musik.
            </p>
          </div>
        )}

        <div
          role="tablist"
          aria-label="Tab panel sedang diputar"
          className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-white/[0.05] backdrop-blur-md border border-white/[0.08]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={rightPanelTab === 'queue'}
            onClick={() => setRightPanelTab('queue')}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
              rightPanelTab === 'queue'
                ? 'bg-white/[0.12] text-[#19EE8A]'
                : 'text-[#B3F7D1]/65 hover:text-[#E8FFF3]'
            }`}
          >
            <ListMusic className="w-3.5 h-3.5" strokeWidth={1.9} />
            Antrean
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightPanelTab === 'lyrics'}
            onClick={() => setRightPanelTab('lyrics')}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
              rightPanelTab === 'lyrics'
                ? 'bg-white/[0.12] text-[#19EE8A]'
                : 'text-[#B3F7D1]/65 hover:text-[#E8FFF3]'
            }`}
          >
            <Mic2 className="w-3.5 h-3.5" strokeWidth={1.9} />
            Lirik
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightPanelTab === 'details'}
            onClick={() => setRightPanelTab('details')}
            className={`flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
              rightPanelTab === 'details'
                ? 'bg-white/[0.12] text-[#19EE8A]'
                : 'text-[#B3F7D1]/65 hover:text-[#E8FFF3]'
            }`}
          >
            <Info className="w-3.5 h-3.5" strokeWidth={1.9} />
            {localPlaying ? 'Info' : 'Kredit'}
          </button>
        </div>

        <div>
          {rightPanelTab === 'queue' ? (
            <QueueView />
          ) : rightPanelTab === 'lyrics' ? (
            <LyricsView />
          ) : currentTrack ? (
            localPlaying ? (
              <LocalFileDetails track={currentTrack} />
            ) : (
              <SongDetailsAndRelated track={currentTrack} onAddToPlaylist={onAddToPlaylist} />
            )
          ) : (
            <p className="text-xs text-[#B3F7D1]/50 py-8 text-center">
              Putar lagu untuk melihat kredit dan lagu terkait.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
