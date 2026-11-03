import type { Firestore } from "firebase-admin/firestore";
import { firestore } from "../firebase/admin.ts";
import type { Offer } from "./types.ts";

// Where published offers live. Same shape as the registry store: Firestore when FIREBASE_* is
// set (durable, shared across instances), otherwise process memory. Both implement the same
// interface so tests use memory. Reads are always scoped by donorUid on the server.

export interface OffersStore {
  readonly kind: "firestore" | "memory";
  /** Last Firestore failure (the store then serves from memory), or null. */
  readonly lastError?: string | null;
  saveOffer(o: Offer): Promise<void>;
  getOffer(id: string): Promise<Offer | null>;
  listOffersByOwner(donorUid: string): Promise<Offer[]>;
  listOffersNotified(participantId: string): Promise<Offer[]>;
}

export function createMemoryOffersStore(): OffersStore {
  const offers = new Map<string, Offer>();
  const copy = <T,>(v: T): T => structuredClone(v);
  return {
    kind: "memory",
    async saveOffer(o) { offers.set(o.id, copy(o)); },
    async getOffer(id) { const o = offers.get(id); return o ? copy(o) : null; },
    async listOffersByOwner(donorUid) {
      return [...offers.values()].filter((o) => o.donorUid === donorUid).map(copy)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async listOffersNotified(participantId) {
      return [...offers.values()].filter((o) => o.notifiedIds.includes(participantId)).map(copy)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}

/** Exported for contract tests, which inject a fake; production calls it without arguments. */
export function createFirestoreOffersStore(db: Firestore | null = firestore()): OffersStore | null {
  if (!db) return null;
  const col = db.collection("gf_offers");
  return {
    kind: "firestore",
    async saveOffer(o) { await col.doc(o.id).set(JSON.parse(JSON.stringify(o))); },
    async getOffer(id) { const s = await col.doc(id).get(); return s.exists ? (s.data() as Offer) : null; },
    async listOffersByOwner(donorUid) {
      // Single-field filter (no composite index needed); newest first, sorted in code.
      const q = await col.where("donorUid", "==", donorUid).get();
      return q.docs.map((d) => d.data() as Offer).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async listOffersNotified(participantId) {
      const q = await col.where("notifiedIds", "array-contains", participantId).get();
      return q.docs.map((d) => d.data() as Offer).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}

/**
 * Firestore first with the same semantics as the registry fallback: a failed call is answered
 * from memory and kept in `lastError`; writes go to both. Local mirror so the registry
 * adapter stays untouched.
 */
export function withOffersFallback(primary: OffersStore, backup: OffersStore = createMemoryOffersStore(), timeoutMs = 6000): OffersStore {
  const state = { lastError: null as string | null };
  const timed = <T,>(p: Promise<T>) => new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no answer in ${timeoutMs / 1000}s`)), timeoutMs);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
  const run = async <T,>(op: string, a: () => Promise<T>, b: () => Promise<T>): Promise<T> => {
    try { const v = await timed(a()); state.lastError = null; return v; }
    catch (error) {
      state.lastError = `firestore ${op} failed: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`;
      console.error(state.lastError);
      return b();
    }
  };
  const both = (op: string, a: () => Promise<void>, b: () => Promise<void>) => run(op, async () => { await b(); await a(); }, b);
  return {
    kind: primary.kind,
    get lastError() { return state.lastError; },
    saveOffer: (o) => both("write", () => primary.saveOffer(o), () => backup.saveOffer(o)),
    getOffer: (id) => run("read", () => primary.getOffer(id), () => backup.getOffer(id)),
    listOffersByOwner: (u) => run("read", () => primary.listOffersByOwner(u), () => backup.listOffersByOwner(u)),
    listOffersNotified: (p) => run("read", () => primary.listOffersNotified(p), () => backup.listOffersNotified(p)),
  };
}

const g = globalThis as unknown as { __grinflowOffers?: OffersStore };

/** The process-wide store: Firestore if configured, else memory (kept on globalThis across hot reloads). */
export function offersStore(): OffersStore {
  if (!g.__grinflowOffers) {
    const fs = createFirestoreOffersStore();
    g.__grinflowOffers = fs ? withOffersFallback(fs) : createMemoryOffersStore();
  }
  return g.__grinflowOffers;
}
