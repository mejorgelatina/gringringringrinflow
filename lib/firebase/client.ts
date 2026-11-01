"use client";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { firebaseWebConfig } from "./config";

// Browser side of Firebase. Only Auth runs in the browser: Firestore is read and written by the server with
// the Admin SDK (lib/firebase/admin.ts), and firestore.rules deny every direct client access.

let cachedAuth: Auth | null | undefined;

export function firebaseClientApp(): FirebaseApp | null {
  const config = firebaseWebConfig();
  if (!config) return null;
  return getApps().length ? getApp() : initializeApp(config);
}

/** Null when the NEXT_PUBLIC_FIREBASE_* variables are missing: the UI then falls back to the operator key. */
export function firebaseClientAuth(): Auth | null {
  if (cachedAuth !== undefined) return cachedAuth;
  const app = firebaseClientApp();
  cachedAuth = app ? getAuth(app) : null;
  return cachedAuth;
}
