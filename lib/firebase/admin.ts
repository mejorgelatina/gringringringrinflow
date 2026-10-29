import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cachedApp: App | null | undefined;
let cachedDb: Firestore | null | undefined;

function firebaseConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
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
  cachedApp = getApps()[0] ?? initializeApp({ credential: cert(config) });
  return cachedApp;
}

export function firestore(): Firestore | null {
  if (cachedDb !== undefined) return cachedDb;
  const app = firebaseApp();
  cachedDb = app ? getFirestore(app) : null;
  return cachedDb;
}
