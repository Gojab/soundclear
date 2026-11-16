import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { create } from 'zustand';
import { auth, firebaseWebClientId, googleProvider } from '../firebase/firebase';
import { formatFirestoreQuotaNotice } from '../firebase/firestoreError';
import { clearKnownFirestoreDocPaths } from '../firebase/firestoreSync';

interface SoundClearGoogleAuthPlugin {
  signIn(options: { webClientId: string }): Promise<{
    idToken: string;
    email?: string | null;
    displayName?: string | null;
    photoUrl?: string | null;
  }>;
  signOut(): Promise<void>;
}

const SoundClearGoogleAuth = registerPlugin<SoundClearGoogleAuthPlugin>('SoundClearGoogleAuth');

interface AuthState {
  authReady: boolean;
  user: User | null;
  signingIn: boolean;
  syncActive: boolean;
  firestoreError: string | null;
  lastSyncedAt: number | null;

  setAuthUser: (user: User | null) => void;
  setAuthReady: (ready: boolean) => void;
  setSyncActive: (active: boolean) => void;
  setFirestoreError: (message: string | null) => void;
  markSyncedNow: () => void;
  signInWithGoogle: () => Promise<User | null>;
  signOutUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  authReady: false,
  user: null,
  signingIn: false,
  syncActive: false,
  firestoreError: null,
  lastSyncedAt: null,

  setAuthUser: (user) => set({ user }),
  setAuthReady: (authReady) => set({ authReady }),
  setSyncActive: (syncActive) => set({ syncActive }),
  setFirestoreError: (firestoreError) => set({ firestoreError }),
  markSyncedNow: () => set({ lastSyncedAt: Date.now(), firestoreError: null }),

  signInWithGoogle: async () => {
    set({ signingIn: true, firestoreError: null });
    try {
      if (Capacitor.isNativePlatform()) {
        if (!firebaseWebClientId) {
          throw new Error('Konfigurasi OAuth Web Client ID Firebase tidak ditemukan.');
        }
        const nativeRes = await SoundClearGoogleAuth.signIn({
          webClientId: firebaseWebClientId,
        });
        const credential = GoogleAuthProvider.credential(nativeRes.idToken);
        const cred = await signInWithCredential(auth, credential);
        set({ user: cred.user, signingIn: false });
        return cred.user;
      }

      const cred = await signInWithPopup(auth, googleProvider);
      set({ user: cred.user, signingIn: false });
      return cred.user;
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const quotaMsg = formatFirestoreQuotaNotice(rawMsg);
      const friendly =
        quotaMsg ||
        (rawMsg.includes('popup-closed-by-user') || rawMsg.includes('SIGN_IN_CANCELLED')
          ? 'Login Google dibatalkan.'
          : rawMsg.includes('DEVELOPER_ERROR') || rawMsg.includes('developer-error')
            ? 'SHA-1 aplikasi Android (com.zhafx.soundclear) belum terdaftar di Firebase Console.'
            : rawMsg.includes('NETWORK_ERROR') || rawMsg.includes('network-error')
              ? 'Tidak dapat terhubung ke Google. Periksa koneksi internet Anda.'
              : rawMsg.includes('popup-blocked')
                ? 'Popup login diblokir browser. Izinkan popup untuk masuk dengan Google.'
                : `Gagal masuk dengan Google: ${rawMsg}`);
      set({ signingIn: false, firestoreError: friendly });
      return null;
    }
  },

  signOutUser: async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await SoundClearGoogleAuth.signOut().catch(() => {});
      }
      await signOut(auth);
      clearKnownFirestoreDocPaths();
      set({ user: null, syncActive: false, firestoreError: null, lastSyncedAt: null });
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      set({ firestoreError: `Gagal keluar: ${rawMsg}` });
    }
  },
}));
