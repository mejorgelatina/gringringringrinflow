import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { firestore } from "../firebase/admin.ts";
import { NetworkError, confirmReceipt, notified, recordPickup, tick } from "../network/coordinator.ts";
import type { Ms, Network, NetworkCase, Reservation } from "../network/types.ts";
import { shiftWindowToDay } from "./publish.ts";
import type { InboxItem } from "./inbox.ts";
import { OfferError, statusFor } from "./respond.ts";
import type { OffersStore } from "./store.ts";
import type { Offer } from "./types.ts";

// Missions and QR close (E5). A scheduled hold becomes a mission with an unguessable token; the
// collector scans it in /scan, which records pickup and verified receipt atomically. A missed
// pickup releases the kilos back to the cascade with a fresh 24h window.

export type MissionStatus = "active" | "completed" | "expired";

/** Extra hours granted when a pickup is missed and the lot returns to the cascade. */
export const MISSED_PICKUP_EXTENSION_HOURS = 24;

export type Mission = {
  id: string;
  offerId: string;
  reservationId: string;
  holderUid: string;
  holderRegId: string;
  donorRegId: string;
  /** Unguessable QR payload. The 4-digit handoff code stays internal. */
  token: string;
  kg: number;
  /** Pickup deadline snapshot. */
  windowEnd: Ms;
  createdAt: string;
  scannedAt: string | null;
  receivedKg: number | null;
  status: MissionStatus;
};

export function missionId(offerId: string, reservationId: string): string {
  return `m_${offerId}_${reservationId}`;
}

/** A mission plus the holder's redacted view of its lot (null when the lot is gone). */
export type MissionItem = { mission: Mission; item: InboxItem | null };

function fail(e: unknown): never {
  if (e instanceof NetworkError) throw new OfferError(e.code, statusFor(e.code), e.message);
  throw e;
}

export interface MissionStore {
  readonly kind: "firestore" | "memory";
  readonly lastError?: string | null;
  saveMission(m: Mission): Promise<void>;
  getMission(id: string): Promise<Mission | null>;
  getMissionByToken(token: string): Promise<Mission | null>;
  listMissionsByHolder(holderUid: string): Promise<Mission[]>;
  listMissionsByOffer(offerId: string): Promise<Mission[]>;
}

