import { auth } from './firebase';

export function getActiveFirestoreUid(): string | null {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return null;
  return user.uid;
}
