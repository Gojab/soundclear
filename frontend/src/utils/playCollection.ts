import {
  fetchAlbum,
  fetchArtist,
  fetchPlaylist,
  fetchPodcast,
  fetchSearch,
} from '../api/client';
import { useContextMenuStore } from '../store/contextMenuStore';
import { usePlayerStore } from '../store/playerStore';
import type { MediaItem } from '../types/music';
import {
  extractTracksFromArtistDetail,
  isPlayableTrack,
  normalizeRouteId,
  podcastEpisodesToMediaItems,
} from './playerLogic';

export async function playAnyMediaItem(item: MediaItem): Promise<boolean> {
  const player = usePlayerStore.getState();
  const showToast = useContextMenuStore.getState().showToast;

  if (isPlayableTrack(item)) {
    player.playTrack(item);
    return true;
  }

  const targetId = normalizeRouteId(item.browseId || item.playlistId || item.id);
  if (!targetId) {
    showToast('Konten ini tidak memiliki ID pemutaran yang valid.');
    return false;
  }

  try {
    if (item.type === 'album') {
      const album = await fetchAlbum(targetId, undefined, item.title);
      if (album.tracks.length > 0) {
        player.playTrackList(album.tracks, 0, album.title || item.title);
        return true;
      }
      if (album.audioPlaylistId) {
        const pl = await fetchPlaylist(album.audioPlaylistId, undefined, album.title);
        if (pl.tracks.length > 0) {
          player.playTrackList(pl.tracks, 0, album.title || pl.title);
          return true;
        }
      }
    } else if (item.type === 'playlist') {
      const playlistId = normalizeRouteId(item.playlistId || item.browseId || item.id) || targetId;
      const pl = await fetchPlaylist(playlistId, undefined, item.title);
      if (pl.tracks.length > 0) {
        player.playTrackList(pl.tracks, 0, pl.title || item.title);
        return true;
      }
    } else if (item.type === 'artist') {
      const artist = await fetchArtist(targetId, undefined, item.title);
      const directTracks = extractTracksFromArtistDetail(artist);
      if (directTracks.length > 0) {
        player.playTrackList(directTracks, 0, artist.name || item.title);
        return true;
      }
      const firstAlbum = artist.albums[0] || artist.singles[0];
      const firstAlbumId = normalizeRouteId(firstAlbum?.browseId || firstAlbum?.id);
      if (firstAlbumId) {
        const alb = await fetchAlbum(firstAlbumId, undefined, firstAlbum.title);
        if (alb.tracks.length > 0) {
          player.playTrackList(alb.tracks, 0, artist.name || item.title);
          return true;
        }
      }
      const fallbackSearch = await fetchSearch(artist.name || item.title, 'songs');
      const searchedTracks = fallbackSearch.items.filter((t) => isPlayableTrack(t));
      if (searchedTracks.length > 0) {
        player.playTrackList(searchedTracks, 0, artist.name || item.title);
        return true;
      }
    } else if (item.type === 'podcast') {
      const podcast = await fetchPodcast(targetId, undefined, item.title);
      const episodes = podcastEpisodesToMediaItems(
        podcast.episodes,
        podcast.author,
        podcast.thumbnail,
      );
      if (episodes.length > 0) {
        player.playTrackList(episodes, 0, podcast.title || item.title);
        return true;
      }
    }

    showToast(`Belum ada trek yang dapat diputar untuk "${item.title}".`);
    return false;
  } catch {
    showToast(`Gagal memuat trek untuk "${item.title}".`);
    return false;
  }
}
