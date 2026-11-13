import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LocalPlaylist, MediaItem } from '../types/music';
import { getPlayableVideoId } from '../utils/playerLogic';

interface LibraryState {
  likedTracks: MediaItem[];
  playlists: LocalPlaylist[];
  toggleLike: (track: MediaItem) => void;
  isLiked: (trackId: string | null | undefined) => boolean;
  createPlaylist: (name: string, initialTrack?: MediaItem) => LocalPlaylist;
  renamePlaylist: (playlistId: string, name: string) => void;
  deletePlaylist: (playlistId: string) => void;
  addTrackToPlaylist: (playlistId: string, track: MediaItem) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
}

function normalizeTrackId(track: MediaItem): string {
  return getPlayableVideoId(track) || track.id;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      likedTracks: [],
      playlists: [],

      toggleLike: (track) => {
        const key = normalizeTrackId(track);
        const current = get().likedTracks;
        const exists = current.some((t) => normalizeTrackId(t) === key);
        if (exists) {
          set({ likedTracks: current.filter((t) => normalizeTrackId(t) !== key) });
        } else {
          set({ likedTracks: [{ ...track, id: key }, ...current] });
        }
      },

      isLiked: (trackId) => {
        if (!trackId) return false;
        return get().likedTracks.some((t) => normalizeTrackId(t) === trackId);
      },

      createPlaylist: (name, initialTrack) => {
        const cleanName = name.trim() || 'Playlist Baru';
        const newPlaylist: LocalPlaylist = {
          id: `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          name: cleanName,
          createdAt: Date.now(),
          tracks: initialTrack ? [initialTrack] : [],
        };
        set((state) => ({ playlists: [newPlaylist, ...state.playlists] }));
        return newPlaylist;
      },

      renamePlaylist: (playlistId, name) => {
        const cleanName = name.trim();
        if (!cleanName) return;
        set((state) => ({
          playlists: state.playlists.map((pl) =>
            pl.id === playlistId ? { ...pl, name: cleanName } : pl,
          ),
        }));
      },

      deletePlaylist: (playlistId) => {
        set((state) => ({
          playlists: state.playlists.filter((pl) => pl.id !== playlistId),
        }));
      },

      addTrackToPlaylist: (playlistId, track) => {
        const key = normalizeTrackId(track);
        set((state) => ({
          playlists: state.playlists.map((pl) => {
            if (pl.id !== playlistId) return pl;
            if (pl.tracks.some((t) => normalizeTrackId(t) === key)) return pl;
            return { ...pl, tracks: [...pl.tracks, track] };
          }),
        }));
      },

      removeTrackFromPlaylist: (playlistId, trackId) => {
        set((state) => ({
          playlists: state.playlists.map((pl) => {
            if (pl.id !== playlistId) return pl;
            return {
              ...pl,
              tracks: pl.tracks.filter((t) => normalizeTrackId(t) !== trackId),
            };
          }),
        }));
      },
    }),
    {
      name: 'soundclear_library_v1',
    },
  ),
);
