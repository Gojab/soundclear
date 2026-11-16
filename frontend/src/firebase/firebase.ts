import { Capacitor } from '@capacitor/core';
import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

function createFirebaseAuth(): Auth {
  if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
    try {
      // Android WebView only runs a single instance and IndexedDB cross-tab polling
      // frequently times out with DB_TIMEOUT; localStorage persistence avoids polling.
      return initializeAuth(app, {
        persistence: browserLocalPersistence,
        popupRedirectResolver: browserPopupRedirectResolver,
      });
    } catch {
      return getAuth(app);
    }
  }
  return getAuth(app);
}

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = createFirebaseAuth();
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const firebaseWebClientId = firebaseConfig.oAuthClientId || '';

export const firebaseProjectInfo = {
  projectId: firebaseConfig.projectId,
  firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
};

if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  void isAnalyticsSupported()
    .then((supported) => {
      if (supported) {
        getAnalytics(app);
      }
    })
    .catch(() => {});
}

let connectionTested = false;
export async function testFirestoreConnection(): Promise<void> {
  if (connectionTested) return;
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