export function createMemoryMissionStore(): MissionStore {
  const missions = new Map<string, Mission>();
  const copy = <T,>(v: T): T => structuredClone(v);
  return {
    kind: "memory",
    async saveMission(m) { missions.set(m.id, copy(m)); },
    async getMission(id) { const m = missions.get(id); return m ? copy(m) : null; },
    async getMissionByToken(token) {
      const m = [...missions.values()].find((x) => x.token === token);
      return m ? copy(m) : null;
    },
    async listMissionsByHolder(holderUid) {
      return [...missions.values()].filter((m) => m.holderUid === holderUid).map(copy)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async listMissionsByOffer(offerId) {
      return [...missions.values()].filter((m) => m.offerId === offerId).map(copy)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}

/** Exported for contract tests, which inject a fake; production calls it without arguments. */
export function createFirestoreMissionStore(db: Firestore | null = firestore()): MissionStore | null {
  if (!db) return null;
  const col = db.collection("gf_missions");
  return {
    kind: "firestore",
    async saveMission(m) { await col.doc(m.id).set(JSON.parse(JSON.stringify(m))); },
    async getMission(id) { const s = await col.doc(id).get(); return s.exists ? (s.data() as Mission) : null; },
    async getMissionByToken(token) {
      const q = await col.where("token", "==", token).limit(1).get();
      return q.docs.map((d) => d.data() as Mission)[0] ?? null;
    },
    async listMissionsByHolder(holderUid) {
      const q = await col.where("holderUid", "==", holderUid).get();
      return q.docs.map((d) => d.data() as Mission).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async listMissionsByOffer(offerId) {
      const q = await col.where("offerId", "==", offerId).get();
      return q.docs.map((d) => d.data() as Mission).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}

export function withMissionFallback(primary: MissionStore, backup: MissionStore = createMemoryMissionStore(), timeoutMs = 6000): MissionStore {
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
    saveMission: (m) => both("write", () => primary.saveMission(m), () => backup.saveMission(m)),
    getMission: (id) => run("read", () => primary.getMission(id), () => backup.getMission(id)),
    getMissionByToken: (t) => run("read", () => primary.getMissionByToken(t), () => backup.getMissionByToken(t)),
    listMissionsByHolder: (u) => run("read", () => primary.listMissionsByHolder(u), () => backup.listMissionsByHolder(u)),
    listMissionsByOffer: (o) => run("read", () => primary.listMissionsByOffer(o), () => backup.listMissionsByOffer(o)),
  };
}

const g = globalThis as unknown as { __grinflowMissions?: MissionStore };

/** The process-wide store: Firestore if configured, else memory (kept on globalThis across hot reloads). */
export function missionStore(): MissionStore {
  if (!g.__grinflowMissions) {
    const fs = createFirestoreMissionStore();
    g.__grinflowMissions = fs ? withMissionFallback(fs) : createMemoryMissionStore();
  }
  return g.__grinflowMissions;
}

/**
 * Open the mission for a scheduled hold. Idempotent by deterministic id; returns null when the
 * hold is not scheduled (no mission warranted). Called by the routes that schedule holds.
 */
export async function ensureMission(store: MissionStore, offer: Offer, reservation: Reservation, holderUid: string): Promise<Mission | null> {
  if (!offer.case) return null;
  if (reservation.status !== "scheduled") return null;
  const id = missionId(offer.id, reservation.id);
  const existing = await store.getMission(id);
  if (existing) return existing;
  const mission: Mission = {
    id,
    offerId: offer.id,
    reservationId: reservation.id,
    holderUid,
    holderRegId: reservation.participantId,
    donorRegId: offer.donorRegId,
    token: randomUUID().replace(/-/g, "").slice(0, 16),
    kg: reservation.kg,
    windowEnd: offer.case.resource.pickupWindow.end,
    createdAt: new Date().toISOString(),
    scannedAt: null,
    receivedKg: null,
    status: "active",
  };
  await store.saveMission(mission);
  return mission;
}

export type ExpiryOutcome = { offer: Offer; missions: Mission[] };

/**
 * Release missed pickups back to the cascade. Pure: same references back when nothing changed.
 * A scheduled hold whose window passed without a scan expires, the lot gets a fresh 24h window,
 * the case reopens and the waves resume. Active missions on dead holds (cancelled, stopped)
 * expire silently: their kilos were already released.
 */
export function expireMissedPickups(offer: Offer, missions: Mission[], now: Ms, network: Network): ExpiryOutcome {
  const c = offer.case;
  if (!c) return { offer, missions };
  const mine = missions.filter((m) => m.offerId === offer.id && m.status === "active");
  if (mine.length === 0) return { offer, missions };
  const byId = new Map(c.reservations.map((r) => [r.id, r]));
  const missed: Mission[] = [];
  const dead: Mission[] = [];
  for (const m of mine) {
    const r = byId.get(m.reservationId);
    if (!r || r.status !== "scheduled") { dead.push(m); continue; }
    if (now > m.windowEnd) missed.push(m);
  }
  if (missed.length === 0 && dead.length === 0) return { offer, missions };
  const missedIds = new Set(missed.map((m) => m.reservationId));
  // Fresh 24h from now, keeping the original clock start on today's date so receiving-hour
  // checks keep evaluating the lot the same way.
  const { start } = shiftWindowToDay(c.resource.pickupWindow, now);
  const end = now + MISSED_PICKUP_EXTENSION_HOURS * 3600_000;
  let next: NetworkCase = {
    ...c,
    resource: { ...c.resource, pickupWindow: { start, end } },
    status: "open",
    reservations: c.reservations.map((r) => (missedIds.has(r.id) ? { ...r, status: "expired" as const } : r)),
    events: [...c.events],
  };
  for (const m of missed) {
    next = {
      ...next,
      events: [...next.events, {
        seq: next.events.length + 1, at: now, type: "pickup_missed", actor: "grinflow",
        detail: { reservation: m.reservationId, mission: m.id, extendedHours: MISSED_PICKUP_EXTENSION_HOURS },
      }],
    };
  }
  next = tick(next, network, now);
  const expiredIds = new Set([...missed, ...dead].map((m) => m.id));
  return {
    offer: { ...offer, case: next, notifiedIds: [...notified(next)] },
    missions: missions.map((m) => (expiredIds.has(m.id) ? { ...m, status: "expired" as const } : m)),
  };
}

/** Apply missed-pickup expiry and persist anything it changed. Routes call this before reading. */
export async function advanceOffer(offers: OffersStore, store: MissionStore, offer: Offer, network: Network, now: Ms): Promise<Offer> {
  const missions = await store.listMissionsByOffer(offer.id);
  const out = expireMissedPickups(offer, missions, now, network);
  if (out.offer === offer) return offer;
  await offers.saveOffer(out.offer);
  for (let i = 0; i < missions.length; i += 1) {
    if (out.missions[i] !== missions[i]) await store.saveMission(out.missions[i]);
  }
  return out.offer;
}

export type ScanOutcome = { offer: Offer; missions: Mission[]; mission: Mission; repeated: boolean };

/**
 * Scan a mission QR: pickup and verified receipt in one atomic step. Only the holder org scans;
 * a repeated scan returns the same completion without touching state. Unknown tokens stay 404.
 */
export function scanByToken(
  offer: Offer, missions: Mission[], token: string,
  scannerUid: string, scannerRegId: string, receivedKg: number, now: Ms, network: Network,
): ScanOutcome {
  const found = missions.find((m) => m.offerId === offer.id && m.token === token);
  if (!found) throw new OfferError("wrong_code", 404, "ese código no abre ninguna misión.");
  if (found.holderUid !== scannerUid) throw new OfferError("wrong_user", 403, "solo la organización que aceptó escanea esta misión.");
  if (found.status === "completed") return { offer, missions, mission: found, repeated: true };
  if (found.status === "expired") throw new OfferError("mission_expired", 409, "esta misión venció; el lote volvió a la cascada.");
  const c = offer.case;
  if (!c) throw new OfferError("no_case", 409, "esta oferta aún no tiene destinos coordinados.");
  const r = c.reservations.find((x) => x.id === found.reservationId);
  if (!r || !r.handoffCode) throw new OfferError("bad_state", 400, "este apartado no está listo para entregarse.");
  try {
    const picked = recordPickup(c, r.id, r.handoffCode, scannerRegId, now);
    const done = confirmReceipt(picked, r.id, receivedKg, scannerRegId, now);
    const mission: Mission = { ...found, status: "completed", scannedAt: new Date(now).toISOString(), receivedKg };
    return {
      offer: { ...offer, case: done, notifiedIds: [...notified(done)] },
      missions: missions.map((m) => (m.id === mission.id ? mission : m)),
      mission,
      repeated: false,
    };
  } catch (e) { fail(e); }
}
