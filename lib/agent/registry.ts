import type { Firestore } from "firebase-admin/firestore";
import { firestore } from "../firebase/admin.ts";

/**
 * Tracking-number lookup. Codes are case-insensitive. With Firebase configured, each code is
 * stored in Firestore (`agent_tracking`), so it survives redeploys and other instances. Without
 * it, this server instance's memory keeps the newest 200, and the console also keeps each run
 * in the browser.
 */
const runs = new Map<string, string>();
const COLLECTION = "agent_tracking";

const keyOf = (code: string) => code.trim().toUpperCase();

function rememberLocally(code: string, token: string) {
  runs.delete(code);
  runs.set(code, token);
  while (runs.size > 200) runs.delete(runs.keys().next().value!);
}

/** The token is the sealed run, so a stored copy can't be edited into a different state. */
export async function remember(code: string, token: string, db: Firestore | null = firestore()) {
  const key = keyOf(code);
  rememberLocally(key, token);
  if (!db) return;
  try { await db.collection(COLLECTION).doc(key).set({ code: key, token, updatedAt: new Date().toISOString() }); }
  catch (error) { console.error("Firebase tracking write failed; kept in memory only", error); }
}

export async function lookup(code: string, db: Firestore | null = firestore()): Promise<string | null> {
  const key = keyOf(code);
  const local = runs.get(key);
  if (local) return local;
  if (!db) return null;
  try {
    const doc = await db.collection(COLLECTION).doc(key).get();
    const token = doc.exists ? doc.get("token") : null;
    if (typeof token !== "string") return null;
    rememberLocally(key, token);
    return token;
  } catch (error) {
    console.error("Firebase tracking read failed", error);
    return null;
  }
}
