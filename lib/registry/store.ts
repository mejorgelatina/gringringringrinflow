import { createHash } from "node:crypto"
import { firestore } from "../firebase/admin.ts"
import type { Conversation, InboxItem, Notice, Registration, RunLink } from "./types.ts"

// Where registrations, conversation memory and the team inbox live. Firestore when FIREBASE_* is set
// (durable, shared across server instances); otherwise process memory, which is enough for a demo on one
// warm instance but is lost on a cold start. Both implement the same interface so tests use memory.

export interface RegistryStore {
  readonly kind: "firestore" | "memory"
  /** Last Firestore failure (the store then serves from memory), or null. */
  readonly lastError?: string | null
  getConversation(key: string): Promise<Conversation | null>
  saveConversation(c: Conversation): Promise<void>
  getRegistration(id: string): Promise<Registration | null>
  findRegistrationByPhone(phone: string): Promise<Registration | null>
  saveRegistration(r: Registration): Promise<void>
  listRegistrations(): Promise<Registration[]>
  addInbox(item: InboxItem): Promise<void>
  listInbox(limit?: number): Promise<InboxItem[]>
  getInbox(id: string): Promise<InboxItem | null>
  linkRun(link: RunLink): Promise<void>
  getRunLink(code: string): Promise<RunLink | null>
  addNotice(n: Notice): Promise<void>
  listNotices(limit?: number): Promise<Notice[]>
}

export const digits = (v: string) => v.replace(/\D/g, "")

export function createMemoryStore(): RegistryStore {
  const conversations = new Map<string, Conversation>()
  const registrations = new Map<string, Registration>()
  const inbox: InboxItem[] = []
  const links = new Map<string, RunLink>()
  const notices: Notice[] = []
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
    async getInbox(id) { const i = inbox.find((x) => x.id === id); return i ? copy(i) : null },
    async linkRun(l) { links.set(l.code.toUpperCase(), copy(l)) },
    async getRunLink(code) { const l = links.get(code.toUpperCase()); return l ? copy(l) : null },
    async addNotice(n) { const i = notices.findIndex((x) => x.id === n.id); if (i >= 0) notices.splice(i, 1); notices.unshift(copy(n)); notices.length = Math.min(notices.length, 200) },
    async listNotices(limit = 50) { return notices.slice(0, limit).map(copy) },
  }
}

const hash = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 40)

function createFirestoreStore(): RegistryStore | null {
  const db = firestore()
  if (!db) return null
  const conv = db.collection("gf_conversations")
  const regs = db.collection("gf_registrations")
  const box = db.collection("gf_inbox")
  const runLinks = db.collection("gf_run_links")
  const outbox = db.collection("gf_outbox")
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
    async getInbox(id) { const s = await box.doc(id).get(); return s.exists ? (s.data() as InboxItem) : null },
    async linkRun(l) { await runLinks.doc(l.code.toUpperCase()).set(JSON.parse(JSON.stringify(l))) },
    async getRunLink(code) { const s = await runLinks.doc(code.toUpperCase()).get(); return s.exists ? (s.data() as RunLink) : null },
    async addNotice(n) { await outbox.doc(n.id).set(JSON.parse(JSON.stringify(n))) },
    async listNotices(limit = 50) { const q = await outbox.orderBy("at", "desc").limit(limit).get(); return q.docs.map((d) => d.data() as Notice) },
  }
}

/**
 * Firestore first; if a call fails (API disabled, wrong project, missing index, bad credentials) the request
 * is still answered from memory and the error is kept in `lastError` so /team can show it.
 * Writes go to both, so nothing taken while Firestore is down is lost on this instance.
 */
export function withFallback(primary: RegistryStore, backup: RegistryStore = createMemoryStore(), timeoutMs = 6000): RegistryStore {
  const state = { lastError: null as string | null }
  // Bad credentials can make the Firestore client retry for a long time; don't let that hang the request.
  const timed = <T,>(p: Promise<T>) => new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no answer in ${timeoutMs / 1000}s`)), timeoutMs)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
  const run = async <T,>(op: string, a: () => Promise<T>, b: () => Promise<T>): Promise<T> => {
    try { const v = await timed(a()); state.lastError = null; return v }
    catch (error) {
      state.lastError = `firestore ${op} failed: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`
      console.error(state.lastError)
      return b()
    }
  }
  const both = (op: string, a: () => Promise<void>, b: () => Promise<void>) => run(op, async () => { await b(); await a() }, b)
  return {
    kind: primary.kind,
    get lastError() { return state.lastError },
    getConversation: (k) => run("read", () => primary.getConversation(k), () => backup.getConversation(k)),
    saveConversation: (c) => both("write", () => primary.saveConversation(c), () => backup.saveConversation(c)),
    getRegistration: (id) => run("read", () => primary.getRegistration(id), () => backup.getRegistration(id)),
    findRegistrationByPhone: (p) => run("read", () => primary.findRegistrationByPhone(p), () => backup.findRegistrationByPhone(p)),
    saveRegistration: (r) => both("write", () => primary.saveRegistration(r), () => backup.saveRegistration(r)),
    listRegistrations: () => run("read", () => primary.listRegistrations(), () => backup.listRegistrations()),
    addInbox: (i) => both("write", () => primary.addInbox(i), () => backup.addInbox(i)),
    listInbox: (n) => run("read", () => primary.listInbox(n), () => backup.listInbox(n)),
    getInbox: (id) => run("read", () => primary.getInbox(id), () => backup.getInbox(id)),
    linkRun: (l) => both("write", () => primary.linkRun(l), () => backup.linkRun(l)),
    getRunLink: (c) => run("read", () => primary.getRunLink(c), () => backup.getRunLink(c)),
    addNotice: (n) => both("write", () => primary.addNotice(n), () => backup.addNotice(n)),
    listNotices: (n) => run("read", () => primary.listNotices(n), () => backup.listNotices(n)),
  }
}

const g = globalThis as unknown as { __grinflowRegistry?: RegistryStore }

/** The process-wide store: Firestore if configured, else memory (kept on globalThis across hot reloads). */
export function registryStore(): RegistryStore {
  if (!g.__grinflowRegistry) {
    const fs = createFirestoreStore()
    g.__grinflowRegistry = fs ? withFallback(fs) : createMemoryStore()
  }
  return g.__grinflowRegistry
}
