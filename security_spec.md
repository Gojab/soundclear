# SoundClear Firestore Security Specification

## 1. Data Invariants

1. **Root Ownership Invariant**: Every subcollection document under `/users/{userId}/...` requires the parent `/users/{userId}` document to exist with `uid == request.auth.uid` (Master Gate), and requires `request.auth.token.email_verified == true`.
2. **PII Isolation Invariant**: Email addresses are strictly isolated inside `/users/{userId}/private/{docId}` (`docId == 'account'`) and are never stored in `/users/{userId}` or any other subcollection.
3. **Identity Integrity Invariant**: Every document's `uid` field must strictly match `request.auth.uid` on creation and remain immutable on update.
4. **Temporal Integrity Invariant**: Every `createdAt` field must equal `request.time` on creation and remain immutable on update; every `updatedAt` field must equal `request.time` on creation and update.
5. **Path & Payload Volumetric Bounds**: All document IDs (`userId`, `playlistId`, `folderId`, `trackDocId`, etc.) must match `^[a-zA-Z0-9_\-]+$` with length `<= 128`. All strings and lists (`tracks <= 500`, `queue <= 200`, `homeSectionOrder <= 20`) are strictly bounded.
6. **Shadow Field Prevention**: Every `create` rule enforces `keys().hasAll(...) && keys().hasOnly(...)`, and every `update` rule enforces action-specific `affectedKeys().hasOnly(...)` combined with `isValid[Entity](incoming())`.
7. **Default-Deny Catch-All**: Any unmatched path (including `/test/connection`) is explicitly denied by `match /{document=**} { allow read, write: if false; }`.

## 2. The "Dirty Dozen" Adversarial Payloads

| # | Attack Vector | Target Path | Malicious Payload / Operation | Expected Result |
|---|---|---|---|---|
| 1 | Unauthenticated Read | `/users/u1/likedTracks/t1` | `get` with `auth = null` | `PERMISSION_DENIED` |
| 2 | Unverified Email Write | `/users/u1` | `create` with `email_verified = false` | `PERMISSION_DENIED` |
| 3 | Cross-User Impersonation (UID Spoof) | `/users/u2/playlists/pl1` | `u1` creates doc with `uid: "u2"` or `"u1"` under `/users/u2` | `PERMISSION_DENIED` |
| 4 | PII Cross-User Read | `/users/u2/private/account` | `u1` attempts `get` on `u2`'s private PII doc | `PERMISSION_DENIED` |
| 5 | Shadow Field Injection (Create) | `/users/u1/playlists/pl1` | Valid playlist + `{ isAdmin: true, role: "superuser" }` | `PERMISSION_DENIED` |
| 6 | Shadow Field Injection (Update) | `/users/u1/playlists/pl1` | Update `name` + `{ ghostField: "injected" }` | `PERMISSION_DENIED` |
| 7 | Client Timestamp Forgery | `/users/u1/playlists/pl1` | `create` with `createdAt: Timestamp(1999)` instead of `request.time` | `PERMISSION_DENIED` |
| 8 | Immortal Field Tampering | `/users/u1/playlists/pl1` | `update` mutating `createdAt` or `uid` or `id` | `PERMISSION_DENIED` |
| 9 | ID Poisoning (Oversized/Invalid ID) | `/users/u1/playlists/` + 300-char ID or `../bad` | `create` with invalid document ID | `PERMISSION_DENIED` |
| 10 | Array Poisoning (Unbounded/Wrong Element Type) | `/users/u1/playlists/pl1` | `tracks: ["not-a-map"]` or `tracks.length > 500` | `PERMISSION_DENIED` |
| 11 | Value Poisoning (Enum / Size Violation) | `/users/u1/settings/preferences` | `notchDisplayMode: "invalid-mode"` or `notchMonitor` > 128 chars | `PERMISSION_DENIED` |
| 12 | Blanket Collection Scraping | `/users/u1/private/account` or `/users` | `list` on `/users` or `u1` listing `/users/u2/likedTracks` | `PERMISSION_DENIED` |

## 3. Test Runner

See `firestore.rules.test.ts` for the complete automated verification suite targeting all 12 Dirty Dozen payloads against the Firestore Rules test harness.
