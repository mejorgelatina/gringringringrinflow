// Public web-app config for the Firebase project ("grinflow"). These values are not secrets: they identify
// the project to the browser SDK, and access is enforced by Firebase Auth + Firestore security rules + the
// server checks in lib/auth/team.ts. Each variable is read literally so Next.js inlines it in the client bundle.

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
};

// The registered web app "grinflow-web" in project grinflow (`firebase apps:sdkconfig WEB`). Public by design.
// Env vars override it (another project, or a staging app). Set NEXT_PUBLIC_FIREBASE_DISABLED=true to turn it off.
const GRINFLOW_WEB_APP: FirebaseWebConfig = {
  apiKey: "AIzaSyBQh5aa70B5i34E-udCQXSUgJ2WI0gBRjs",
  authDomain: "grinflow.firebaseapp.com",
  projectId: "grinflow",
  appId: "1:792933786297:web:e806f14334bd8e33837168",
  storageBucket: "grinflow.firebasestorage.app",
  messagingSenderId: "792933786297",
};

export function firebaseWebConfig(): FirebaseWebConfig | null {
  if (process.env.NEXT_PUBLIC_FIREBASE_DISABLED === "true") return null;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) return GRINFLOW_WEB_APP;
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || undefined,
  };
}
