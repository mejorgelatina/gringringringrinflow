import { createHash } from "node:crypto"
import { firestore } from "../firebase/admin.ts"
import type { Conversation, InboxItem, Registration } from "./types.ts"

// Where registrations, conversation memory and the team inbox live. Firestore when FIREBASE_* is set
// (durable, shared across server instances); otherwise process memory, which is enough for a demo on one
// warm instance but is lost on a cold start. Both implement the same interface so tests use memory.

export interface RegistryStore {
  readonly kind: "firestore" | "memory"
  getConversation(key: string): Promise<Conversation | null>
  saveConversation(c: Conversation): Promise<void>
  getRegistration(id: string): Promise<Registration | null>
  findRegistrationByPhone(phone: string): Promise<Registration | null>
  saveRegistration(r: Registration): Promise<void>
  listRegistrations(): Promise<Registration[]>
  addInbox(item: InboxItem): Promise<void>
  listInbox(limit?: number): Promise<InboxItem[]>
}

export const digits = (v: string) => v.replace(/\D/g, "")

export function createMemoryStore(): RegistryStore {
  const conversations = new Map<string, Conversation>()
  const registrations = new Map<string, Registration>()
  const inbox: InboxItem[] = []
  const copy = <T,>(v: T): T => structuredClone(v)
  return {
    kind: "memory",
    async getConversation(key) { const c = conversations.get(key); return c ? copy(c) : null },
    async saveConversation(c) { conversations.set(c.key, copy(c)) },
    async getRegistration(id) { const r = registrations.get(id); return r ? copy(r) : null },
    async findRegistrationByPhone(phone) {
      const d = digits(phone)
      const r = [...registrations.values()].filter((x) => x.phone === d && x.status !== "rejected").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
      return r ? copy(r) : null
    },
    async saveRegistration(r) { registrations.set(r.id, copy(r)) },
    async listRegistrations() { return [...registrations.values()].map(copy).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) },
    async addInbox(item) { const i = inbox.findIndex((x) => x.id === item.id); if (i >= 0) inbox.splice(i, 1); inbox.unshift(copy(item)); inbox.length = Math.min(inbox.length, 200) },
    async listInbox(limit = 50) { return inbox.slice(0, limit).map(copy) },
  }
}

const hash = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 40)

function createFirestoreStore(): RegistryStore | null {
  const db = firestore()
  if (!db) return null
  const conv = db.collection("gf_conversations")
  const regs = db.collection("gf_registrations")
  const box = db.collection("gf_inbox")
  return {
    kind: "firestore",
    async getConversation(key) { const s = await conv.doc(hash(key)).get(); return s.exists ? (s.data() as Conversation) : null },
    async saveConversation(c) { await conv.doc(hash(c.key)).set(JSON.parse(JSON.stringify(c))) },
    async getRegistration(id) { const s = await regs.doc(id).get(); return s.exists ? (s.data() as Registration) : null },
    async findRegistrationByPhone(phone) {
      const q = await regs.where("phone", "==", digits(phone)).get()
      return q.docs.map((d) => d.data() as Registration).filter((r) => r.status !== "rejected").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
    },
    async saveRegistration(r) { await regs.doc(r.id).set(JSON.parse(JSON.stringify(r))) },
    async listRegistrations() { const q = await regs.orderBy("createdAt", "desc").limit(500).get(); return q.docs.map((d) => d.data() as Registration) },
    async addInbox(item) { await box.doc(item.id).set(JSON.parse(JSON.stringify(item))) },
    async listInbox(limit = 50) { const q = await box.orderBy("at", "desc").limit(limit).get(); return q.docs.map((d) => d.data() as InboxItem) },
  }
}

const g = globalThis as unknown as { __grinflowRegistry?: RegistryStore }

/** The process-wide store: Firestore if configured, else memory (kept on globalThis across hot reloads). */
export function registryStore(): RegistryStore {
  if (!g.__grinflowRegistry) g.__grinflowRegistry = createFirestoreStore() ?? createMemoryStore()
  return g.__grinflowRegistry
}
