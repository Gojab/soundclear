import { auth, firebaseProjectInfo } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

type FirestoreErrorListener = (info: FirestoreErrorInfo) => void;
const listeners = new Set<FirestoreErrorListener>();

export function subscribeFirestoreErrors(listener: FirestoreErrorListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isQuotaExceededErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('quota exceeded') ||
    lower.includes('resource-exhausted') ||
    lower.includes('free daily read units per project')
  );
}

export function formatFirestoreQuotaNotice(message: string): string | null {
  if (!isQuotaExceededErrorMessage(message)) return null;
  if (message.includes('Free daily read units per project')) {
    return `Kuota harian Firestore tercapai. Kuota akan direset besok, atau cek paket database di https://console.firebase.google.com/project/${firebaseProjectInfo.projectId}/firestore/databases/${firebaseProjectInfo.firestoreDatabaseId}/data?openUpgradeDialog=true`;
  }
  return 'Kuota harian Firestore tercapai. Kuota akan direset besok (lihat kolom Spark / Enterprise di https://firebase.google.com/pricing#cloud-firestore).';
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  for (const listener of listeners) {
    try {
      listener(errInfo);
    } catch {
      // Ignore listener errors
    }
  }
  throw new Error(JSON.stringify(errInfo));
}
