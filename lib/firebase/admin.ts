import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { firebaseWebConfig } from "./config.ts";

let cachedApp: App | null | undefined;
let cachedDb: Firestore | null | undefined;

let initError: string | null = null;

const unquote = (v: string | undefined) => v?.trim().replace(/^(['"])([\s\S]*)\1$/, "$2").trim() || undefined;

/**
 * Accepts the private key the ways people paste it into Vercel: with literal \n, with real newlines,
 * wrapped in quotes, or even the whole service-account JSON.
 */
export function normalizePrivateKey(raw: string | undefined): string | undefined {
  let v = unquote(raw);
  if (!v) return undefined;
  if (v.startsWith("{")) {
    try { v = String(JSON.parse(v).private_key ?? ""); } catch { /* not JSON, keep as is */ }
  }
  v = v.replace(/\\n/g, "\n").replace(/\r/g, "");
  return v.includes("PRIVATE KEY") ? (v.endsWith("\n") ? v : `${v}\n`) : v;
}

function firebaseConfig() {
  const projectId = unquote(process.env.FIREBASE_PROJECT_ID);
  const clientEmail = unquote(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

/** Shape of the private key (never its content), to debug how it was pasted into the environment. */
export function privateKeyShape(raw: string | undefined): string {
  if (!raw) return "empty";
  const k = normalizePrivateKey(raw) ?? "";
  const lines = k.split("\n").filter(Boolean).length;
  return `raw length ${raw.length}, starts with ${raw.trim().startsWith("{") ? "{" : raw.trim().slice(0, 1) === '"' ? "quote" : "other"}, has BEGIN ${k.includes("BEGIN PRIVATE KEY")}, has END ${k.includes("END PRIVATE KEY")}, lines ${lines}`;
}

/** Why the service account could not be used (bad key format, etc.), or null. Never includes the key. */
export function firebaseInitError(): string | null {
  firebaseApp();
  return initError;
}

/** The Firebase project id, from the service account or, failing that, the public web config. */
export function firebaseProjectId(): string | null {
  const fromEnv = unquote(process.env.FIREBASE_PROJECT_ID);
  if (fromEnv) return fromEnv;
  return firebaseWebConfig()?.projectId ?? null;
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
  try {
    cachedApp = getApps().find((a) => a.name === "[DEFAULT]") ?? initializeApp({ credential: cert(config) });
  } catch (error) {
    initError = `firebase service account rejected: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"} (key: ${privateKeyShape(process.env.FIREBASE_PRIVATE_KEY)}; a good key has BEGIN true, END true, about 28 lines)`;
    console.error(initError);
    cachedApp = null;
  }
  return cachedApp;
}

export function firestore(): Firestore | null {
  if (cachedDb !== undefined) return cachedDb;
  const app = firebaseApp();
  if (!app) return (cachedDb = null);
  try {
    const db = getFirestore(app);
    // REST instead of gRPC: no long-lived channels or native streams, which misbehave in serverless functions.
    db.settings({ preferRest: true, ignoreUndefinedProperties: true });
    cachedDb = db;
  } catch (error) {
    initError = `firestore client failed: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`;
    console.error(initError);
    cachedDb = null;
  }
  return cachedDb;
}
