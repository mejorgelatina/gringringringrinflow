import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cachedApp: App | null | undefined;
let cachedDb: Firestore | null | undefined;
let cachedAuth: Auth | null | undefined;

const AUTH_ONLY_APP = "grinflow-auth-only";

function firebaseConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

/** The Firebase project id, from the service account or, failing that, the public web config. */
export function firebaseProjectId(): string | null {
  return process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null;
}

/** Firebase is deliberately optional so the demo still runs without credentials. */
export function firebaseEnabled() {
  return Boolean(firebaseConfig());
}

export function firebaseApp(): App | null {
  if (cachedApp !== undefined) return cachedApp;
  const config = firebaseConfig();
  if (!config) {
    cachedApp = null;
    return cachedApp;
  }
  cachedApp = getApps().find((a) => a.name === "[DEFAULT]") ?? initializeApp({ credential: cert(config) });
  return cachedApp;
}

export function firestore(): Firestore | null {
  if (cachedDb !== undefined) return cachedDb;
  const app = firebaseApp();
  cachedDb = app ? getFirestore(app) : null;
  return cachedDb;
}

/**
 * Admin Auth, used only to verify ID tokens from the browser. Verifying a token needs just the project id
 * (Google's public keys are fetched over HTTPS), so sign-in works even before the service account is set.
 */
export function firebaseAdminAuth(): Auth | null {
  if (cachedAuth !== undefined) return cachedAuth;
  const app = firebaseApp();
  if (app) return (cachedAuth = getAuth(app));
  const projectId = firebaseProjectId();
  if (!projectId) return (cachedAuth = null);
  const authApp = getApps().some((a) => a.name === AUTH_ONLY_APP) ? getApp(AUTH_ONLY_APP) : initializeApp({ projectId }, AUTH_ONLY_APP);
  return (cachedAuth = getAuth(authApp));
}
