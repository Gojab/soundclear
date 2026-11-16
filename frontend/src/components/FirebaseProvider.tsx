import { onAuthStateChanged } from 'firebase/auth';
import { useEffect } from 'react';
import { auth, testFirestoreConnection } from '../firebase/firebase';
import {
  formatFirestoreQuotaNotice,
  subscribeFirestoreErrors,
} from '../firebase/firestoreError';
import {
  clearKnownFirestoreDocPaths,
  ensureUserDocuments,
  seedCloudIfEmptyFromLocal,
  subscribeUserFirestoreData,
} from '../firebase/firestoreSync';
import { useAuthStore } from '../store/authStore';
import { useContextMenuStore } from '../store/contextMenuStore';
import { useLibraryStore } from '../store/libraryStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';

export function FirebaseProvider() {
  useEffect(() => {
    void testFirestoreConnection();

    const unsubErrors = subscribeFirestoreErrors((info) => {
      const quotaNotice = formatFirestoreQuotaNotice(info.error);
      const message =
        quotaNotice ||
        (info.error.toLowerCase().includes('permission')
          ? 'Akses Firestore ditolak oleh aturan keamanan. Pastikan akun Google terverifikasi.'
          : `Kesalahan sinkronisasi Firestore: ${info.error}`);
      useAuthStore.getState().setFirestoreError(message);
      if (quotaNotice) {
        useContextMenuStore.getState().showToast(quotaNotice);
      }
    });

    let unsubFirestore: (() => void) | null = null;
    let activeSessionToken = 0;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      activeSessionToken += 1;
      const myToken = activeSessionToken;

      if (unsubFirestore) {
        unsubFirestore();
        unsubFirestore = null;
      }

      const authStore = useAuthStore.getState();
      authStore.setAuthUser(user);
      authStore.setAuthReady(true);

      if (!user || !user.emailVerified) {
        clearKnownFirestoreDocPaths();
        authStore.setSyncActive(false);
        return;
      }

      try {
        if (!useSettingsStore.getState().hydrated) {
          await useSettingsStore.getState().hydrate();
        }
        if (!useLibraryStore.getState().hydrated) {
          await useLibraryStore.getState().hydrate();
        }
        if (!usePlayerStore.getState().hydrated) {
          await usePlayerStore.getState().hydrate();
        }
        if (myToken !== activeSessionToken) return;

        await ensureUserDocuments(user);
        if (myToken !== activeSessionToken) return;

        const libState = useLibraryStore.getState();
        const settingsState = useSettingsStore.getState();
        await seedCloudIfEmptyFromLocal(user.uid, {
          settings: {
            hideExplicit: settingsState.hideExplicit,
            autoplay: settingsState.autoplay,
            dataSaver: settingsState.dataSaver,
            showRightPanel: settingsState.showRightPanel,
            lyricsPreviewEnabled: settingsState.lyricsPreviewEnabled,
            homeSectionOrder: settingsState.homeSectionOrder,
            youtubeSound: settingsState.youtubeSound,
            episodePlaybackRates: settingsState.episodePlaybackRates,
            customBackground: settingsState.customBackground,
            notchDisplayMode: settingsState.notchDisplayMode,
            notchMonitor: settingsState.notchMonitor,
          },
          localProfile: settingsState.localProfile,
          likedTracks: libState.likedTracks,
          playlists: libState.playlists,
          folders: libState.folders,
          savedAlbums: libState.savedAlbums,
          followedArtists: libState.followedArtists,
          savedPodcasts: libState.savedPodcasts,
          episodeProgress: libState.episodeProgress,
          hiddenTrackIds: libState.hiddenTrackIds,
          excludedTasteIds: libState.excludedTasteIds,
          recentSearches: libState.recentSearches,
        });
        if (myToken !== activeSessionToken) return;

        await settingsState.setAccountKey('cloud');
        if (myToken !== activeSessionToken) return;

        unsubFirestore = subscribeUserFirestoreData(user.uid, {
          onSettings: (s) => {
            useSettingsStore.getState().applyFirestoreSettings(s);
            useAuthStore.getState().markSyncedNow();
          },
          onAudioProfile: (profile) => {
            useSettingsStore.getState().applyFirestoreAudioProfile(profile);
            useAuthStore.getState().markSyncedNow();
          },
          onLikedTracks: (rows) => {
            void useLibraryStore.getState().applyFirestoreLikedTracks(rows);
            useAuthStore.getState().markSyncedNow();
          },
          onPlaylists: (pls) => {
            void useLibraryStore.getState().applyFirestorePlaylists(pls);
            useAuthStore.getState().markSyncedNow();
          },
          onFolders: (folders) => {
            void useLibraryStore.getState().applyFirestoreFolders(folders);
          },
          onSavedAlbums: (albums) => {
            void useLibraryStore.getState().applyFirestoreSavedAlbums(albums);
          },
          onFollowedArtists: (artists) => {
            void useLibraryStore.getState().applyFirestoreFollowedArtists(artists);
          },
          onSavedPodcasts: (podcasts) => {
            void useLibraryStore.getState().applyFirestoreSavedPodcasts(podcasts);
          },
          onEpisodeProgress: (progress) => {
            void useLibraryStore.getState().applyFirestoreEpisodeProgress(progress);
          },
          onPlayHistory: (history) => {
            void useLibraryStore.getState().applyFirestorePlayHistory(history);
          },
          onRecentSearches: (searches) => {
            void useLibraryStore.getState().applyFirestoreRecentSearches(searches);
          },
          onHiddenTracks: (ids) => {
            void useLibraryStore.getState().applyFirestoreHiddenTracks(ids);
          },
          onTasteExclusions: (ids) => {
            void useLibraryStore.getState().applyFirestoreTasteExclusions(ids);
          },
          onPlayerSession: (session) => {
            usePlayerStore.getState().applyFirestorePlayerSession(session);
          },
        });

        authStore.setSyncActive(true);
        authStore.markSyncedNow();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const quotaNotice = formatFirestoreQuotaNotice(msg);
        authStore.setSyncActive(false);
        authStore.setFirestoreError(quotaNotice || msg);
      }
    });

    return () => {
      unsubAuth();
      unsubErrors();
      if (unsubFirestore) {
        unsubFirestore();
      }
    };
  }, []);

  return null;
}
