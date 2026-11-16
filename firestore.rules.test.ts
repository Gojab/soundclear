/**
 * SoundClear Firestore Security Rules — Dirty Dozen Test Runner
 * Validates all 12 adversarial payloads from security_spec.md against the Firestore Rules Emulator.
 * Run with Firebase Emulator Suite:
 *   npx firebase emulators:exec --only firestore "npx tsx firestore.rules.test.ts"
 */
import fs from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

async function runDirtyDozenSuite() {
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: 'soundclear',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });

  try {
    const u1Verified = testEnv.authenticatedContext('u1', {
      email: 'u1@example.com',
      email_verified: true,
    });
    const u1Unverified = testEnv.authenticatedContext('u1', {
      email: 'u1@example.com',
      email_verified: false,
    });
    const u2Verified = testEnv.authenticatedContext('u2', {
      email: 'u2@example.com',
      email_verified: true,
    });
    const unauth = testEnv.unauthenticatedContext();

    // Seed valid parent and private docs via rules-bypassed admin context
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      await setDoc(doc(adminDb, 'users', 'u1'), {
        uid: 'u1',
        displayName: 'User One',
        photoURL: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(adminDb, 'users', 'u2'), {
        uid: 'u2',
        displayName: 'User Two',
        photoURL: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(adminDb, 'users', 'u2', 'private', 'account'), {
        uid: 'u2',
        email: 'u2-secret@example.com',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(adminDb, 'users', 'u1', 'playlists', 'pl1'), {
        uid: 'u1',
        id: 'pl1',
        name: 'My Mix',
        description: '',
        coverUrl: null,
        folderId: null,
        pinned: false,
        tracks: [],
        mixConfig: null,
        lastPlayedAt: null,
        createdAtMs: 1700000000000,
        updatedAtMs: 1700000000000,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    // 1. Unauthenticated Read
    await assertFails(getDoc(doc(unauth.firestore(), 'users', 'u1', 'likedTracks', 't1')));

    // 2. Unverified Email Write
    await assertFails(
      setDoc(doc(u1Unverified.firestore(), 'users', 'u1'), {
        uid: 'u1',
        displayName: 'Unverified',
        photoURL: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    // 3. Cross-User Impersonation (UID Spoof)
    await assertFails(
      setDoc(doc(u1Verified.firestore(), 'users', 'u2', 'playlists', 'pl_spoof'), {
        uid: 'u2',
        id: 'pl_spoof',
        name: 'Spoofed',
        description: '',
        coverUrl: null,
        folderId: null,
        pinned: false,
        tracks: [],
        mixConfig: null,
        lastPlayedAt: null,
        createdAtMs: 1700000000000,
        updatedAtMs: 1700000000000,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    // 4. PII Cross-User Read
    await assertFails(getDoc(doc(u1Verified.firestore(), 'users', 'u2', 'private', 'account')));

    // 5. Shadow Field Injection (Create)
    await assertFails(
      setDoc(doc(u1Verified.firestore(), 'users', 'u1', 'playlists', 'pl_shadow'), {
        uid: 'u1',
        id: 'pl_shadow',
        name: 'Shadow',
        description: '',
        coverUrl: null,
        folderId: null,
        pinned: false,
        tracks: [],
        mixConfig: null,
        lastPlayedAt: null,
        createdAtMs: 1700000000000,
        updatedAtMs: 1700000000000,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isAdmin: true,
      }),
    );

    // 6. Shadow Field Injection (Update)
    await assertFails(
      updateDoc(doc(u1Verified.firestore(), 'users', 'u1', 'playlists', 'pl1'), {
        name: 'Renamed',
        ghostField: 'injected',
        updatedAtMs: 1700000000001,
        updatedAt: serverTimestamp(),
      }),
    );

    // 7. Client Timestamp Forgery
    await assertFails(
      setDoc(doc(u1Verified.firestore(), 'users', 'u1', 'playlists', 'pl_time'), {
        uid: 'u1',
        id: 'pl_time',
        name: 'Backdated',
        description: '',
        coverUrl: null,
        folderId: null,
        pinned: false,
        tracks: [],
        mixConfig: null,
        lastPlayedAt: null,
        createdAtMs: 1700000000000,
        updatedAtMs: 1700000000000,
        createdAt: new Date('1999-01-01T00:00:00Z'),
        updatedAt: serverTimestamp(),
      }),
    );

    // 8. Immortal Field Tampering
    await assertFails(
      updateDoc(doc(u1Verified.firestore(), 'users', 'u1', 'playlists', 'pl1'), {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    // 9. ID Poisoning (Oversized ID)
    await assertFails(
      setDoc(doc(u1Verified.firestore(), 'users', 'u1', 'playlists', 'a'.repeat(200)), {
        uid: 'u1',
        id: 'pl_bad',
        name: 'Bad ID',
        description: '',
        coverUrl: null,
        folderId: null,
        pinned: false,
        tracks: [],
        mixConfig: null,
        lastPlayedAt: null,
        createdAtMs: 1700000000000,
        updatedAtMs: 1700000000000,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    // 10. Array Poisoning (Invalid element type)
    await assertFails(
      updateDoc(doc(u1Verified.firestore(), 'users', 'u1', 'playlists', 'pl1'), {
        tracks: ['not-a-map'],
        updatedAtMs: 1700000000002,
        updatedAt: serverTimestamp(),
      }),
    );

    // 11. Value Poisoning (Invalid enum)
    await assertFails(
      setDoc(doc(u1Verified.firestore(), 'users', 'u1', 'settings', 'preferences'), {
        uid: 'u1',
        hideExplicit: false,
        autoplay: true,
        dataSaver: false,
        showRightPanel: true,
        lyricsPreviewEnabled: true,
        homeSectionOrder: ['continue'],
        youtubeSound: {
          maxVolumeLimit: 100,
          startupVolumeMode: 'last',
          startupFixedVolume: 75,
          defaultPlaybackRate: 1,
          trackFadeSeconds: 3,
          fadeOnPauseResume: true,
          fadeOutOnSleepTimer: true,
          resumeLastPosition: true,
          autoStartOnOpen: false,
        },
        episodePlaybackRates: {},
        customBackground: {
          mode: 'default',
          presetId: 'aurora',
          solidColor: '#000000',
          gradientFrom: '#0F1F17',
          gradientTo: '#000000',
          gradientAngle: 135,
          customImageDataUrl: null,
          customImageName: null,
          blurPx: 0,
          dimOpacity: 0.45,
          panelGlass: true,
        },
        notchDisplayMode: 'invalid-mode',
        notchMonitor: 'primary',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );

    // 12. Blanket Collection Scraping
    await assertFails(getDocs(collection(u1Verified.firestore(), 'users')));
    await assertFails(getDocs(collection(u1Verified.firestore(), 'users', 'u2', 'likedTracks')));

    // Legitimate owner operations succeed
    await assertSucceeds(getDoc(doc(u1Verified.firestore(), 'users', 'u1')));
    await assertSucceeds(getDocs(collection(u1Verified.firestore(), 'users', 'u1', 'playlists')));
    await assertSucceeds(
      updateDoc(doc(u1Verified.firestore(), 'users', 'u1', 'playlists', 'pl1'), {
        name: 'Updated Mix',
        updatedAtMs: 1700000000005,
        updatedAt: serverTimestamp(),
      }),
    );

    // Verify u2 cannot mutate u1
    await assertFails(
      updateDoc(doc(u2Verified.firestore(), 'users', 'u1', 'playlists', 'pl1'), {
        name: 'Hijacked',
        updatedAtMs: 1700000000009,
        updatedAt: serverTimestamp(),
      }),
    );

    console.log('All 12 Dirty Dozen security assertions passed.');
  } finally {
    await testEnv.cleanup();
  }
}

void runDirtyDozenSuite();
